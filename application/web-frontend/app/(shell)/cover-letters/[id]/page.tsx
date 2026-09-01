"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileCode,
  Hammer,
  Loader2,
  RotateCw,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { LatexEditor } from "@/components/editor/LatexEditor";
import { IconButton } from "@/components/ui/IconButton";
import { resolveAiCredentials } from "@/lib/ai/storage";
import { apiFetch } from "@/lib/api/client";
import type { CoverLetterDetail } from "@/lib/api/types";
import { buildApiUrl, getApiToken } from "@/lib/config/env";

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

  // Live PDF Compilation State
  const [isCompiling, setIsCompiling] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [compilationError, setCompilationError] = useState<string | null>(null);

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

  const handleCompile = async () => {
    if (!latex.trim()) return;
    setIsCompiling(true);
    setCompilationError(null);

    try {
      if (name.trim() && category.trim()) {
        void apiFetch(`/cover_letters/${id}`, {
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
      }

      const token = getApiToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(buildApiUrl("/pdf/compile"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          latex_content: latex,
          filename: `${name || "cover_letter"}.pdf`,
        }),
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
        err.message || "Compilation failed. Check LaTeX syntax.",
      );
    } finally {
      setIsCompiling(false);
    }
  };

  const handleAiFix = async () => {
    if (!compilationError) return;
    setIsFixing(true);
    try {
      const creds = resolveAiCredentials();

      if (!creds?.apiKey) {
        throw new Error(
          "AI API key not configured. Please set it in Settings \u2192 AI Intelligence.",
        );
      }
      const res = await apiFetch<{ latex: string }>("/pdf/fix", {
        method: "POST",
        body: {
          provider: creds.provider,
          model: creds.model,
          api_key: creds.apiKey,
          custom_base_url: creds.customBaseUrl || undefined,
          broken_latex: latex,
          error_logs: compilationError,
        },
      });
      if (res?.latex) {
        setLatex(res.latex);
        setCompilationError(null);
        setTimeout(() => void handleCompile(), 100);
      }
    } catch (err: any) {
      console.error(err);
      alert(`AI Fix error: ${err.message}`);
    } finally {
      setIsFixing(false);
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
              className="bg-transparent border-b border-transparent hover:border-[var(--line)] focus:border-[var(--accent)] px-1 py-0.5 text-xs font-bold text-[var(--ink)] focus:outline-hidden"
            />
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[var(--surface-soft)] border border-[var(--line)] rounded px-2 py-0.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            label="Compile LaTeX"
            tooltipPlacement="bottom"
            variant="accent"
            size="sm"
            icon={<Hammer />}
            loading={isCompiling}
            disabled={isCompiling}
            onClick={handleCompile}
          />

          {pdfBlobUrl && (
            <IconButton
              label="Download PDF"
              tooltipPlacement="bottom"
              variant="soft"
              size="sm"
              icon={<Download />}
              onClick={() => {
                const a = document.createElement("a");
                a.href = pdfBlobUrl;
                a.download = `${name || "cover_letter"}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
            />
          )}

          <IconButton
            label="Save Template"
            tooltipPlacement="bottom"
            variant="soft"
            size="sm"
            icon={isSaved ? <Check className="text-emerald-400" /> : <Save />}
            disabled={saving}
            loading={saving}
            onClick={handleSave}
          />

          <IconButton
            label="Delete Template"
            tooltipPlacement="bottom"
            variant="danger"
            size="sm"
            icon={<Trash2 />}
            onClick={handleDelete}
          />
        </div>
      </header>

      {/* Error Bar */}
      {compilationError && (
        <div className="px-4 py-2 bg-[rgba(248,81,73,0.15)] border-b border-[var(--warning)] text-xs text-[var(--warning)] font-semibold flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 truncate pr-4">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="truncate">{compilationError}</span>
          </div>
          <button
            type="button"
            onClick={handleAiFix}
            disabled={isFixing}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[var(--warning)] text-white text-xs font-bold hover:opacity-90 shrink-0"
          >
            {isFixing ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            <span>AI Fix LaTeX</span>
          </button>
        </div>
      )}

      {/* Split Pane Editor & Vector PDF Preview */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left: Production LaTeX Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117] overflow-hidden">
          <div className="h-8 flex items-center justify-between px-4 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-mono text-[var(--muted)] select-none">
            <span>cover_letter.tex</span>
            <span>{latex.split("\n").length} lines</span>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden bg-[#0d1117]">
            <LatexEditor
              value={latex}
              onChange={setLatex}
              onCompile={handleCompile}
              onSave={handleSave}
              height="100%"
              placeholder="% Cover letter LaTeX — CodeMirror with LaTeX grammar, bracket matching & dark theme"
            />
          </div>
        </div>

        {/* Right: PDF Vector Viewer */}
        <div className="w-full lg:w-[480px] xl:w-[540px] bg-[var(--bg-accent)] border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col shrink-0 overflow-hidden">
          <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] select-none">
            <span>PDF Vector Output</span>
          </div>

          <div className="flex-1 bg-zinc-900 overflow-hidden flex items-center justify-center">
            {isCompiling ? (
              <div className="flex flex-col items-center gap-2 text-xs text-[var(--muted)]">
                <RotateCw className="h-6 w-6 animate-spin text-[var(--accent)]" />
                <span>Compiling in Tectonic…</span>
              </div>
            ) : pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                title="Cover Letter PDF Preview"
                className="h-full w-full bg-white border-0"
              />
            ) : (
              <div className="text-center p-6 space-y-2 text-[var(--muted)]">
                <FileCode className="h-8 w-8 mx-auto opacity-40" />
                <p className="text-xs">Click Compile to render PDF preview.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
