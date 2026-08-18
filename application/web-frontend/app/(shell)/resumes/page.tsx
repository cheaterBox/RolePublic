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
import {
  createResume,
  deleteResume,
  listResumes,
} from "@/features/resumes/api";
import type { ResumeItem } from "@/lib/api/types";

export default function ResumesPage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // New Template Form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Software Engineering");
  const [newLatex, setNewLatex] = useState(defaultLatex);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listResumes();
      setResumes(data || []);
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
      router.push(`/resumes/${id}`);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createResume({
        name: newName,
        category: newCategory,
        latex_content: newLatex,
      });
      setShowNewForm(false);
      setNewName("");
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} templates?`)) return;
    try {
      for (const id of selectedIds) {
        await deleteResume(id);
      }
      await load();
      setIsSelectionMode(false);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredResumes = resumes.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      !searchQuery ||
      r.name.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto p-6 sm:p-10 space-y-6 animate-in fade-in-50 duration-200">
      {/* Header (Matching ResumesTab.vue) */}
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
            Resume Templates
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            Manage base LaTeX templates used across applications.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isSelectionMode ? (
            <>
              <div
                className="relative flex items-center"
                onMouseEnter={() => setActiveTooltip("selection")}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <button
                  type="button"
                  onClick={() => setIsSelectionMode(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)]"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
                {activeTooltip === "selection" && (
                  <div className="absolute top-full mt-2 right-0 z-50 rounded-md bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                    Selection Mode
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowNewForm(!showNewForm)}
                className="flex h-10 px-3.5 items-center gap-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                <span>New Template</span>
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

      {/* CREATE NEW TEMPLATE FORM DRAWER */}
      {showNewForm && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              Create New Base Template
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
                Template Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Modern Systems Engineer"
                className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-1.5 text-xs text-[var(--ink)] focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                Category
              </label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Software Engineering"
                className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-1.5 text-xs text-[var(--ink)] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
              LaTeX Document Source
            </label>
            <textarea
              value={newLatex}
              onChange={(e) => setNewLatex(e.target.value)}
              rows={8}
              className="w-full bg-[#0d0f14] border border-[var(--line)] rounded p-3 font-mono text-xs text-[#e6edf3] focus:outline-none resize-none leading-relaxed"
            />
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
              disabled={!newName.trim()}
              className="px-4 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
            >
              Save Template
            </button>
          </div>
        </div>
      )}

      {/* Search Filter */}
      {!isSelectionMode && (
        <div className="flex items-center bg-[var(--surface)] border border-[var(--line)] rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-[var(--muted)] shrink-0 mr-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates by name or category..."
            className="w-full bg-transparent border-0 p-0 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
          />
        </div>
      )}

      {/* Grid of Templates */}
      {loading ? (
        <div className="py-20 text-center text-xs text-[var(--muted)]">
          Loading templates…
        </div>
      ) : filteredResumes.length === 0 ? (
        <div className="py-20 text-center space-y-3">
          <FolderOpen className="h-10 w-10 text-[var(--muted)] opacity-40 mx-auto" />
          <h3 className="text-sm font-bold text-[var(--ink)]">
            No templates found
          </h3>
          <p className="text-xs text-[var(--muted)] max-w-xs mx-auto">
            Create a new template to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredResumes.map((r) => {
            const isSelected = selectedIds.has(r.id);

            return (
              <div
                key={r.id}
                onClick={() => handleCardClick(r.id)}
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
                      <span className="tag-pill tag-pill-accent">
                        {r.category}
                      </span>
                    )}

                    <span className="font-mono text-[11px] text-[var(--muted)]">
                      {new Date(r.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[var(--ink)] truncate pt-1">
                    {r.name}
                  </h3>
                </div>

                <div className="mt-5 pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs font-bold text-[var(--muted)] hover:text-[var(--accent)]">
                  <span>Edit Template</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const defaultLatex = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem}

\\begin{document}
\\begin{center}
  {\\Huge \\textbf{Alex Morgan}}\\\\
  \\vspace{2pt}
  San Francisco, CA $\\cdot$ \\href{mailto:alex@example.com}{alex@example.com} $\\cdot$ (555) 019-2834\\\\
  \\href{https://github.com/alexmorgan}{github.com/alexmorgan} $\\cdot$ \\href{https://linkedin.com/in/alexmorgan}{linkedin.com/in/alexmorgan}
\\end{center}

\\vspace{-8pt}
\\section*{Summary}
Principal Systems Software Engineer with 8+ years experience designing high-throughput distributed backends in Rust, TypeScript, and Go.

\\vspace{-4pt}
\\section*{Experience}
\\textbf{Senior Systems Engineer} \\hfill \\textit{Acme Cloud $\\cdot$ 2022 -- Present}
\\begin{itemize}[noitemsep,topsep=2pt]
  \\item Architected high-throughput async processing pipeline in Rust handling 50,000+ RPS.
  \\item Reduced end-to-end latency by 45\\% using Tokio channels and zero-copy memory buffers.
\\end{itemize}

\\vspace{-4pt}
\\section*{Skills}
\\textbf{Languages:} Rust, Go, TypeScript, C++, Python, SQL\\\\
\\textbf{Technologies:} Tokio, Axum, PostgreSQL, SQLite, Docker, AWS S3, Linux Internals
\\end{document}`;
