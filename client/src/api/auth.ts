import api from "./axios";

// Types

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  user: User;
}

// API functions
// Tokens are delivered/cleared via HttpOnly cookies set by the server.
// The client never reads or writes token strings.

export function registerUser(email: string, password: string) {
  return api.post<AuthResponse>("/api/auth/register", { email, password });
}

export function loginUser(email: string, password: string) {
  return api.post<AuthResponse>("/api/auth/login", { email, password });
}

export function refreshToken() {
  return api.post("/api/auth/refresh");
}

export function logoutUser() {
  return api.post("/api/auth/logout");
}

export function getMe() {
  return api.get<User>("/api/auth/me");
}
