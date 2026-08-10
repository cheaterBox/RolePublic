import { apiFetch } from "@/lib/api/client";
import type { InboxJob } from "@/lib/api/types";

export function listInbox() {
  return apiFetch<InboxJob[]>("/inbox");
}
export function deleteInbox(id: string) {
  return apiFetch<void>(`/inbox/${id}`, { method: "DELETE" });
}
export function markProcessed(id: string) {
  return apiFetch<void>(`/inbox/${id}/process`, { method: "POST", body: {} });
}
