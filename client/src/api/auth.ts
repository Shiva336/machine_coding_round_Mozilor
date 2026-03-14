import api from "./axios";

// Types

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  created_at: string;
}

// API functions

export function registerUser(email: string, password: string) {
  return api.post<TokenResponse>("/api/auth/register", { email, password });
}

export function loginUser(email: string, password: string) {
  return api.post<TokenResponse>("/api/auth/login", { email, password });
}

export function refreshToken(refresh_token: string) {
  return api.post<TokenResponse>("/api/auth/refresh", { refresh_token });
}

export function logoutUser(refresh_token: string) {
  return api.post("/api/auth/logout", { refresh_token });
}

export function getMe() {
  return api.get<User>("/api/auth/me");
}
