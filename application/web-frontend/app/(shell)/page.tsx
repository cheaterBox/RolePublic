"use client";

import {
  Activity,
  ChevronRight,
  FileText,
  LayoutGrid,
  Mail,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { listJobs } from "@/features/jobs/api";
import type { JobPayload } from "@/lib/api/types";

export default function HomePage() {
  const router = useRouter();
  const [savedJobs, setSavedJobs] = useState<JobPayload[]>([]);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const jobs = await listJobs();
        if (mounted) setSavedJobs(jobs || []);
      } catch (err) {
        console.error("Home data load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadData();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-8 md:p-10 animate-in fade-in-50 duration-200">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Hero Section (Matching HomeTab.vue) */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            <Activity className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Engine Ready</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ink)]">
            Craft your professional narrative.
          </h1>

          <p className="text-sm sm:text-base text-[var(--muted)] leading-relaxed max-w-xl">
            Surgical AI tailoring for high-performance LaTeX resumes.
          </p>

          {/* Action Buttons with Floating Tooltips (Matching HomeTab.vue) */}
          <div className="flex items-center gap-3 pt-2">
            {/* New Application */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => setActiveTooltip("new-app")}
              onMouseLeave={() => setActiveTooltip(null)}
            >
              <Link
                href="/parse"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
              >
                <Plus className="h-5 w-5" />
              </Link>
              {activeTooltip === "new-app" && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 rounded-md bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                  New Application
                </div>
              )}
            </div>

            {/* Resume Templates */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => setActiveTooltip("resumes")}
              onMouseLeave={() => setActiveTooltip(null)}
            >
              <Link
                href="/resumes"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
              >
                <FileText className="h-5 w-5" />
              </Link>
              {activeTooltip === "resumes" && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 rounded-md bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                  Resume Templates
                </div>
              )}
            </div>

            {/* CL Templates */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => setActiveTooltip("cls")}
              onMouseLeave={() => setActiveTooltip(null)}
            >
              <Link
                href="/cover-letters"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
              >
                <Mail className="h-5 w-5" />
              </Link>
              {activeTooltip === "cls" && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 rounded-md bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                  CL Templates
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RECENT APPLICATIONS Box (Matching HomeTab.vue) */}
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-accent)] border-b border-[var(--line)]">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
              RECENT APPLICATIONS
            </h3>

            <div
              className="relative flex items-center"
              onMouseEnter={() => setActiveTooltip("all-jobs")}
              onMouseLeave={() => setActiveTooltip(null)}
            >
              <Link
                href="/jobs"
                className="text-[var(--accent)] hover:opacity-80 text-xs font-bold flex items-center gap-1"
              >
                <LayoutGrid className="h-4 w-4" />
              </Link>
              {activeTooltip === "all-jobs" && (
                <div className="absolute top-full mt-2 right-0 z-50 rounded-md bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                  All Applications
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--muted)]">
              Loading applications…
            </div>
          ) : savedJobs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted)]">
              No active applications. Start by parsing a job description.
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {savedJobs.slice(0, 8).map((job) => (
                <button
                  type="button"
                  key={job.id}
                  onClick={() => router.push(`/jobs/${job.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--surface-soft)] transition-colors group"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="text-sm font-semibold text-[var(--ink)] truncate group-hover:text-[var(--accent)] transition-colors">
                      {job.job_title}
                    </div>
                    <div className="text-xs text-[var(--muted)] truncate">
                      {job.company_name}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {job.created_at?.split("T")[0] ||
                        job.created_at?.split(" ")[0] ||
                        "Recent"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
