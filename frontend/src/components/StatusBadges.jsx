import { BAND_LABEL, STATUS_LABEL } from "../lib/api";
import { AlertTriangle, CheckCircle2, Clock, Send, FileText, Info, PackageCheck, Archive, XCircle } from "lucide-react";

export function StatusBadge({ status, testId }) {
  const map = {
    created: { label: "Created", cls: "bg-slate-100 text-slate-700 border-slate-200", Icon: FileText },
    reviewed: { label: "Reviewed", cls: "bg-amber-50 text-amber-800 border-amber-200", Icon: Clock },
    approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-800 border-emerald-200", Icon: CheckCircle2 },
    sent: { label: "Sent", cls: "bg-sky-50 text-sky-800 border-sky-200", Icon: Send },
    acknowledged: { label: "Acknowledged", cls: "bg-indigo-50 text-indigo-800 border-indigo-200", Icon: PackageCheck },
    closed: { label: "Closed", cls: "bg-slate-200 text-slate-800 border-slate-300", Icon: Archive },
    rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-800 border-rose-200", Icon: XCircle },
  };
  const m = map[status] || map.created;
  const Icon = m.Icon;
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label || STATUS_LABEL[status]}
    </span>
  );
}

export function QualityBandBadge({ band, testId }) {
  const map = {
    ready_for_review: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", Icon: CheckCircle2 },
    needs_information: { cls: "bg-amber-50 text-amber-800 border-amber-200", Icon: Info },
    requires_attention: { cls: "bg-rose-50 text-rose-800 border-rose-200", Icon: AlertTriangle },
  };
  const m = map[band] || map.needs_information;
  const Icon = m.Icon;
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      <Icon className="h-3 w-3" /> {BAND_LABEL[band] || band}
    </span>
  );
}
