import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

// Types 

export interface AuthFormProps {
  /** Heading displayed at the top of the form card. */
  title: string;
  /** Label shown on the submit button. */
  submitLabel: string;
  /** Called with (email, password) when the form is submitted. */
  onSubmit: (email: string, password: string) => Promise<void>;
  /** A server-level error message (e.g. "Invalid credentials"). */
  serverError: string | null;
  /** Per-field errors keyed by field name (e.g. { password: "…" }). */
  fieldErrors: Record<string, string>;
  /** Prompt before the navigation link (e.g. "Don't have an account?"). */
  footerText: string;
  /** Text for the navigation link (e.g. "Register"). */
  footerLinkText: string;
  /** Route the navigation link points to (e.g. "/register"). */
  footerLinkTo: string;
  /** Whether a submission is currently in-flight. */
  isLoading: boolean;
}

// Component

export default function AuthForm({
  title,
  submitLabel,
  onSubmit,
  serverError,
  fieldErrors,
  footerText,
  footerLinkText,
  footerLinkTo,
  isLoading,
}: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Refs for focus management (WCAG 2.4.3 – Focus Order)
  const serverErrorRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Move focus to the server-error banner when it appears.
  useEffect(() => {
    if (serverError && serverErrorRef.current) {
      serverErrorRef.current.focus();
    }
  }, [serverError]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;
    void onSubmit(email, password);
  };

  const hasEmailError = Boolean(fieldErrors.email);
  const hasPasswordError = Boolean(fieldErrors.password);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Card */}
        <div className="rounded-xl bg-white px-6 py-8 shadow-lg sm:px-10">
          <h1 className="mb-6 text-center text-2xl font-bold tracking-tight text-gray-900">
            {title}
          </h1>

          {/* Server error banner */}
          {serverError && (
            <div
              ref={serverErrorRef}
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 focus:outline-none"
            >
              {/* Visible icon so the error is not conveyed by colour alone */}
              <svg
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email field */}
            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                ref={emailRef}
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-required="true"
                aria-invalid={hasEmailError}
                aria-describedby={hasEmailError ? "auth-email-error" : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                className={`mt-1 block w-full rounded-lg border px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1 sm:text-sm ${
                  hasEmailError
                    ? "border-red-400 focus:ring-red-500"
                    : "border-gray-300 focus:ring-indigo-500"
                }`}
                placeholder="you@example.com"
              />
              {hasEmailError && (
                <p
                  id="auth-email-error"
                  role="alert"
                  className="mt-1 flex items-center gap-1 text-sm text-red-600"
                >
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={
                  footerLinkTo === "/login" ? "new-password" : "current-password"
                }
                required
                aria-required="true"
                aria-invalid={hasPasswordError}
                aria-describedby={
                  hasPasswordError ? "auth-password-error" : undefined
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`mt-1 block w-full rounded-lg border px-3 py-2 text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1 sm:text-sm ${
                  hasPasswordError
                    ? "border-red-400 focus:ring-red-500"
                    : "border-gray-300 focus:ring-indigo-500"
                }`}
                placeholder="••••••••"
              />
              {hasPasswordError && (
                <p
                  id="auth-password-error"
                  role="alert"
                  className="mt-1 flex items-center gap-1 text-sm text-red-600"
                >
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              aria-disabled={isLoading}
              className="flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  {submitLabel === "Sign In" ? "Signing in…" : "Registering…"}
                </span>
              ) : (
                submitLabel
              )}
            </button>
          </form>

          {/* Footer nav link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            {footerText}{" "}
            <Link
              to={footerLinkTo}
              className="font-semibold text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded"
            >
              {footerLinkText}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
