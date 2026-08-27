"use client";

import {
  ArrowUpDown,
  Check,
  ChevronRight,
  FolderOpen,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteAllJobs, deleteJobsBatch, listJobs } from "@/features/jobs/api";
import type { JobPayload } from "@/lib/api/types";

export default function JobsPage() {
  const router = useRouter();
  const [allJobs, setAllJobs] = useState<JobPayload[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("date-desc");
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const statuses = [
    "All",
    "Drafting",
    "Applied",
    "Interviewing",
    "Offer",
    "Rejected",
  ];

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await listJobs();
      setAllJobs(data || []);
      setSelectedJobs(new Set());
    } catch (err) {
      console.error("Failed to load jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const handleCardClick = (id: string) => {
    if (isSelectionMode) {
      const updated = new Set(selectedJobs);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      setSelectedJobs(updated);
    } else {
      router.push(`/jobs/${id}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedJobs.size === 0) return;
    if (
      !confirm(
        `Are you sure you want to delete ${selectedJobs.size} selected applications?`,
      )
    )
      return;

    try {
      await deleteJobsBatch(Array.from(selectedJobs));
      await loadJobs();
      setIsSelectionMode(false);
    } catch (err) {
      console.error("Batch delete error:", err);
    }
  };

  const handleDeleteAll = async () => {
    if (
      !confirm(
        "CRITICAL: This will delete ALL job applications and their tailored resumes. This action is permanent. Continue?",
      )
    )
      return;

    try {
      await deleteAllJobs();
      await loadJobs();
    } catch (err) {
      console.error("Delete all error:", err);
    }
  };

  const handleSelectAllVisible = () => {
    const ids = new Set(filteredAndSortedJobs.map((j) => j.id));
    setSelectedJobs(ids);
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedJobs(new Set());
  };

  const filteredAndSortedJobs = allJobs
    .filter((job) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        (job.job_title || "").toLowerCase().includes(q) ||
        (job.company_name || "").toLowerCase().includes(q);

      const jobStatus = job.status || "Drafting";
      const matchesStatus =
        statusFilter === "All" ||
        jobStatus.toLowerCase() === statusFilter.toLowerCase() ||
        (statusFilter === "Offer" && jobStatus.toLowerCase() === "offered");

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
        case "date-asc":
          return (
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime()
          );
        case "title":
          return (a.job_title || "").localeCompare(b.job_title || "");
        case "company":
          return (a.company_name || "").localeCompare(b.company_name || "");
        default:
          return 0;
      }
    });

  const getStatusBadgeClass = (status?: string | null) => {
    const s = (status || "drafting").toLowerCase();
    if (s === "applied") return "status-badge applied";
    if (s === "interviewing") return "status-badge interviewing";
    if (s === "offer" || s === "offered") return "status-badge offer";
    if (s === "rejected") return "status-badge rejected";
    return "status-badge drafting";
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-8 md:p-10 animate-in fade-in-50 duration-200">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Page Header (Matching JobsTab.vue) */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[var(--ink)]">
              Application Vault
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-0.5">
              {!isSelectionMode
                ? "Track and manage your professional opportunities."
                : "Click items to select/deselect them."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isSelectionMode ? (
              <>
                {/* Selection Mode Button */}
                <div
                  className="relative flex items-center"
                  onMouseEnter={() => setActiveTooltip("selection-mode")}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  <button
                    type="button"
                    onClick={() => setIsSelectionMode(true)}
                    className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  {activeTooltip === "selection-mode" && (
                    <div className="absolute top-full mt-2 right-0 z-50 rounded-md bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                      Selection Mode
                    </div>
                  )}
                </div>

                {/* Delete All Button */}
                <div
                  className="relative flex items-center"
                  onMouseEnter={() => setActiveTooltip("delete-all")}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-white transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {activeTooltip === "delete-all" && (
                    <div className="absolute top-full mt-2 right-0 z-50 rounded-md bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                      Delete All
                    </div>
                  )}
                </div>

                {/* New Application Button */}
                <div
                  className="relative flex items-center"
                  onMouseEnter={() => setActiveTooltip("new-app")}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  <Link
                    href="/parse"
                    className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                  >
                    <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                  {activeTooltip === "new-app" && (
                    <div className="absolute top-full mt-2 right-0 z-50 rounded-md bg-[var(--surface-soft)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                      New Application
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Select All Button */}
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="flex h-9 px-3 items-center gap-1.5 rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)]"
                >
                  <Check className="h-4 w-4" />
                  <span>Select All</span>
                </button>

                {/* Delete Batch Button */}
                {selectedJobs.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="flex h-9 px-3 items-center gap-1.5 rounded-lg bg-[var(--warning)] text-white text-xs font-bold hover:opacity-90"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete ({selectedJobs.size})</span>
                  </button>
                )}

                {/* Exit Selection Mode Button */}
                <button
                  type="button"
                  onClick={exitSelectionMode}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:opacity-90"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </header>

        {/* Filters Bar (Matching JobsTab.vue) */}
        {!isSelectionMode && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-2.5 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-xs">
              {/* Search Box */}
              <div className="flex-1 flex items-center bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg px-3 py-2 focus-within:border-[var(--accent)] transition-colors">
                <Search className="h-4 w-4 text-[var(--muted)] shrink-0 mr-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, role, or company..."
                  className="w-full bg-transparent border-0 p-0 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none"
                />
              </div>

              {/* Sort Order */}
              <div className="flex items-center bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg px-3 py-1.5 gap-2">
                <ArrowUpDown className="h-3.5 w-3.5 text-[var(--muted)] shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent border-0 p-0 text-xs font-bold text-[var(--ink)] focus:outline-none cursor-pointer"
                >
                  <option value="date-desc">Newest First</option>
                  <option value="date-asc">Oldest First</option>
                  <option value="title">Title (A-Z)</option>
                  <option value="company">Company (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Status Tabs with Counts */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {statuses.map((s) => {
                const count =
                  s === "All"
                    ? allJobs.length
                    : allJobs.filter(
                        (j) =>
                          (j.status || "Drafting").toLowerCase() ===
                          s.toLowerCase(),
                      ).length;
                const isActive = statusFilter === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      isActive
                        ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-xs"
                        : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)] hover:border-[var(--muted)] hover:bg-[var(--surface-soft)]"
                    }`}
                  >
                    <span>{s}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-[var(--surface-soft)] text-[var(--muted)] border border-[var(--line)]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Jobs Grid (Matching JobsTab.vue) */}
        {loading ? (
          <div className="py-20 text-center text-xs text-[var(--muted)]">
            Scanning vault...
          </div>
        ) : filteredAndSortedJobs.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <FolderOpen className="h-10 w-10 text-[var(--muted)] opacity-40 mx-auto" />
            <h3 className="text-sm font-bold text-[var(--ink)]">
              No applications found
            </h3>
            <p className="text-xs text-[var(--muted)] max-w-xs mx-auto">
              Try adjusting your search or filters.
            </p>
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAndSortedJobs.map((job) => {
              const isSelected = selectedJobs.has(job.id);

              return (
                <div
                  key={job.id}
                  onClick={() => handleCardClick(job.id)}
                  className={`flex flex-col justify-between rounded-xl border bg-[var(--surface)] p-4 sm:p-5 cursor-pointer transition-all hover:border-[var(--accent)] hover:-translate-y-0.5 shadow-md ${
                    isSelected
                      ? "border-[var(--accent)] bg-[rgba(35,134,54,0.08)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--line)]"
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Card Top Row */}
                    <div className="flex items-center justify-between gap-2">
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
                        <span className={getStatusBadgeClass(job.status)}>
                          {job.status || "Drafting"}
                        </span>
                      )}

                      <span className="font-mono text-[11px] text-[var(--muted)] shrink-0">
                        {job.created_at?.split("T")[0] ||
                          job.created_at?.split(" ")[0] ||
                          "Recent"}
                      </span>
                    </div>

                    {/* Title and Company */}
                    <div className="space-y-0.5 min-w-0">
                      <h2 className="text-sm sm:text-base font-bold text-[var(--ink)] truncate">
                        {job.job_title}
                      </h2>
                      <p className="text-xs font-semibold text-[var(--accent-blue)] truncate">
                        {job.company_name}
                      </p>
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="tag-pill">
                        {job.work_model || "Remote"}
                      </span>
                      <span className="tag-pill">
                        {job.employment_type || "Full-time"}
                      </span>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs font-bold text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
                    <span>View Details</span>
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
