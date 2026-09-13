import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listReferrals } from "../lib/api";
import { TEST_IDS } from "../constants/testIds/clinbridge";
import { StatusBadge, QualityBandBadge } from "../components/StatusBadges";
import { FilePlus2, AlertTriangle, Info } from "lucide-react";

export default function ReferralsListPage() {
  const { data: referrals = [], isLoading, error } = useQuery({
    queryKey: ["referrals"],
    queryFn: listReferrals,
    refetchOnMount: "always",
  });

  return (
    <div data-testid={TEST_IDS.referralsListRoot} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Referrals</h1>
          <p className="text-sm text-slate-500 mt-1">All referrals processed by ClinBridge (SQLite persistence).</p>
        </div>
        <Link
          to="/app/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-4 py-2 text-sm font-medium"
        >
          <FilePlus2 className="h-4 w-4" /> New referral
        </Link>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm">
        {isLoading && <div className="p-6 text-sm text-slate-500">Loading…</div>}
        {error && (
          <div data-testid={TEST_IDS.errorState} className="p-6 text-sm text-rose-700 bg-rose-50">
            Unable to load referrals.
          </div>
        )}
        {!isLoading && !error && referrals.length === 0 && (
          <div data-testid={TEST_IDS.emptyState} className="p-10 text-center">
            <div className="text-slate-500 text-sm">No referrals yet.</div>
            <Link to="/app/new" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1E4634]">
              Create the first referral →
            </Link>
          </div>
        )}
        {!isLoading && !error && referrals.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Referral ID</th>
                  <th className="text-left px-6 py-3 font-medium">Reason</th>
                  <th className="text-left px-6 py-3 font-medium">Destination</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-left px-6 py-3 font-medium">Quality</th>
                  <th className="text-left px-6 py-3 font-medium">Score</th>
                  <th className="text-left px-6 py-3 font-medium">Signals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...referrals].reverse().map((r) => {
                  const missing = r.validation?.missing_fields?.length || 0;
                  const conflicts = r.validation?.potential_conflicts?.length || 0;
                  return (
                    <tr key={r.referral_id} data-testid={TEST_IDS.referralListRow} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-mono font-medium">
                        <Link to={`/app/referrals/${r.referral_id}`} className="text-slate-900 hover:text-[#2F6B4F]">
                          {r.referral_id}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-slate-700 max-w-xs truncate">
                        {r.extracted?.situation?.reason_for_referral || <span className="text-slate-400">Not documented</span>}
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {r.extracted?.recommendation?.referred_to || <span className="text-slate-400">Not documented</span>}
                      </td>
                      <td className="px-6 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-6 py-3"><QualityBandBadge band={r.validation?.band} /></td>
                      <td className="px-6 py-3 font-mono">{r.validation?.quality_score}/100</td>
                      <td className="px-6 py-3 text-xs">
                        <div className="flex flex-wrap gap-1.5">
                          {missing > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5">
                              <Info className="h-3 w-3" /> {missing}
                            </span>
                          )}
                          {conflicts > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5">
                              <AlertTriangle className="h-3 w-3" /> {conflicts}
                            </span>
                          )}
                          {missing === 0 && conflicts === 0 && <span className="text-slate-400">Clean</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
