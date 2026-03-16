import { useContext } from "react";
import { AuthContext, type AuthContextType } from "../context/AuthContext";

/**
 * Convenience hook that consumes the AuthContext.
 *
 * Throws a clear error if called outside of an `<AuthProvider>`.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>.");
  }
  return context;
}
