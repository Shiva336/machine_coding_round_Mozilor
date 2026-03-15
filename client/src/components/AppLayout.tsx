import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, Outlet, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { deleteScan, getScanHistory, type ScanSummary } from "../api/scan";
import { useAuth } from "../hooks/useAuth";
import { useHistoryPolling } from "../hooks/useHistoryPolling";
import ScanHistory from "./ScanHistory";

// Outlet context type
// Child pages (DashboardPage, ScanDetailPage) receive this via
// useOutletContext() so they can trigger a history refresh.

export interface AppLayoutContext {
  refreshHistory: () => Promise<boolean>;
  deleteScan: (scanId: number) => Promise<void>;
}

// Helpers

/**
 * Returns true only if any scan's id or status has changed between two lists.
 * Used by refreshHistory to skip a React state update when nothing relevant
 * changed, preventing unnecessary sidebar re-renders.
 */
function hasHistoryChanged(prev: ScanSummary[], next: ScanSummary[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].status !== next[i].status) {
      return true;
    }
  }
  return false;
}

export function useAppLayout() {
  return useOutletContext<AppLayoutContext>();
}

const PAGE_SIZE = 10;
const SIDEBAR_WIDTH = "w-72"; // 288 px

/**
 * Shared authenticated layout: header + collapsible sidebar + main content.
 *
 * The sidebar is always visible on md+ screens and collapses to an overlay
 * drawer on smaller screens (toggled by a hamburger button in the header).
 *
 * WCAG / ARIA:
 *  - Skip-to-content link at the very top.
 *  - <header> landmark, <aside> landmark with aria-label.
 *  - Hamburger button: aria-expanded, aria-controls.
 *  - Mobile overlay: aria-hidden backdrop, close button with aria-label.
 *  - Focus is moved into the sidebar when it opens on mobile.
 *  - Escape key closes the sidebar.
 */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { scanId: activeScanIdParam } = useParams<{ scanId: string }>();

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the sidebar when it opens on mobile.
  useEffect(() => {
    if (sidebarOpen) {
      closeButtonRef.current?.focus();
    } else {
      // Return focus to the open button when drawer closes.
      openButtonRef.current?.focus();
    }
  }, [sidebarOpen]);

  // Close sidebar on Escape.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen) setSidebarOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [sidebarOpen]);

  // History state (lifted here so sidebar stays in sync)
  const [history, setHistory] = useState<ScanSummary[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);

  // User-initiated fetches (initial load, pagination) — shows loading skeleton.
  const loadHistory = useCallback(async (offset: number) => {
    setHistoryLoading(true);
    try {
      const { data } = await getScanHistory(PAGE_SIZE, offset);
      setHistory(data.scans);
      setHistoryTotal(data.total);
    } catch {
      // Non-critical – leave previous list visible.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Initial load and on offset change.
  useEffect(() => {
    void loadHistory(historyOffset);
  }, [historyOffset, loadHistory]);

  /**
   * Silent background refresh — used by useHistoryPolling and by child pages
   * after a scan is created or settles.
   *
   * Does NOT show a loading skeleton (background polls must be invisible).
   * Only updates React state when a scan's id or status has actually changed,
   * preventing unnecessary sidebar re-renders on no-op polls.
   *
   * Returns true on success, false on failure so the polling hook can track
   * consecutive errors and stop if the server is persistently down.
   */
  const refreshHistory = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await getScanHistory(PAGE_SIZE, historyOffset);
      setHistory((prev) =>
        hasHistoryChanged(prev, data.scans) ? data.scans : prev,
      );
      setHistoryTotal(data.total);
      return true;
    } catch {
      return false;
    }
  }, [historyOffset]);

  // While any scan in the list is pending, re-fetch the history list every
  // 3 seconds so all sidebar status pills stay up to date — even for scans
  // the user is not currently viewing.
  useHistoryPolling(history, refreshHistory);

  /**
   * Delete a scan by id.
   *
   * After the API call succeeds:
   *  - If the user is currently viewing that scan's detail page, navigate
   *    them to /dashboard so they don't see a stale deleted scan.
   *  - Reload the sidebar history list (with loading skeleton) so the
   *    deleted entry is removed immediately.
   */
  const handleDeleteScan = useCallback(async (scanId: number) => {
    await deleteScan(scanId);
    const viewingDeleted = activeScanIdParam && parseInt(activeScanIdParam, 10) === scanId;
    if (viewingDeleted) {
      navigate("/dashboard", { replace: true });
    }
    // Reload the current page of history so the row disappears.
    await loadHistory(historyOffset);
  }, [activeScanIdParam, navigate, loadHistory, historyOffset]);

  // Handlers 
  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const handleSidebarNavigation = () => {
    // Close mobile drawer when a link is followed.
    setSidebarOpen(false);
  };

  // Sidebar content (shared between mobile drawer + desktop) 
  const sidebarContent = (
    <nav aria-label="Scan history" className="flex h-full flex-col">
      {/* Sidebar header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <span className="text-sm font-semibold text-gray-700">History</span>
        {/* Close button — only shown inside mobile drawer */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close history sidebar"
          className="md:hidden rounded-lg p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <ScanHistory
          scans={history}
          total={historyTotal}
          offset={historyOffset}
          onPageChange={(newOffset) => setHistoryOffset(newOffset)}
          onNavigate={handleSidebarNavigation}
          onDelete={handleDeleteScan}
          isLoading={historyLoading}
        />
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Skip-to-content (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          {/* Left: hamburger (mobile) + logo */}
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              ref={openButtonRef}
              type="button"
              aria-label="Open history sidebar"
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            {/* Logo + app name */}
            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Alt Text Checker – go to dashboard"
            >
              <svg aria-hidden="true" className="h-6 w-6 text-indigo-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              <span className="text-base font-semibold text-gray-900">Alt Text Checker</span>
            </Link>
          </div>

          {/* Right: user + sign out */}
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-600 sm:block">{user?.email}</span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-gray-900/50 md:hidden"
          />
          {/* Drawer */}
          <aside
            id="sidebar"
            aria-label="Scan history"
            className={`fixed inset-y-0 left-0 z-50 ${SIDEBAR_WIDTH} bg-white shadow-xl md:hidden`}
          >
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop sidebar (always visible) */}
      <aside
        aria-label="Scan history"
        className={`fixed bottom-0 left-0 top-14 hidden ${SIDEBAR_WIDTH} border-r border-gray-200 bg-white md:block`}
      >
        {sidebarContent}
      </aside>

      {/* Main content area */}
      <div className="pt-14 md:pl-72">
        <main id="main-content" className="min-h-[calc(100vh-3.5rem)] p-4 sm:p-6">
          {/* Outlet receives the refreshHistory callback via context */}
          <Outlet context={{ refreshHistory, deleteScan: handleDeleteScan } satisfies AppLayoutContext} />
        </main>
      </div>
    </div>
  );
}
