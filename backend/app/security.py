"""
ClinBridge — Security, Rate Limiting & Header Protection

Deliberately implemented with Python stdlib (threading, time, collections) to
avoid external redis/database dependencies for local and SIH evaluation setups.
Provides sliding-window in-memory rate limiting and request security helpers.
"""

from __future__ import annotations

import time
import threading
from collections import defaultdict, deque
from typing import Optional
from fastapi import Request, HTTPException, status


class SlidingWindowRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter.
    Cleans up expired timestamps on access to bound memory usage.
    """

    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _get_client_key(self, request: Request) -> str:
        # Prefer client IP from request, fallback to 'anonymous'
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "127.0.0.1"

    def check(self, request: Request, custom_key: Optional[str] = None) -> None:
        """
        Records an attempt and raises HTTP 429 if the rate limit is exceeded.
        """
        key = custom_key or self._get_client_key(request)
        now = time.time()
        window_start = now - self.window_seconds

        with self._lock:
            queue = self._requests[key]
            # Evict timestamps outside current window
            while queue and queue[0] < window_start:
                queue.popleft()

            if len(queue) >= self.max_requests:
                retry_after = int(queue[0] + self.window_seconds - now) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Please retry after {max(1, retry_after)} seconds.",
                    headers={"Retry-After": str(max(1, retry_after))},
                )

            queue.append(now)

    def reset(self) -> None:
        """Helper for test suites to reset rate limiter counts."""
        with self._lock:
            self._requests.clear()


# Pre-configured rate limiters for key endpoints:
# Login: max 10 requests per minute per IP (prevents brute-force)
login_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=60.0)

# Extraction / New Referral: max 20 requests per minute per IP (protects LLM quota)
extraction_limiter = SlidingWindowRateLimiter(max_requests=20, window_seconds=60.0)
