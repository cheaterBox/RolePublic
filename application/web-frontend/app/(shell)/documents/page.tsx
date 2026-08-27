"use client";

import {
  ChevronRight,
  FolderOpen,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { DocumentSummary } from "@/lib/api/types";

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // New Doc Form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<DocumentSummary[]>("/documents");
      setDocs(data || []);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCardClick = (id: string) => {
    if (isSelectionMode) {
      const updated = new Set(selectedIds);
      if (updated.has(id)) updated.delete(id);
      else updated.add(id);
      setSelectedIds(updated);
    } else {
      router.push(`/documents/${id}`);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await apiFetch<{ id: string }>("/documents", {
        method: "POST",
        body: {
          title: newTitle,
          description: newDesc,
          tags: "LaTeX Project",
          starred: false,
        },
      });

      // Default main.tex
      await apiFetch(`/documents/${res.id}/files/create`, {
        method: "POST",
        body: {
          name: "main.tex",
          content: defaultProjectLatex,
        },
      });

      await apiFetch(`/documents/${res.id}/main`, {
        method: "POST",
        body: { rel_path: "main.tex" },
      });

      setShowNewForm(false);
      setNewTitle("");
      setNewDesc("");
      router.push(`/documents/${res.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Delete ${selectedIds.size} document workspaces and all contained files?`,
      )
    )
      return;
    try {
      for (const id of selectedIds) {
        await apiFetch(`/documents/${id}`, { method: "DELETE" });
      }
      await load();
      setIsSelectionMode(false);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredDocs = docs.filter((d) => {
    const q = searchQuery.toLowerCase();
    return (
      !searchQuery ||
      d.title.toLowerCase().includes(q) ||
      (d.description || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-8 md:p-10 animate-in fade-in-50 duration-200">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header (Matching DocumentsTab.vue) */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
              Documents
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
              Folder-based multi-file LaTeX project workspaces.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isSelectionMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsSelectionMode(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)]"
                  title="Selection Mode"
                >
                  <Settings2 className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowNewForm(!showNewForm)}
                  className="flex h-10 px-3.5 items-center gap-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Project</span>
                </button>
              </>
            ) : (
              <>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="flex h-10 px-3 items-center gap-1.5 rounded-lg bg-[var(--warning)] text-white text-xs font-bold hover:opacity-90"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete ({selectedIds.size})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </header>

        {/* CREATE NEW DOC FORM */}
        {showNewForm && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                Create New Multi-File Project Workspace
              </h3>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="text-[var(--muted)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  Project Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. ModernCV Full Package"
                  className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-1.5 text-xs text-[var(--ink)] focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Multi-file modular LaTeX package"
                  className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-1.5 text-xs text-[var(--ink)] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="px-3 py-1.5 rounded text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="px-4 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
              >
                Create Project
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        {!isSelectionMode && (
          <div className="flex items-center bg-[var(--surface)] border border-[var(--line)] rounded-lg px-3 py-2">
            <Search className="h-4 w-4 text-[var(--muted)] shrink-0 mr-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-transparent border-0 p-0 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
            />
          </div>
        )}

        {/* Grid of Documents */}
        {loading ? (
          <div className="py-20 text-center text-xs text-[var(--muted)]">
            Loading document workspaces…
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <FolderOpen className="h-10 w-10 text-[var(--muted)] opacity-40 mx-auto" />
            <h3 className="text-sm font-bold text-[var(--ink)]">
              No documents found
            </h3>
            <p className="text-xs text-[var(--muted)] max-w-xs mx-auto">
              Create a multi-file project workspace to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDocs.map((doc) => {
              const isSelected = selectedIds.has(doc.id);

              return (
                <div
                  key={doc.id}
                  onClick={() => handleCardClick(doc.id)}
                  className={`flex flex-col justify-between rounded-xl border bg-[var(--surface)] p-5 cursor-pointer transition-all hover:border-[var(--accent)] hover:-translate-y-0.5 shadow-md ${
                    isSelected
                      ? "border-[var(--accent)] bg-[rgba(35,134,54,0.08)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--line)]"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      {isSelectionMode ? (
                        <div
                          className={`h-4 w-4 rounded border flex items-center justify-center text-[10px] font-bold ${
                            isSelected
                              ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                              : "border-[var(--line)] bg-[var(--surface)]"
                          }`}
                        >
                          {isSelected && "✓"}
                        </div>
                      ) : (
                        <span className="tag-pill tag-pill-accent font-mono">
                          {doc.main_file || "main.tex"}
                        </span>
                      )}

                      <span className="font-mono text-[11px] text-[var(--muted)]">
                        {new Date(doc.updated_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-[var(--ink)] truncate pt-1">
                      {doc.title}
                    </h3>
                    <p className="text-xs text-[var(--muted)] line-clamp-2">
                      {doc.description || "Multi-file LaTeX project workspace."}
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs font-bold text-[var(--muted)] hover:text-[var(--accent)]">
                    <span>Open Workspace</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const defaultProjectLatex = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}

\\begin{document}
\\section*{Multi-File LaTeX Project}
This workspace supports folder modularity and sub-file inclusion via \\texttt{\\textbackslash input{section.tex}}.
\\end{document}`;
