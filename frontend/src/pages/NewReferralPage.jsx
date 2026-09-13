import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createReferral, getErrorMessage } from "../lib/api";
import { TEST_IDS } from "../constants/testIds/clinbridge";
import { Loader2, AlertTriangle, Sparkles, RotateCcw, ArrowRight, ShieldCheck, PlayCircle } from "lucide-react";

const DEMO_SCENARIOS = [
  {
    id: "clean-cardio",
    label: "1. Clean Cardiology Referral",
    description: "Complete referral with vitals, history, meds, and clear contact.",
    text: `67-year-old female presenting with exertional chest tightness (CCS Class II) for 3 weeks.
History: Hypertension (10 yrs) on Amlodipine 5mg OD, Type 2 Diabetes on Metformin 500mg BD.
Allergies: None documented.
Vitals: BP 130/80 mmHg, HR 72 bpm, SpO2 98% on room air, Temp 98.4 F.
Investigations: ECG shows normal sinus rhythm with non-specific T-wave flattening in V5-V6.
Refer to Cardiology — Dr. Vivek Rao at Shivajinagar Heart Hospital, Pune.
Referring Clinician: Dr. Aarti Deshmukh, Kothrud Care Clinic (+91 98220 11234).`,
  },
  {
    id: "missing-info",
    label: "2. Missing Vitals & Contact",
    description: "Incomplete referral lacking vitals, background meds, and contact phone.",
    text: `67-year-old female referred for chest pain.
History of hypertension.
Refer to cardiology.`,
  },
  {
    id: "med-allergy",
    label: "3. Medication–Allergy Conflict",
    description: "Documented penicillin allergy with active amoxicillin prescription.",
    text: `54-year-old male, community-acquired pneumonia.
Penicillin allergy documented.
Current medication: amoxicillin 500mg TDS.
Refer to internal medicine — Dr. Rao, Pune.`,
  },
  {
    id: "demographic",
    label: "4. Demographic Discrepancy",
    description: "Contradictory age statements across referral narrative.",
    text: `Patient aged 67 presenting with fatigue and unintentional weight loss.
BP 138/86, on levothyroxine.
Later documented age 61, referred to endocrinology.`,
  },
  {
    id: "messy-shorthand",
    label: "5. Messy Clinical Shorthand",
    description: "Dense clinical abbreviations (c/o, Hx, HTN, DM, ASA, PCN).",
    text: `67F c/o CP.
Hx HTN + DM.
BP 160/100, SpO2 91%.
On ASA + metformin.
Allergy: PCN.
Refer cardio.`,
  },
  {
    id: "pune-specialist",
    label: "6. Pune Specialist Referral",
    description: "Specialist handover directed to Dr. Aarti Deshmukh in Kothrud, Pune.",
    text: `67-year-old female presenting with exertional chest tightness and dyspnea.
History of hypertension (10 yrs) on amlodipine.
Known allergy to Penicillin (severe rash).
BP 150/92, HR 82 bpm, SpO2 96%.
Refer to Cardiology — Dr. Aarti Deshmukh at Kothrud Care Clinic, Paud Road, Pune.
Referring Clinician: Dr. Joshi (+91 98220 33456).`,
  },
];

const STAGES = [
  "Extracting documented information",
  "Checking completeness",
  "Checking consistency",
  "Preparing structured handover",
];

