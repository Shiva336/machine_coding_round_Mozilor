import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import AuthForm from "../components/AuthForm";
import { useAuth } from "../hooks/useAuth";

/**
 * Extracts a user-friendly error from an Axios error response returned by
 * the FastAPI backend.
 *
 * FastAPI returns validation errors (422) as:
 *   { detail: [{ loc: ["body","field"], msg: "…" }, …] }
 *
 * And business errors (401, 409, …) as:
 *   { detail: "…" }
 */
function parseApiError(err: unknown): {
  serverError: string | null;
  fieldErrors: Record<string, string>;
} {
  if (!(err instanceof AxiosError) || !err.response) {
    return { serverError: "An unexpected error occurred. Please try again.", fieldErrors: {} };
  }

  const { status, data } = err.response;

  // 422 – Pydantic validation errors
  if (status === 422 && Array.isArray(data.detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const item of data.detail) {
      // loc looks like ["body", "email"] or ["body", "password"]
      const field = item.loc?.[item.loc.length - 1];
      if (field && typeof item.msg === "string") {
        // Strip the "Value error, " prefix Pydantic adds
        fieldErrors[field] = item.msg.replace(/^Value error,\s*/i, "");
      }
    }
    return { serverError: null, fieldErrors };
  }

  // Business error (401, 409, etc.)
  const message =
    typeof data.detail === "string"
      ? data.detail
      : "An unexpected error occurred. Please try again.";

  return { serverError: message, fieldErrors: {} };
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (email: string, password: string) => {
    setServerError(null);
    setFieldErrors({});
    setIsLoading(true);

    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const parsed = parseApiError(err);
      setServerError(parsed.serverError);
      setFieldErrors(parsed.fieldErrors);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <AuthForm
        title="Sign In"
        submitLabel="Sign In"
        onSubmit={handleSubmit}
        serverError={serverError}
        fieldErrors={fieldErrors}
        footerText="Don't have an account?"
        footerLinkText="Register"
        footerLinkTo="/register"
        isLoading={isLoading}
      />
    </main>
  );
}
