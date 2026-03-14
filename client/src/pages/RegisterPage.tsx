import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import AuthForm from "../components/AuthForm";
import { useAuth } from "../hooks/useAuth";

/**
 * Extracts a user-friendly error from an Axios error response returned by
 * the FastAPI backend.
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
      const field = item.loc?.[item.loc.length - 1];
      if (field && typeof item.msg === "string") {
        fieldErrors[field] = item.msg.replace(/^Value error,\s*/i, "");
      }
    }
    return { serverError: null, fieldErrors };
  }

  // Business error (409, etc.)
  const message =
    typeof data.detail === "string"
      ? data.detail
      : "An unexpected error occurred. Please try again.";

  return { serverError: message, fieldErrors: {} };
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (email: string, password: string) => {
    setServerError(null);
    setFieldErrors({});
    setIsLoading(true);

    try {
      await register(email, password);
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
        title="Create Account"
        submitLabel="Register"
        onSubmit={handleSubmit}
        serverError={serverError}
        fieldErrors={fieldErrors}
        footerText="Already have an account?"
        footerLinkText="Sign in"
        footerLinkTo="/login"
        isLoading={isLoading}
      />
    </main>
  );
}
