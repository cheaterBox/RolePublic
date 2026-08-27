"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  Edit3,
  File,
  FileCode,
  FilePlus,
  FileText,
  Hammer,
  History,
  Layers,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelLeft,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { writeTrackedFile } from "@/features/documents/api";
import { CollaboratorsModal } from "@/features/documents/components/CollaboratorsModal";
import { CommentsSidebar } from "@/features/documents/components/CommentsSidebar";
import { HistoryDrawer } from "@/features/documents/components/HistoryDrawer";
import { getAiConfig } from "@/features/settings/api";
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
  const _router = useRouter();

  // Document & Files State
  const [doc, setDoc] = useState<DocumentSummary | null>(null);
  const [files, setFiles] = useState<DocumentFileEntry[]>([]);
  const [mainFile, setMainFile] = useState<string | null>(null);
  const [activeFileRel, setActiveFileRel] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [fileContentMap, setFileContentMap] = useState<Record<string, string>>(
    {},
  );
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Search & File Management
  const [searchFile, setSearchFile] = useState("");
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Inline Title Editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Editor Coordinates & Controls
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const sidebarWidth = 240;
  const _previewWidth = 520;
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [_copiedSource, setCopiedSource] = useState(false);
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");

  // Compilation & Diagnostics
  const [isCompiling, setIsCompiling] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [showRefineBar, setShowRefineBar] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [compilationError, setCompilationError] = useState<string | null>(null);

  // Collaboration Drawers & Presence
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [activePresence, setActivePresence] = useState<UserPresence[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const activeContent = activeFileRel
    ? (fileContentMap[activeFileRel] ?? "")
    : "";

  // Load Document and its File Tree
  const loadDoc = async () => {
    setLoading(true);
    try {
      const [docData, filesList, mainData] = await Promise.all([
        apiFetch<DocumentSummary>(`/documents/${id}`),
        apiFetch<DocumentFileEntry[]>(`/documents/${id}/files`),
        apiFetch<{ rel_path: string | null }>(`/documents/${id}/main`),
      ]);

      setDoc(docData);
      setTitleDraft(docData.title);
      setFiles(filesList || []);
      setMainFile(mainData.rel_path);

      if (filesList && filesList.length > 0) {
        const defaultFile = mainData.rel_path || filesList[0].rel_path;
        if (!activeFileRel) {
          setActiveFileRel(defaultFile);
          setOpenTabs([defaultFile]);
        }
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

  // Read file content when switching active file
  useEffect(() => {
    if (!activeFileRel) return;
    if (fileContentMap[activeFileRel] !== undefined) return;

    void (async () => {
      try {
        const res = await apiFetch<{ content: string }>(
          `/documents/${id}/files/read`,
          {
            method: "POST",
            body: { rel_path: activeFileRel },
          },
        );
        setFileContentMap((prev) => ({
          ...prev,
          [activeFileRel]: res.content ?? "",
        }));
      } catch (err) {
        console.error(err);
      }
    })();
  }, [id, activeFileRel, fileContentMap]);

  // Connect WebSocket for live collaboration & presence
  useEffect(() => {
    const token = getApiToken();
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost =
      window.location.hostname === "localhost"
        ? "localhost:8080"
        : window.location.host;
    const wsUrl = `${wsProto}//${wsHost}/api/documents/${id}/ws?token=${encodeURIComponent(
      token,
    )}`;

    try {
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
            if (msg.rel_path === activeFileRel) {
              void apiFetch<{ content: string }>(
                `/documents/${id}/files/read`,
                {
                  method: "POST",
                  body: { rel_path: msg.rel_path },
                },
              ).then((res) => {
                if (res.content) {
                  setFileContentMap((prev) => ({
                    ...prev,
                    [msg.rel_path]: res.content,
                  }));
                }
              });
            }
          }
        } catch (e) {
          console.error("WebSocket parse error:", e);
        }
      };

      return () => {
        ws.close();
        wsRef.current = null;
      };
    } catch {
      // Offline fallback
    }
  }, [id, activeFileRel]);

  // Update cursor position on editor interaction
  const updateCursorPosition = () => {
    if (!textareaRef.current) return;
    const text = textareaRef.current.value;
    const selStart = textareaRef.current.selectionStart;
    const lines = text.slice(0, selStart).split("\n");
    const currentLine = lines.length;
    const currentCol = lines[lines.length - 1].length + 1;
    setCursorPos({ line: currentLine, col: currentCol });
  };

  // Switch Active File Tab
  const handleSelectFile = (relPath: string) => {
    setActiveFileRel(relPath);
    if (!openTabs.includes(relPath)) {
      setOpenTabs((prev) => [...prev, relPath]);
    }
  };

  const handleCloseTab = (relPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = openTabs.filter((t) => t !== relPath);
    setOpenTabs(remaining);
    if (activeFileRel === relPath) {
      setActiveFileRel(
        remaining.length > 0 ? remaining[remaining.length - 1] : null,
      );
    }
  };

  // Save current active file
  const handleSaveActiveFile = async () => {
    if (!activeFileRel) return;
    setIsSaving(true);
    try {
      await writeTrackedFile(id, activeFileRel, activeContent);
      setDirtyFiles((prev) => {
        const next = new Set(prev);
        next.delete(activeFileRel);
        return next;
      });
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Document Title
  const handleSaveTitle = async () => {
    if (!titleDraft.trim() || !doc) return;
    try {
      await apiFetch(`/documents/${id}`, {
        method: "PUT",
        body: { title: titleDraft.trim() },
      });
      setDoc((prev) => (prev ? { ...prev, title: titleDraft.trim() } : prev));
      setIsEditingTitle(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Star / Favorite
  const handleToggleStar = async () => {
    if (!doc) return;
    const nextStarred = !doc.starred;
    try {
      await apiFetch(`/documents/${id}`, {
        method: "PUT",
        body: { starred: nextStarred },
      });
      setDoc((prev) => (prev ? { ...prev, starred: nextStarred } : prev));
    } catch (err) {
      console.error(err);
    }
  };

  // Create New File
  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    let fileName = newFileName.trim();
    if (!fileName.includes(".")) fileName += ".tex";
    try {
      await apiFetch(`/documents/${id}/files/create`, {
        method: "POST",
        body: {
          name: fileName,
          content: `% ${fileName}\n`,
        },
      });
      setShowNewFileInput(false);
      setNewFileName("");
      await loadDoc();
      handleSelectFile(fileName);
    } catch (err) {
      console.error(err);
    }
  };

  // Rename File
  const handleRenameFile = async (oldPath: string) => {
    if (!renameValue.trim() || renameValue.trim() === oldPath) {
      setRenamingFile(null);
      return;
    }
    try {
      await apiFetch(`/documents/${id}/files/rename`, {
        method: "POST",
        body: {
          old_path: oldPath,
          new_name: renameValue.trim(),
        },
      });
      setRenamingFile(null);
      await loadDoc();
      if (activeFileRel === oldPath) {
        setActiveFileRel(renameValue.trim());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Set Main Entrypoint
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

  // Delete File
  const handleDeleteFile = async (relPath: string) => {
    if (!confirm(`Delete ${relPath}?`)) return;
    try {
      await apiFetch(`/documents/${id}/files/delete`, {
        method: "POST",
        body: { rel_path: relPath },
      });
      setOpenTabs((prev) => prev.filter((t) => t !== relPath));
      if (activeFileRel === relPath) {
        setActiveFileRel(null);
      }
      await loadDoc();
    } catch (err) {
      console.error(err);
    }
  };

  // Compile Document Workspace
  const handleCompile = async () => {
    setIsCompiling(true);
    setCompilationError(null);
    try {
      if (activeFileRel && dirtyFiles.has(activeFileRel)) {
        await writeTrackedFile(id, activeFileRel, activeContent);
        setDirtyFiles((prev) => {
          const next = new Set(prev);
          next.delete(activeFileRel);
          return next;
        });
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
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setMobileTab("preview");
      }
    } catch (err: any) {
      setCompilationError(
        err.message ||
          "Compilation failed. Ensure a main.tex entrypoint is set.",
      );
    } finally {
      setIsCompiling(false);
    }
  };

  // AI Fix Handler
  const handleAiFix = async () => {
    if (!compilationError || !activeFileRel) return;
    setIsFixing(true);
    try {
      const cfg = await getAiConfig().catch(() => ({
        provider: "gemini",
        model: "gemini-1.5-pro",
      }));
      const res = await apiFetch<{ latex: string }>("/pdf/fix", {
        method: "POST",
        body: {
          provider: cfg.provider || "gemini",
          model: cfg.model || "gemini-1.5-pro",
          api_key: "vault_key",
          broken_latex: activeContent,
          error_logs: compilationError,
        },
      });
      if (res?.latex) {
        setFileContentMap((prev) => ({
          ...prev,
          [activeFileRel]: res.latex,
        }));
        setDirtyFiles((prev) => new Set(prev).add(activeFileRel));
        setCompilationError(null);
        setTimeout(() => void handleCompile(), 100);
      }
    } catch (err: any) {
      alert(`AI Fix error: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  // AI Refine Handler
  const handleAiRefine = async () => {
    if (!refinePrompt.trim() || !activeFileRel) return;
    setIsRefining(true);
    try {
      const cfg = await getAiConfig().catch(() => ({
        provider: "gemini",
        model: "gemini-1.5-pro",
      }));
      const res = await apiFetch<{ refined_latex?: string; latex?: string }>(
        "/pdf/refine",
        {
          method: "POST",
          body: {
            provider: cfg.provider || "gemini",
            model: cfg.model || "gemini-1.5-pro",
            api_key: "vault_key",
            current_latex: activeContent,
            prompt: refinePrompt,
          },
        },
      );
      const newLatex = res.refined_latex || res.latex;
      if (newLatex) {
        setFileContentMap((prev) => ({
          ...prev,
          [activeFileRel]: newLatex,
        }));
        setDirtyFiles((prev) => new Set(prev).add(activeFileRel));
        setRefinePrompt("");
        setShowRefineBar(false);
        setTimeout(() => void handleCompile(), 100);
      }
    } catch (err: any) {
      alert(`AI Refine error: ${err.message}`);
    } finally {
      setIsRefining(false);
    }
  };

  const _handleCopySource = async () => {
    if (!activeContent) return;
    await navigator.clipboard.writeText(activeContent);
    setCopiedSource(true);
    setTimeout(() => setCopiedSource(false), 2000);
  };

  const filteredFiles = useMemo(() => {
    if (!searchFile.trim()) return files;
    const q = searchFile.toLowerCase();
    return files.filter((f) => f.rel_path.toLowerCase().includes(q));
  }, [files, searchFile]);

  const getFileIcon = (relPath: string) => {
    if (relPath.endsWith(".tex"))
      return <FileCode className="h-3.5 w-3.5 text-[var(--accent)]" />;
    if (relPath.endsWith(".bib"))
      return <BookOpen className="h-3.5 w-3.5 text-blue-400" />;
    if (relPath.endsWith(".sty") || relPath.endsWith(".cls"))
      return <Layers className="h-3.5 w-3.5 text-purple-400" />;
    return <File className="h-3.5 w-3.5 text-zinc-400" />;
  };

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full p-20 text-xs text-[var(--muted)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)] mr-2" />
        <span>Loading collaborative LaTeX IDE workspace…</span>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full bg-[var(--bg)] select-none ${
        isFullscreen ? "fixed inset-0 z-50" : ""
      }`}
    >
      {/* 1. Pro Header Toolbar (52px / h-13) */}
      <header className="h-13 flex items-center justify-between px-3 sm:px-4 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 z-20 gap-2">
        {/* Left Navigation & Project Identity */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            href="/documents"
            className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors shrink-0"
            title="Back to Documents"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors shrink-0"
            title={isSidebarOpen ? "Collapse File Tree" : "Show File Tree"}
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          {/* Editable Project Title */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {isEditingTitle ? (
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveTitle();
                  if (e.key === "Escape") {
                    setTitleDraft(doc.title);
                    setIsEditingTitle(false);
                  }
                }}
                className="bg-[var(--bg)] border border-[var(--accent)] rounded px-2 py-1 text-xs font-bold text-[var(--ink)] focus:outline-none"
              />
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="flex items-center gap-1.5 cursor-pointer group min-w-0"
                title="Click to rename workspace"
              >
                <span className="text-xs font-bold text-[var(--ink)] truncate max-w-[120px] sm:max-w-xs group-hover:text-[var(--accent)] transition-colors">
                  {doc.title}
                </span>
                <Edit3 className="h-3 w-3 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            )}

            {/* Favorite Star */}
            <button
              type="button"
              onClick={handleToggleStar}
              className={`p-1 rounded transition-colors shrink-0 ${
                doc.starred
                  ? "text-amber-400 hover:text-amber-300"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
              title={doc.starred ? "Favorited" : "Star Workspace"}
            >
              <Star
                className={`h-3.5 w-3.5 ${doc.starred ? "fill-amber-400" : ""}`}
              />
            </button>
          </div>

          {/* Live Online Presence Avatars */}
          {activePresence.length > 0 && (
            <div className="hidden xl:flex items-center -space-x-1.5 pl-2 border-l border-[var(--line)]">
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

        {/* Center / Mobile View Switcher */}
        <div className="flex md:hidden items-center bg-[var(--surface)] p-0.5 rounded-lg border border-[var(--line)] shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab("editor")}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
              mobileTab === "editor"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
              mobileTab === "preview"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            PDF
          </button>
        </div>

        {/* Right Tools & Compilation */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* AI Refine Toggle */}
          <button
            type="button"
            onClick={() => setShowRefineBar(!showRefineBar)}
            className={`flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded text-xs font-semibold border transition-colors ${
              showRefineBar
                ? "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30"
                : "bg-[var(--surface-soft)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--muted)]"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">AI Refine</span>
          </button>

          {/* Collaborators Button */}
          <button
            type="button"
            onClick={() => setShowCollaborators(true)}
            className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
            title="Team & Access"
          >
            <Users className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="hidden lg:inline">Team</span>
          </button>

          {/* History / Audit Drawer */}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
            title="Version Checkpoints"
          >
            <History className="h-3.5 w-3.5 text-blue-400" />
            <span className="hidden lg:inline">History</span>
          </button>

          {/* Review Comments */}
          <button
            type="button"
            onClick={() => setShowComments(true)}
            className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
            title="Margin Comments"
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Review</span>
          </button>

          {/* Save Action */}
          <button
            type="button"
            onClick={handleSaveActiveFile}
            disabled={isSaving || !activeFileRel}
            className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
            title="Save File (Ctrl+S)"
          >
            {isSaving ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
            ) : dirtyFiles.has(activeFileRel || "") ? (
              <span className="h-2 w-2 rounded-full bg-amber-400" />
            ) : (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span className="hidden sm:inline">
              {isSaving
                ? "Saving..."
                : dirtyFiles.has(activeFileRel || "")
                  ? "Save"
                  : "Saved"}
            </span>
          </button>

          {/* Primary Compile Action */}
          <button
            type="button"
            onClick={handleCompile}
            disabled={isCompiling}
            className="flex items-center gap-1.5 sm:gap-2 h-8.5 px-3 sm:px-3.5 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm transition-all active:scale-[0.98]"
            title="Compile Multi-file Workspace (Ctrl+Enter)"
          >
            {isCompiling ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Hammer className="h-3.5 w-3.5" />
            )}
            <span>Compile</span>
            <kbd className="hidden sm:inline-block px-1 py-0.2 rounded bg-black/20 text-[10px] font-mono">
              Ctrl+Enter
            </kbd>
          </button>

          {/* Download PDF */}
          {pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              download={`${doc.title.replace(/\s+/g, "_")}.pdf`}
              className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm"
              title="Download compiled PDF"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden md:inline">PDF</span>
            </a>
          )}

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Studio"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {/* 2. AI Refinement Bar (Expandable) */}
      {showRefineBar && (
        <div className="px-4 py-2.5 bg-[var(--surface-soft)] border-b border-[var(--line)] flex items-center gap-2 z-10 animate-in slide-in-from-top-2 duration-150">
          <Wand2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
          <input
            type="text"
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAiRefine();
            }}
            placeholder={`Refine active file "${activeFileRel || "document"}" (e.g. 'Add a sub-item for Kubernetes orchestration', 'Refactor into custom command')...`}
            className="flex-1 bg-[var(--bg)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-1.5 text-xs text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAiRefine}
            disabled={isRefining || !refinePrompt.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 shrink-0 transition-opacity"
          >
            {isRefining ? (
              <RotateCw className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            <span>Apply AI Edit</span>
          </button>
        </div>
      )}

      {/* 3. Diagnostic Error Banner */}
      {compilationError && (
        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/30 flex items-start justify-between gap-3 text-xs text-rose-600 dark:text-rose-400 z-10 animate-in slide-in-from-top-1">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-bold">
                Multi-File Tectonic XeTeX Diagnostic:
              </span>
              <p className="font-mono text-[11px] mt-0.5 line-clamp-2 select-text opacity-90">
                {compilationError}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAiFix}
            disabled={isFixing}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0 transition-colors shadow-sm"
          >
            {isFixing ? (
              <RotateCw className="h-3 w-3 animate-spin" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            <span>Auto-Repair LaTeX</span>
          </button>
        </div>
      )}

      {/* 4. 3-Pane Multi-File IDE Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left Pane: File Tree Explorer */}
        {isSidebarOpen && (
          <aside
            style={{ width: `${sidebarWidth}px` }}
            className="hidden lg:flex bg-[var(--bg-accent)] border-r border-[var(--line)] flex-col shrink-0 overflow-hidden select-none"
          >
            {/* Header with search & New file */}
            <div className="p-2.5 border-b border-[var(--line)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  EXPLORER ({files.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewFileInput(true)}
                  className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
                  title="New File"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="relative">
                <Search className="h-3 w-3 absolute left-2 top-2 text-[var(--muted)]" />
                <input
                  type="text"
                  value={searchFile}
                  onChange={(e) => setSearchFile(e.target.value)}
                  placeholder="Filter files..."
                  className="w-full pl-7 pr-2 py-1 bg-[var(--bg)] border border-[var(--line)] focus:border-[var(--accent)] rounded text-xs text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none"
                />
              </div>
            </div>

            {/* New File Inline Input */}
            {showNewFileInput && (
              <div className="p-2 bg-[var(--surface)] border-b border-[var(--line)] space-y-1.5">
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="filename.tex"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreateFile();
                    if (e.key === "Escape") setShowNewFileInput(false);
                  }}
                  className="w-full bg-[var(--bg)] border border-[var(--accent)] rounded px-2 py-1 text-xs font-mono text-[var(--ink)] focus:outline-none"
                />
                <div className="flex justify-end gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setShowNewFileInput(false)}
                    className="px-2 py-0.5 text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateFile}
                    className="px-2 py-0.5 bg-[var(--accent)] text-white rounded font-bold"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Files List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {filteredFiles.map((f) => {
                const isMain = mainFile === f.rel_path;
                const isActive = activeFileRel === f.rel_path;
                const isDirty = dirtyFiles.has(f.rel_path);

                return (
                  <div
                    key={f.rel_path}
                    onClick={() => handleSelectFile(f.rel_path)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-xs font-mono group transition-colors ${
                      isActive
                        ? "bg-[var(--surface-soft)] text-[var(--ink)] font-bold"
                        : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      {getFileIcon(f.rel_path)}
                      {renamingFile === f.rel_path ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => void handleRenameFile(f.rel_path)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              void handleRenameFile(f.rel_path);
                            if (e.key === "Escape") setRenamingFile(null);
                          }}
                          className="bg-[var(--bg)] border border-[var(--accent)] rounded px-1 text-xs font-mono text-[var(--ink)]"
                        />
                      ) : (
                        <span className="truncate">{f.rel_path}</span>
                      )}
                      {isDirty && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      )}
                      {isMain && (
                        <span className="text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1 py-0.2 rounded shrink-0">
                          MAIN
                        </span>
                      )}
                    </div>

                    {/* File Hover Controls */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!isMain && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSetMain(f.rel_path);
                          }}
                          className="text-[9px] text-[var(--muted)] hover:text-amber-400 font-sans px-1 rounded hover:bg-[var(--bg)]"
                          title="Set as main compilation entrypoint"
                        >
                          Main
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingFile(f.rel_path);
                          setRenameValue(f.rel_path);
                        }}
                        className="text-[var(--muted)] hover:text-[var(--ink)] p-0.5"
                        title="Rename file"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteFile(f.rel_path);
                        }}
                        className="text-[var(--muted)] hover:text-rose-400 p-0.5"
                        title="Delete file"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sidebar Footer Info */}
            <div className="p-2 border-t border-[var(--line)] text-[10px] font-mono text-[var(--muted)] flex items-center justify-between px-3">
              <span>Main: {mainFile || "None"}</span>
              <span>XeTeX</span>
            </div>
          </aside>
        )}

        {/* Center Pane: Multi-Tab Code Editor */}
        <main
          className={`flex-1 min-w-0 min-h-0 bg-[#0d1117] flex-col overflow-hidden ${
            mobileTab === "editor" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Tab Bar */}
          <div className="h-8 flex items-center bg-[#161b22] border-b border-[#30363d] overflow-x-auto select-none no-scrollbar">
            {openTabs.map((tab) => {
              const isActive = activeFileRel === tab;
              const isDirty = dirtyFiles.has(tab);
              return (
                <div
                  key={tab}
                  onClick={() => setActiveFileRel(tab)}
                  className={`h-full flex items-center gap-2 px-3 border-r border-[#30363d] text-xs font-mono cursor-pointer transition-colors ${
                    isActive
                      ? "bg-[#0d1117] text-zinc-100 font-semibold border-t-2 border-t-[var(--accent)]"
                      : "bg-[#161b22] text-zinc-400 hover:text-zinc-200 hover:bg-[#21262d]"
                  }`}
                >
                  {getFileIcon(tab)}
                  <span>{tab}</span>
                  {isDirty && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(tab, e)}
                    className="p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Editor Body */}
          {activeFileRel ? (
            <>
              <div className="flex-1 relative overflow-hidden flex">
                <textarea
                  ref={textareaRef}
                  value={activeContent}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setFileContentMap((prev) => ({
                      ...prev,
                      [activeFileRel]: nextVal,
                    }));
                    setDirtyFiles((prev) => new Set(prev).add(activeFileRel));
                  }}
                  onClick={updateCursorPosition}
                  onKeyUp={updateCursorPosition}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      void handleCompile();
                    }
                    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                      e.preventDefault();
                      void handleSaveActiveFile();
                    }
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const val = target.value;
                      const updated = `${val.substring(0, start)}  ${val.substring(end)}`;
                      setFileContentMap((prev) => ({
                        ...prev,
                        [activeFileRel]: updated,
                      }));
                      setDirtyFiles((prev) => new Set(prev).add(activeFileRel));
                      setTimeout(() => {
                        target.selectionStart = target.selectionEnd = start + 2;
                        updateCursorPosition();
                      }, 0);
                    }
                  }}
                  spellCheck={false}
                  className="flex-1 w-full h-full bg-[#0d1117] p-4 font-mono text-[13px] text-zinc-100 leading-relaxed border-0 resize-none focus:outline-none select-text overflow-y-auto"
                  style={{
                    tabSize: 2,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                />
              </div>

              {/* Status Bar Footer */}
              <div className="h-6.5 px-3 bg-[#161b22] border-t border-[#30363d] text-[10px] font-mono text-zinc-400 flex items-center justify-between select-none">
                <div className="flex items-center gap-3">
                  <span>
                    Ln {cursorPos.line}, Col {cursorPos.col}
                  </span>
                  <span className="text-zinc-600">|</span>
                  <span>{activeContent.split("\n").length} lines</span>
                  <span className="text-zinc-600">|</span>
                  <span>{activeContent.length} chars</span>
                  <span className="text-zinc-600">|</span>
                  <span
                    className={
                      dirtyFiles.has(activeFileRel)
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }
                  >
                    {dirtyFiles.has(activeFileRel) ? "Modified" : "Saved"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">
                    Shortcuts: Ctrl+Enter (Compile) | Ctrl+S (Save)
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-3">
              <FileCode className="h-10 w-10 opacity-40" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-300">
                  No File Open
                </p>
                <p className="text-[11px] text-zinc-500">
                  Select a file from the explorer on the left to edit.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Right Pane: Project PDF Preview */}
        <section
          className={`w-full md:w-[440px] lg:w-[480px] xl:w-[540px] 2xl:w-[600px] bg-[var(--bg-accent)] border-l border-[var(--line)] flex-col shrink-0 min-h-0 overflow-hidden ${
            mobileTab === "preview" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* PDF Viewer Header */}
          <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] select-none">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Project PDF Canvas</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] font-mono text-[var(--muted)] w-9 text-center">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] ml-1"
                title="Reset Zoom"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleCompile}
                disabled={isCompiling}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] ml-1"
                title="Recompile Project"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isCompiling ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* PDF Canvas Container */}
          <div className="flex-1 bg-zinc-900/90 overflow-auto flex items-center justify-center p-4">
            {isCompiling ? (
              <div className="flex flex-col items-center gap-3 text-xs text-zinc-400">
                <RotateCw className="h-7 w-7 animate-spin text-[var(--accent)]" />
                <span className="font-medium">
                  Compiling workspace in Tectonic…
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  Entrypoint: {mainFile || "main.tex"}
                </span>
              </div>
            ) : pdfBlobUrl ? (
              <div
                className="h-full w-full flex items-center justify-center transition-transform origin-top"
                style={{ transform: `scale(${zoomLevel / 100})` }}
              >
                <iframe
                  src={pdfBlobUrl}
                  title="Project PDF Preview"
                  className="h-full w-full bg-white shadow-2xl rounded-sm border-0"
                />
              </div>
            ) : (
              <div className="text-center p-8 space-y-3 text-zinc-400 max-w-xs">
                <div className="h-12 w-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-500">
                  <FileCode className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-zinc-200">
                    No PDF Generated Yet
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Click <strong>Compile</strong> or press{" "}
                    <kbd className="px-1 py-0.5 bg-zinc-800 rounded font-mono text-[10px]">
                      Ctrl+Enter
                    </kbd>{" "}
                    to build your multi-file PDF workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCompile}
                  className="px-4 py-2 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  Compile Workspace
                </button>
              </div>
            )}
          </div>
        </section>

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
