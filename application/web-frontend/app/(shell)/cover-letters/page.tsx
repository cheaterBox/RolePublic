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
import { LatexEditor } from "@/components/editor/LatexEditor";
import { IconButton } from "@/components/ui/IconButton";
import { apiFetch } from "@/lib/api/client";
import type { CoverLetterItem } from "@/lib/api/types";

export default function CoverLettersPage() {
  const router = useRouter();
  const [letters, setLetters] = useState<CoverLetterItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // New Form State
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Software Engineering");
  const [newLatex, setNewLatex] = useState(defaultCoverLetterLatex);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CoverLetterItem[]>("/cover_letters");
      setLetters(data || []);
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
      router.push(`/cover-letters/${id}`);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await apiFetch<{ id: string }>("/cover_letters", {
        method: "POST",
        body: {
          name: newName,
          category: newCategory,
          latex_content: newLatex,
        },
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
    if (!confirm(`Delete ${selectedIds.size} cover letter templates?`)) return;
    try {
      for (const id of selectedIds) {
        await apiFetch(`/cover_letters/${id}`, { method: "DELETE" });
      }
      await load();
      setIsSelectionMode(false);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredLetters = letters.filter((l) => {
    const q = searchQuery.toLowerCase();
    return (
      !searchQuery ||
      l.name.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-8 md:p-10 animate-in fade-in-50 duration-200">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header (Matching CoverLettersTab.vue) */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
              CL Templates
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
              Manage base cover letter templates used across applications.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isSelectionMode ? (
              <>
                <IconButton
                  label="Selection Mode"
                  tooltipPlacement="bottom"
                  variant="soft"
                  size="md"
                  icon={<Settings2 />}
                  onClick={() => setIsSelectionMode(true)}
                />

                <IconButton
                  label="New Template"
                  tooltipPlacement="bottom"
                  variant="accent"
                  size="md"
                  icon={<Plus />}
                  onClick={() => setShowNewForm(!showNewForm)}
                />
              </>
            ) : (
              <>
                {selectedIds.size > 0 && (
                  <IconButton
                    label={`Delete (${selectedIds.size})`}
                    tooltipPlacement="bottom"
                    variant="danger"
                    size="md"
                    icon={<Trash2 />}
                    onClick={handleDeleteSelected}
                  />
                )}
                <IconButton
                  label="Exit Selection Mode"
                  tooltipPlacement="bottom"
                  variant="soft"
                  size="md"
                  icon={<X />}
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                />
              </>
            )}
          </div>
        </header>

        {/* CREATE NEW FORM */}
        {showNewForm && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                Create New Cover Letter Template
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
                  placeholder="e.g. Executive Systems Engineering"
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
                LaTeX Document Source — syntax highlighting enabled
              </label>
              <div className="w-full h-[380px] border border-[var(--line)] rounded overflow-hidden bg-[#0d1117]">
                <LatexEditor
                  value={newLatex}
                  onChange={setNewLatex}
                  height="380px"
                  placeholder="% Cover letter template LaTeX — CodeMirror LaTeX grammar"
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
                disabled={!newName.trim()}
                className="px-4 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
              >
                Save Template
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
              placeholder="Search cover letters..."
              className="w-full bg-transparent border-0 p-0 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
            />
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="py-20 text-center text-xs text-[var(--muted)]">
            Loading templates…
          </div>
        ) : filteredLetters.length === 0 ? (
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
            {filteredLetters.map((l) => {
              const isSelected = selectedIds.has(l.id);

              return (
                <div
                  key={l.id}
                  onClick={() => handleCardClick(l.id)}
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
                          {l.category}
                        </span>
                      )}

                      <span className="font-mono text-[11px] text-[var(--muted)]">
                        {new Date(l.updated_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-[var(--ink)] truncate pt-1">
                      {l.name}
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
    </div>
  );
}

const defaultCoverLetterLatex = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{hyperref}

\\begin{document}
\\noindent
\\textbf{Alex Morgan}\\\\
San Francisco, CA $\\cdot$ \\href{mailto:alex@example.com}{alex@example.com} $\\cdot$ (555) 019-2834\\\\
\\today

\\vspace{12pt}
\\noindent
\\textbf{Hiring Team}\\\\
Acme Corp\\\\
San Francisco, CA

\\vspace{12pt}
\\noindent
Dear Hiring Manager,

\\vspace{8pt}
I am writing to express my strong enthusiasm for the Senior Systems Engineer position at Acme Corp. With over 8 years of experience building mission-critical backend systems in Rust and TypeScript, I have long admired Acme's commitment to high reliability and developer-first infrastructure.

\\vspace{8pt}
In my previous role at Acme Cloud, I led the architecture of a distributed message pipeline processing over 50,000 requests per second with sub-millisecond latencies. I look forward to bringing this depth of systems programming and scalable architecture to Acme.

\\vspace{8pt}
Thank you for your time and consideration.

\\vspace{16pt}
\\noindent
Sincerely,\\\\
\\textbf{Alex Morgan}
\\end{document}`;
