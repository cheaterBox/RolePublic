import { apiFetch } from "@/lib/api/client";
import type {
  CollaboratorRole,
  DocumentChangeEntry,
  DocumentCollaboratorEntry,
  DocumentCommentEntry,
  DocumentFileEntry,
  DocumentRevisionEntry,
  DocumentSummary,
} from "@/lib/api/types";

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

export function readFile(docId: string, relPath: string) {
  return apiFetch<{ content: string }>(`/documents/${docId}/files/read`, {
    method: "POST",
    body: { rel_path: relPath },
  });
}

export function writeFile(docId: string, relPath: string, content: string) {
  return apiFetch<void>(`/documents/${docId}/files/write`, {
    method: "POST",
    body: { rel_path: relPath, content },
  });
}

export function writeTrackedFile(
  docId: string,
  relPath: string,
  content: string,
  summary?: string,
) {
  return apiFetch<{ ok: boolean }>(`/documents/${docId}/files/write_tracked`, {
    method: "POST",
    body: { rel_path: relPath, content, summary },
  });
}

export function createFile(docId: string, name: string, content = "") {
  return apiFetch<void>(`/documents/${docId}/files/create`, {
    method: "POST",
    body: { name, content },
  });
}

export function deleteFile(docId: string, relPath: string) {
  return apiFetch<void>(`/documents/${docId}/files/delete`, {
    method: "POST",
    body: { rel_path: relPath },
  });
}

export function renameFile(
  docId: string,
  oldPath: string,
  newPathOrName: string,
) {
  return apiFetch<void>(`/documents/${docId}/files/rename`, {
    method: "POST",
    body: { old_path: oldPath, new_name: newPathOrName },
  });
}

export function setMainFile(docId: string, relPath: string) {
  return apiFetch<void>(`/documents/${docId}/main`, {
    method: "POST",
    body: { rel_path: relPath },
  });
}

// ---------------------------------------------------------------------------
// Collaborators & RBAC
// ---------------------------------------------------------------------------

export function listCollaborators(docId: string) {
  return apiFetch<DocumentCollaboratorEntry[]>(
    `/documents/${docId}/collaborators`,
  );
}

export function addCollaborator(
  docId: string,
  email: string,
  role: CollaboratorRole | string = "Editor",
) {
  return apiFetch<{ ok: boolean }>(`/documents/${docId}/collaborators`, {
    method: "POST",
    body: { email, role },
  });
}

export function updateCollaboratorRole(
  docId: string,
  userId: string,
  role: CollaboratorRole | string,
) {
  return apiFetch<{ ok: boolean }>(
    `/documents/${docId}/collaborators/${userId}`,
    {
      method: "PUT",
      body: { role },
    },
  );
}

export function removeCollaborator(docId: string, userId: string) {
  return apiFetch<void>(`/documents/${docId}/collaborators/${userId}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Version History & Checkpoint Revisions
// ---------------------------------------------------------------------------

export function listRevisions(docId: string) {
  return apiFetch<DocumentRevisionEntry[]>(`/documents/${docId}/revisions`);
}

export function createRevision(docId: string, title: string) {
  return apiFetch<DocumentRevisionEntry>(`/documents/${docId}/revisions`, {
    method: "POST",
    body: { title },
  });
}

export function restoreRevision(docId: string, revId: string) {
  return apiFetch<{ ok: boolean; restored_files: number }>(
    `/documents/${docId}/revisions/${revId}/restore`,
    {
      method: "POST",
      body: {},
    },
  );
}

// ---------------------------------------------------------------------------
// Granular Edit History & Who Edited What
// ---------------------------------------------------------------------------

export function listHistory(docId: string, limit = 50) {
  return apiFetch<DocumentChangeEntry[]>(
    `/documents/${docId}/history?limit=${limit}`,
  );
}

export function listFileHistory(docId: string, relPath: string) {
  return apiFetch<DocumentChangeEntry[]>(
    `/documents/${docId}/history/file?path=${encodeURIComponent(relPath)}`,
  );
}

// ---------------------------------------------------------------------------
// Margin Comments & Review Annotations
// ---------------------------------------------------------------------------

export function listComments(docId: string, relPath?: string) {
  const query = relPath ? `?rel_path=${encodeURIComponent(relPath)}` : "";
  return apiFetch<DocumentCommentEntry[]>(
    `/documents/${docId}/comments${query}`,
  );
}

export function createComment(
  docId: string,
  relPath: string,
  lineNumber: number,
  content: string,
  selectedText?: string,
) {
  return apiFetch<{ id: string; ok: boolean }>(`/documents/${docId}/comments`, {
    method: "POST",
    body: {
      rel_path: relPath,
      line_number: lineNumber,
      content,
      selected_text: selectedText,
    },
  });
}

export function resolveComment(
  docId: string,
  commentId: string,
  resolved: boolean,
) {
  return apiFetch<{ ok: boolean }>(
    `/documents/${docId}/comments/${commentId}/resolve`,
    {
      method: "PUT",
      body: { resolved },
    },
  );
}

export function deleteComment(docId: string, commentId: string) {
  return apiFetch<void>(`/documents/${docId}/comments/${commentId}`, {
    method: "DELETE",
  });
}
