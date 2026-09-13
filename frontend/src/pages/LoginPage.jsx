import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Heart, Loader2 } from "lucide-react";
import { login, getErrorMessage } from "../lib/api";
import { LOGIN } from "../constants/testIds/auth";

/**
 * Real authentication against the ClinBridge backend (POST /api/auth/login).
 * Demo accounts (see backend/.env.example and README "Demo accounts"):
 *   admin / dr.deshmukh / dr.rao / coordinator1 — all share the demo
 *   password documented in README, configurable via CLINBRIDGE_DEMO_PASSWORD.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Enter a username and password.");
      return;
    }
    setLoading(true);
    try {
      const data = await login(username.trim(), password);
      localStorage.setItem("clinbridge_token", data.token);
      localStorage.setItem("clinbridge_role", data.role);
      localStorage.setItem("clinbridge_username", data.username);
      navigate("/app");
    } catch (err) {
      setError(getErrorMessage(err, "Login failed. Check your username and password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-[#E5DFD1] shadow-sm p-8 w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-[#4B5147] hover:text-[#1E4634]" data-testid="login-back">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div className="flex items-center gap-2 mt-4">
          <Heart className="h-5 w-5 text-[#2F6B4F] fill-[#2F6B4F]/20" />
          <span className="font-serif-display text-xl">ClinBridge</span>
        </div>
        <h1 className="font-serif-display text-3xl mt-3 text-[#1E241F]">Welcome to ClinBridge</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div>
            <label className="block text-xs text-[#8A8577] mb-1" htmlFor="username">Username</label>
            <input
              id="username"
              data-testid={LOGIN.emailInput}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. dr.deshmukh"
              className="w-full px-3 py-2 border border-[#E5DFD1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B4F]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8A8577] mb-1" htmlFor="password">Password</label>
            <input
              id="password"
              data-testid={LOGIN.passwordInput}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-[#E5DFD1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B4F]"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            data-testid={LOGIN.submitButton}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#2F6B4F] hover:bg-[#1E4634] text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-[11px] text-[#8A8577] mt-4 leading-relaxed">
          Demo accounts: <code>admin</code>, <code>dr.deshmukh</code> (referring clinician),{" "}
          <code>dr.rao</code> (receiving clinician), <code>coordinator1</code>. See the README for the
          shared demo password. Change it before any non-local deployment.
        </p>
      </div>
    </div>
  );
}
