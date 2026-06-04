import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

const AppShell = lazy(() => import('@/components/layout/AppShell').then(module => ({ default: module.AppShell })));
const AuthPage = lazy(() => import('@/pages/Auth/AuthPage').then(module => ({ default: module.AuthPage })));
const LandingPage = lazy(() => import('@/pages/LandingPage').then(module => ({ default: module.LandingPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFound').then(module => ({ default: module.NotFoundPage })));
const UpgradePlanPage = lazy(() => import('@/pages/UpgradePlan').then(module => ({ default: module.UpgradePlanPage })));
const AdminApp = lazy(() => import('@/pages/Admin').then(module => ({ default: module.AdminApp })));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isInitialized } = useAuthStore();

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route
            path="/upgrade"
            element={
              <ProtectedRoute>
                <UpgradePlanPage />
              </ProtectedRoute>
            }
          />
          <Route path="/app/*" element={<Navigate to="/sdlc" replace />} />
          
          {/* ── AIDLC Control Platform ── */}
          <Route
            path="/sdlc/*"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/settings"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
