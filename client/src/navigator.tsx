import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import type { ReactNode } from "react";

// Route guards 

/**
 * Wraps a route that should only be accessible to **unauthenticated** users
 * (login, register).  If the user is already logged in they are redirected
 * to the dashboard.
 */
function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null; // wait for initial auth check
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

/**
 * Wraps a route that requires authentication.  Unauthenticated visitors are
 * redirected to the login page.
 */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null; // wait for initial auth check
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

// Route tree

export default function Navigator() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Catch-all: redirect unknown paths to the dashboard (which will
          itself redirect to /login if not authenticated). */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
