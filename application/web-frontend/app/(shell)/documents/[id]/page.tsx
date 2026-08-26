"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileCode,
  Hammer,
  History,
  Loader2,
  MessageSquare,
  Plus,
  RotateCw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { writeTrackedFile } from "@/features/documents/api";
import { CollaboratorsModal } from "@/features/documents/components/CollaboratorsModal";
import { CommentsSidebar } from "@/features/documents/components/CommentsSidebar";
import { HistoryDrawer } from "@/features/documents/components/HistoryDrawer";
import { apiFetch } from "@/lib/api/client";
import type {
  DocumentFileEntry,
  DocumentSummary,
  UserPresence,
  WsServerMessage,
} from "@/lib/api/types";
import { buildApiUrl, getApiToken } from "@/lib/config/env";

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [doc, setDoc] = useState<DocumentSummary | null>(null);
  const [files, setFiles] = useState<DocumentFileEntry[]>([]);
  const [mainFile, setMainFile] = useState<string | null>(null);
  const [activeFileRel, setActiveFileRel] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // New File State
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  // Compile State
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [compilationError, setCompilationError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Collaboration Drawers & Modals
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [activePresence, setActivePresence] = useState<UserPresence[]>([]);

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  const loadDoc = async () => {
    setLoading(true);
    try {
      const [docData, filesList, mainData] = await Promise.all([
        apiFetch<DocumentSummary>(`/documents/${id}`),
        apiFetch<DocumentFileEntry[]>(`/documents/${id}/files`),
        apiFetch<{ rel_path: string | null }>(`/documents/${id}/main`),
      ]);

      setDoc(docData);
      setFiles(filesList || []);
      setMainFile(mainData.rel_path);

      if (filesList.length > 0 && !activeFileRel) {
        const defaultFile = mainData.rel_path || filesList[0].rel_path;
        setActiveFileRel(defaultFile);
      }
    } catch (err) {
      console.error("Failed to load document:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDoc();
  }, [id]);

  // Connect WebSocket for live collaboration & presence
  useEffect(() => {
    const token = getApiToken();
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost =
      window.location.hostname === "localhost"
        ? "localhost:8080"
        : window.location.host;
    const wsUrl = `${wsProto}//${wsHost}/api/documents/${id}/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;
        if (msg.type === "presence_list") {
          setActivePresence(msg.users);
        } else if (msg.type === "user_joined") {
          setActivePresence((prev) => [
            ...prev.filter((u) => u.user_id !== msg.presence.user_id),
            msg.presence,
          ]);
        } else if (msg.type === "user_left") {
          setActivePresence((prev) =>
            prev.filter((u) => u.user_id !== msg.user_id),
          );
        } else if (msg.type === "file_updated") {
          // If remote user updated the file currently open, optionally refresh or notify
          if (msg.rel_path === activeFileRel) {
            void apiFetch<{ content: string }>(`/documents/${id}/files/read`, {
              method: "POST",
              body: { rel_path: msg.rel_path },
            }).then((res) => {
              if (res.content) setFileContent(res.content);
            });
          }
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [id, activeFileRel]);

  useEffect(() => {
    if (activeFileRel) {
      void (async () => {
        try {
          const res = await apiFetch<{ content: string }>(
            `/documents/${id}/files/read`,
            {
              method: "POST",
              body: { rel_path: activeFileRel },
            },
          );
          setFileContent(res.content);
        } catch (err) {
          console.error(err);
        }
      })();
    }
  }, [id, activeFileRel]);

  const handleSaveFile = async () => {
    if (!activeFileRel) return;
    try {
      await writeTrackedFile(id, activeFileRel, fileContent);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    try {
      await apiFetch(`/documents/${id}/files/create`, {
        method: "POST",
        body: {
          name: newFileName,
          content: `% ${newFileName}\n`,
        },
      });
      setShowNewFileInput(false);
      setNewFileName("");
      await loadDoc();
      setActiveFileRel(newFileName);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetMain = async (relPath: string) => {
    try {
      await apiFetch(`/documents/${id}/main`, {
        method: "POST",
        body: { rel_path: relPath },
      });
      setMainFile(relPath);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFile = async (relPath: string) => {
    if (!confirm(`Delete ${relPath}?`)) return;
    try {
      await apiFetch(`/documents/${id}/files/delete`, {
        method: "POST",
        body: { rel_path: relPath },
      });
      setActiveFileRel(null);
      await loadDoc();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompile = async () => {
    setIsCompiling(true);
    setCompilationError(null);
    try {
      if (activeFileRel) {
        await writeTrackedFile(id, activeFileRel, fileContent);
      }

      const token = getApiToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(buildApiUrl("/pdf/compile-document"), {
        method: "POST",
        headers,
        body: JSON.stringify({ doc_id: id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || err.error || "Compilation failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch (err: any) {
      console.error(err);
      setCompilationError(
        err.message || "Compilation failed. Check main file.",
      );
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDeleteDoc = async () => {
    if (!confirm("Delete this entire document workspace?")) return;
    try {
      await apiFetch(`/documents/${id}`, { method: "DELETE" });
      router.push("/documents");
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full p-20 text-xs text-[var(--muted)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)] mr-2" />
        <span>Loading collaborative workspace…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] animate-in fade-in-50 duration-150">
      {/* Top Collaboration Header */}
      <header className="h-12 flex items-center justify-between px-4 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 select-none z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/documents"
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            title="Back to Documents"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-2">
            <h1 className="text-xs font-bold text-[var(--ink)] truncate max-w-xs">
              {doc.title}
            </h1>
            <span className="font-mono text-[10px] text-[var(--muted)] bg-[var(--surface-soft)] px-2 py-0.5 rounded">
              Main: {mainFile || "None"}
            </span>
          </div>

          {/* Live Online Collaborators Avatars */}
          {activePresence.length > 0 && (
            <div className="flex items-center -space-x-1.5 pl-2 border-l border-[var(--line)]">
              {activePresence.map((u) => (
                <div
                  key={u.user_id}
                  style={{ borderColor: u.color }}
                  className="w-6 h-6 rounded-full bg-[var(--surface)] border-2 flex items-center justify-center text-[10px] font-bold text-[var(--ink)] shadow-xs"
                  title={`${u.user_name} is active`}
                >
                  {u.user_name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Collaborators Button */}
          <button
            type="button"
            onClick={() => setShowCollaborators(true)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
            title="Manage Team & Permissions"
          >
            <Users className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">Collaborate</span>
          </button>

          {/* Version History & Audit Button */}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
            title="Tracked Changes & Checkpoints"
          >
            <History className="h-3.5 w-3.5 text-blue-400" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Margin Comments Button */}
          <button
            type="button"
            onClick={() => setShowComments(true)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
            title="Review & Line Comments"
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Review</span>
          </button>

          <div className="h-4 w-px bg-[var(--line)] mx-0.5" />

          {/* Compile Project */}
          <button
            type="button"
            onClick={handleCompile}
            disabled={isCompiling}
            className="flex items-center gap-1.5 h-8 px-3 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isCompiling ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Hammer className="h-3.5 w-3.5" />
            )}
            <span>Compile</span>
          </button>

          {pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              download={`${doc.title}.pdf`}
              className="flex items-center gap-1 h-8 px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)]"
              title="Download PDF"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            type="button"
            onClick={handleSaveFile}
            className="flex items-center gap-1 h-8 px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)]"
            title="Save & Record Changes"
          >
            {isSaved ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleDeleteDoc}
            className="flex items-center h-8 px-2 rounded border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-white"
            title="Delete Workspace"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Error Bar */}
      {compilationError && (
        <div className="px-4 py-2 bg-[rgba(248,81,73,0.15)] border-b border-[var(--warning)] text-xs text-[var(--warning)] font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate">{compilationError}</span>
        </div>
      )}

      {/* 3-Pane Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
        {/* Left: File Tree Explorer */}
        <div className="w-full lg:w-64 bg-[var(--bg-accent)] border-b lg:border-b-0 lg:border-r border-[var(--line)] p-3 flex flex-col gap-2 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between px-1 pb-1 border-b border-[var(--line)]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              FILES ({files.length})
            </span>
            <button
              type="button"
              onClick={() => setShowNewFileInput(true)}
              className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
              title="Add File"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {showNewFileInput && (
            <div className="p-2 bg-[var(--surface)] border border-[var(--line)] rounded space-y-1.5">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="filename.tex"
                className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-2 py-1 text-xs font-mono text-[var(--ink)] focus:outline-hidden"
              />
              <div className="flex justify-end gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setShowNewFileInput(false)}
                  className="px-2 py-0.5 text-[var(--muted)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateFile}
                  className="px-2 py-0.5 bg-[var(--accent)] text-white rounded font-bold"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {files.map((f) => {
              const isMain = mainFile === f.rel_path;
              const isActive = activeFileRel === f.rel_path;

              return (
                <div
                  key={f.rel_path}
                  onClick={() => setActiveFileRel(f.rel_path)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-xs font-mono group transition-colors ${
                    isActive
                      ? "bg-[var(--surface-soft)] text-[var(--ink)] font-bold"
                      : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <FileCode
                      className={`h-3.5 w-3.5 shrink-0 ${isMain ? "text-amber-400" : "text-[var(--muted)]"}`}
                    />
                    <span className="truncate">{f.rel_path}</span>
                    {isMain && (
                      <span className="tag-pill text-[9px] font-bold bg-amber-500/15 text-amber-300 border-amber-500/30 px-1.5 py-0.5">
                        MAIN
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isMain && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSetMain(f.rel_path);
                        }}
                        className="text-[9px] text-[var(--muted)] hover:text-amber-400 font-sans"
                        title="Set as main entrypoint"
                      >
                        Main
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteFile(f.rel_path);
                      }}
                      className="text-[var(--muted)] hover:text-[var(--warning)] p-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: File Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0d0f14] overflow-hidden">
          <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-mono text-[var(--muted)] select-none">
            <span>{activeFileRel || "No file selected"}</span>
            <span>{fileContent.split("\n").length} lines</span>
          </div>

          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full bg-[#0d0f14] p-4 font-mono text-xs text-[#e6edf3] border-0 resize-none focus:outline-hidden leading-relaxed select-text overflow-y-auto"
          />
        </div>

        {/* Right: PDF Vector Viewer */}
        <div className="w-full lg:w-[480px] bg-[var(--bg-accent)] border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col shrink-0 overflow-hidden">
          <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] select-none">
            <span>Project PDF Output</span>
          </div>

          <div className="flex-1 bg-zinc-900 overflow-hidden flex items-center justify-center">
            {isCompiling ? (
              <div className="flex flex-col items-center gap-2 text-xs text-[var(--muted)]">
                <RotateCw className="h-6 w-6 animate-spin text-[var(--accent)]" />
                <span>Compiling workspace in Tectonic…</span>
              </div>
            ) : pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                title="Project PDF Preview"
                className="h-full w-full bg-white border-0"
              />
            ) : (
              <div className="text-center p-6 space-y-2 text-[var(--muted)]">
                <FileCode className="h-8 w-8 mx-auto opacity-40" />
                <p className="text-xs">Click Compile to build project PDF.</p>
              </div>
            )}
          </div>
        </div>

        {/* Side Drawers and Modals */}
        <CollaboratorsModal
          docId={id}
          isOpen={showCollaborators}
          onClose={() => setShowCollaborators(false)}
        />

        <HistoryDrawer
          docId={id}
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          onRestoreComplete={() => void loadDoc()}
        />

        <CommentsSidebar
          docId={id}
          activeFileRel={activeFileRel}
          isOpen={showComments}
          onClose={() => setShowComments(false)}
        />
      </div>
    </div>
  );
}