export default function NewReferralPage() {
  const [text, setText] = useState("");
  const [stage, setStage] = useState(0);
  const [activeScenario, setActiveScenario] = useState(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: async (raw) => {
      let s = 0;
      setStage(0);
      const timer = setInterval(() => {
        s = Math.min(s + 1, STAGES.length - 1);
        setStage(s);
      }, 1400);
      try {
        return await createReferral(raw);
      } finally {
        clearInterval(timer);
      }
    },
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ["referrals"] });
      qc.setQueryData(["referral", record.referral_id], record);
      toast.success(`Referral ${record.referral_id} processed`);
      navigate(`/app/referrals/${record.referral_id}`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Unable to analyze referral. Please try again."));
    },
  });

  const loadScenario = (s) => {
    setText(s.text);
    setActiveScenario(s);
  };

  const disabled = mutation.isPending || text.trim().length === 0;

  return (
    <div data-testid={TEST_IDS.newReferralRoot} className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">New Referral</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paste the raw referral text or select a synthetic demo scenario. ClinBridge extracts structured data,
          runs deterministic rules, and generates a reviewable SBAR handover.
        </p>
      </div>

      {/* Demo Mode Scenarios Bar */}
      <div className="bg-[#FBF6EE] border border-[#E5DFD1] rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-[#2F6B4F]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1E4634]">
              SIH Demo Mode — Synthetic Scenarios
            </h2>
          </div>
          <span className="text-[11px] font-medium bg-[#2F6B4F]/10 text-[#1E4634] px-2.5 py-0.5 rounded-full">
            Synthetic Demo Data — For Demonstration Only
          </span>
        </div>
        <p className="text-xs text-slate-600">
          Click any preset case to populate the referral note. The complete extraction, validation, and scoring pipeline will execute live.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
          {DEMO_SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              data-testid={i === 0 ? TEST_IDS.loadSampleBtn : `${TEST_IDS.loadSampleBtn}-${i}`}
              disabled={mutation.isPending}
              onClick={() => loadScenario(s)}
              className={`text-left p-2.5 rounded-lg border transition text-xs ${
                activeScenario?.id === s.id && text === s.text
                  ? "border-[#2F6B4F] bg-[#F1F7F2] font-semibold text-[#1E4634]"
                  : "border-[#E5DFD1] bg-white hover:bg-slate-50 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-3 w-3 text-[#2F6B4F] shrink-0" />
                <span>{s.label}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-5 sm:p-6 space-y-4">
        <label htmlFor="referral" className="block text-sm font-medium text-slate-700">
          Raw Referral Note
        </label>
        <textarea
          id="referral"
          data-testid={TEST_IDS.referralTextInput}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (activeScenario && e.target.value !== activeScenario.text) {
              setActiveScenario(null);
            }
          }}
          disabled={mutation.isPending}
          rows={12}
          placeholder="Paste the referral note as written by the referring clinician or select a demo scenario above…"
          className="w-full rounded-lg border border-[#E5DFD1] bg-white focus:border-[#2F6B4F] focus:ring-2 focus:ring-[#2F6B4F]/15 outline-none px-4 py-3 text-sm font-mono resize-y disabled:bg-slate-50"
        />

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="text-xs text-slate-500 max-w-md flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[#2F6B4F] shrink-0" />
            <span>AI assists extraction. Rules validate completeness. Clinicians decide.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid={TEST_IDS.resetBtn}
              disabled={mutation.isPending || text.length === 0}
              onClick={() => {
                setText("");
                setActiveScenario(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 transition"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
            <button
              type="button"
              data-testid={TEST_IDS.analyzeButton}
              disabled={disabled}
              onClick={() => mutation.mutate(text.trim())}
              className="inline-flex items-center gap-2 rounded-full bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-5 py-2.5 text-sm font-semibold shadow-sm disabled:opacity-60 transition"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {mutation.isPending ? "Processing Referral…" : "Analyze Referral"}
            </button>
          </div>
        </div>

        {mutation.isPending && (
          <div data-testid={TEST_IDS.processingIndicator} className="rounded-lg border border-[#D4E1D6] bg-[#F1F7F2] p-4 space-y-2">
            <div className="flex items-center gap-2 text-[#1E4634] text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              Contacting ClinBridge backend…
            </div>
            <ul className="text-xs text-[#1E4634]/80 space-y-1">
              {STAGES.map((label, i) => (
                <li key={label} className="flex items-center gap-2">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      i < stage ? "bg-[#2F6B4F]" : i === stage ? "bg-[#2F6B4F] animate-pulse" : "bg-slate-300"
                    }`}
                  />
                  <span className={i <= stage ? "text-[#1E4634] font-medium" : "text-slate-500"}>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mutation.isError && !mutation.isPending && (
          <div data-testid={TEST_IDS.submitError} className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Unable to analyze referral.</div>
              <div className="text-rose-700/90 mt-0.5">
                {mutation.error?.response?.data?.detail || mutation.error?.message || "Please try again in a moment."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
