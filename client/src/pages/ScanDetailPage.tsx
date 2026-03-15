import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getScanDetail, type ScanDetail } from "../api/scan";
import ScanResults from "../components/ScanResults";
import { useAppLayout } from "../components/AppLayout";
import { usePolling } from "../hooks/usePolling";

/**
 * Displays the full results for a single scan.
 *
 * Behaviour:
 *  - Reads `scanId` from the URL param.
 *  - Fetches the scan on mount / when the id changes.
 *  - If the scan is still `pending`, starts polling via usePolling until it
 *    settles (or the polling window expires).
 *  - Calls `refreshHistory` (from AppLayout context) once a pending scan
 *    settles so the sidebar list updates.
 *
 * WCAG / ARIA:
 *  - Error state uses role="alert" so it is announced immediately.
 *  - Loading skeleton uses aria-hidden + aria-busy on the container.
 *  - Back navigation link is keyboard-accessible.
 */
export default function ScanDetailPage() {
  const { scanId } = useParams<{ scanId: string }>();
  const { refreshHistory, deleteScan } = useAppLayout();
  const navigate = useNavigate();

  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // pendingScanId drives polling — set to the id while scan is pending, null
  // once it settles or if it was already completed when first loaded.
  const [pendingScanId, setPendingScanId] = useState<number | null>(null);

  // Ref to error div for focus management.
  const errorRef = useRef<HTMLDivElement>(null);

  // Initial fetch
  useEffect(() => {
    if (!scanId) return;

    const id = parseInt(scanId, 10);
    if (Number.isNaN(id)) {
      setError("Invalid scan ID.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setScan(null);
    setPendingScanId(null);

    getScanDetail(id)
      .then(({ data }) => {
        setScan(data);
        if (data.status === "pending") {
          setPendingScanId(id);
        }
      })
      .catch(() => {
        setError("Could not load the scan. It may have been deleted or you may not have access.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [scanId]);

  // Focus error when it appears.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // Polling (only active while scan is pending)
  const { isPolling } = usePolling(pendingScanId, 2500, (completedScan) => {
    setScan(completedScan);
    setPendingScanId(null);
    // Update sidebar history so the status pill reflects the final state.
    refreshHistory();
  });

  const handleDelete = async () => {
    if (!scan) return;
    if (!window.confirm("Delete this scan? This cannot be undone.")) return;
    await deleteScan(scan.id);
    // Navigation + sidebar refresh are handled by AppLayout's handleDeleteScan.
  };

  // Render
  return (
    <div>
      {/* Back navigation + delete */}
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Dashboard
        </Link>

        {/* Delete button — only shown for settled scans */}
        {scan && scan.status !== "pending" && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
          >
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
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            Delete scan
          </button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div aria-busy="true" aria-label="Loading scan details" className="space-y-3">
          <div aria-hidden="true" className="h-8 w-1/3 animate-pulse rounded-lg bg-gray-200" />
          <div aria-hidden="true" className="h-32 animate-pulse rounded-xl bg-gray-100" />
          <div aria-hidden="true" className="h-64 animate-pulse rounded-xl bg-gray-100" />
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 focus:outline-none"
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
          <span>{error}</span>
        </div>
      )}

      {/* Scan results */}
      {!isLoading && scan && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <h1 className="mb-1 text-lg font-semibold text-gray-900">
            Scan results
          </h1>
          <p
            className="mb-4 truncate text-sm text-gray-500"
            title={scan.url}
          >
            {scan.url}
          </p>
          <ScanResults scan={scan} isPolling={isPolling} />
        </div>
      )}
    </div>
  );
}
