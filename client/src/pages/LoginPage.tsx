import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthForm from "../components/AuthForm";
import { useAuth } from "../hooks/useAuth";
import { parseApiError } from "../utils/parseApiError";

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
