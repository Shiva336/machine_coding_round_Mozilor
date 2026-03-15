import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

/**
 * Shared Axios instance with the API base URL pre-configured.
 *
 * Tokens are stored in HttpOnly cookies and are therefore never accessible
 * to JavaScript.  The browser attaches them automatically on every request
 * because ``withCredentials: true`` is set.
 *
 * Response interceptor: on 401, attempts a silent token refresh by calling
 * POST /api/auth/refresh (the refresh_token cookie is sent automatically).
 * If the refresh succeeds, the original request is retried.  If it fails,
 * the user is redirected to /login – the server already cleared the cookies
 * via Set-Cookie on the failed refresh response.
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  // Required for cross-origin requests: tells the browser to include cookies
  // and accept Set-Cookie headers from the API server.
  withCredentials: true,
});

// Response interceptor (silent refresh)

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: () => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  for (const { resolve, reject } of pendingQueue) {
    if (error) {
      reject(error);
    } else {
      resolve();
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

    // If a refresh is already in flight, queue this request.
    if (isRefreshing) {
      return new Promise<void>((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then(() => api(originalRequest));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // POST /api/auth/refresh – refresh_token cookie sent automatically.
      await api.post("/api/auth/refresh");

      // New access_token cookie is now set by the server.  Retry all
      // queued requests and the original one; cookies are attached by
      // the browser automatically.
      processQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      // Server cleared the cookies on failure; redirect to login.
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
