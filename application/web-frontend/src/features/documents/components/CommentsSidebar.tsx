"use client";

import {
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { DocumentCommentEntry } from "@/lib/api/types";
import {
  createComment,
  deleteComment,
  listComments,
  resolveComment,
} from "../api";

interface CommentsSidebarProps {
  docId: string;
  activeFileRel: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentsSidebar({
  docId,
  activeFileRel,
  isOpen,
  onClose,
}: CommentsSidebarProps) {
  const [comments, setComments] = useState<DocumentCommentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [targetLine, setTargetLine] = useState(1);
  const [selectedSnippet, setSelectedSnippet] = useState("");
  const [showAddBox, setShowAddBox] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const data = await listComments(docId, activeFileRel || undefined);
      setComments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchComments();
    }
  }, [isOpen, docId, activeFileRel]);

  if (!isOpen) return null;

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || !activeFileRel) return;
    setSubmitting(true);
    try {
      await createComment(
        docId,
        activeFileRel,
        targetLine,
        newContent.trim(),
        selectedSnippet.trim() || undefined,
      );
      setNewContent("");
      setSelectedSnippet("");
      setShowAddBox(false);
      await fetchComments();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleResolve = async (commentId: string, current: boolean) => {
    try {
      await resolveComment(docId, commentId, !current);
      await fetchComments();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(docId, commentId);
      await fetchComments();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[380px] bg-[var(--surface)] border-l border-[var(--line)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-[var(--line)] bg-[var(--bg-accent)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[var(--accent)]" />
          <h2 className="text-sm font-bold text-[var(--ink)]">
            Margin Comments & Review
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

      {/* Action Bar */}
      <div className="px-4 py-2.5 bg-[var(--surface-soft)] border-b border-[var(--line)] flex items-center justify-between">
        <span className="text-[11px] font-mono text-[var(--muted)] truncate max-w-[200px]">
          {activeFileRel || "All files"}
        </span>
        <button
          type="button"
          onClick={() => setShowAddBox(true)}
          className="flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:opacity-80"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Comment</span>
        </button>
      </div>

      {/* Add Comment Form */}
      {showAddBox && (
        <form
          onSubmit={handleAddComment}
          className="p-4 border-b border-[var(--line)] bg-[var(--surface-soft)]/60 space-y-2.5"
        >
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[var(--muted)] uppercase">
              Line:
            </label>
            <input
              type="number"
              min={1}
              value={targetLine}
              onChange={(e) => setTargetLine(Number(e.target.value))}
              className="w-16 bg-[var(--surface)] border border-[var(--line)] rounded px-2 py-0.5 text-xs text-[var(--ink)] font-mono"
            />
          </div>

          <textarea
            required
            rows={2}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Type your feedback or review comment…"
            className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-lg p-2 text-xs text-[var(--ink)] focus:outline-hidden focus:border-[var(--accent)]"
          />

          <div className="flex justify-end gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setShowAddBox(false)}
              className="px-2.5 py-1 text-[var(--muted)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !newContent.trim()}
              className="flex items-center gap-1 px-3 py-1 bg-[var(--accent)] text-white rounded font-bold hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Post</span>
            </button>
          </div>
        </form>
      )}

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-xs text-[var(--muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)] mr-2" />
            <span>Loading review comments…</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center p-8 text-xs text-[var(--muted)] border border-dashed border-[var(--line)] rounded-lg">
            No comments on this file yet. Use Add Comment to leave line-specific
            feedback for your co-authors.
          </div>
        ) : (
          <div className="space-y-2.5">
            {comments.map((c) => (
              <div
                key={c.id}
                className={`p-3 rounded-lg border transition-all ${
                  c.resolved
                    ? "bg-[var(--surface)]/50 border-[var(--line)] opacity-60"
                    : "bg-[var(--surface-soft)] border-[var(--line)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] font-bold text-[9px] flex items-center justify-center">
                      {c.user_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-[var(--ink)]">
                      {c.user_name}
                    </span>
                    <span className="tag-pill text-[9px] font-mono bg-zinc-800 text-zinc-300 border-zinc-700 px-1 py-0.2">
                      L{c.line_number}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleResolve(c.id, c.resolved)}
                      className={`p-1 rounded text-xs transition-colors ${
                        c.resolved
                          ? "text-emerald-400 hover:bg-emerald-500/10"
                          : "text-[var(--muted)] hover:text-emerald-400 hover:bg-emerald-500/10"
                      }`}
                      title={c.resolved ? "Unresolve" : "Mark as resolved"}
                    >
                      {c.resolved ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="p-1 rounded text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10"
                      title="Delete comment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {c.selected_text && (
                  <div className="mt-1.5 px-2 py-1 bg-[#0d0f14] rounded border border-[var(--line)] text-[10px] font-mono text-zinc-400 italic">
                    "{c.selected_text}"
                  </div>
                )}

                <p
                  className={`text-xs text-[var(--ink)] mt-2 leading-relaxed ${
                    c.resolved ? "line-through text-[var(--muted)]" : ""
                  }`}
                >
                  {c.content}
                </p>

                <div className="text-[10px] text-[var(--muted)] mt-1.5 font-mono">
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
