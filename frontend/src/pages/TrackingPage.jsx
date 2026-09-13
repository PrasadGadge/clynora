import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listReferrals } from "../lib/api";
import { TEST_IDS } from "../constants/testIds/clinbridge";
import { StatusBadge } from "../components/StatusBadges";
import { Route as RouteIcon } from "lucide-react";

export default function TrackingPage() {
  const { data: referrals = [], isLoading, error } = useQuery({
    queryKey: ["referrals"],
    queryFn: listReferrals,
    refetchOnMount: "always",
  });

  const groups = {
    created: [],
    reviewed: [],
    approved: [],
    sent: [],
    acknowledged: [],
    closed: [],
    rejected: [],
  };
  referrals.forEach((r) => {
    if (groups[r.status]) groups[r.status].push(r);
  });

  const cols = [
    { key: "created", label: "Created", desc: "Captured & processed" },
    { key: "reviewed", label: "Reviewed", desc: "Clinician reviewed" },
    { key: "approved", label: "Approved", desc: "Clinician approved" },
    { key: "sent", label: "Sent", desc: "Marked as sent (workflow only)" },
    { key: "acknowledged", label: "Acknowledged", desc: "Receipt acknowledged" },
    { key: "closed", label: "Closed", desc: "Handover loop closed" },
    { key: "rejected", label: "Rejected", desc: "Sent back for revision" },
  ];

  return (
    <div data-testid={TEST_IDS.trackingRoot} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Referral tracking</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live workflow status of every referral. "Sent" is a workflow marker only — this prototype does not deliver referrals externally.
        </p>
      </div>

      {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      {error && <div data-testid={TEST_IDS.errorState} className="text-sm text-rose-700">Unable to load referrals.</div>}

      {!isLoading && !error && referrals.length === 0 && (
        <div data-testid={TEST_IDS.emptyState} className="bg-white border border-slate-200/80 rounded-xl p-10 text-center">
          <div className="text-slate-500 text-sm">No referrals to track yet.</div>
        </div>
      )}

      {!isLoading && referrals.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {cols.map((c) => (
            <div key={c.key} className="bg-white border border-slate-200/80 rounded-xl shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{c.label}</div>
                  <div className="text-[11px] text-slate-500">{c.desc}</div>
                </div>
                <span className="text-xs font-mono text-slate-500">{groups[c.key].length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-[520px] overflow-auto">
                {groups[c.key].length === 0 && <div className="text-xs text-slate-400 py-4 text-center">Empty</div>}
                {groups[c.key].map((r) => (
                  <Link
                    key={r.referral_id}
                    to={`/app/referrals/${r.referral_id}`}
                    className="block rounded-lg border border-slate-200 hover:border-[#2F6B4F]/40 hover:bg-[#F9F5EC] p-3 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-sm font-medium text-slate-900">{r.referral_id}</div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 truncate">
                      {r.extracted?.situation?.reason_for_referral || <em>No reason documented</em>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1.5">
                      <RouteIcon className="h-3 w-3" />
                      <span>{r.extracted?.recommendation?.referred_to || "Destination not documented"}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
