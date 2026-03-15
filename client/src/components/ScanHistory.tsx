import { Link, useParams } from "react-router-dom";
import type { ScanSummary } from "../api/scan";

const PAGE_SIZE = 10;

interface ScanHistoryProps {
  scans: ScanSummary[];
  total: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
  /** Called when the user navigates to a scan (e.g. to close mobile drawer). */
  onNavigate?: () => void;
  isLoading: boolean;
}

/**
 * Paginated list of past scans rendered inside the sidebar.
 *
 * Each scan is a React Router <Link> navigating to /scans/:id.
 * The active scan is determined by matching the current URL param,
 * not by external state.
 *
 * WCAG / ARIA:
 *  - <nav> with aria-label wraps the list.
 *  - Each scan is a <Link> (renders as <a>) — keyboard-navigable and
 *    announced correctly by screen readers as a link.
 *  - aria-current="page" on the link matching the current route.
 *  - aria-label on each link describes its full content.
 *  - Empty state is a plain <p> visible to all users and AT.
 *  - Loading skeleton uses aria-hidden.
 *  - Status badges use text + icon, never colour alone.
 *  - Pagination prev/next buttons have aria-label; active page has
 *    aria-current="page".
 */
export default function ScanHistory({
  scans,
  total,
  offset,
  onPageChange,
  onNavigate,
  isLoading,
}: ScanHistoryProps) {
  const { scanId } = useParams<{ scanId: string }>();
  const activeScanId = scanId ? parseInt(scanId, 10) : null;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  if (isLoading) {
    return (
      <div aria-hidden="true" className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-gray-400">
        No scans yet.<br />Enter a URL on the dashboard to get started.
      </p>
    );
  }

  return (
    <nav aria-label="Scan history navigation">
      <ul role="list" className="space-y-1">
        {scans.map((scan) => {
          const isActive = scan.id === activeScanId;
          return (
            <li key={scan.id}>
              <Link
                to={`/scans/${scan.id}`}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                aria-label={`${
                  scan.status === "pending"
                    ? "Scanning"
                    : scan.status === "completed"
                      ? "Completed scan of"
                      : "Failed scan of"
                } ${scan.url}${
                  scan.status === "completed"
                    ? `, ${scan.total_images} images, ${scan.images_with_alt} with alt text`
                    : ""
                }`}
                className={`block rounded-lg px-3 py-2.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                  isActive
                    ? "bg-indigo-50 ring-1 ring-indigo-200"
                    : "hover:bg-gray-100"
                }`}
              >
                {/* URL */}
                <p
                  className={`truncate text-xs font-medium ${
                    isActive ? "text-indigo-700" : "text-gray-800"
                  }`}
                  title={scan.url}
                >
                  {scan.url}
                </p>

                {/* Date + status */}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">
                    {formatDate(scan.scanned_at)}
                  </span>
                  <StatusPill status={scan.status} />
                </div>

                {/* Image counts — completed only */}
                {scan.status === "completed" && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    <span className="font-medium text-emerald-600">
                      {scan.images_with_alt}
                    </span>
                    {" / "}
                    <span className="font-medium text-gray-600">
                      {scan.total_images}
                    </span>{" "}
                    with alt
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Scan history pagination"
          className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3"
        >
          <button
            type="button"
            onClick={() => onPageChange(offset - PAGE_SIZE)}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ Prev
          </button>

          <span className="text-xs text-gray-400">
            {currentPage} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(offset + PAGE_SIZE)}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next ›
          </button>
        </nav>
      )}
    </nav>
  );
}

// Sub-components

function StatusPill({ status }: { status: ScanSummary["status"] }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800">
        <svg aria-hidden="true" className="h-2.5 w-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Scanning
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
        <svg aria-hidden="true" className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
        </svg>
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
      <svg aria-hidden="true" className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      Done
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
