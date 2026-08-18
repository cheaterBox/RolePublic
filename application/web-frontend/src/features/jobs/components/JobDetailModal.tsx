"use client";

import {
  Building2,
  ChevronRight,
  ExternalLink,
  FileText,
  Gauge,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { JobPayload } from "@/lib/api/types";

interface JobDetailModalProps {
  job: JobPayload | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export function JobDetailModal({
  job,
  onClose,
  onDelete,
  onUpdateStatus,
}: JobDetailModalProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "requirements" | "responsibilities" | "raw"
  >("overview");

  if (!job) return null;

  const parseJsonSafe = (str?: string | null): string[] => {
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const requirements = parseJsonSafe(job.requirements);
  const responsibilities = parseJsonSafe(job.core_responsibilities);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-50">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-border/80 bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 px-6 py-4 bg-secondary/30">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-extrabold text-foreground">
                {job.job_title}
              </h3>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
                  job.status === "offered"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : job.status === "interviewing"
                      ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                      : job.status === "applied"
                        ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                        : "bg-secondary text-muted-foreground border border-border/60"
                }`}
              >
                {job.status || "saved"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span>{job.company_name}</span>
              {job.job_url && (
                <a
                  href={job.job_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Posting Link</span>
                </a>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-border/40 px-6 pt-3 bg-secondary/10">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("requirements")}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 ${
              activeTab === "requirements"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Technical Requirements ({requirements.length})
          </button>
          <button
            onClick={() => setActiveTab("responsibilities")}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 ${
              activeTab === "responsibilities"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Responsibilities ({responsibilities.length})
          </button>
          <button
            onClick={() => setActiveTab("raw")}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 ${
              activeTab === "raw"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Raw Description
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Quick Details Matrix */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-secondary/40 p-3.5 space-y-1">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase">
                    Work Model
                  </span>
                  <div className="text-xs font-bold text-foreground">
                    {job.work_model || "Remote"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-secondary/40 p-3.5 space-y-1">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase">
                    Employment Type
                  </span>
                  <div className="text-xs font-bold text-foreground">
                    {job.employment_type || "Full-time"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-secondary/40 p-3.5 space-y-1">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase">
                    Compensation
                  </span>
                  <div className="text-xs font-bold text-emerald-400 font-mono">
                    {job.salary || "Not Specified"}
                  </div>
                </div>
              </div>

              {/* Status Update Control */}
              <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-foreground">
                    Update Application Status:
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Keep your pipeline accurate across application stages
                  </div>
                </div>
                <select
                  value={job.status || "saved"}
                  onChange={(e) => onUpdateStatus(job.id, e.target.value)}
                  className="rounded-xl border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="saved">Saved</option>
                  <option value="applied">Applied</option>
                  <option value="interviewing">Interviewing</option>
                  <option value="offered">Offered</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Quick AI Action Launchers */}
              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                <Link
                  href={`/resumes?jobId=${job.id}`}
                  className="flex items-center justify-between rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 hover:bg-purple-500/20 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        Tailor Base Resume
                      </div>
                      <div className="text-[11px] text-purple-300">
                        Align experience with this role
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-purple-400 group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link
                  href={`/scoring?jobId=${job.id}`}
                  className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 hover:bg-amber-500/20 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                      <Gauge className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        ATS Match Scorer
                      </div>
                      <div className="text-[11px] text-amber-300">
                        Calculate 100% local fit score
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-amber-400 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          )}

          {activeTab === "requirements" && (
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-muted-foreground uppercase">
                Extracted Requirements:
              </span>
              <div className="flex flex-wrap gap-2">
                {requirements.map((req, idx) => (
                  <span
                    key={idx}
                    className="rounded-xl border border-border/70 bg-secondary/50 px-3 py-1.5 text-xs text-foreground font-medium"
                  >
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeTab === "responsibilities" && (
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-muted-foreground uppercase">
                Core Responsibilities:
              </span>
              <div className="space-y-1.5">
                {responsibilities.map((resp, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border/60 bg-secondary/40 p-2.5 text-xs text-muted-foreground"
                  >
                    • {resp}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "raw" && (
            <pre className="rounded-2xl border border-border/70 bg-secondary/30 p-4 font-mono text-xs text-muted-foreground whitespace-pre-wrap max-h-96 overflow-y-auto">
              {job.raw_jd}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-4 bg-secondary/30">
          <button
            onClick={() => {
              onDelete(job.id);
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Application</span>
          </button>

          <button
            onClick={onClose}
            className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-foreground hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
