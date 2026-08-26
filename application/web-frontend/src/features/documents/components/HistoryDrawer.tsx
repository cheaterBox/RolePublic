"use client";

import {
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DocumentChangeEntry,
  DocumentRevisionEntry,
} from "@/lib/api/types";
import {
  createRevision,
  listHistory,
  listRevisions,
  restoreRevision,
} from "../api";

interface HistoryDrawerProps {
  docId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestoreComplete: () => void;
}

export function HistoryDrawer({
  docId,
  isOpen,
  onClose,
  onRestoreComplete,
}: HistoryDrawerProps) {
  const [tab, setTab] = useState<"changes" | "snapshots">("changes");
  const [changes, setChanges] = useState<DocumentChangeEntry[]>([]);
  const [revisions, setRevisions] = useState<DocumentRevisionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedChangeId, setExpandedChangeId] = useState<string | null>(null);

  // New Checkpoint
  const [showNewCheckpoint, setShowNewCheckpoint] = useState(false);
  const [checkpointTitle, setCheckpointTitle] = useState("");
  const [creatingCheckpoint, setCreatingCheckpoint] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (tab === "changes") {
        const data = await listHistory(docId, 100);
        setChanges(data);
      } else {
        const data = await listRevisions(docId);
        setRevisions(data);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchData();
    }
  }, [isOpen, docId, tab]);

  if (!isOpen) return null;

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkpointTitle.trim()) return;
    setCreatingCheckpoint(true);
    try {
      await createRevision(docId, checkpointTitle.trim());
      setCheckpointTitle("");
      setShowNewCheckpoint(false);
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingCheckpoint(false);
    }
  };

  const handleRestore = async (revId: string, title: string) => {
    if (
      !confirm(
        `Restore document to checkpoint "${title}"? Current files will be replaced with this snapshot.`,
      )
    )
      return;
    setRestoringId(revId);
    try {
      await restoreRevision(docId, revId);
      onRestoreComplete();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-[var(--surface)] border-l border-[var(--line)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-[var(--line)] bg-[var(--bg-accent)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-[var(--accent)]" />
          <h2 className="text-sm font-bold text-[var(--ink)]">
            Version History & Audit
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--line)] bg-[var(--surface-soft)]">
        <button
          type="button"
          onClick={() => setTab("changes")}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
            tab === "changes"
              ? "text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--surface)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          Granular Edits & Attribution
        </button>
        <button
          type="button"
          onClick={() => setTab("snapshots")}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
            tab === "snapshots"
              ? "text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--surface)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          Checkpoints & Snapshots
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === "changes" ? (
          <>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] px-1">
              <span>Change Trail ({changes.length})</span>
              <span className="text-[10px] font-mono lowercase">
                who edited what
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12 text-xs text-[var(--muted)]">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)] mr-2" />
                <span>Loading edit history…</span>
              </div>
            ) : changes.length === 0 ? (
              <div className="text-center p-8 text-xs text-[var(--muted)] border border-dashed border-[var(--line)] rounded-lg">
                No recorded changes yet. Edits made in the workspace will appear
                here with exact diffs and author attribution.
              </div>
            ) : (
              <div className="space-y-2">
                {changes.map((ch) => {
                  const isExpanded = expandedChangeId === ch.id;

                  return (
                    <div
                      key={ch.id}
                      className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] overflow-hidden transition-all"
                    >
                      <div
                        onClick={() =>
                          setExpandedChangeId(isExpanded ? null : ch.id)
                        }
                        className="p-3 flex items-start justify-between cursor-pointer hover:bg-[var(--surface)] transition-colors"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {ch.user_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-[var(--ink)]">
                                {ch.user_name}
                              </span>
                              <span className="tag-pill text-[9px] font-mono bg-blue-500/10 text-blue-400 border-blue-500/20 px-1 py-0.2">
                                {ch.change_type}
                              </span>
                              <span className="text-[10px] font-mono text-[var(--muted)]">
                                {ch.rel_path}
                              </span>
                            </div>
                            {ch.summary && (
                              <p className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
                                {ch.summary}
                              </p>
                            )}
                            <div className="text-[10px] text-[var(--muted)] mt-1 font-mono">
                              {new Date(ch.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="text-[var(--muted)] p-1 shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {/* Expandable Diff Patch */}
                      {isExpanded && (
                        <div className="p-3 border-t border-[var(--line)] bg-[#0d0f14] font-mono text-[10px] leading-tight overflow-x-auto">
                          {ch.diff_patch.split("\n").map((line, idx) => {
                            const isAdd =
                              line.startsWith("+") && !line.startsWith("+++");
                            const isDel =
                              line.startsWith("-") && !line.startsWith("---");

                            return (
                              <div
                                key={idx}
                                className={`whitespace-pre px-1 py-0.5 rounded-xs ${
                                  isAdd
                                    ? "bg-emerald-950/60 text-emerald-300 font-semibold"
                                    : isDel
                                      ? "bg-rose-950/60 text-rose-300 font-semibold"
                                      : "text-zinc-400"
                                }`}
                              >
                                {line}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Checkpoints ({revisions.length})
              </span>
              <button
                type="button"
                onClick={() => setShowNewCheckpoint(true)}
                className="flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:opacity-80"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Checkpoint</span>
              </button>
            </div>

            {showNewCheckpoint && (
              <form
                onSubmit={handleCreateCheckpoint}
                className="p-3 bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg space-y-2"
              >
                <input
                  type="text"
                  required
                  value={checkpointTitle}
                  onChange={(e) => setCheckpointTitle(e.target.value)}
                  placeholder="e.g., Camera Ready Submission v1.0"
                  className="w-full bg-[var(--surface)] border border-[var(--line)] rounded px-2.5 py-1.5 text-xs text-[var(--ink)] focus:outline-hidden focus:border-[var(--accent)]"
                />
                <div className="flex justify-end gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowNewCheckpoint(false)}
                    className="px-2.5 py-1 text-[var(--muted)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingCheckpoint || !checkpointTitle.trim()}
                    className="px-3 py-1 bg-[var(--accent)] text-white rounded font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    {creatingCheckpoint ? "Saving…" : "Save Checkpoint"}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="flex items-center justify-center p-12 text-xs text-[var(--muted)]">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)] mr-2" />
                <span>Loading checkpoints…</span>
              </div>
            ) : revisions.length === 0 ? (
              <div className="text-center p-8 text-xs text-[var(--muted)] border border-dashed border-[var(--line)] rounded-lg">
                No checkpoints created yet. Click Create Checkpoint to freeze a
                labeled version of the entire document tree.
              </div>
            ) : (
              <div className="space-y-2">
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="tag-pill text-[10px] font-mono bg-purple-500/15 text-purple-400 border-purple-500/20 font-bold px-1.5 py-0.5">
                          v{rev.version_number}
                        </span>
                        <h4 className="text-xs font-bold text-[var(--ink)] truncate">
                          {rev.title}
                        </h4>
                      </div>
                      <div className="text-[10px] text-[var(--muted)] mt-1 font-mono">
                        {rev.created_by_name || "Author"} •{" "}
                        {new Date(rev.created_at).toLocaleString()}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={restoringId === rev.id}
                      onClick={() => handleRestore(rev.id, rev.title)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--surface)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shrink-0"
                    >
                      {restoringId === rev.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      <span>Restore</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
