import type { ScanDetail } from "../api/scan";
import ScanChart from "./ScanChart";

interface ScanResultsProps {
  scan: ScanDetail;
  isPolling: boolean;
}

/**
 * Displays the status, summary stats, chart, and image detail table for a
 * single scan.
 *
 * WCAG / ARIA:
 *  - aria-live="polite" on the status region announces status changes to
 *    screen readers without interrupting them.
 *  - Status uses text + icon, not colour alone.
 *  - <table> with <caption>, <thead>, <th scope="col">.
 *  - Missing alt text is indicated with text + icon, not just red colour.
 *  - Long src URLs have a title attribute for hover/AT access to the full URL.
 *  - aria-label on icon-only cells.
 */
export default function ScanResults({ scan, isPolling }: ScanResultsProps) {
  return (
    <section aria-label="Scan results">
      {/* Status banner */}
      <div aria-live="polite" aria-atomic="true">
        <StatusBadge scan={scan} isPolling={isPolling} />
      </div>

      {/* Summary stats */}
      {scan.status === "completed" && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3" role="group" aria-label="Image counts">
            <StatCard
              label="Total Images"
              value={scan.total_images}
              colorClass="text-gray-900"
              bgClass="bg-gray-50"
            />
            <StatCard
              label="With Alt Text"
              value={scan.images_with_alt}
              colorClass="text-emerald-700"
              bgClass="bg-emerald-50"
            />
            <StatCard
              label="Missing Alt"
              value={scan.images_without_alt}
              colorClass={scan.images_without_alt > 0 ? "text-red-700" : "text-emerald-700"}
              bgClass={scan.images_without_alt > 0 ? "bg-red-50" : "bg-emerald-50"}
            />
          </div>

          {/* Chart — only when there are images */}
          {scan.total_images > 0 && (
            <div className="mt-4">
              <ScanChart
                withAlt={scan.images_with_alt}
                withoutAlt={scan.images_without_alt}
                mode="pie"
              />
            </div>
          )}

          {/* Image detail table */}
          {scan.images.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <caption className="sr-only">
                  Images found on {scan.url}
                </caption>
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-semibold text-gray-600"
                    >
                      Image URL
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left font-semibold text-gray-600"
                    >
                      Alt Text
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center font-semibold text-gray-600"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {scan.images.map((img) => (
                    <tr key={img.id} className="hover:bg-gray-50">
                      {/* Source URL */}
                      <td className="max-w-xs px-4 py-3">
                        <span
                          className="block truncate text-gray-700"
                          title={img.src}
                        >
                          {img.src || (
                            <span className="italic text-gray-500">
                              (no src)
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Alt text value */}
                      <td className="max-w-xs px-4 py-3">
                        {img.has_alt ? (
                          img.alt === "" ? (
                            <span className="italic text-gray-500">
                              (decorative)
                            </span>
                          ) : (
                            <span
                              className="block truncate text-gray-700"
                              title={img.alt ?? ""}
                            >
                              {img.alt}
                            </span>
                          )
                        ) : (
                          <span className="flex items-center gap-1 font-medium text-red-600">
                            <svg
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Missing
                          </span>
                        )}
                      </td>

                      {/* Pass / Fail icon */}
                      <td className="px-4 py-3 text-center">
                        {img.has_alt ? (
                          <span
                            aria-label="Pass – alt text present"
                            className="inline-flex items-center justify-center"
                          >
                            <svg
                              aria-hidden="true"
                              className="h-5 w-5 text-emerald-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        ) : (
                          <span
                            aria-label="Fail – alt text missing"
                            className="inline-flex items-center justify-center"
                          >
                            <svg
                              aria-hidden="true"
                              className="h-5 w-5 text-red-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-600">
              No images were found on this page.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// Sub-components

function StatusBadge({
  scan,
  isPolling,
}: {
  scan: ScanDetail;
  isPolling: boolean;
}) {
  if (scan.status === "pending") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        <svg
          aria-hidden="true"
          className="h-4 w-4 animate-spin shrink-0"
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
        <span>
          <span className="font-semibold">Scanning</span> —{" "}
          {isPolling ? "checking for results…" : "queued"}
        </span>
      </div>
    );
  }

  if (scan.status === "failed") {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
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
        <span>
          <span className="font-semibold">Scan failed</span>
          {scan.error_message && ` — ${scan.error_message}`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <svg
        aria-hidden="true"
        className="h-4 w-4 shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        <span className="font-semibold">Scan complete</span> —{" "}
        {scan.total_images} image{scan.total_images !== 1 ? "s" : ""} found
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  colorClass,
  bgClass,
}: {
  label: string;
  value: number;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className={`rounded-lg ${bgClass} p-3 text-center`}>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-600">{label}</p>
    </div>
  );
}
