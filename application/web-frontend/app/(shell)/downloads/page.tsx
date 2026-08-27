"use client";

import { Archive, FileCode, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { apiFetch } from "@/lib/api/client";
import type { DownloadRecord } from "@/lib/api/types";

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDownloads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<DownloadRecord[]>("/downloads");
      setDownloads(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDownloads();
  }, [loadDownloads]);

  const handleExportFullArchive = async () => {
    try {
      const data = await apiFetch("/data/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roletect_full_backup_${Date.now()}.json`;
      a.click();
    } catch (err) {
      console.error(err);
      alert("Export failed.");
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-8 md:p-10 animate-in fade-in-50 duration-200">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
              Downloads
            </h1>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
              Historical log of compiled PDFs, tailored resumes, and raw
              database backup archives.
            </p>
          </div>

          <IconButton
            label="Export JSON Archive"
            tooltipPlacement="bottom"
            variant="accent"
            size="sm"
            icon={<Archive className="h-4 w-4" />}
            onClick={handleExportFullArchive}
          />
        </header>

        {/* Downloads Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
            Generated Artifacts History ({downloads.length})
          </h3>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-md">
            {loading ? (
              <div className="py-16 text-center text-xs text-[var(--muted)]">
                Loading export logs…
              </div>
            ) : downloads.length === 0 ? (
              <div className="py-16 text-center text-xs text-[var(--muted)] space-y-2">
                <FileCode className="h-8 w-8 mx-auto opacity-40" />
                <div className="font-bold text-[var(--ink)]">
                  No downloads recorded yet
                </div>
                <p className="max-w-xs mx-auto">
                  Compiled PDFs and exported templates will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--surface-soft)] font-mono text-[10px] text-[var(--muted)] uppercase">
                      <th className="py-3 px-4">Filename</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Generated At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {downloads.map((d) => (
                      <tr
                        key={d.id}
                        className="hover:bg-[var(--surface-soft)] transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-[var(--ink)] flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[var(--accent-blue)]" />
                          <span>{d.filename}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="tag-pill font-mono">
                            {d.download_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[var(--muted)]">
                          {new Date(d.created_at).toLocaleString()}
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
