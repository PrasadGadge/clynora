import { Link } from "react-router-dom";
import { Heart, ArrowRight, Check } from "lucide-react";

const TIERS = [
  {
    name: "Starter",
    price: "₹0",
    period: "per month",
    tag: "For pilots and SIH demos",
    features: [
      "Up to 20 referrals / month",
      "AI extraction + validation",
      "SBAR draft generation",
      "Referral tracking board",
      "Community support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Hospital",
    price: "₹9,900",
    period: "per hospital / month",
    tag: "For single-facility teams",
    features: [
      "Unlimited referrals",
      "All Starter features",
      "Multi-clinician approval",
      "Priority OpenRouter throughput",
      "Email + WhatsApp alerts (roadmap)",
    ],
    cta: "Start Hospital plan",
    highlighted: true,
  },
  {
    name: "Network",
    price: "Custom",
    period: "annual",
    tag: "Multi-hospital + insurance",
    features: [
      "All Hospital features",
      "Hospital-to-hospital delivery (roadmap)",
      "Insurance network dashboards (roadmap)",
      "FHIR / ABDM integrations (roadmap)",
      "Dedicated onboarding",
    ],
    cta: "Talk to us",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#1E241F]">
      <header className="max-w-7xl mx-auto px-6 lg:px-12 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-[#2F6B4F] fill-[#2F6B4F]/20" />
          <span className="font-serif-display text-xl">ClinBridge</span>
        </Link>
        <Link to="/login" className="inline-flex items-center gap-1.5 rounded-full bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-4 py-2 text-sm font-semibold">
          Get Started <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <section className="max-w-6xl mx-auto px-6 lg:px-12 py-14 text-center">
        <h1 className="font-serif-display text-5xl">Simple, honest pricing</h1>
        <p className="mt-3 text-[#4B5147]">Illustrative pricing for the SIH prototype. Real billing is not enabled.</p>
      </section>

      <section className="max-w-6xl mx-auto px-6 lg:px-12 pb-24 grid md:grid-cols-3 gap-5">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={`rounded-2xl p-6 border ${
              t.highlighted
                ? "bg-[#1E4634] text-white border-[#1E4634]"
                : "bg-white text-[#1E241F] border-[#E5DFD1]"
            }`}
            data-testid={`plan-${t.name.toLowerCase()}`}
          >
            <div className={`text-xs uppercase tracking-wide ${t.highlighted ? "text-white/70" : "text-[#8A8577]"}`}>{t.tag}</div>
            <div className="font-serif-display text-2xl mt-2">{t.name}</div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-semibold">{t.price}</span>
              <span className={`text-xs ${t.highlighted ? "text-white/60" : "text-[#8A8577]"}`}>{t.period}</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className={`h-4 w-4 mt-0.5 ${t.highlighted ? "text-[#B7D6C4]" : "text-[#2F6B4F]"}`} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/login"
              className={`mt-6 inline-flex items-center gap-2 rounded-full w-full justify-center px-4 py-2.5 text-sm font-semibold ${
                t.highlighted
                  ? "bg-white text-[#1E4634] hover:bg-[#F5F0E8]"
                  : "bg-[#2F6B4F] text-white hover:bg-[#1E4634]"
              }`}
            >
              {t.cta} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
