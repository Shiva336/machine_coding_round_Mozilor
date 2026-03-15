import { AxiosError } from "axios";

export interface ParsedApiError {
  serverError: string | null;
  fieldErrors: Record<string, string>;
}

/**
 * Extracts a user-friendly error from an Axios error response returned by
 * the FastAPI backend.
 *
 * FastAPI returns validation errors (422) as:
 *   { detail: [{ loc: ["body", "field"], msg: "…" }, …] }
 *
 * And business errors (401, 409, …) as:
 *   { detail: "…" }
 */
export function parseApiError(err: unknown): ParsedApiError {
  if (!(err instanceof AxiosError) || !err.response) {
    return {
      serverError: "An unexpected error occurred. Please try again.",
      fieldErrors: {},
    };
  }

  const { status, data } = err.response;

  // 422 – Pydantic validation errors
  if (status === 422 && Array.isArray(data.detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const item of data.detail as Array<{
      loc: string[];
      msg: string;
    }>) {
      const field = item.loc?.[item.loc.length - 1];
      if (field && typeof item.msg === "string") {
        // Strip the "Value error, " prefix Pydantic adds
        fieldErrors[field] = item.msg.replace(/^Value error,\s*/i, "");
      }
    }
    return { serverError: null, fieldErrors };
  }

  // Business error (401, 403, 409, etc.)
  const message =
    typeof data?.detail === "string"
      ? data.detail
      : "An unexpected error occurred. Please try again.";

  return { serverError: message, fieldErrors: {} };
}
