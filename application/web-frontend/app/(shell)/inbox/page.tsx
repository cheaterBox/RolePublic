"use client";

import {
  Check,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  FolderOpen,
  Key,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { deleteInbox, listInbox } from "@/features/inbox/api";
import { getExtensionConfig } from "@/features/settings/api";
import type { InboxJob } from "@/lib/api/types";

export default function InboxPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<InboxJob[]>([]);
  const [extConfig, setExtConfig] = useState<{ port: string; secret: string }>({
    port: "14207",
    secret: "",
  });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, cfg] = await Promise.all([
        listInbox().catch(() => []),
        getExtensionConfig().catch(() => ({ port: "14207", secret: "" })),
      ]);
      setJobs(list || []);
      setExtConfig(cfg);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const copySecret = async () => {
    await navigator.clipboard.writeText(extConfig.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Delete this raw job data?")) return;
    try {
      await deleteInbox(id);
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} items?`)) return;
    try {
      for (const id of selectedIds) {
        await deleteInbox(id);
      }
      await load();
      setIsSelectionMode(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConvert = (_item: InboxJob) => {
    router.push(`/parse`);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 sm:p-10 space-y-6 animate-in fade-in-50 duration-200">
      {/* Header (Matching InboxTab.vue) */}
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
            Raw Ingestion Inbox
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            Captured job postings from the browser extension waiting for
            processing.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isSelectionMode ? (
            <>
              <IconButton
                label="Selection Mode"
                tooltipPlacement="bottom"
                variant="soft"
                size="sm"
                icon={<Settings2 className="h-4 w-4" />}
                onClick={() => setIsSelectionMode(true)}
              />
              <IconButton
                label="Refresh Inbox"
                tooltipPlacement="bottom"
                variant="soft"
                size="sm"
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={load}
              />
            </>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <IconButton
                  label={`Delete Selected (${selectedIds.size})`}
                  tooltipPlacement="bottom"
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={handleDeleteSelected}
                />
              )}
              <IconButton
                label="Cancel"
                tooltipPlacement="bottom"
                variant="soft"
                size="sm"
                icon={<X className="h-4 w-4" />}
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedIds(new Set());
                }}
              />
            </>
          )}
        </div>
      </header>

      {/* Extension Pairing Info Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[var(--surface)] border border-[var(--line)] rounded-xl text-xs">
        <div className="space-y-1">
          <div className="font-bold text-[var(--ink)] flex items-center gap-2">
            <Key className="h-4 w-4 text-[var(--accent)]" />
            <span>Extension Listener: Port :{extConfig.port || "14207"}</span>
          </div>
          <p className="text-[var(--muted)]">
            Connect your browser extension to capture jobs with 1 click.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-[var(--surface-soft)] border border-[var(--line)] rounded px-2.5 py-1 font-mono text-[11px] text-[var(--ink)] truncate max-w-[200px]">
            {extConfig.secret || "rt_sec_xxxxxxxx"}
          </div>
          <button
            type="button"
            onClick={copySecret}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)]"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Ingested List */}
      {loading ? (
        <div className="py-20 text-center text-xs text-[var(--muted)]">
          Scanning inbox…
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-20 text-center space-y-3">
          <FolderOpen className="h-10 w-10 text-[var(--muted)] opacity-40 mx-auto" />
          <h3 className="text-sm font-bold text-[var(--ink)]">
            Inbox is empty
          </h3>
          <p className="text-xs text-[var(--muted)] max-w-xs mx-auto">
            Click the extension icon on any job posting to send it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((item) => {
            const isSelected = selectedIds.has(item.id);

            return (
              <div
                key={item.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-[var(--surface)] shadow-md transition-all ${
                  isSelected
                    ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                    : "border-[var(--line)]"
                }`}
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center justify-between text-xs font-mono text-[var(--muted)]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard.writeText(item.raw_description)
                      }
                      className="text-[10px] hover:text-[var(--ink)] flex items-center gap-1"
                      title="Copy Raw Description"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </button>
                  </div>

                  <p className="font-mono text-xs text-[var(--ink)] line-clamp-2 leading-relaxed">
                    {item.raw_description}
                  </p>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--accent-blue)] hover:underline truncate max-w-md font-semibold"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span className="truncate">{item.url}</span>
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <IconButton
                    label="Delete"
                    tooltipPlacement="top"
                    variant="danger"
                    size="sm"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => handleDeleteOne(item.id)}
                  />
                  <IconButton
                    label="Convert to Application"
                    tooltipPlacement="top"
                    variant="accent"
                    size="sm"
                    icon={<Cpu className="h-3.5 w-3.5" />}
                    onClick={() => handleConvert(item)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
