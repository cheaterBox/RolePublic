import { apiFetch } from "@/lib/api/client";

export function testCloud() {
  return apiFetch<{ ok: boolean }>("/cloud/test", { method: "POST", body: {} });
}
export function listBackups() {
  return apiFetch<{ key: string; size: number }[]>("/cloud/list", {
    method: "GET",
  });
}
