import { useRef, useState, type FormEvent } from "react";

interface ScanFormProps {
  onSubmit: (url: string) => Promise<void>;
  isLoading: boolean;
}

/**
 * URL input form for triggering a new accessibility scan.
 *
 * WCAG / ARIA:
 *  - Explicit <label> linked via htmlFor.
 *  - aria-required on the input.
 *  - aria-invalid + aria-describedby wired to the inline error.
 *  - role="alert" on the validation error so screen readers announce it.
 *  - Loading state communicated via aria-disabled + visible spinner.
 *  - Visible focus ring on input and button.
 *  - noValidate – custom validation keeps the browser from surfacing its
 *    own (non-accessible) tooltips.
 */
export default function ScanForm({ onSubmit, isLoading }: ScanFormProps) {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return "Please enter a URL.";
    try {
      const parsed = new URL(trimmed);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return "URL must start with http:// or https://.";
      }
    } catch {
      return "Please enter a valid URL (e.g. https://example.com).";
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;

    const error = validate(url);
    if (error) {
      setUrlError(error);
      inputRef.current?.focus();
      return;
    }

    setUrlError(null);
    await onSubmit(url.trim());
    setUrl("");
  };

  const hasError = urlError !== null;

  return (
    <section aria-label="Scan a URL for image accessibility">
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label
              htmlFor="scan-url"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Website URL
            </label>
            <input
              ref={inputRef}
              id="scan-url"
              name="url"
              type="url"
              autoComplete="url"
              required
              aria-required="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? "scan-url-error" : undefined}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError(null);
              }}
              placeholder="https://example.com"
              disabled={isLoading}
              className={`block w-full rounded-lg border px-3 py-2.5 text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1 sm:text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                hasError
                  ? "border-red-400 focus:ring-red-500"
                  : "border-gray-300 focus:ring-indigo-500"
              }`}
            />
            {hasError && (
              <p
                id="scan-url-error"
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
                {urlError}
              </p>
            )}
          </div>

          {/* Scan button — aligned to the input bottom edge */}
          <button
            type="submit"
            disabled={isLoading}
            aria-disabled={isLoading}
            className="mt-6 flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
          >
            {isLoading ? (
              <>
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
                Scanning…
              </>
            ) : (
              <>
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                  />
                </svg>
                Scan
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
