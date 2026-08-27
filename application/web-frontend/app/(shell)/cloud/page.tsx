"use client";

import {
  AlertCircle,
  CheckCircle2,
  Database,
  DownloadCloud,
  HardDrive,
  RefreshCw,
  RotateCw,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

interface BackupEntry {
  key: string;
  size: number;
  last_modified: string;
}

export default function CloudPage() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<BackupEntry[]>("/cloud/list");
      setBackups(list || []);
    } catch (err: any) {
      console.error(err);
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMsg(null);
    try {
      await apiFetch("/cloud/test", { method: "POST" });
      setStatusMsg({
        text: "S3 connection verified successfully.",
        ok: true,
      });
    } catch (err: any) {
      setStatusMsg({
        text:
          err.message ||
          "S3 Connection failed: verify S3 credentials in Settings.",
        ok: false,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setUploading(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{ key: string }>("/cloud/upload", {
        method: "POST",
      });
      setStatusMsg({
        text: `Snapshot ${res?.key || "saved"} created successfully.`,
        ok: true,
      });
      await loadBackups();
    } catch (err: any) {
      setStatusMsg({
        text: err.message || "Upload failed: check S3 credentials.",
        ok: false,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRestore = async (key: string) => {
    if (
      !confirm(
        `Restore full database from snapshot ${key}? Current local state will be overwritten.`,
      )
    )
      return;
    try {
      await apiFetch("/cloud/download", {
        method: "POST",
        body: { key },
      });
      alert("Restore completed successfully.");
      window.location.reload();
    } catch (err: any) {
      alert(`Restore failed: ${err.message || "Error restoring snapshot"}`);
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-8 md:p-10 animate-in fade-in-50 duration-200">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
              Cloud Backup
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
              Encrypted snapshot sync to AWS S3, Cloudflare R2, MinIO, Wasabi,
              or B2 bucket.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] shadow-xs transition-colors cursor-pointer"
            >
              {testing ? (
                <RotateCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 text-[var(--accent)]" />
              )}
              <span>Test Connection</span>
            </button>

            <button
              type="button"
              onClick={handleCreateSnapshot}
              disabled={uploading}
              className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm border border-[var(--accent)] transition-all active:scale-[0.98] cursor-pointer"
            >
              {uploading ? (
                <RotateCw className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              <span>Create Backup Snapshot</span>
            </button>
          </div>
        </header>

        {/* Notification Banner */}
        {statusMsg && (
          <div
            className={`p-3.5 rounded-lg border text-xs font-semibold flex items-center gap-2.5 ${
              statusMsg.ok
                ? "border-[rgba(35,134,54,0.3)] bg-[rgba(35,134,54,0.1)] text-[var(--accent)]"
                : "border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.1)] text-[var(--warning)]"
            }`}
          >
            {statusMsg.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Snapshots Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--accent)]" />
            <span>Available Cloud Snapshots ({backups.length})</span>
          </h3>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-md">
            {loading ? (
              <div className="py-16 text-center text-xs text-[var(--muted)]">
                Loading backups…
              </div>
            ) : backups.length === 0 ? (
              <div className="py-16 text-center text-xs text-[var(--muted)] space-y-2">
                <HardDrive className="h-8 w-8 mx-auto opacity-40" />
                <div className="font-bold text-[var(--ink)]">
                  No cloud backups found
                </div>
                <p className="max-w-xs mx-auto">
                  Click &ldquo;Create Backup Snapshot&rdquo; to store your first
                  backup.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--surface-soft)] font-mono text-[10px] text-[var(--muted)] uppercase">
                      <th className="py-3 px-4">Snapshot Key</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {backups.map((b) => (
                      <tr
                        key={b.key}
                        className="hover:bg-[var(--surface-soft)] transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-[var(--ink)]">
                          {b.key}
                        </td>
                        <td className="py-3 px-4 font-mono text-[var(--muted)]">
                          {(b.size / 1024).toFixed(1)} KB
                        </td>
                        <td className="py-3 px-4 text-[var(--muted)]">
                          {b.last_modified || "Recent"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRestore(b.key)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)]"
                          >
                            <DownloadCloud className="h-3.5 w-3.5" />
                            <span>Restore</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
