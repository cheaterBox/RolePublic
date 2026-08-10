import { apiFetch } from "@/lib/api/client";
import type { FullBackup } from "@/lib/api/types";

export function exportData() {
  return apiFetch<FullBackup>("/data/export");
}
export function importData(backup: FullBackup) {
  return apiFetch<void>("/data/import", { method: "POST", body: backup });
}
