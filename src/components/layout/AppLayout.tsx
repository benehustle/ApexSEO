import React, { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Globe, 
  Calendar, 
  Search, 
  Settings, 
  HelpCircle, 
  LogOut, 
  Menu, 
  X
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/auth.service';

export const AppLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'My Sites', href: '/onboarding', icon: Globe }, // Ideally this would be a list or a dedicated sites page
    { name: 'Content Calendar', href: '/calendar', icon: Calendar },
    { name: 'Keyword Research', href: '/keywords', icon: Search },
  ];

  const secondaryNavigation = [
    { name: 'Settings', href: '/settings', icon: Settings },
    { name: 'Help Center', href: '/help', icon: HelpCircle },
  ];

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-glow">
                A
              </div>
              <span className="text-xl font-bold text-gray-900 tracking-tight">Apex SEO</span>
            </div>
            <button 
              className="ml-auto lg:hidden text-gray-500"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) => `
                    flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative
                    ${isActive 
                      ? 'bg-primary-50 text-primary-700' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <item.icon className={`
                    w-5 h-5 mr-3 transition-colors
                    ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'}
                  `} />
                  {item.name}
                  {isActive && (
                    <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-primary-600" />
                  )}
                </NavLink>
              );
            })}

            <div className="pt-6 pb-2">
              <div className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Support & Settings
              </div>
              {secondaryNavigation.map((item) => {
                 const isActive = location.pathname === item.href;
                 return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) => `
                      flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group
                      ${isActive 
                        ? 'bg-primary-50 text-primary-700' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }
                    `}
                  >
                    <item.icon className={`
                      w-5 h-5 mr-3 transition-colors
                      ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'}
                    `} />
                    {item.name}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium">
                {user?.email?.[0].toUpperCase() || 'U'}
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.displayName || 'User'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="ml-2 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-glow">
              A
            </div>
            <span className="font-bold text-gray-900">Apex SEO</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
