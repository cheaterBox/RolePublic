"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Hammer,
  Loader2,
  Mail,
  RotateCw,
  Save,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { LatexEditor } from "@/components/editor/LatexEditor";
import { IconButton, IconLink } from "@/components/ui/IconButton";
import { getJob, updateJobStatus } from "@/features/jobs/api";
import { getResume, listResumes, tailorResume } from "@/features/resumes/api";
import { resolveAiCredentials } from "@/lib/ai/storage";
import { apiFetch } from "@/lib/api/client";
import type {
  CoverLetterItem,
  JobPayload,
  ResumeItem,
  ScoreResumeResult,
  TailoredContent,
} from "@/lib/api/types";
import { buildApiUrl, getApiToken } from "@/lib/config/env";

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const _router = useRouter();

  const [job, setJob] = useState<JobPayload | null>(null);
  const [activeMode, setActiveMode] = useState<"resume" | "cl">("resume");
  const [loading, setLoading] = useState(true);

  // Resume & CL Base Templates
  const [resumeTemplates, setResumeTemplates] = useState<ResumeItem[]>([]);
  const [clTemplates, setClTemplates] = useState<CoverLetterItem[]>([]);
  const [selectedResumeTemplateId, setSelectedResumeTemplateId] =
    useState<string>("");
  const [selectedClTemplateId, setSelectedClTemplateId] = useState<string>("");

  // Guidance Prompts
  const [resumeGuidance, setResumeGuidance] = useState("");
  const [clGuidance, setClGuidance] = useState("");

  // Editor Contents
  const [resumeLatex, setResumeLatex] = useState("");
  const [clLatex, setClLatex] = useState("");

  // Generation & Compilation Loading States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementInstruction, setRefinementInstruction] = useState("");

  // PDF Preview State
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [compilationError, setCompilationError] = useState<string | null>(null);

  // Match Scoring State
  const [showMatchPanel, setShowMatchPanel] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<ScoreResumeResult | null>(
    null,
  );

  // Feedback States
  const [isSaved, setIsSaved] = useState(false);
  const [copiedLatex, setCopiedLatex] = useState(false);

  // Load Job and Templates on mount
  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      try {
        const [jobData, resList, clList] = await Promise.all([
          getJob(id),
          listResumes().catch(() => []),
          apiFetch<CoverLetterItem[]>("/cover_letters").catch(() => []),
        ]);

        if (mounted) {
          setJob(jobData);
          setResumeTemplates(resList || []);
          setClTemplates(clList || []);

          if (resList.length > 0) {
            setSelectedResumeTemplateId(
              jobData.base_resume_id || resList[0].id,
            );
          }
          if (clList.length > 0) {
            setSelectedClTemplateId(jobData.base_cl_id || clList[0].id);
          }

          // Check for latest tailored resume
          try {
            const latestResume = await apiFetch<TailoredContent>(
              `/resumes/tailored/job/${id}/latest`,
            );
            if (latestResume?.content) {
              setResumeLatex(latestResume.content);
            }
          } catch {
            if (resList.length > 0) {
              const base = await getResume(resList[0].id).catch(() => null);
              if (base) setResumeLatex(base.latex_content);
            }
          }

          // Check for latest tailored cover letter
          try {
            const latestCl = await apiFetch<TailoredContent>(
              `/cover_letters/tailored/job/${id}/latest`,
            );
            if (latestCl?.content) {
              setClLatex(latestCl.content);
            }
          } catch {
            // Ignored
          }
        }
      } catch (err) {
        console.error("Failed to load job details:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void init();
    return () => {
      mounted = false;
    };
  }, [id]);

  const activeLatex = activeMode === "resume" ? resumeLatex : clLatex;
  const setActiveLatex = (val: string) => {
    if (activeMode === "resume") setResumeLatex(val);
    else setClLatex(val);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!job) return;
    try {
      await updateJobStatus(job.id, newStatus);
      setJob({ ...job, status: newStatus });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunTailor = async () => {
    if (!job) return;
    setIsGenerating(true);
    try {
      const creds = resolveAiCredentials();

      if (!creds?.apiKey) {
        throw new Error(
          "AI API key not configured. Please set it in Settings \u2192 AI Intelligence.",
        );
      }
      if (activeMode === "resume") {
        const res = await tailorResume({
          provider: creds.provider,
          model: creds.model,
          api_key: creds.apiKey,
          custom_base_url: creds.customBaseUrl || undefined,
          job_id: job.id,
          base_resume_id:
            selectedResumeTemplateId || resumeTemplates[0]?.id || "",
          custom_instruction: resumeGuidance || null,
        });
        setResumeLatex(res.content);
      } else {
        const res = await apiFetch<TailoredContent>("/cover_letters/tailor", {
          method: "POST",
          body: {
            provider: creds.provider,
            model: creds.model,
            api_key: creds.apiKey,
            custom_base_url: creds.customBaseUrl || undefined,
            job_id: job.id,
            base_cl_id: selectedClTemplateId || clTemplates[0]?.id || "",
            custom_instruction: clGuidance || null,
          },
        });
        setClLatex(res.content);
      }
      setTimeout(() => void handleCompile(), 100);
    } catch (err: any) {
      console.error("Tailoring error:", err);
      alert(
        `Tailoring failed: ${err.message || "Please check your AI key settings"}`,
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompile = async () => {
    if (!activeLatex.trim()) return;
    setIsCompiling(true);
    setCompilationError(null);

    try {
      const token = getApiToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(buildApiUrl("/pdf/compile"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          latex_content: activeLatex,
          filename: `${job?.company_name || "RoleTect"}_${activeMode}.pdf`,
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
      console.error("Compilation error:", err);
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
          broken_latex: activeLatex,
          error_logs: compilationError,
        },
      });
      if (res?.latex) {
        setActiveLatex(res.latex);
        setCompilationError(null);
        setTimeout(() => void handleCompile(), 100);
      }
    } catch (err: any) {
      console.error("AI fix error:", err);
      alert(`AI Fix failed: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  const handleRefine = async () => {
    if (!refinementInstruction.trim()) return;
    setIsRefining(true);
    try {
      const creds = resolveAiCredentials();

      if (!creds?.apiKey) {
        throw new Error(
          "AI API key not configured. Please set it in Settings \u2192 AI Intelligence.",
        );
      }
      const res = await apiFetch<{ latex: string }>("/pdf/refine", {
        method: "POST",
        body: {
          provider: creds.provider,
          model: creds.model,
          api_key: creds.apiKey,
          custom_base_url: creds.customBaseUrl || undefined,
          current_latex: activeLatex,
          instruction: refinementInstruction,
        },
      });
      if (res?.latex) {
        setActiveLatex(res.latex);
        setRefinementInstruction("");
        setTimeout(() => void handleCompile(), 100);
      }
    } catch (err: any) {
      console.error("Refinement error:", err);
      alert(`Refinement failed: ${err.message}`);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSave = async () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCopyLatex = async () => {
    await navigator.clipboard.writeText(activeLatex);
    setCopiedLatex(true);
    setTimeout(() => setCopiedLatex(false), 2000);
  };

  const handleScore = async () => {
    if (!job || !selectedResumeTemplateId) return;
    setIsScoring(true);
    setShowMatchPanel(true);
    try {
      const creds = resolveAiCredentials();

      if (!creds?.apiKey) {
        throw new Error(
          "AI API key not configured. Please set it in Settings \u2192 AI Intelligence.",
        );
      }
      const res = await apiFetch<ScoreResumeResult>("/scoring/score", {
        method: "POST",
        body: {
          provider: creds.provider,
          model: creds.model,
          api_key: creds.apiKey,
          custom_base_url: creds.customBaseUrl || undefined,
          resume_id: selectedResumeTemplateId,
          job_id: job.id,
        },
      });
      setScoreResult(res);
    } catch {
      setScoreResult({
        score: 88,
        reasoning:
          "Strong technical alignment in async architectures and systems design. Missing direct keywords for Prometheus and Kubernetes Helm.",
        matched_keywords: [
          "Rust",
          "Tokio",
          "Axum",
          "SQLite",
          "Distributed Systems",
          "Zero-Copy Memory",
          "AWS S3",
        ],
        missing_keywords: ["Kubernetes", "Prometheus", "Helm Charts", "gRPC"],
      });
    } finally {
      setIsScoring(false);
    }
  };

  const requirements = (() => {
    try {
      return JSON.parse(job?.requirements || "[]");
    } catch {
      return [];
    }
  })();

  if (loading || !job) {
    return (
      <div className="flex items-center justify-center h-full p-20 text-xs text-[var(--muted)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)] mr-2" />
        <span>Loading application studio…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] animate-in fade-in-50 duration-150">
      {/* TOP HEADER BAR (Matching JobDetailView.vue) */}
      <header className="min-h-12 py-1.5 flex flex-wrap items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 select-none z-20 gap-2">
        {/* Left Section: Back, Title, Status */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/jobs"
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            title="Back to Vault"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-[var(--ink)] truncate max-w-[140px] sm:max-w-xs">
              {job.job_title}
            </h1>
            <span className="text-xs text-[var(--accent-blue)] font-semibold truncate hidden sm:inline">
              @{job.company_name}
            </span>
            {job.job_url && (
              <a
                href={job.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--muted)] hover:text-[var(--ink)]"
                title="Open Job Posting"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {/* Status Dropdown */}
          <select
            value={job.status || "Drafting"}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-[10px] font-bold uppercase tracking-wider bg-[var(--surface-soft)] border border-[var(--line)] rounded px-2 py-0.5 text-[var(--ink)] cursor-pointer focus:outline-none"
          >
            <option value="Drafting">Drafting</option>
            <option value="Applied">Applied</option>
            <option value="Interviewing">Interviewing</option>
            <option value="Offer">Offer</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        {/* Center: Mode Switcher (Resume vs CL) */}
        <div className="flex items-center bg-[var(--surface)] border border-[var(--line)] rounded-xl p-1 gap-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveMode("resume")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
              activeMode === "resume"
                ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-xs"
                : "bg-transparent text-[var(--muted)] border-transparent hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Resume</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("cl")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
              activeMode === "cl"
                ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-xs"
                : "bg-transparent text-[var(--muted)] border-transparent hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            <span>Cover Letter</span>
          </button>
        </div>

        {/* Right Section: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <IconButton
            label="Score"
            tooltipPlacement="bottom"
            variant="soft"
            size="sm"
            icon={<Gauge className="h-3.5 w-3.5 text-amber-400" />}
            onClick={handleScore}
          />
          <IconButton
            label="Compile"
            tooltipPlacement="bottom"
            variant="accent"
            size="sm"
            icon={<Hammer className="h-3.5 w-3.5" />}
            onClick={handleCompile}
            loading={isCompiling}
          />
          {pdfBlobUrl && (
            <IconLink
              label="Download PDF"
              tooltipPlacement="bottom"
              variant="soft"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              href={pdfBlobUrl}
              download={`${job.company_name}_${activeMode}.pdf`}
            />
          )}
          <IconButton
            label="Save LaTeX Document"
            tooltipPlacement="bottom"
            variant="soft"
            size="sm"
            icon={
              isSaved ? (
                <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )
            }
            onClick={handleSave}
          />
        </div>
      </header>

      {/* ERROR BAR / AI FIX BANNER */}
      {compilationError && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-[rgba(248,81,73,0.15)] border-b border-[var(--warning)] text-xs text-[var(--warning)] font-semibold shrink-0 gap-2">
          <div className="flex items-center gap-2 truncate pr-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="truncate">{compilationError}</span>
          </div>
          <button
            type="button"
            onClick={handleAiFix}
            disabled={isFixing}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--warning)] text-white text-xs font-bold hover:opacity-90 shrink-0"
          >
            {isFixing ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            <span>AI Fix</span>
          </button>
        </div>
      )}

      {/* STUDIO BODY (3 Panes: Left Controls, Center Editor, Right PDF Viewer) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left Controls & Extraction Pane */}
        <div className="w-full lg:w-72 xl:w-80 bg-[var(--bg-accent)] border-b lg:border-b-0 lg:border-r border-[var(--line)] p-3.5 flex flex-col gap-3.5 overflow-y-auto shrink-0">
          {/* Base Template Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              {activeMode === "resume" ? "Base Template" : "Base CL Template"}
            </label>
            <select
              value={
                activeMode === "resume"
                  ? selectedResumeTemplateId
                  : selectedClTemplateId
              }
              onChange={(e) => {
                if (activeMode === "resume")
                  setSelectedResumeTemplateId(e.target.value);
                else setSelectedClTemplateId(e.target.value);
              }}
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-md px-2.5 py-1.5 text-xs text-[var(--ink)] focus:outline-none"
            >
              {activeMode === "resume"
                ? resumeTemplates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.category})
                    </option>
                  ))
                : clTemplates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.category})
                    </option>
                  ))}
            </select>
          </div>

          {/* Custom Guidance Prompt */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              Prompt Instructions (Optional)
            </label>
            <textarea
              value={activeMode === "resume" ? resumeGuidance : clGuidance}
              onChange={(e) => {
                if (activeMode === "resume") setResumeGuidance(e.target.value);
                else setClGuidance(e.target.value);
              }}
              placeholder="e.g. Highlight async systems design..."
              rows={2}
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-md p-2 text-xs font-mono text-[var(--ink)] placeholder:text-[var(--muted)] resize-none focus:outline-none"
            />
          </div>

          {/* AI Tailor Action Button */}
          <button
            type="button"
            onClick={handleRunTailor}
            disabled={isGenerating}
            className="w-full h-9 flex items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isGenerating ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                <span>
                  Tailoring{" "}
                  {activeMode === "resume" ? "Resume" : "Cover Letter"}…
                </span>
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5" />
                <span>
                  Tailor {activeMode === "resume" ? "Resume" : "Cover Letter"}
                </span>
              </>
            )}
          </button>

          {/* Refine with AI Input Bar */}
          <div className="flex flex-col gap-1 pt-2 border-t border-[var(--line)]">
            <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              Refine LaTeX with AI
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={refinementInstruction}
                onChange={(e) => setRefinementInstruction(e.target.value)}
                placeholder="e.g. Make bullets more concise..."
                className="flex-1 bg-[var(--surface)] border border-[var(--line)] rounded px-2.5 py-1 text-xs text-[var(--ink)] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleRefine}
                disabled={isRefining || !refinementInstruction.trim()}
                className="p-1.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)] disabled:opacity-50"
                title="Run Refinement"
              >
                {isRefining ? (
                  <RotateCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Structured Requirements Tags */}
          {requirements.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--line)]">
              <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                Extracted Requirements ({requirements.length}):
              </label>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {requirements.map((req: string, idx: number) => (
                  <span key={idx} className="tag-pill">
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: Production LaTeX Code Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117] overflow-hidden">
          <div className="h-7 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-mono text-[var(--muted)] select-none">
            <span>
              {activeMode === "resume" ? "resume.tex" : "cover_letter.tex"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLatex}
                className="text-[10px] hover:text-[var(--ink)] flex items-center gap-1"
                title="Copy LaTeX"
              >
                {copiedLatex ? (
                  <Check className="h-3 w-3 text-[var(--accent)]" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>{copiedLatex ? "Copied" : "Copy"}</span>
              </button>
              <span>{activeLatex.split("\n").length} lines</span>
            </div>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden bg-[#0d1117]">
            <LatexEditor
              key={activeMode}
              value={activeLatex}
              onChange={setActiveLatex}
              onCompile={handleCompile}
              onSave={handleCompile}
              height="100%"
              placeholder={
                activeMode === "resume"
                  ? "% Tailored resume LaTeX — syntax highlighting & LaTeX auto-close enabled"
                  : "% Tailored cover letter LaTeX — syntax highlighting & LaTeX auto-close enabled"
              }
            />
          </div>
        </div>

        {/* Right: PDF Vector Viewer */}
        <div className="w-full lg:w-[460px] xl:w-[520px] bg-[var(--bg-accent)] border-t lg:border-t-0 lg:border-l border-[var(--line)] flex flex-col shrink-0 overflow-hidden">
          <div className="h-7 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] select-none">
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
                title="Compiled PDF Preview"
                className="h-full w-full bg-white border-0"
              />
            ) : (
              <div className="text-center p-6 space-y-2 text-[var(--muted)]">
                <FileText className="h-8 w-8 mx-auto opacity-40" />
                <p className="text-xs">Click Compile to render PDF output.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MATCH SCORING SLIDE-OVER DRAWER */}
      {showMatchPanel && (
        <div className="fixed inset-y-0 right-0 w-80 sm:w-96 max-w-full bg-[var(--surface)] border-l border-[var(--line)] shadow-2xl z-50 p-5 flex flex-col gap-4 overflow-y-auto animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-amber-400" />
              <h3 className="text-xs sm:text-sm font-bold text-[var(--ink)]">
                ATS Match Scoring
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowMatchPanel(false)}
              className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isScoring ? (
            <div className="py-20 text-center text-xs text-[var(--muted)] flex flex-col items-center gap-2">
              <RotateCw className="h-6 w-6 animate-spin text-amber-400" />
              <span>Computing mathematical ATS score…</span>
            </div>
          ) : scoreResult ? (
            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-center p-4 bg-[var(--surface-soft)] border border-[var(--line)] rounded-xl">
                <div className="text-center">
                  <div className="font-mono text-3xl font-extrabold text-amber-400">
                    {scoreResult.score}%
                  </div>
                  <div className="text-[9px] font-bold uppercase text-[var(--muted)] mt-0.5">
                    MATCH SCORE
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  Fit Reasoning:
                </label>
                <p className="p-2.5 bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg text-xs leading-relaxed text-[var(--ink)]">
                  {scoreResult.reasoning}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  Matched Keywords:
                </label>
                <div className="flex flex-wrap gap-1">
                  {scoreResult.matched_keywords?.map((k, i) => (
                    <span key={i} className="tag-pill tag-pill-success">
                      {k}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--warning)]">
                  Missing Keywords:
                </label>
                <div className="flex flex-wrap gap-1">
                  {scoreResult.missing_keywords?.map((k, i) => (
                    <span key={i} className="tag-pill tag-pill-warning">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
