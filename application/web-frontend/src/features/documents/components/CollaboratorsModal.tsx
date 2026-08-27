"use client";

import {
  AlertCircle,
  Check,
  Copy,
  Link2,
  Loader2,
  Lock,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  CollaboratorRole,
  DocumentCollaboratorEntry,
} from "@/lib/api/types";
import {
  addCollaborator,
  listCollaborators,
  removeCollaborator,
  updateCollaboratorRole,
} from "../api";

interface CollaboratorsModalProps {
  docId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CollaboratorsModal({
  docId,
  isOpen,
  onClose,
}: CollaboratorsModalProps) {
  const [collaborators, setCollaborators] = useState<
    DocumentCollaboratorEntry[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("Editor");
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchCollaborators = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCollaborators(docId);
      setCollaborators(data);
    } catch (err: any) {
      setError(err.message || "Failed to load collaborators");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchCollaborators();
    }
  }, [isOpen, docId]);

  if (!isOpen) return null;

  const shareableUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/documents/${docId}`
      : `/documents/${docId}`;

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(shareableUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    setSuccess(null);
    try {
      await addCollaborator(docId, email.trim(), role);
      setEmail("");
      setSuccess(`Invited ${email} as ${role}`);
      await fetchCollaborators();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to add collaborator");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (
    userId: string,
    newRole: CollaboratorRole,
  ) => {
    try {
      await updateCollaboratorRole(docId, userId, newRole);
      await fetchCollaborators();
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from this document?`)) return;
    try {
      await removeCollaborator(docId, userId);
      await fetchCollaborators();
    } catch (err: any) {
      setError(err.message || "Failed to remove collaborator");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50 duration-150">
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--bg-accent)]">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-[var(--ink)]">
              Document Access & Collaboration
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

        {/* Shareable Link Bar */}
        <div className="px-5 py-3 border-b border-[var(--line)] bg-[var(--surface-soft)] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Shareable Collaboration Link</span>
            </span>
            <span className="text-[10px] font-medium text-amber-400 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              <span>Restricted Access</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareableUrl}
              className="flex-1 bg-[var(--surface)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[var(--ink)] select-all truncate focus:outline-hidden"
            />
            <button
              type="button"
              onClick={copyShareLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
            >
              {copiedLink ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copiedLink ? "Copied" : "Copy Link"}</span>
            </button>
          </div>
          <p className="text-[10px] text-[var(--muted)]">
            Only users with emails added to the member list below will be
            permitted to enter and collaborate.
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="px-5 py-2.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="px-5 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Invite Form */}
        <form
          onSubmit={handleInvite}
          className="p-5 border-b border-[var(--line)] bg-[var(--surface-soft)]/30 space-y-3"
        >
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Add Collaborator by Email
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 bg-[var(--surface)] border border-[var(--line)] rounded-lg px-3 py-2 text-xs text-[var(--ink)] focus:outline-hidden focus:border-[var(--accent)]"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CollaboratorRole)}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-lg px-3 py-2 text-xs text-[var(--ink)] focus:outline-hidden focus:border-[var(--accent)] font-medium"
            >
              <option value="Editor">Editor</option>
              <option value="Admin">Admin</option>
              <option value="Commenter">Commenter</option>
              <option value="Viewer">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={inviting || !email.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
            >
              {inviting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              <span>Add Member</span>
            </button>
          </div>
        </form>

        {/* Collaborators List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Active Members ({collaborators.length})
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-8 text-xs text-[var(--muted)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)] mr-2" />
              <span>Loading team members…</span>
            </div>
          ) : collaborators.length === 0 ? (
            <div className="text-center p-6 text-xs text-[var(--muted)] border border-dashed border-[var(--line)] rounded-lg">
              No additional collaborators added yet. Invite someone above!
            </div>
          ) : (
            <div className="space-y-2">
              {collaborators.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-soft)] border border-[var(--line)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] font-bold text-xs flex items-center justify-center shrink-0">
                      {c.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--ink)] truncate">
                        {c.full_name}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--muted)] truncate">
                        {c.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={c.role}
                      onChange={(e) =>
                        handleRoleChange(
                          c.user_id,
                          e.target.value as CollaboratorRole,
                        )
                      }
                      className="bg-[var(--surface)] border border-[var(--line)] rounded px-2 py-1 text-[11px] text-[var(--ink)] font-bold"
                    >
                      <option value="Owner">Owner</option>
                      <option value="Admin">Admin</option>
                      <option value="Editor">Editor</option>
                      <option value="Commenter">Commenter</option>
                      <option value="Viewer">Viewer</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleRemove(c.user_id, c.full_name)}
                      className="p-1.5 rounded text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove collaborator"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--line)] bg-[var(--bg-accent)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
