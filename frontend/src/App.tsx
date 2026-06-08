import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

const AppShell = lazy(() => import('@/components/layout/AppShell').then(module => ({ default: module.AppShell })));
const AuthPage = lazy(() => import('@/pages/Auth/AuthPage').then(module => ({ default: module.AuthPage })));
const LandingPage = lazy(() => import('@/pages/LandingPage').then(module => ({ default: module.LandingPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFound').then(module => ({ default: module.NotFoundPage })));
const UpgradePlanPage = lazy(() => import('@/pages/UpgradePlan').then(module => ({ default: module.UpgradePlanPage })));
const AdminApp = lazy(() => import('@/pages/Admin').then(module => ({ default: module.AdminApp })));
// AIFA v3 single-screen demo (Phase 7).
const AifaDemo = lazy(() => import('@/pages/AifaDemo'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export default function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* AIFA v3 single-screen demo is now the default landing (Phase 7). */}
          <Route path="/" element={<Navigate to="/aifa" replace />} />
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
          <Route path="/app/*" element={<Navigate to="/aifa" replace />} />

          {/* ── AIFA v3 single-screen demo (primary UI) ── */}
          <Route path="/aifa" element={<AifaDemo />} />

          {/* ── Legacy AIDLC dashboard: redirected to the single-screen demo ── */}
          <Route path="/sdlc/*" element={<Navigate to="/aifa" replace />} />

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
