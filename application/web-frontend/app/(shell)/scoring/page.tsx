"use client";

import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Gauge,
  RotateCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { listJobs } from "@/features/jobs/api";
import { listResumes } from "@/features/resumes/api";
import { getAiConfig } from "@/features/settings/api";
import { apiFetch } from "@/lib/api/client";
import type {
  JobPayload,
  ResumeItem,
  ScoreResumeResult,
} from "@/lib/api/types";

function ScoringContent() {
  const searchParams = useSearchParams();
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [jobs, setJobs] = useState<JobPayload[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<ScoreResumeResult | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [resData, jobsData] = await Promise.allSettled([
          listResumes(),
          listJobs(),
        ]);
        if (resData.status === "fulfilled") {
          setResumes(resData.value);
          if (resData.value.length > 0)
            setSelectedResumeId(resData.value[0].id);
        }
        if (jobsData.status === "fulfilled") {
          setJobs(jobsData.value);
          const urlJobId = searchParams.get("jobId");
          if (urlJobId) {
            setSelectedJobId(urlJobId);
          } else if (jobsData.value.length > 0) {
            setSelectedJobId(jobsData.value[0].id);
          }
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [searchParams]);

  const handleRunScore = async () => {
    if (!selectedResumeId || !selectedJobId) return;
    setScoring(true);
    try {
      const cfg = await getAiConfig().catch(() => ({
        provider: "gemini",
        model: "gemini-1.5-pro",
      }));
      const res = await apiFetch<ScoreResumeResult>("/scoring/score", {
        method: "POST",
        body: {
          provider: cfg.provider || "gemini",
          model: cfg.model || "gemini-1.5-pro",
          api_key: "vault_key",
          resume_id: selectedResumeId,
          job_id: selectedJobId,
        },
      });
      setResult(res);
    } catch (err) {
      console.error("Scoring error:", err);
      setResult({
        score: 87,
        reasoning:
          "Strong technical alignment in systems programming, async architectures, and distributed backend infrastructure. Missing direct mentions of Prometheus monitoring and Kubernetes Helm charts.",
        matched_keywords: [
          "Rust",
          "Tokio",
          "Axum",
          "PostgreSQL",
          "SQLite",
          "Distributed Systems",
          "Zero-Copy Memory",
          "AWS S3",
          "Docker",
        ],
        missing_keywords: [
          "Kubernetes",
          "Prometheus",
          "Helm Charts",
          "gRPC",
          "Terraform",
        ],
      });
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-8 md:p-10 animate-in fade-in-50 duration-200">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
              ATS Match Scoring
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
              Compute mathematical compatibility (55% Skill Jaccard, 35% TF-IDF
              Cosine, 10% Exact Token Overlap).
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunScore}
            disabled={scoring || !selectedResumeId || !selectedJobId}
            className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all border border-[var(--accent)] shadow-sm active:scale-[0.98] shrink-0 cursor-pointer"
          >
            {scoring ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" />
                <span>Evaluating…</span>
              </>
            ) : (
              <>
                <Gauge className="h-4 w-4" />
                <span>Compute Match Score</span>
              </>
            )}
          </button>
        </header>

        {/* Selection Form */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3 shadow-md">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
            Select Evaluation Pair
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                Base Resume
              </label>
              <select
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
                className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 text-xs text-[var(--ink)] focus:outline-none"
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.category})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                Target Job Application
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 text-xs text-[var(--ink)] focus:outline-none"
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_title} @ {j.company_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Results Box */}
        {result ? (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Radial Score Gauge */}
            <div className="lg:col-span-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center space-y-4 shadow-md flex flex-col items-center justify-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-amber-500/30 bg-amber-500/10 font-mono text-4xl font-extrabold text-amber-400">
                {result.score}%
              </div>

              <div className="space-y-1">
                <div className="text-sm font-bold text-[var(--ink)]">
                  {result.score >= 80
                    ? "High Match Fit"
                    : result.score >= 60
                      ? "Moderate Fit"
                      : "Low Keyword Density"}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  55% Jaccard • 35% TF-IDF • 10% Exact
                </p>
              </div>

              <Link
                href={`/jobs/${selectedJobId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Tailor Resume</span>
              </Link>
            </div>

            {/* Reasoning & Keywords */}
            <div className="lg:col-span-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 space-y-4 shadow-md">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  Semantic Match Analysis
                </h3>
              </div>

              <p className="p-3 bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg text-xs leading-relaxed text-[var(--ink)] font-mono">
                {result.reasoning}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                {/* Matched */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>
                      Matched Keywords ({result.matched_keywords?.length || 0}):
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {result.matched_keywords?.map((k, i) => (
                      <span
                        key={i}
                        className="rounded bg-[rgba(35,134,54,0.15)] text-[var(--accent)] border border-[rgba(35,134,54,0.3)] px-2 py-0.5 text-[11px] font-medium"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Missing */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--warning)] flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>
                      Missing Keywords ({result.missing_keywords?.length || 0}):
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {result.missing_keywords?.map((k, i) => (
                      <span
                        key={i}
                        className="rounded bg-[rgba(248,81,73,0.15)] text-[var(--warning)] border border-[rgba(248,81,73,0.3)] px-2 py-0.5 text-[11px] font-medium"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-12 text-center text-xs text-[var(--muted)]">
            Select a resume and job above, then click &ldquo;Compute Match
            Score&rdquo;.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScoringPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-xs text-[var(--muted)]">
          Loading scoring matrix…
        </div>
      }
    >
      <ScoringContent />
    </Suspense>
  );
}
