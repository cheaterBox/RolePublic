import { apiFetch } from "@/lib/api/client";
import type { DownloadRecord } from "@/lib/api/types";

export function listDownloads() {
  return apiFetch<DownloadRecord[]>("/downloads");
}
export function recordDownload(p: {
  filename: string;
  download_type: string;
  job_id?: string | null;
}) {
  return apiFetch<void>("/downloads", { method: "POST", body: p });
}
