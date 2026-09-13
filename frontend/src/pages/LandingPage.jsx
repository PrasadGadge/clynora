import { Link } from "react-router-dom";
import { Heart, ArrowRight, ShieldCheck, Building2, Stethoscope, User, Landmark, Sparkles, FileText, ClipboardCheck, Send } from "lucide-react";

/**
 * Public landing page matching the reference site design (forest-green + cream).
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#1E241F]">
      <TopNav />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 pt-10 lg:pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="cb-eyebrow" data-testid="landing-eyebrow">
            <ShieldCheck className="h-3.5 w-3.5" />
            AI assists. Humans verify. Doctors decide.
          </div>
          <h1 className="font-serif-display text-5xl sm:text-6xl lg:text-[68px] leading-[1.05] mt-6 text-[#1E241F]">
            Connecting Hospitals.
            <br />
            <span className="text-[#2F6B4F] italic">Strengthening Clinical Handover.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-[#4B5147] max-w-xl leading-relaxed">
            ClinBridge is a prototype AI-assisted clinical referral workflow that makes patient
            handovers structured, clinician-verifiable, and traceable — from referral to
            recovery, in one workflow.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/login"
              data-testid="hero-get-started"
              className="inline-flex items-center gap-2 rounded-full bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-5 py-3 text-sm font-semibold transition-colors"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              data-testid="hero-explore"
              className="inline-flex items-center gap-2 rounded-full border border-[#2F6B4F]/25 hover:border-[#2F6B4F]/50 bg-white/60 px-5 py-3 text-sm font-semibold text-[#1E4634]"
            >
              Explore ClinBridge
            </Link>
          </div>
        </div>

        {/* Right image + floating card */}
        <div className="relative">
          <div className="rounded-2xl overflow-hidden shadow-lg border border-[#E5DFD1]">
            <img
              src="https://images.pexels.com/photos/7579823/pexels-photo-7579823.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
              alt="Doctor consulting patient"
              className="w-full h-[420px] object-cover"
            />
          </div>
          <div className="absolute -bottom-6 left-6 sm:left-10 bg-white rounded-xl shadow-xl border border-[#E5DFD1] p-4 w-[300px]">
            <div className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold">Example Referral Preview — not a real patient</div>
            <div className="text-[11px] uppercase tracking-wide text-[#8A8577] mt-1">Referral CB-REF-10245</div>
            <div className="font-semibold mt-1 text-[#1E241F]">AI Check completed</div>
            <div className="mt-2 flex gap-1.5 text-[11px]">
              <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5">6 ok</span>
              <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5">2 review</span>
              <span className="rounded-full bg-rose-50 border border-rose-200 text-rose-800 px-2 py-0.5">1 missing</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-7xl mx-auto px-6 lg:px-12 py-20">
        <h2 className="font-serif-display text-4xl sm:text-5xl text-[#1E241F]">How it works</h2>
        <p className="mt-2 text-[#4B5147]">Three simple steps to safer patient transfers.</p>
        <div className="mt-10 grid md:grid-cols-3 gap-6">
          {[
            { n: "01", title: "Create Referral", Icon: FileText, body: "Hospital creates a structured patient referral with clinical detail." },
            { n: "02", title: "AI Verification", Icon: Sparkles, body: "ClinBridge AI extracts info and flags missing or unclear details." },
            { n: "03", title: "Secure Handover", Icon: Send, body: "Receiving clinician acknowledges and closes the loop in-app — a prototype workflow, not live hospital-to-hospital transmission." },
          ].map((s) => (
            <div key={s.n} className="cb-card p-6">
              <div className="text-xs font-mono text-[#8A8577]">{s.n}</div>
              <div className="mt-4 flex items-center gap-2">
                <s.Icon className="h-4 w-4 text-[#2F6B4F]" />
                <h3 className="text-xl font-semibold text-[#1E241F]">{s.title}</h3>
              </div>
              <p className="mt-3 text-sm text-[#4B5147] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 lg:px-12 pb-20">
        <h2 className="font-serif-display text-4xl sm:text-5xl">Everything a referral needs</h2>
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { Icon: Sparkles, t: "AI Clinical Extraction", d: "Convert unstructured referrals into structured clinical data." },
            { Icon: ClipboardCheck, t: "Deterministic Validation", d: "Missing fields and potential conflicts surfaced automatically." },
            { Icon: ShieldCheck, t: "Doctor Verification", d: "Clinician-in-the-loop approval before any referral moves forward." },
            { Icon: Send, t: "Referral Tracking", d: "Workflow status from Created → Reviewed → Approved → Sent." },
            { Icon: FileText, t: "Structured Handover", d: "SBAR-format draft ready for clinician review and edit." },
            { Icon: User, t: "Patient Health Record", d: "Roadmap: longitudinal referral record for continuity of care." },
            { Icon: Landmark, t: "Insurance Network", d: "Roadmap: coverage-aware routing between facilities." },
            { Icon: Building2, t: "Hospital-to-Hospital", d: "Roadmap: acknowledged closed-loop delivery." },
          ].map((f) => (
            <div key={f.t} className="cb-card p-5">
              <f.Icon className="h-5 w-5 text-[#2F6B4F]" />
              <div className="mt-3 font-semibold text-[#1E241F]">{f.t}</div>
              <div className="mt-1 text-xs text-[#4B5147] leading-relaxed">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 lg:px-12 pb-24">
        <div className="cb-cream-card p-10 lg:p-14 text-center">
          <h3 className="font-serif-display text-3xl sm:text-4xl">From Referral to Recovery, Connected.</h3>
          <p className="mt-3 text-[#4B5147]">Structured referrals. Smarter handovers. Connected hospitals.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-5 py-3 text-sm font-semibold"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="text-sm font-semibold text-[#1E4634]">See features</a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function TopNav() {
  return (
    <header className="max-w-7xl mx-auto px-6 lg:px-12 py-5 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
        <Heart className="h-5 w-5 text-[#2F6B4F] fill-[#2F6B4F]/20" />
        <span className="font-serif-display text-xl text-[#1E241F]">ClinBridge</span>
      </Link>
      <nav className="hidden md:flex items-center gap-8 text-sm text-[#3A423B]">
        <a href="#how" className="hover:text-[#1E4634]">How it works</a>
        <a href="#features" className="hover:text-[#1E4634]">Features</a>
        <Link to="/pricing" className="hover:text-[#1E4634]">Pricing</Link>
        <a href="#features" className="hover:text-[#1E4634]">More Services</a>
      </nav>
      <div className="flex items-center gap-3">
        <Link to="/login" data-testid="nav-signin" className="text-sm font-medium text-[#1E4634]">
          Sign in
        </Link>
        <Link
          to="/login"
          data-testid="nav-get-started"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-4 py-2 text-sm font-semibold"
        >
          Get Started <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#E5DFD1] bg-[#F0E9DC]">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 grid md:grid-cols-4 gap-8 text-sm text-[#4B5147]">
        <div>
          <div className="flex items-center gap-2 text-[#1E241F]">
            <Heart className="h-4 w-4 text-[#2F6B4F] fill-[#2F6B4F]/20" />
            <span className="font-serif-display text-lg">ClinBridge</span>
          </div>
          <p className="mt-3 max-w-xs text-xs leading-relaxed">
            Information-quality and handover assistance for clinical referrals. Not a
            diagnosis or prescribing system.
          </p>
        </div>
        <div>
          <div className="font-semibold text-[#1E241F] mb-2">Product</div>
          <ul className="space-y-1">
            <li><a href="#how">How it works</a></li>
            <li><a href="#features">Features</a></li>
            <li><Link to="/pricing">Pricing</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-[#1E241F] mb-2">Account</div>
          <ul className="space-y-1">
            <li><Link to="/login">Sign in</Link></li>
            <li><Link to="/login">Get Started</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-[#1E241F] mb-2">SIH 2026</div>
          <p className="text-xs leading-relaxed">
            Prototype for the Smart India Hackathon 2026. Not for real clinical use.
          </p>
        </div>
      </div>
      <div className="border-t border-[#E5DFD1] px-6 py-4 text-center text-xs text-[#8A8577]">
        © 2026 ClinBridge. All rights reserved.
      </div>
    </footer>
  );
}
