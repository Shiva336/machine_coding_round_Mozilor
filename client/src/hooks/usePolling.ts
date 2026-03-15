import { useCallback, useEffect, useRef, useState } from "react";
import { getScanDetail, type ScanDetail } from "../api/scan";

const MAX_ATTEMPTS = 30; // 30 × 2.5 s = 75 s max polling window

/**
 * Polls ``GET /api/scans/{scanId}`` at a fixed interval until the scan
 * transitions out of ``"pending"`` or the max attempt count is exceeded.
 *
 * @param scanId  - The scan to watch, or ``null`` to disable polling.
 * @param interval - Polling interval in milliseconds (default 2 500 ms).
 * @param onComplete - Called once when status becomes ``"completed"`` or
 *   ``"failed"``, receiving the final scan detail.
 */
export function usePolling(
  scanId: number | null,
  interval = 2500,
  onComplete?: (scan: ScanDetail) => void,
): { isPolling: boolean } {
  const [isPolling, setIsPolling] = useState(false);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref to onComplete so we can call it inside the interval without
  // including it in the dependency array.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsPolling(false);
    attemptsRef.current = 0;
  }, []);

  useEffect(() => {
    if (scanId === null) {
      stopPolling();
      return;
    }

    attemptsRef.current = 0;
    setIsPolling(true);

    const poll = async () => {
      attemptsRef.current += 1;

      try {
        const { data } = await getScanDetail(scanId);

        if (data.status !== "pending") {
          // Scan is settled — notify caller and stop.
          onCompleteRef.current?.(data);
          stopPolling();
          return;
        }
      } catch {
        // Network error while polling — stop to avoid hammering the server.
        stopPolling();
        return;
      }

      // Still pending — schedule next tick unless limit reached.
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        stopPolling();
        return;
      }

      timerRef.current = setTimeout(() => void poll(), interval);
    };

    // Kick off the first poll immediately.
    timerRef.current = setTimeout(() => void poll(), interval);

    return stopPolling;
  }, [scanId, interval, stopPolling]);

  return { isPolling };
}
