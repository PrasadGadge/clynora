import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getReferral,
  approveReferral,
  updateReferralStatus,
  getReferralHistory,
  getReferralVersions,
  MISSING_FIELD_LABEL,
  BAND_LABEL,
  STATUS_LABEL,
  getErrorMessage,
} from "../lib/api";
import { TEST_IDS } from "../constants/testIds/clinbridge";
import { StatusBadge, QualityBandBadge } from "../components/StatusBadges";
import {
  ArrowLeft, AlertTriangle, Info, CheckCircle2, ShieldCheck, Send, Loader2, Save, Stethoscope,
  History, Layers, Printer, FileText, Clock, User, ArrowRight
} from "lucide-react";

const TABS = [
  { id: "clinical", label: "Clinical Data", testId: TEST_IDS.tabClinical },
  { id: "validation", label: "Validation", testId: TEST_IDS.tabValidation },
  { id: "sbar", label: "SBAR", testId: TEST_IDS.tabSbar },
  { id: "tracking", label: "Tracking", testId: TEST_IDS.tabTracking },
  { id: "history", label: "Audit Trail", testId: "tab-history" },
  { id: "versions", label: "Version History", testId: "tab-versions" },
];

export default function ReferralWorkspacePage() {
  const { id } = useParams();
  const [tab, setTab] = useState("clinical");
  const [showPrintModal, setShowPrintModal] = useState(false);

  const { data: referral, isLoading, error } = useQuery({
    queryKey: ["referral", id],
    queryFn: () => getReferral(id),
    refetchOnMount: "always",
  });

  if (isLoading) {
    return <div className="text-sm text-slate-500 p-6">Loading referral…</div>;
  }
  if (error || !referral) {
    return (
      <div data-testid={TEST_IDS.errorState} className="max-w-xl mx-auto text-center py-16">
        <div className="text-lg font-semibold text-slate-900">Referral not found or unauthorized</div>
        <p className="text-sm text-slate-500 mt-1">
          {error?.response?.data?.detail || "The referral could not be loaded from the backend."}
        </p>
        <Link to="/app" className="inline-flex items-center gap-1.5 mt-4 text-sm text-[#1E4634] hover:text-[#2F6B4F]">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div data-testid={TEST_IDS.workspaceRoot} className="space-y-6">
      <WorkspaceHeader referral={referral} onExport={() => setShowPrintModal(true)} />

      <div className="border-b border-slate-200">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              data-testid={t.testId}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                tab === t.id
                  ? "border-[#2F6B4F] text-[#1E4634]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "clinical" && <ClinicalDataTab referral={referral} />}
      {tab === "validation" && <ValidationTab referral={referral} />}
      {tab === "sbar" && <SbarTab referral={referral} onExport={() => setShowPrintModal(true)} />}
      {tab === "tracking" && <TrackingTab referral={referral} />}
      {tab === "history" && <AuditHistoryTab referralId={referral.referral_id} />}
      {tab === "versions" && <VersionHistoryTab referralId={referral.referral_id} currentRecord={referral} />}

      {showPrintModal && (
        <PrintHandoverReport referral={referral} onClose={() => setShowPrintModal(false)} />
      )}
    </div>
  );
}

function WorkspaceHeader({ referral, onExport }) {
  const dest = referral.extracted?.recommendation?.referred_to;
  return (
    <div data-testid={TEST_IDS.workspaceHeader} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex items-start gap-3">
        <Link to="/app" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-mono">{referral.referral_id}</h1>
            <StatusBadge status={referral.status} />
            <QualityBandBadge band={referral.validation?.band} testId={TEST_IDS.qualityBand} />
            {referral.created_by && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                By: {referral.created_by}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Destination: {dest ? <span className="text-slate-800 font-medium">{dest}</span> : <em className="text-slate-400">Not documented</em>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 text-xs font-semibold shadow-sm transition"
        >
          <Printer className="h-4 w-4 text-[#2F6B4F]" /> Export Handover Report
        </button>
        <QualityScoreDisplay validation={referral.validation} />
      </div>
    </div>
  );
}

function QualityScoreDisplay({ validation }) {
  const score = validation?.quality_score ?? 0;
  const tone =
    validation?.band === "ready_for_review"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : validation?.band === "needs_information"
      ? "text-amber-800 bg-amber-50 border-amber-200"
      : "text-rose-800 bg-rose-50 border-rose-200";
  return (
    <div data-testid={TEST_IDS.qualityScore} className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2 ${tone}`}>
      <div>
        <div className="text-[10px] uppercase tracking-wider font-medium opacity-80">Referral Quality Score</div>
        <div className="text-xl font-bold font-mono">{score}<span className="text-xs font-medium opacity-70">/100</span></div>
      </div>
      <div className="text-xs font-medium">{BAND_LABEL[validation?.band] || "—"}</div>
    </div>
  );
}

/* ---------- Clinical Data ---------- */

function DataRow({ label, value, mono = false }) {
  const missing = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className={`col-span-2 text-sm ${missing ? "text-slate-400 italic" : "text-slate-900"} ${mono ? "font-mono" : ""}`}>
        {missing ? "Not documented" : Array.isArray(value) ? value.join(", ") : String(value)}
      </div>
    </div>
  );
}

function Section({ title, Icon, children }) {
  return (
    <section className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="h-4 w-4 text-[#2F6B4F]" />}
        <h3 className="font-semibold tracking-tight text-slate-900">{title}</h3>
      </div>
      <div>{children}</div>
    </section>
  );
}

function ClinicalDataTab({ referral }) {
  const e = referral.extracted || {};
  return (
    <div data-testid={TEST_IDS.clinicalData} className="grid gap-5 lg:grid-cols-2">
      <Section title="Patient" Icon={Stethoscope}>
        <DataRow label="Age" value={e.patient?.patient_age} mono />
        <DataRow label="Sex" value={e.patient?.patient_sex} />
      </Section>
      <Section title="Situation">
        <DataRow label="Reason for referral" value={e.situation?.reason_for_referral} />
        <DataRow label="Urgency" value={e.situation?.urgency_documented} />
        <DataRow label="Urgency source" value={e.situation?.urgency_source} />
      </Section>
      <Section title="Background">
        <DataRow label="History" value={e.background?.history} />
        <DataRow label="Medications" value={e.background?.medications} />
        <DataRow label="Allergies" value={e.background?.allergies} />
      </Section>
      <Section title="Assessment">
        <DataRow label="Blood pressure" value={e.assessment?.vitals?.blood_pressure} mono />
        <DataRow label="Heart rate" value={e.assessment?.vitals?.heart_rate} mono />
        <DataRow label="SpO₂" value={e.assessment?.vitals?.spo2} mono />
        <DataRow label="Temperature" value={e.assessment?.vitals?.temperature} mono />
        <DataRow label="Investigations" value={e.assessment?.investigations} />
        <DataRow label="Diagnosis documented" value={e.assessment?.diagnosis_documented} />
        <DataRow label="Imaging" value={e.assessment?.imaging} />
      </Section>
      <Section title="Recommendation / Request">
        <DataRow label="Referred to" value={e.recommendation?.referred_to} />
        <DataRow label="Referring physician contact" value={e.recommendation?.referring_physician_contact} />
        <DataRow label="Treatment documented" value={e.recommendation?.treatment_documented} />
      </Section>
      <Section title="Source referral text">
        <pre className="whitespace-pre-wrap text-xs font-mono bg-slate-50 border border-slate-200 rounded-md p-3 text-slate-700 max-h-64 overflow-auto">
          {referral.raw_text}
        </pre>
      </Section>
    </div>
  );
}

/* ---------- Validation ---------- */

function ValidationTab({ referral }) {
  const v = referral.validation || {};
  const missing = v.missing_fields || [];
  const conflicts = v.potential_conflicts || [];
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Section title="Referral Quality Score" Icon={ShieldCheck}>
        <QualityScoreDisplay validation={v} />
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-mono text-slate-700 space-y-1">
          <div>Base Score: 100</div>
          <div>Missing critical: -{v.missing_critical_count * 10} ({v.missing_critical_count} x 10)</div>
          <div>Conflicts: -{v.conflict_count * 15} ({v.conflict_count} x 15)</div>
          <div>Missing optional: -{v.missing_optional_count * 5} ({v.missing_optional_count} x 5)</div>
          <div className="font-semibold text-slate-900 pt-1 border-t border-slate-200">Final: {v.quality_score}/100</div>
        </div>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          Documentation-quality indicator based on completeness and detected consistency issues.
          <strong className="text-slate-700"> Not a clinical risk or safety score.</strong>
        </p>
      </Section>

      <Section title={`Missing information (${missing.length})`} Icon={Info}>
        {missing.length === 0 ? (
          <div data-testid={TEST_IDS.emptyState} className="text-sm text-slate-500">No missing information detected.</div>
        ) : (
          <ul data-testid={TEST_IDS.missingFieldsList} className="space-y-1.5">
            {missing.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-amber-900">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {MISSING_FIELD_LABEL[f] || f}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-slate-500 mt-4">
          Missing information means the referral text did not document these fields. It is not a negative clinical finding.
        </p>
      </Section>

      <Section title={`Potential conflicts (${conflicts.length})`} Icon={AlertTriangle}>
        {conflicts.length === 0 ? (
          <div data-testid={TEST_IDS.emptyState} className="text-sm text-slate-500">No potential conflicts detected.</div>
        ) : (
          <ul data-testid={TEST_IDS.conflictsList} className="space-y-3">
            {conflicts.map((c, i) => (
              <li key={i} className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-rose-900 leading-relaxed">{c}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-slate-500 mt-4">
          Potential conflicts are surfaced for clinician verification. ClinBridge does not make clinical safety decisions.
        </p>
      </Section>
    </div>
  );
}

/* ---------- SBAR ---------- */

function SbarTab({ referral, onExport }) {
  const [draft, setDraft] = useState(referral.sbar || "");
  const [dirty, setDirty] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    setDraft(referral.sbar || "");
    setDirty(false);
  }, [referral.referral_id, referral.sbar]);

  const approve = useMutation({
    mutationFn: () => approveReferral(referral.referral_id, dirty ? draft : null),
    onSuccess: (updated) => {
      qc.setQueryData(["referral", updated.referral_id], updated);
      qc.invalidateQueries({ queryKey: ["referrals"] });
      toast.success("Referral approved by clinician");
      setDirty(false);
    },
    onError: (err) => toast.error(getErrorMessage(err, "Approval failed")),
  });

  const approved = referral.status === "approved" || referral.status === "sent" || referral.status === "acknowledged" || referral.status === "closed";

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Section title="Structured Handover (SBAR)" Icon={ShieldCheck}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-500">
              {approved ? (
                <span data-testid={TEST_IDS.approvedBadge} className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> Approved by Clinician
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-800 font-medium">
                  <Info className="h-4 w-4" /> Draft — Awaiting Clinician Approval
                </span>
              )}
            </div>
            {dirty && !approved && (
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Save className="h-3 w-3" /> Unsaved edits</span>
            )}
          </div>
          <textarea
            data-testid={TEST_IDS.sbarEditor}
            value={draft}
            disabled={approved || approve.isPending}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(e.target.value !== (referral.sbar || ""));
            }}
            rows={22}
            className="w-full font-mono text-xs bg-[#FBF6EE] border border-[#E5DFD1] rounded-md p-4 focus:border-[#2F6B4F] focus:ring-2 focus:ring-[#2F6B4F]/15 outline-none disabled:bg-slate-100 disabled:text-slate-600"
          />
        </Section>
      </div>

      <div className="space-y-5">
        <Section title="Clinician Approval Gate" Icon={ShieldCheck}>
          <p className="text-sm text-slate-600 leading-relaxed">
            AI prepares the handover. The clinician verifies and approves it. Approval is required before this referral
            can move forward.
          </p>
          <button
            type="button"
            data-testid={TEST_IDS.approveBtn}
            disabled={approved || approve.isPending}
            onClick={() => approve.mutate()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60 transition"
          >
            {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {approved ? "Approved" : dirty ? "Save & Approve Handover" : "Approve Handover"}
          </button>
          {approved && (
            <button
              type="button"
              onClick={onExport}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-semibold transition"
            >
              <Printer className="h-3.5 w-3.5 text-[#2F6B4F]" /> Export Handover Report
            </button>
          )}
          <p className="text-[11px] text-slate-500 mt-3">
            Approval is recorded on the ClinBridge backend and reflected in the referral status.
          </p>
        </Section>
        <Section title="Safety boundary">
          <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
            <li>ClinBridge does not diagnose or prescribe.</li>
            <li>ClinBridge does not determine clinical urgency.</li>
            <li>Potential conflicts require clinician verification.</li>
            <li>The clinician is the final decision-maker.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

/* ---------- Tracking ---------- */

function TrackingTab({ referral }) {
  const qc = useQueryClient();
  const statusFlow = ["created", "reviewed", "approved", "sent", "acknowledged", "closed"];
  const currentIndex = statusFlow.indexOf(referral.status);

  const patch = useMutation({
    mutationFn: (status) => updateReferralStatus(referral.referral_id, status),
    onSuccess: (updated) => {
      qc.setQueryData(["referral", updated.referral_id], updated);
      qc.invalidateQueries({ queryKey: ["referrals"] });
      toast.success(`Status updated to ${updated.status}`);
    },
    onError: (err) => toast.error(getErrorMessage(err, "Status update failed")),
  });

  return (
    <div data-testid={TEST_IDS.workspaceTrackingRoot} className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Section title="Workflow status" Icon={Send}>
          <ol className="space-y-4">
            {statusFlow.map((s, i) => {
              const active = i <= currentIndex;
              const current = i === currentIndex;
              return (
                <li key={s} className="flex items-start gap-3">
                  <div
                    className={`h-6 w-6 rounded-full grid place-items-center text-xs font-semibold ${
                      active ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${current ? "text-sky-700" : active ? "text-slate-800" : "text-slate-500"}`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {s === "created" && "Referral captured and processed by ClinBridge."}
                      {s === "reviewed" && "Clinician has reviewed the extracted information."}
                      {s === "approved" && "Clinician has approved the structured handover."}
                      {s === "sent" && "Referral marked as sent. External delivery is not part of this prototype."}
                      {s === "acknowledged" && "Receiving clinician/coordinator has acknowledged receipt."}
                      {s === "closed" && "Handover loop closed."}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {referral.status === "rejected" && (
            <div className="mt-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              Rejected{referral.rejection_reason ? `: ${referral.rejection_reason}` : "."}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-6">
            Workflow status is separate from Referral Quality. A referral may be Approved while still flagged as Needs Information.
            "Sent" / "Acknowledged" / "Closed" are prototype workflow markers — this does not perform real hospital-to-hospital transmission.
          </p>
        </Section>
      </div>
      <Section title="Update status">
        <div className="space-y-2">
          <button
            type="button"
            data-testid={TEST_IDS.markReviewedBtn}
            disabled={patch.isPending || referral.status !== "created"}
            onClick={() => patch.mutate("reviewed")}
            className="w-full rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-medium disabled:opacity-50 transition"
          >
            Mark as Reviewed
          </button>
          <button
            type="button"
            data-testid={TEST_IDS.markSentBtn}
            disabled={patch.isPending || referral.status !== "approved"}
            onClick={() => patch.mutate("sent")}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-3 py-2 text-sm font-semibold disabled:opacity-50 transition"
          >
            <Send className="h-4 w-4" /> Mark as Sent
          </button>
          <button
            type="button"
            disabled={patch.isPending || referral.status !== "sent"}
            onClick={() => patch.mutate("acknowledged")}
            className="w-full rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-medium disabled:opacity-50 transition"
          >
            Acknowledge Receipt
          </button>
          <button
            type="button"
            disabled={patch.isPending || referral.status !== "acknowledged"}
            onClick={() => patch.mutate("closed")}
            className="w-full rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-medium disabled:opacity-50 transition"
          >
            Close Referral
          </button>
          <p className="text-[11px] text-slate-500 mt-2">
            Each step is enforced by the backend workflow state machine — an out-of-order transition is rejected.
          </p>
        </div>
      </Section>
    </div>
  );
}

/* ---------- Activity / Audit Trail (Phase 4) ---------- */

function AuditHistoryTab({ referralId }) {
  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["referral-history", referralId],
    queryFn: () => getReferralHistory(referralId),
    refetchOnMount: "always",
  });

  if (isLoading) {
    return <div className="text-sm text-slate-500 p-6">Loading audit events…</div>;
  }
  if (error) {
    return (
      <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-4">
        Unable to load audit history: {getErrorMessage(error)}
      </div>
    );
  }

  const formatEventType = (type) => {
    const map = {
      referral_created: "Referral Created",
      extraction_completed: "AI Extraction Completed",
      referral_reviewed: "Marked as Reviewed",
      referral_approved: "Handover Approved by Clinician",
      referral_sent: "Referral Marked Sent",
      referral_acknowledged: "Receipt Acknowledged",
      referral_closed: "Referral Closed",
      referral_rejected: "Referral Rejected",
      referral_reopened: "Referral Reopened",
      referral_edited: "SBAR Edited",
    };
    return map[type] || type.replace(/_/g, " ");
  };

  return (
    <div className="space-y-4">
      <Section title="Referral Audit Trail & Activity Log" Icon={History}>
        <p className="text-xs text-slate-500 mb-6">
          Immutable event log tracking every action, transition, and actor throughout the referral lifecycle.
        </p>
        {events.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No events recorded for this referral.</div>
        ) : (
          <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
            {events.map((ev, idx) => (
              <div key={ev.id || idx} className="relative group">
                <div className="absolute -left-[31px] top-0 h-4 w-4 rounded-full bg-[#2F6B4F] border-4 border-white shadow-sm" />
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg p-4 space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-semibold text-sm text-slate-900">{formatEventType(ev.event_type)}</span>
                    <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {ev.created_at || "Just now"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-medium text-slate-800">{ev.actor_username || "System"}</span>
                    {ev.actor_role && (
                      <span className="bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px]">
                        {ev.actor_role}
                      </span>
                    )}
                  </div>
                  {(ev.old_status || ev.new_status) && (
                    <div className="text-xs text-slate-700 flex items-center gap-1.5 pt-1">
                      <span className="text-slate-500">State:</span>
                      {ev.old_status && <span className="font-medium text-slate-600">{ev.old_status}</span>}
                      {ev.old_status && ev.new_status && <ArrowRight className="h-3 w-3 text-slate-400" />}
                      <span className="font-semibold text-[#1E4634]">{ev.new_status}</span>
                    </div>
                  )}
                  {ev.change_summary && (
                    <div className="text-xs text-slate-600 bg-white border border-slate-100 rounded p-2 mt-1 font-mono">
                      {ev.change_summary}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------- Version History & Diff (Phase 5) ---------- */

function VersionHistoryTab({ referralId, currentRecord }) {
  const { data: versions = [], isLoading, error } = useQuery({
    queryKey: ["referral-versions", referralId],
    queryFn: () => getReferralVersions(referralId),
    refetchOnMount: "always",
  });

  const [selectedVersion, setSelectedVersion] = useState(null);

  if (isLoading) {
    return <div className="text-sm text-slate-500 p-6">Loading versions…</div>;
  }
  if (error) {
    return (
      <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-4">
        Unable to load version history: {getErrorMessage(error)}
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-4">
        <Section title="Version Snapshots" Icon={Layers}>
          <p className="text-xs text-slate-500 mb-3">
            Every clinical revision creates an immutable version snapshot.
          </p>
          {versions.length === 0 ? (
            <div className="text-sm text-slate-500 italic">Only current draft exists (no prior revisions saved).</div>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <button
                  key={v.version_number}
                  type="button"
                  onClick={() => setSelectedVersion(v)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedVersion?.version_number === v.version_number
                      ? "border-[#2F6B4F] bg-[#F1F7F2]"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900">Version {v.version_number}</span>
                    <span className="text-[11px] text-slate-500 font-mono">{v.created_at?.slice(0, 16) || "Initial"}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    By: <span className="font-medium text-slate-800">{v.actor_username || "System"}</span>
                  </div>
                  {v.change_summary && (
                    <div className="text-[11px] text-slate-500 mt-1 italic">{v.change_summary}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="lg:col-span-2">
        <Section title="Structured Content & Revision Diff" Icon={FileText}>
          {selectedVersion ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="font-semibold text-sm text-slate-900">
                  Inspecting Snapshot: Version {selectedVersion.version_number}
                </div>
                <span className="text-xs text-slate-500 font-mono">Actor: {selectedVersion.actor_username}</span>
              </div>
              <div>
                <h4 className="text-xs uppercase font-semibold text-slate-500 tracking-wider mb-2">
                  Handover SBAR at Version {selectedVersion.version_number}
                </h4>
                <pre className="whitespace-pre-wrap text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-800 max-h-72 overflow-auto">
                  {selectedVersion.data?.sbar || "No SBAR stored in this snapshot."}
                </pre>
              </div>
              {currentRecord.sbar && selectedVersion.data?.sbar !== currentRecord.sbar && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <h4 className="text-xs uppercase font-semibold text-emerald-800 tracking-wider mb-2">
                    Current Live Handover SBAR (Approved / Active)
                  </h4>
                  <pre className="whitespace-pre-wrap text-xs font-mono bg-[#FBF6EE] border border-[#E5DFD1] rounded-lg p-3 text-slate-900 max-h-72 overflow-auto">
                    {currentRecord.sbar}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-500 py-12 text-center italic">
              Select a version from the left panel to inspect its structured snapshot and compare changes.
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ---------- Printable Handover Report (Phase 7) ---------- */

function PrintHandoverReport({ referral, onClose }) {
  const e = referral.extracted || {};
  const v = referral.validation || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 print:hidden">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Handover Report Export</h2>
            <p className="text-xs text-slate-500">Ready for print or PDF export via system printer dialog.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-4 py-2 text-xs font-semibold shadow-sm transition"
            >
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 text-xs font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="space-y-6 text-slate-900 font-sans">
          {/* Header */}
          <div className="border-b-2 border-[#2F6B4F] pb-4 flex justify-between items-start">
            <div>
              <div className="text-2xl font-bold tracking-tight text-[#1E4634]">ClinBridge Clinical Handover</div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">
                Referral ID: <strong className="text-slate-900">{referral.referral_id}</strong> | Workflow Status: <strong className="text-slate-900 uppercase">{STATUS_LABEL[referral.status] || referral.status}</strong>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">Documentation Quality Score</div>
              <div className="text-xl font-bold font-mono text-[#2F6B4F]">{v.quality_score}/100</div>
              <div className="text-[11px] font-medium text-slate-600">{BAND_LABEL[v.band]}</div>
            </div>
          </div>

          {/* Critical Disclaimer */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            <strong>DOCUMENTATION QUALITY LAYER HANDOVER:</strong> This structured document is an AI-assisted, clinician-verified clinical handover summary. It is not an official EHR legal medical record or an autonomous diagnosis. For clinical review only.
          </div>

          {/* Patient & Situation Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs border border-slate-200 rounded-lg p-4 bg-slate-50/50">
            <div>
              <span className="text-slate-500 uppercase tracking-wider font-semibold block text-[10px]">Patient Demographics</span>
              <div className="mt-1 font-medium">Age: {e.patient?.patient_age ?? "Not documented"} | Sex: {e.patient?.patient_sex ?? "Not documented"}</div>
            </div>
            <div>
              <span className="text-slate-500 uppercase tracking-wider font-semibold block text-[10px]">Referral Destination</span>
              <div className="mt-1 font-medium">{e.recommendation?.referred_to || "Not documented"}</div>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 uppercase tracking-wider font-semibold block text-[10px]">Reason for Referral</span>
              <div className="mt-1 font-medium">{e.situation?.reason_for_referral || "Not documented"}</div>
            </div>
          </div>

          {/* Structured Clinical Summary */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase font-bold text-slate-700 tracking-wider">Clinical Background & Assessment</h3>
            <div className="grid grid-cols-2 gap-3 text-xs border border-slate-200 rounded-lg p-4">
              <div>
                <span className="text-slate-500 font-semibold block">History:</span>
                <div>{e.background?.history || "Not documented"}</div>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Medications:</span>
                <div>{e.background?.medications?.length ? e.background.medications.join(", ") : "Not documented"}</div>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Allergies:</span>
                <div>{e.background?.allergies?.length ? e.background.allergies.join(", ") : "Not documented"}</div>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Vitals:</span>
                <div>
                  BP: {e.assessment?.vitals?.blood_pressure || "—"}, HR: {e.assessment?.vitals?.heart_rate || "—"}, SpO2: {e.assessment?.vitals?.spo2 || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* SBAR Section */}
          <div className="space-y-2">
            <h3 className="text-xs uppercase font-bold text-slate-700 tracking-wider">Approved SBAR Handover Text</h3>
            <pre className="whitespace-pre-wrap text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-900 leading-relaxed">
              {referral.sbar || "No SBAR handover generated."}
            </pre>
          </div>

          {/* Validation & Audit Stamp */}
          <div className="border-t border-slate-200 pt-4 flex justify-between items-end text-[11px] text-slate-500 font-mono">
            <div>
              <div>Created: {referral.created_at || "—"} | Originator: {referral.created_by || "Clinician"}</div>
              <div>Acknowledged by: {referral.acknowledged_by || "Pending"} | Closed: {referral.closed_at || "In Progress"}</div>
            </div>
            <div className="text-right font-semibold text-slate-700">
              ClinBridge Handover Layer v0.4
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
