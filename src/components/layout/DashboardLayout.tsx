import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Globe, Settings, LogOut, User, Briefcase, Shield, HelpCircle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { authService } from "../../services/auth.service";
import { SupportCenter } from "../support/SupportCenter";
import { useDashboardTour } from "../../hooks/useDashboardTour";

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAppOwner, setIsAppOwner] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Initialize dashboard tour
  useDashboardTour();

  // Check if user is super admin (by email domain)
  useEffect(() => {
    if (!user || !user.email) {
      setIsAppOwner(false);
      return;
    }

    const userEmail = user.email.toLowerCase().trim();
    const isAdmin = userEmail.endsWith('@spotonwebsites.com.au') || userEmail.endsWith('@myapex.io');
    setIsAppOwner(isAdmin);
  }, [user]);

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      navigate("/login");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const navigation = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "Sites", href: "/sites", icon: Globe },
    { name: "My Agency", href: "/agency", icon: Briefcase },
    { name: "Settings", href: "/settings", icon: Settings },
    ...(isAppOwner ? [{ name: "Super Admin", href: "/admin", icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-slate-950 border-r border-slate-800 flex flex-col z-50">
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-slate-800">
          <img 
            src="/logo.svg" 
            alt="Apex SEO" 
            className="h-14 w-auto"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href ||
              (item.href === "/dashboard" && location.pathname === "/") ||
              (item.href === "/sites" && (location.pathname === "/sites" || location.pathname.startsWith("/sites/"))) ||
              (item.href === "/agency" && location.pathname === "/agency") ||
              (item.href === "/admin" && location.pathname.startsWith("/admin"));

            return (
              <NavLink
                key={item.name}
                to={item.href}
                data-tour={item.name === "Settings" ? "settings-nav" : undefined}
                className={({ isActive: navIsActive }) => `
                  flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group
                  ${
                    navIsActive || isActive
                      ? "bg-slate-800 text-blue-400 shadow-lg shadow-blue-500/10"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                  }
                `}
              >
                <item.icon
                  className={`
                    w-5 h-5 mr-3 transition-colors
                    ${isActive ? "text-blue-400" : "text-slate-400 group-hover:text-slate-300"}
                  `}
                />
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile Section */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <User className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.displayName || "User"}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-all duration-200 border border-slate-800 hover:border-slate-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <main className="flex-1 overflow-y-auto bg-slate-900">
          <div className="p-8">
            {children || <Outlet />}
          </div>
        </main>
      </div>

      {/* Help FAB Button */}
      <button
        data-tour="help-fab"
        onClick={() => setIsSupportOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-40"
        title="Get Help"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* Support Center */}
      <SupportCenter isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
};
