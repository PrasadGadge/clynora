import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Heart, LayoutDashboard, FilePlus2, ListChecks, Route as RouteIcon, ShieldCheck, LogOut, Info, MapPin } from "lucide-react";
import { Toaster } from "sonner";
import { TEST_IDS } from "../constants/testIds/clinbridge";
import { ROLE_LABEL, isValidRole } from "../constants/roles";

const navItems = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, testId: TEST_IDS.navDashboard, end: true },
  { to: "/app/new", label: "New Referral", icon: FilePlus2, testId: TEST_IDS.navNewReferral },
  { to: "/app/referrals", label: "Referrals", icon: ListChecks, testId: TEST_IDS.navReferrals },
  { to: "/app/tracking", label: "Tracking", icon: RouteIcon, testId: TEST_IDS.navTracking },
  { to: "/app/directory", label: "Pune Directory", icon: MapPin, testId: "nav-directory" },
  { to: "/app/about", label: "About", icon: Info, testId: TEST_IDS.navAbout },
];



export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const storedRole = localStorage.getItem("clinbridge_role");
  const username = localStorage.getItem("clinbridge_username");
  const role = isValidRole(storedRole) ? storedRole : null;

  const logout = () => {
    localStorage.removeItem("clinbridge_role");
    localStorage.removeItem("clinbridge_token");
    localStorage.removeItem("clinbridge_username");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#1E241F]">
      <Toaster position="top-right" richColors />
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-[#E5DFD1] bg-[#FBF6EE]">
          <Link to="/app" data-testid={TEST_IDS.sidebarBrand} className="flex items-center gap-2 px-6 py-5 border-b border-[#E5DFD1]">
            <Heart className="h-5 w-5 text-[#2F6B4F] fill-[#2F6B4F]/20" />
            <div>
              <div className="font-serif-display text-xl text-[#1E241F] leading-none">ClinBridge</div>
              <div className="text-[11px] text-[#8A8577] mt-0.5">Referral Quality Layer</div>
            </div>
          </Link>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={item.testId}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#2F6B4F] text-white"
                      : "text-[#3A423B] hover:bg-[#EFE7D6]"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-4 py-4 border-t border-[#E5DFD1] text-[11px] text-[#4B5147] leading-relaxed">
            <div className="flex items-center gap-1.5 font-medium text-[#1E4634] mb-1">
              <ShieldCheck className="h-3.5 w-3.5 text-[#2F6B4F]" />
              Clinician-in-the-loop
            </div>
            AI prepares the handover. The clinician verifies and approves it.
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F5F0E8]/85 border-b border-[#E5DFD1]">
            <div className="flex items-center justify-between px-6 py-3">
              <div className="lg:hidden flex items-center gap-2">
                <Heart className="h-4 w-4 text-[#2F6B4F] fill-[#2F6B4F]/20" />
                <span className="font-serif-display text-lg">ClinBridge</span>
              </div>
              <div className="hidden lg:block text-sm text-[#4B5147]">
                {breadcrumbFor(location.pathname)}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#E5DFD1] bg-white px-3 py-1 text-xs text-[#4B5147]"
                  data-testid="persona-badge"
                  title="Signed in — role is enforced server-side on every referral action."
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2F6B4F]" />
                  {username ? <strong className="text-[#1E4634]">{username}</strong> : null}
                  {username ? " · " : ""}
                  <strong className="text-[#1E4634]">{ROLE_LABEL[role]}</strong>
                </span>
                <button
                  type="button"
                  onClick={logout}
                  data-testid="logout-btn"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DFD1] hover:border-[#2F6B4F]/40 bg-white px-3 py-1.5 text-xs font-medium text-[#3A423B]"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            </div>
            {/* Mobile nav */}
            <nav className="lg:hidden flex overflow-x-auto gap-1 px-3 pb-3">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  data-testid={item.testId + "-mobile"}
                  className={({ isActive }) =>
                    `whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium ${
                      isActive ? "bg-[#2F6B4F] text-white" : "bg-white border border-[#E5DFD1] text-[#3A423B]"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-[1400px] w-full mx-auto">
            <Outlet />
          </main>

          <footer className="border-t border-[#E5DFD1] bg-[#F0E9DC] px-6 py-4 text-xs text-[#8A8577]" data-testid="app-footer">
            ClinBridge is an information-quality and handover assistance tool. It does not diagnose, prescribe, or determine medical urgency.
          </footer>
        </div>
      </div>
    </div>
  );
}

function breadcrumbFor(path) {
  if (path === "/app" || path === "/app/") return "Dashboard";
  if (path.startsWith("/app/new")) return "New Referral";
  if (path.match(/^\/app\/referrals\/[^/]+/)) return "Referral Workspace";
  if (path.startsWith("/app/referrals")) return "Referrals";
  if (path.startsWith("/app/tracking")) return "Referral Tracking";
  if (path.startsWith("/app/directory")) return "Pune Clinics & Specialists Directory";
  if (path.startsWith("/app/about")) return "About";
  return "";
}
