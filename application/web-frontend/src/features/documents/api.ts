import { apiFetch } from "@/lib/api/client";
import type { DocumentFileEntry, DocumentSummary } from "@/lib/api/types";

export function listDocuments() {
  return apiFetch<DocumentSummary[]>("/documents");
}
export function createDocument(p: {
  title: string;
  description?: string | null;
}) {
  return apiFetch<{ id: string }>("/documents", { method: "POST", body: p });
}
export function deleteDocument(id: string) {
  return apiFetch<void>(`/documents/${id}`, { method: "DELETE" });
}
export function listFiles(docId: string) {
  return apiFetch<DocumentFileEntry[]>(`/documents/${docId}/files`);
}
export function getMainFile(docId: string) {
  return apiFetch<{ main_file: string | null }>(`/documents/${docId}/main`);
}
