import api from "./axios";

// Types

export interface ImageDetail {
  id: number;
  src: string;
  alt: string | null;
  has_alt: boolean;
}

export interface ScanSummary {
  id: number;
  url: string;
  status: "pending" | "completed" | "failed";
  total_images: number;
  images_with_alt: number;
  images_without_alt: number;
  error_message: string | null;
  scanned_at: string;
}

export interface ScanDetail extends ScanSummary {
  images: ImageDetail[];
}

export interface ScanHistoryResponse {
  scans: ScanSummary[];
  total: number;
}

// API functions

/** Submit a URL for scanning. Returns immediately with a pending scan. */
export function scanUrl(url: string) {
  return api.post<ScanSummary>("/api/scans", { url });
}

/** Fetch the authenticated user's scan history (paginated). */
export function getScanHistory(limit = 20, offset = 0) {
  return api.get<ScanHistoryResponse>("/api/scans", {
    params: { limit, offset },
  });
}

/** Fetch full details for a single scan including image list. */
export function getScanDetail(scanId: number) {
  return api.get<ScanDetail>(`/api/scans/${scanId}`);
}

/** Delete a scan and all its image records. */
export function deleteScan(scanId: number) {
  return api.delete(`/api/scans/${scanId}`);
}
