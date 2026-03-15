import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getScanHistory, scanUrl, type ScanSummary } from "../api/scan";
import ScanChart from "../components/ScanChart";
import ScanForm from "../components/ScanForm";
import { useAppLayout } from "../components/AppLayout";

/**
 * Dashboard page — URL input + history bar chart.
 *
 * Responsibilities:
 *  - Accept a URL from ScanForm and POST to the backend.
 *  - Navigate immediately to /scans/:id (ScanDetailPage handles polling).
 *  - Show a bar chart of recent completed scans when history is available.
 *
 * History data is fetched here solely for the bar chart.  The sidebar's
 * authoritative history list lives in AppLayout and is refreshed via the
 * `refreshHistory` context callback after a new scan is created.
 *
 * WCAG / ARIA:
 *  - Error banner uses role="alert" + aria-live="assertive".
 *  - All interactive elements have visible focus rings.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { refreshHistory } = useAppLayout();

  // Scan form state 
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanErrorRef = useRef<HTMLDivElement>(null);

  // Bar chart data (recent completed scans)
  const [chartScans, setChartScans] = useState<ScanSummary[]>([]);

  useEffect(() => {
    getScanHistory(10, 0)
      .then(({ data }) => setChartScans(data.scans))
      .catch(() => {
        // Non-critical — chart simply won't appear.
      });
  }, []);

  // Focus error banner when it appears.
  useEffect(() => {
    if (scanError) scanErrorRef.current?.focus();
  }, [scanError]);

  // Handlers 
  const handleScanSubmit = async (url: string) => {
    setScanError(null);
    setScanSubmitting(true);
    try {
      const { data: pending } = await scanUrl(url);
      // Refresh sidebar history so the new pending item appears immediately.
      refreshHistory();
      // Navigate to the detail page — polling happens there.
      navigate(`/scans/${pending.id}`);
    } catch {
      setScanError("Failed to start the scan. Please try again.");
    } finally {
      setScanSubmitting(false);
    }
  };

  const hasCompletedScans = chartScans.some((s) => s.status === "completed");

  // Render
  return (
    <div className="mx-auto max-w-2xl space-y-4">

      {/* Server-level error banner */}
      {scanError && (
        <div
          ref={scanErrorRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 focus:outline-none"
        >
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
          <span>{scanError}</span>
        </div>
      )}

      {/* Scan form card */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">
          Scan a page for image accessibility
        </h1>
        <p className="mb-4 text-sm text-gray-500">
          Enter a public URL to check whether its images have descriptive alt text.
        </p>
        <ScanForm onSubmit={handleScanSubmit} isLoading={scanSubmitting} />
      </div>

      {/* Bar chart — visible when there are completed scans */}
      {hasCompletedScans && (
        <section
          aria-label="Recent scan results chart"
          className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200"
        >
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            Recent scans
          </h2>
          <ScanChart mode="bar" scans={chartScans} />
        </section>
      )}
    </div>
  );
}
