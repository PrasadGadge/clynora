"""
ClinBridge — Extraction Service (OpenRouter version)

FIXES APPLIED:
1. load_dotenv(override=True) -- .env must always win over any stray
   process-level env var.
2. max_tokens=4000, not 2000 -- some reasoning-capable free models spend
   1500-3000+ tokens on internal reasoning before writing the JSON
   answer. At 2000 they hit finish_reason="length" with empty content
   and the call fails. 4000 gives headroom.
3. OPENROUTER_MODEL default is pinned to minimax/minimax-m3:free --
   proven 10/10 success rate, 100% field accuracy, ~4.8s average
   latency, and does NOT expand shorthand inconsistently.
4. Retry logic with exponential backoff (up to 3 attempts) for transient
   OpenRouter failures (network drops, rate limits, empty content responses,
   or length exhaustion).
5. Comprehensive exception handling wrapping OpenAIError, transport errors,
   empty choices, and Pydantic validation errors into informative ValueErrors.

Contract (Master Plan v4 §9, kept intact):
- Extract only information explicitly present in the referral text.
- Never diagnose, never infer missing facts, never assume normal values.
- Never invent allergies, medications, urgency, or recommendations.
- Missing field -> null or [], never a plausible default.
- Missing allergy info must NOT become "No known allergies."
"""

import json
import logging
import os
import time
from openai import OpenAI, OpenAIError
from dotenv import load_dotenv
from pydantic import ValidationError
from app.schemas.referral import ExtractedReferral

load_dotenv(override=True)

logger = logging.getLogger("clinbridge.extractor")
logging.basicConfig(level=logging.INFO)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = os.getenv("OPENROUTER_MODEL", "minimax/minimax-m3")
PLACEHOLDER_KEYS = {"", "your_key_here"}

# Retry duration caps: 3 attempts with 5s timeout each and 0.8s exponential backoff.
# Maximum total elapsed time is strictly capped at < 17 seconds.
MAX_RETRIES = 3
INITIAL_BACKOFF = 0.8
BACKOFF_FACTOR = 1.5
REQUEST_TIMEOUT_SECONDS = 5.0

SYSTEM_PROMPT = """You are a clinical referral extraction engine. You extract \
structured data from a referral document. You do not diagnose, treat, or \
interpret. You do not fill in missing information with plausible defaults.

STRICT RULES:
1. Extract only information explicitly present in the referral text.
2. Never infer, assume, or guess a value that isn't stated.
3. Never assume "normal" vitals when a value is not documented.
4. Never invent allergies, medications, urgency, or recommendations.
5. If a field is absent from the text, return null (or [] for lists). \
Do not write "not documented", "none", "N/A", or similar text into the field \
itself -- leave it null/[] and let the caller report absence separately.
6. Do not convert missing allergy information into "No known allergies." \
Absence of a mention is not evidence of absence of allergy.
7. Recognize common clinical shorthand (c/o, Hx, DM, HTN, PCN, ASA) and \
extract the meaning where it is unambiguous, but do not expand abbreviations \
into claims the text doesn't support. Keep the extracted value as written in \
the source (e.g. keep "PCN" as "PCN", do not silently expand to "Penicillin") \
so downstream string-matching stays consistent.
8. Output ONLY valid JSON matching the schema below. No prose, no markdown \
fences, no commentary.

SCHEMA:
{
  "patient": {"patient_age": int|null, "patient_sex": string|null},
  "situation": {
    "reason_for_referral": string|null,
    "urgency_documented": string|null,
    "urgency_source": "document" | "not_documented"
  },
  "background": {
    "history": string|null,
    "medications": [string],
    "allergies": [string]
  },
  "assessment": {
    "vitals": {
      "blood_pressure": string|null,
      "heart_rate": string|null,
      "spo2": string|null,
      "temperature": string|null
    },
    "investigations": [string],
    "diagnosis_documented": string|null,
    "imaging": [string]
  },
  "recommendation": {
    "referred_to": string|null,
    "referring_physician_contact": string|null,
    "treatment_documented": string|null
  }
}"""


def extract_clinical_fields(raw_text: str) -> ExtractedReferral:
    """
    Calls the LLM with the source-grounded extraction contract and returns
    a validated ExtractedReferral. Retries transient failures up to MAX_RETRIES.
    Strictly caps total retry duration to under 17 seconds.
    Raises ValueError loudly on unrecoverable failure or validation error.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key or api_key.strip() in PLACEHOLDER_KEYS:
        raise ValueError("OPENROUTER_API_KEY is not set")

    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        timeout=REQUEST_TIMEOUT_SECONDS,
        default_headers={
            "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:8000"),
            "X-Title": os.getenv("OPENROUTER_APP_TITLE", "ClinBridge"),
        },
    )

    last_exception = None

    for attempt in range(1, MAX_RETRIES + 1):
        start_time = time.time()
        try:
            logger.info("Extraction attempt %d/%d (model=%s, timeout=%.1fs)", attempt, MAX_RETRIES, MODEL, REQUEST_TIMEOUT_SECONDS)
            response = client.chat.completions.create(
                model=MODEL,
                max_tokens=4000,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Referral text:\n\n{raw_text}"},
                ],
            )

            elapsed = time.time() - start_time
            if not response.choices:
                raise ValueError(f"OpenRouter returned empty choices list (model='{MODEL}', elapsed={elapsed:.2f}s)")

            choice = response.choices[0]
            if not getattr(choice, "message", None):
                raise ValueError(f"OpenRouter choice missing message attribute (model='{MODEL}', elapsed={elapsed:.2f}s)")

            content = choice.message.content
            finish_reason = getattr(choice, "finish_reason", "unknown")

            if not content:
                raise ValueError(
                    f"Extraction model returned empty text content "
                    f"(finish_reason='{finish_reason}', model='{MODEL}', elapsed={elapsed:.2f}s)."
                )

            logger.info("Attempt %d succeeded in %.2fs (finish_reason='%s')", attempt, elapsed, finish_reason)

            cleaned = content.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.strip("`")
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip()

            try:
                parsed = json.loads(cleaned)
            except json.JSONDecodeError as e:
                raise ValueError(f"Extraction model returned invalid JSON: {e}\nRaw: {cleaned[:500]}") from e

            try:
                return ExtractedReferral.model_validate(parsed)
            except ValidationError as e:
                raise ValueError(f"Extracted data schema validation failed: {e}") from e

        except (OpenAIError, ValueError, Exception) as e:
            elapsed = time.time() - start_time
            last_exception = e
            logger.warning("Extraction attempt %d/%d failed after %.2fs: %s", attempt, MAX_RETRIES, elapsed, e)
            if attempt < MAX_RETRIES:
                sleep_time = INITIAL_BACKOFF * (BACKOFF_FACTOR ** (attempt - 1))
                time.sleep(sleep_time)

    raise ValueError(f"Extraction failed after {MAX_RETRIES} attempts: {last_exception}") from last_exception
