import { Link } from "react-router-dom";
import { Heart, ArrowLeft, Github, ShieldCheck } from "lucide-react";
import { TEST_IDS } from "../constants/testIds/clinbridge";

const TEAM = [
  { name: "Prasad Gadge", role: "Team Leader & Solution Architect" },
  { name: "Sanskriti Dhobale", role: "Clinical Research & Requirements Specialist" },
  { name: "Tejaswini Koli", role: "Clinical Research & Domain Specialist" },
  { name: "Amey Thite", role: "Frontend & UI Developer" },
  { name: "Arvind Rebari", role: "AI & Backend Developer" },
  { name: "Shlok Molak", role: "Testing & Product Validation" },
  { name: "Ashwini Sanjay Gagare", role: "Faculty Guide" },
];

export default function AboutPage() {
  return (
    <div data-testid={TEST_IDS.aboutRoot} className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link to="/app" className="inline-flex items-center gap-1 text-sm text-[#4B5147] hover:text-[#1E4634]">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
        <h1 className="font-serif-display text-4xl mt-3 text-[#1E241F]">About ClinBridge</h1>
        <p className="text-sm text-[#4B5147] mt-2">
          <span className="font-semibold">ClinBridge — AI-Assisted Clinical Referral &amp; Handover Quality Layer.</span>{" "}
          A prototype that turns a raw clinical referral into structured data, deterministically validates it, generates
          an SBAR handover draft, and gates approval on a real clinician. It does not diagnose, prescribe, or make
          autonomous triage decisions.
        </p>
      </div>

      <section className="cb-card p-6" data-testid={TEST_IDS.aboutTeam}>
        <div className="flex items-center gap-2 mb-3">
          <Heart className="h-4 w-4 text-[#2F6B4F] fill-[#2F6B4F]/20" />
          <h2 className="font-semibold text-[#1E241F]">Built for Smart India Hackathon (SIH) 2026</h2>
        </div>
        <p className="text-sm text-[#4B5147] leading-relaxed">
          MAEER&rsquo;s MIT Arts, Commerce and Science College, Alandi (D), Pune (MIT ACSC).
        </p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {TEAM.map((m) => (
            <li key={m.name} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2F6B4F]" />
              <span className="text-[#1E241F] font-medium">{m.name}</span>
              <span className="text-xs text-[#8A8577]">— {m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cb-card p-6">
        <h2 className="font-semibold text-[#1E241F]">Tech stack</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-[#4B5147]">
          <li>• FastAPI + SQLite backend</li>
          <li>• React frontend (Create React App)</li>
          <li>• OpenRouter (<span className="font-mono text-xs">minimax/minimax-m3:free</span>) for LLM extraction — server-side only</li>
          <li>• Deterministic Python for validation and scoring</li>
          <li>• Template-based SBAR handover generation (no LLM)</li>
        </ul>
      </section>

      <section className="cb-card p-6">
        <h2 className="font-semibold text-[#1E241F] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#2F6B4F]" />
          Safety boundary
        </h2>
        <p className="text-sm text-[#4B5147] leading-relaxed mt-3">
          AI assists. Deterministic rules validate. Clinician approves. The Referral Quality Score is a
          documentation-completeness indicator, not a clinical risk or safety score. Potential conflicts are surfaced
          for clinician verification — ClinBridge never states that a medication is unsafe or makes clinical decisions.
        </p>
      </section>

      <section className="cb-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[#1E241F]">Repository</h2>
            <p className="text-xs text-[#8A8577] mt-1">Source code and issue tracker</p>
          </div>
          <a
            href="https://github.com/PrasadGadge/clynora"
            target="_blank"
            rel="noreferrer"
            data-testid={TEST_IDS.aboutRepoLink}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DFD1] hover:border-[#2F6B4F]/50 bg-white px-3 py-1.5 text-xs font-medium text-[#1E4634]"
          >
            <Github className="h-3.5 w-3.5" />
            github.com/PrasadGadge/clynora
          </a>
        </div>
      </section>

      <p className="text-[11px] text-[#8A8577] leading-relaxed">
        Prototype for demonstration and educational use only. Not clinically validated. Not for real patient care.
      </p>
    </div>
  );
}
