import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/layout/AppLayout";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import PricingPage from "@/pages/PricingPage";
import DashboardPage from "@/pages/DashboardPage";
import NewReferralPage from "@/pages/NewReferralPage";
import ReferralsListPage from "@/pages/ReferralsListPage";
import ReferralWorkspacePage from "@/pages/ReferralWorkspacePage";
import TrackingPage from "@/pages/TrackingPage";
import DirectoryPage from "@/pages/DirectoryPage";
import AboutPage from "@/pages/AboutPage";
import { isValidRole } from "@/constants/roles";

function RequireRole({ children }) {
  const role = localStorage.getItem("clinbridge_role");
  const token = localStorage.getItem("clinbridge_token");
  if (!isValidRole(role) || !token) {
    // Clears any stale/invalid session so a fresh login starts clean.
    if (role) localStorage.removeItem("clinbridge_role");
    if (token) localStorage.removeItem("clinbridge_token");
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/* App (role-gated) */}
        <Route
          path="/app"
          element={
            <RequireRole>
              <AppLayout />
            </RequireRole>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="new" element={<NewReferralPage />} />
          <Route path="referrals" element={<ReferralsListPage />} />
          <Route path="referrals/:id" element={<ReferralWorkspacePage />} />
          <Route path="tracking" element={<TrackingPage />} />
          <Route path="directory" element={<DirectoryPage />} />
          <Route path="about" element={<AboutPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
