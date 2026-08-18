"use client";

import { Building2, FileText, Gauge, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { JobPayload } from "@/lib/api/types";

interface JobTableProps {
  jobs: JobPayload[];
  onView: (job: JobPayload) => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export function JobTable({
  jobs,
  onView,
  onDelete,
  onUpdateStatus,
}: JobTableProps) {
  const [_activeMenuId, _setActiveMenuId] = useState<string | null>(null);

  if (jobs.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/80 mx-auto text-muted-foreground">
          <Building2 className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-foreground">
            No applications found in this view
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Try adjusting your search criteria or filter, or import new job
            postings using the AI extractor.
          </p>
        </div>
      </div>
    );
  }

  const parseJsonSafe = (str?: string | null): string[] => {
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {jobs.map((job) => {
        const requirements = parseJsonSafe(job.requirements);
        const _responsibilities = parseJsonSafe(job.core_responsibilities);

        return (
          <div
            key={job.id}
            className="group relative flex flex-col justify-between rounded-3xl border border-border/70 bg-card/80 p-5 sm:p-6 backdrop-blur-xl transition-all hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 space-y-4"
          >
            {/* Top Row: Role & Status */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <h4 className="text-base font-extrabold text-foreground truncate group-hover:text-primary transition-colors">
                    {job.job_title}
                  </h4>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                    <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{job.company_name}</span>
                  </div>
                </div>

                {/* Status Dropdown / Pill */}
                <select
                  value={job.status || "saved"}
                  onChange={(e) => onUpdateStatus(job.id, e.target.value)}
                  className={`rounded-xl px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border focus:outline-none cursor-pointer ${
                    job.status === "offered"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : job.status === "interviewing"
                        ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                        : job.status === "applied"
                          ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                          : job.status === "rejected"
                            ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                            : "bg-secondary/80 text-muted-foreground border-border/60"
                  }`}
                >
                  <option value="saved" className="bg-card text-foreground">
                    Saved
                  </option>
                  <option value="applied" className="bg-card text-foreground">
                    Applied
                  </option>
                  <option
                    value="interviewing"
                    className="bg-card text-foreground"
                  >
                    Interviewing
                  </option>
                  <option value="offered" className="bg-card text-foreground">
                    Offered
                  </option>
                  <option value="rejected" className="bg-card text-foreground">
                    Rejected
                  </option>
                </select>
              </div>

              {/* Metadata Badges */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-md bg-secondary/60 px-2 py-0.5 border border-border/50 font-medium">
                  {job.work_model || "Remote"}
                </span>
                <span className="rounded-md bg-secondary/60 px-2 py-0.5 border border-border/50 font-medium">
                  {job.employment_type || "Full-time"}
                </span>
                {job.salary && (
                  <span className="rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 font-mono font-medium">
                    {job.salary}
                  </span>
                )}
              </div>

              {/* Requirement Highlights */}
              {requirements.length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex flex-wrap gap-1">
                    {requirements.slice(0, 3).map((req, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium border border-primary/20 truncate max-w-[150px]"
                      >
                        {req}
                      </span>
                    ))}
                    {requirements.length > 3 && (
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                        +{requirements.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="border-t border-border/50 pt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Link
                  href={`/resumes?jobId=${job.id}`}
                  className="p-1.5 rounded-lg border border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-purple-500/40 transition-all text-[11px] font-semibold flex items-center gap-1"
                  title="Tailor Base Resume for this job"
                >
                  <FileText className="h-3.5 w-3.5 text-purple-400" />
                  <span className="hidden sm:inline">Tailor Resume</span>
                </Link>

                <Link
                  href={`/scoring?jobId=${job.id}`}
                  className="p-1.5 rounded-lg border border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-amber-500/40 transition-all text-[11px] font-semibold flex items-center gap-1"
                  title="Evaluate ATS Match Score"
                >
                  <Gauge className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Score</span>
                </Link>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onView(job)}
                  className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  Inspect
                </button>

                <button
                  onClick={() => onDelete(job.id)}
                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-colors"
                  title="Delete Application"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
