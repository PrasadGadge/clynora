import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listReferrals, MISSING_FIELD_LABEL } from "../lib/api";
import { TEST_IDS } from "../constants/testIds/clinbridge";
import { StatusBadge, QualityBandBadge } from "../components/StatusBadges";
import {
  AlertTriangle, FileText, CheckCircle2, Clock, Send, Info, ArrowRight,
  PackageCheck, Archive, AlertOctagon, Gauge, BarChart3, PieChart
} from "lucide-react";

function StatCard({ label, value, Icon, tone = "slate", testId }) {
  const tones = {
    slate: "text-slate-700 bg-slate-50",
    sky: "text-sky-700 bg-sky-50",
    emerald: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-700 bg-amber-50",
    rose: "text-rose-700 bg-rose-50",
    indigo: "text-indigo-700 bg-indigo-50",
  };
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm" data-testid={testId}>
      <div className="flex items-center justify-between">
        <div className={`h-9 w-9 rounded-lg grid place-items-center ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 font-mono">{value}</div>
      <div className="mt-1 text-xs text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

const SLA_HOURS_AWAITING_ACK = 4;

function hoursSince(isoString) {
  if (!isoString) return null;
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 3_600_000;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: referrals = [], isLoading, error } = useQuery({
    queryKey: ["referrals"],
    queryFn: listReferrals,
    refetchOnMount: "always",
  });

  const overdueCount = referrals.filter((r) => {
    if (r.status !== "sent") return false;
    const h = hoursSince(r.sent_at);
    return h !== null && h > SLA_HOURS_AWAITING_ACK;
  }).length;

  const scores = referrals.map((r) => r.validation?.quality_score).filter((s) => typeof s === "number");
  const avgQuality = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  // Quality distribution calculation
  const readyCount = referrals.filter((r) => r.validation?.band === "ready_for_review").length;
  const needsInfoCount = referrals.filter((r) => r.validation?.band === "needs_information").length;
  const requiresAttentionCount = referrals.filter((r) => r.validation?.band === "requires_attention").length;

  // Missing fields aggregation
  const missingCounts = {};
  referrals.forEach((r) => {
    (r.validation?.missing_fields || []).forEach((f) => {
      missingCounts[f] = (missingCounts[f] || 0) + 1;
    });
  });
  const topMissing = Object.entries(missingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const stats = {
    total: referrals.length,
    pending: referrals.filter((r) => r.status === "created" || r.status === "reviewed").length,
    approved: referrals.filter((r) => r.status === "approved").length,
    sent: referrals.filter((r) => r.status === "sent").length,
    acknowledged: referrals.filter((r) => r.status === "acknowledged").length,
    closed: referrals.filter((r) => r.status === "closed").length,
    needsInfo: referrals.filter((r) => r.validation?.band === "needs_information" || r.validation?.band === "requires_attention").length,
    conflicts: referrals.filter((r) => (r.validation?.potential_conflicts || []).length > 0).length,
    overdue: overdueCount,
    avgQuality,
  };

  const recent = [...referrals].reverse().slice(0, 8);

  return (
    <div data-testid={TEST_IDS.dashboardRoot} className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of clinical referrals, quality scoring, and closed-loop handover progress.
          </p>
        </div>
        <Link
          to="/app/new"
          className="inline-flex items-center gap-2 rounded-full bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-4 py-2 text-sm font-medium transition shadow-sm"
        >
          New Referral <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="Total referrals" value={stats.total} Icon={FileText} tone="slate" testId={TEST_IDS.statTotal} />
        <StatCard label="Pending review" value={stats.pending} Icon={Clock} tone="amber" testId={TEST_IDS.statPending} />
        <StatCard label="Approved" value={stats.approved} Icon={CheckCircle2} tone="emerald" testId={TEST_IDS.statApproved} />
        <StatCard label="Sent" value={stats.sent} Icon={Send} tone="sky" testId={TEST_IDS.statSent} />
        <StatCard label="Acknowledged" value={stats.acknowledged} Icon={PackageCheck} tone="indigo" />
        <StatCard label="Closed" value={stats.closed} Icon={Archive} tone="slate" />
        <StatCard label="Needs information" value={stats.needsInfo} Icon={Info} tone="amber" testId={TEST_IDS.statNeedsInfo} />
        <StatCard label="Potential conflicts" value={stats.conflicts} Icon={AlertTriangle} tone="rose" testId={TEST_IDS.statConflicts} />
        <StatCard label="Awaiting ack. overdue" value={stats.overdue} Icon={AlertOctagon} tone="rose" />
        <StatCard label="Avg. documentation quality" value={stats.avgQuality === null ? "—" : `${stats.avgQuality}/100`} Icon={Gauge} tone="emerald" />
      </div>

      {/* Analytics Insights (Phase 8) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Quality Distribution */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-[#2F6B4F]" />
              <h3 className="font-semibold text-sm text-slate-900">Documentation Quality Distribution</h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">{referrals.length} referrals</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-emerald-700">Ready for Review (&ge;85)</span>
                <span className="font-mono">{readyCount} ({referrals.length ? Math.round((readyCount / referrals.length) * 100) : 0}%)</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${referrals.length ? (readyCount / referrals.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-amber-700">Needs Information (60–84)</span>
                <span className="font-mono">{needsInfoCount} ({referrals.length ? Math.round((needsInfoCount / referrals.length) * 100) : 0}%)</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${referrals.length ? (needsInfoCount / referrals.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-rose-700">Requires Attention (&lt;60)</span>
                <span className="font-mono">{requiresAttentionCount} ({referrals.length ? Math.round((requiresAttentionCount / referrals.length) * 100) : 0}%)</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all"
                  style={{ width: `${referrals.length ? (requiresAttentionCount / referrals.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Most Frequent Missing Fields */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#2F6B4F]" />
              <h3 className="font-semibold text-sm text-slate-900">Missing Information Frequencies</h3>
            </div>
            <span className="text-[11px] text-slate-500">Quality Gaps</span>
          </div>
          {topMissing.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center italic">No missing information detected across referrals.</div>
          ) : (
            <div className="space-y-2.5">
              {topMissing.map(([field, count]) => (
                <div key={field} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium">{MISSING_FIELD_LABEL[field] || field}</span>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                      <span
                        className="h-full bg-amber-500 block"
                        style={{ width: `${Math.min(100, (count / (referrals.length || 1)) * 100)}%` }}
                      />
                    </span>
                    <span className="font-mono text-slate-600 w-8 text-right">{count}x</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500 -mt-3">
        "Overdue" is a workflow SLA indicator (referrals sent more than {SLA_HOURS_AWAITING_ACK}h ago without acknowledgement) — not a clinical risk measure.
        All metrics measure documentation quality and workflow timeliness, not clinical risk or patient outcomes.
      </p>

      {/* Recent referrals */}
      <section className="bg-white border border-slate-200/80 rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Recent Referrals</h2>
            <p className="text-xs text-slate-500 mt-0.5">Live data from the ClinBridge backend.</p>
          </div>
          <Link to="/app/referrals" className="text-sm text-[#1E4634] hover:text-[#2F6B4F] font-medium">
            View all
          </Link>
        </div>

        {isLoading && <div className="p-6 text-sm text-slate-500">Loading referrals…</div>}
        {error && (
          <div data-testid={TEST_IDS.errorState} className="p-6 text-sm text-rose-700 bg-rose-50 border-t border-rose-100">
            Unable to load referrals. Please check the backend connection.
          </div>
        )}
        {!isLoading && !error && recent.length === 0 && (
          <div data-testid={TEST_IDS.emptyState} className="p-10 text-center">
            <div className="text-slate-500 text-sm">No referrals yet.</div>
            <Link
              to="/app/new"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1E4634] hover:text-[#2F6B4F]"
            >
              Create the first referral <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
        {!isLoading && !error && recent.length > 0 && (
          <div className="overflow-x-auto" data-testid={TEST_IDS.recentReferralsTable}>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/60 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Referral ID</th>
                  <th className="text-left px-6 py-3 font-medium">Destination</th>
                  <th className="text-left px-6 py-3 font-medium">Workflow status</th>
                  <th className="text-left px-6 py-3 font-medium">Referral quality</th>
                  <th className="text-left px-6 py-3 font-medium">Quality score</th>
                  <th className="text-left px-6 py-3 font-medium">Signals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((r) => {
                  const missing = r.validation?.missing_fields?.length || 0;
                  const conflicts = r.validation?.potential_conflicts?.length || 0;
                  return (
                    <tr
                      key={r.referral_id}
                      data-testid={TEST_IDS.recentReferralRow}
                      className="hover:bg-slate-50 cursor-pointer transition"
                      onClick={() => navigate(`/app/referrals/${r.referral_id}`)}
                    >
                      <td className="px-6 py-3 font-mono text-slate-900 font-medium">
                        <Link to={`/app/referrals/${r.referral_id}`} className="hover:text-[#2F6B4F]">
                          {r.referral_id}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {r.extracted?.recommendation?.referred_to || <span className="text-slate-400">Not documented</span>}
                      </td>
                      <td className="px-6 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-6 py-3"><QualityBandBadge band={r.validation?.band} /></td>
                      <td className="px-6 py-3 font-mono text-slate-800">{r.validation?.quality_score}/100</td>
                      <td className="px-6 py-3 text-xs text-slate-600">
                        <div className="flex flex-wrap gap-1.5">
                          {missing > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5">
                              <Info className="h-3 w-3" /> {missing} missing
                            </span>
                          )}
                          {conflicts > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5">
                              <AlertTriangle className="h-3 w-3" /> {conflicts} conflict{conflicts > 1 ? "s" : ""}
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
      </section>
    </div>
  );
}
