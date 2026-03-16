import { useCallback, useEffect, useRef } from "react";
import type { ScanSummary } from "../api/scan";

const POLL_INTERVAL = 3000;       // ms between ticks
const MAX_ATTEMPTS = 40;          // 40 × 3 s = 2 min max polling window
const MAX_CONSECUTIVE_ERRORS = 3; // stop if server fails this many times in a row

/**
 * Polls the history list while any scan in `scans` has ``status === "pending"``.
 *
 * Mirrors the robustness of `usePolling` (single-scan) but operates on the
 * history endpoint so ALL pending scans' sidebar pills update from one call.
 *
 * Design decisions:
 *  - Uses a setTimeout chain (not setInterval) so ticks wait for the
 *    previous fetch to settle before scheduling the next one.
 *  - All mutable tracking lives in refs — this hook never triggers its own
 *    re-renders.
 *  - Skips a tick (but keeps scheduling) when a fetch is already in-flight
 *    or when the browser tab is hidden; those skipped ticks do NOT consume
 *    attempts.
 *  - Stops permanently after MAX_ATTEMPTS actual fetches, or after
 *    MAX_CONSECUTIVE_ERRORS consecutive failures.
 *  - Effect dependency is `hasPending` (boolean) — the timer chain starts
 *    when the first pending scan appears and stops when all are gone.
 *  - Counters (attempts, consecutive errors) reset ONLY when the number of
 *    pending scans INCREASES (a new scan was submitted). A scan completing
 *    does not reset counters — a stuck scan keeps burning its budget
 *    towards MAX_ATTEMPTS without getting a free reset every time another
 *    scan happens to finish.
 *
 * @param scans     - Current history list from AppLayout state.
 * @param onRefresh - Silent re-fetcher that returns true on success, false on
 *                    failure. Must NOT show a loading skeleton.
 */
export function useHistoryPolling(
  scans: ScanSummary[],
  onRefresh: () => Promise<boolean>,
): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const timerRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef        = useRef(false);
  const attemptsRef          = useRef(0);
  const consecutiveErrorsRef = useRef(0);

  // Current number of pending scans — updated on every render via a ref so
  // the tick function can read the latest value without needing to be in the
  // effect's dependency array.
  const pendingCount = scans.filter((s) => s.status === "pending").length;
  const pendingCountRef = useRef(pendingCount);
  pendingCountRef.current = pendingCount;

  // Tracks the pending count at the last counter-reset point.
  // Used inside the tick to detect when new scans are submitted.
  const prevPendingCountRef = useRef(0);

  const hasPending = pendingCount > 0;

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // No pending scans — stop the chain and clear the baseline count so the
    // next submission starts cleanly.
    if (!hasPending) {
      stop();
      prevPendingCountRef.current = 0;
      return;
    }

    // hasPending just became true (first pending scan in an otherwise-idle
    // state). Reset everything and record the starting count.
    attemptsRef.current          = 0;
    consecutiveErrorsRef.current = 0;
    prevPendingCountRef.current  = pendingCountRef.current;

    const tick = async () => {
      // Skip tick — tab not visible. Don't count as an attempt.
      if (document.hidden) {
        timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL);
        return;
      }

      // Skip tick — previous fetch still in flight. Don't count as an attempt.
      if (isFetchingRef.current) {
        timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL);
        return;
      }

      // A new scan was submitted since the last reset — reset counters so the
      // fresh batch gets its full attempt budget. A scan completing (count
      // decreasing) does NOT trigger this branch.
      if (pendingCountRef.current > prevPendingCountRef.current) {
        attemptsRef.current          = 0;
        consecutiveErrorsRef.current = 0;
        prevPendingCountRef.current  = pendingCountRef.current;
      }

      attemptsRef.current += 1;

      // Hit the attempt ceiling — stop entirely.
      if (attemptsRef.current > MAX_ATTEMPTS) {
        stop();
        return;
      }

      isFetchingRef.current = true;
      const success = await onRefreshRef.current();
      isFetchingRef.current = false;

      if (success) {
        consecutiveErrorsRef.current = 0;
      } else {
        consecutiveErrorsRef.current += 1;
        if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
          stop();
          return;
        }
      }

      timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL);
    };

    // Kick off the first tick after one interval.
    timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL);

    return stop;
  }, [hasPending, stop]); // eslint-disable-line react-hooks/exhaustive-deps
  // pendingCountRef is intentionally omitted — it's a ref updated every
  // render, read inside the tick closure. Including it would cause the effect
  // to restart (killing the timer chain) on every pending count change.
}
