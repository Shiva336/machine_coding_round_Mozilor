import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getMe,
  loginUser,
  logoutUser,
  registerUser,
  type User,
} from "../api/auth";

// Context shape 

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  /** `true` while the initial session-validation check is in-flight. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

// Provider

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: call /me to check whether the browser has a valid access_token
  // cookie.  We can't inspect HttpOnly cookies from JS – the server is the
  // only source of truth.  If the cookie is missing or expired, /me returns
  // 401 and we stay logged out.  If it's expired but a valid refresh_token
  // cookie exists, the response interceptor in axios.ts will silently rotate
  // the tokens and retry before this .catch ever runs.
  useEffect(() => {
    getMe()
      .then(({ data }) => setUser(data))
      .catch(() => {
        // No valid session – stay logged out.  Cookies are managed by the
        // server; nothing to clear on the client.
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // The server sets the access_token + refresh_token cookies in the
    // Set-Cookie header.  The response body carries the user profile so
    // we don't need an extra /me round-trip.
    const { data } = await loginUser(email, password);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { data } = await registerUser(email, password);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Server revokes the refresh token in the DB and clears both cookies
      // via Set-Cookie: Max-Age=0.  Best-effort – clear local state even
      // if the server is temporarily unreachable.
      await logoutUser();
    } catch {
      // Intentionally swallowed.
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
