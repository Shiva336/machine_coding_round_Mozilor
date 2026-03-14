import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

/**
 * Shared Axios instance with the API base URL pre-configured.
 *
 * - Request interceptor: attaches the access token from localStorage.
 * - Response interceptor: on 401, attempts a silent token refresh using the
 *   stored refresh token.  If the refresh succeeds the original request is
 *   retried transparently.  If the refresh fails, tokens are cleared and the
 *   user is redirected to /login.
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor (silent refresh)

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  for (const { resolve, reject } of pendingQueue) {
    if (token) {
      resolve(token);
    } else {
      reject(error);
    }
  }
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401 and if we haven't already retried.
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't try to refresh if the failing request was itself a refresh or
    // login call – that would loop.
    const url: string = originalRequest.url ?? "";
    if (url.includes("/api/auth/refresh") || url.includes("/api/auth/login")) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      return Promise.reject(error);
    }

    // If a refresh is already in flight, queue this request.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((newToken) => {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
        refresh_token: refreshToken,
      });

      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);

      api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;

      processQueue(null, data.access_token);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
