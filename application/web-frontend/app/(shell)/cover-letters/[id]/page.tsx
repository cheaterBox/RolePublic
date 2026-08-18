"use client";

import { ArrowLeft, Check, Cpu, Loader2, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { CoverLetterDetail } from "@/lib/api/types";

export default function CoverLetterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [letter, setLetter] = useState<CoverLetterDetail | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [latex, setLatex] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadLetter() {
      setLoading(true);
      try {
        const data = await apiFetch<CoverLetterDetail>(`/cover_letters/${id}`);
        if (mounted && data) {
          setLetter(data);
          setName(data.name);
          setCategory(data.category);
          setLatex(data.latex_content);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadLetter();
    return () => {
      mounted = false;
    };
  }, [id]);

  const handleSave = async () => {
    if (!name.trim() || !category.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/cover_letters/${id}`, {
        method: "PUT",
        body: {
          id,
          name,
          category,
          latex_content: latex,
          created_at: letter?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Delete this cover letter template? This action cannot be undone.",
      )
    )
      return;
    try {
      await apiFetch(`/cover_letters/${id}`, { method: "DELETE" });
      router.push("/cover-letters");
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !letter) {
    return (
      <div className="flex items-center justify-center h-full p-20 text-xs text-[var(--muted)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)] mr-2" />
        <span>Loading template…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] animate-in fade-in-50 duration-150">
      {/* Top Header Bar */}
      <header className="h-12 flex items-center justify-between px-4 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 select-none z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/cover-letters"
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            title="Back to Templates"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-transparent border-b border-transparent hover:border-[var(--line)] focus:border-[var(--accent)] px-1 py-0.5 text-xs font-bold text-[var(--ink)] focus:outline-none"
            />
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[var(--surface-soft)] border border-[var(--line)] rounded px-2 py-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/compiler"
            className="flex items-center gap-1 h-8 px-3 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
          >
            <Cpu className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Compiler</span>
          </Link>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 h-8 px-3 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isSaved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span>{isSaved ? "Saved" : "Save"}</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center h-8 px-2.5 rounded border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-white transition-colors"
            title="Delete Template"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Editor Body */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d0f14] overflow-hidden">
        <div className="h-8 flex items-center justify-between px-4 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-mono text-[var(--muted)] select-none">
          <span>LaTeX Document Source</span>
          <span>{latex.split("\n").length} lines</span>
        </div>

        <textarea
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full bg-[#0d0f14] p-5 font-mono text-xs text-[#e6edf3] border-0 resize-none focus:outline-none leading-relaxed select-text overflow-y-auto"
        />
      </div>
    </div>
  );
}
