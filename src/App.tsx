import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { OnboardingTour } from './components/OnboardingTour';
import { LoadingSpinner } from './components/LoadingSpinner';
import { queryClient } from './config/queryClient';
import { AgencyProvider } from './contexts/AgencyContext';
import { Login } from './pages/Login';
import { SiteOnboarding } from './pages/SiteOnboarding';
import { DevUtils } from './pages/DevUtils';
import { HelpCenter } from './pages/HelpCenter';
import { EmbeddedSignup } from './pages/EmbeddedSignup';
import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { ShoplineAuthCallback } from './pages/ShoplineAuthCallback';

import { DashboardLayout } from './components/layout/DashboardLayout';

// Lazy load heavy components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Sites = lazy(() => import('./pages/Sites').then(module => ({ default: module.Sites })));
const ContentCalendar = lazy(() => import('./pages/ContentCalendar'));
const KeywordResearch = lazy(() => import('./pages/KeywordResearch'));
const SiteSettings = lazy(() => import('./pages/SiteSettings'));
const SiteDetailsPage = lazy(() => import('./pages/SiteDetailsPage').then(module => ({ default: module.SiteDetailsPage })));
const UserSettings = lazy(() => import('./pages/UserSettings'));
const AgencyProfilePage = lazy(() => import('./pages/AgencyProfilePage').then(module => ({ default: module.AgencyProfilePage })));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard').then(module => ({ default: module.SuperAdminDashboard })));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ToastProvider>
          <AgencyProvider>
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <OnboardingTour />
              <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/embed/signup" element={<EmbeddedSignup />} />
                <Route path="/auth/callback" element={<ShoplineAuthCallback />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                
                <Route
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/sites" element={<Sites />} />
                  <Route path="/onboarding" element={<SiteOnboarding />} />
                  <Route path="/sites/:siteId" element={<SiteDetailsPage />} />
                  <Route path="/sites/:siteId/settings" element={<SiteSettings />} />
                  <Route path="/calendar" element={<ContentCalendar />} />
                  <Route path="/dev" element={<DevUtils />} />
                  <Route path="/keywords" element={<KeywordResearch />} />
                  <Route path="/agency" element={<AgencyProfilePage />} />
                  <Route path="/admin" element={<SuperAdminDashboard />} />
                  <Route path="/admin/agency/:agencyId" element={<SuperAdminDashboard />} />
                  <Route path="/settings" element={<UserSettings />} />
                  <Route path="/help" element={<HelpCenter />} />
                </Route>

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          </AgencyProvider>
        </ToastProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
