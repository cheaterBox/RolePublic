"use client";

import { AlertCircle, ArrowLeft, Check, Copy, Cpu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { parseJobDescription, saveJob } from "@/features/jobs/api";
import { resolveAiCredentials } from "@/lib/ai/storage";
import type { JobPayload } from "@/lib/api/types";

export default function ParsePage() {
  const router = useRouter();
  const [rawJobDescription, setRawJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const copyError = async () => {
    if (!error) return;
    try {
      await navigator.clipboard.writeText(error);
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy error:", err);
    }
  };

  const handleParse = async () => {
    if (!rawJobDescription.trim() && !jobUrl.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const creds = resolveAiCredentials();
      if (!creds?.apiKey) {
        throw new Error(
          "AI API key not configured. Please set it in Settings → AI Intelligence.",
        );
      }
      const provider = creds.provider;
      const model = creds.model;
      const customBaseUrl = creds.customBaseUrl || undefined;

      const res = await parseJobDescription({
        provider,
        model,
        api_key: creds.apiKey,
        custom_base_url: customBaseUrl,
        raw_jd: rawJobDescription,
        job_url: jobUrl.trim() || null,
      });

      const details = res.details;
      const slug = `job_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

      const payload: JobPayload = {
        id: slug,
        company_name: details.company_name || "Unknown Company",
        job_title: details.job_title || "Untitled Role",
        work_model: details.work_model || "Remote",
        employment_type: details.employment_type || "Full-time",
        status: "Drafting",
        raw_jd: res.raw_description || rawJobDescription,
        requirements: JSON.stringify(details.requirements || []),
        core_responsibilities: JSON.stringify(
          details.core_responsibilities || [],
        ),
        job_url: jobUrl.trim() || null,
        created_at: new Date().toISOString(),
      };

      await saveJob(payload);
      router.push(`/jobs/${slug}`);
    } catch (err: any) {
      console.error("Parsing failed:", err);
      setError(
        err.message ||
          err.toString() ||
          "Extraction failed. Please verify API key settings.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] animate-in fade-in-50 duration-150">
      {/* Header bar (Matching JobParserView.vue) */}
      <div className="h-9 flex items-center gap-3 px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] select-none">
        <Link
          href="/"
          className="text-[var(--muted)] hover:text-[var(--ink)] p-1 rounded transition-colors"
          title="Back to Home"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
          NEW APPLICATION
        </h2>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Input Panel */}
        <div className="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">
          {/* Manual Entry Pro-Tip Banner */}
          <div className="flex items-center gap-4 p-3.5 bg-[rgba(58,134,255,0.1)] border border-[rgba(58,134,255,0.2)] rounded-xl">
            <AlertCircle className="h-5 w-5 text-[var(--accent-blue)] shrink-0" />
            <div className="text-xs text-[var(--muted)] leading-relaxed">
              <span className="block font-extrabold text-[var(--accent-blue)] text-[10px] tracking-wider mb-0.5">
                PRO TIP: BETTER RESULTS
              </span>
              <span>
                Pasting the job description <strong>manually</strong> provides
                more accurate tailoring than URL extraction.
              </span>
            </div>
          </div>

          {/* URL Input */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              URL (OPTIONAL)
            </label>
            <input
              type="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="Link to job posting..."
              className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-md px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Raw Description Textarea */}
          <div className="flex-1 flex flex-col gap-2 min-h-[300px]">
            <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
              RAW DESCRIPTION
            </label>
            <textarea
              value={rawJobDescription}
              onChange={(e) => setRawJobDescription(e.target.value)}
              placeholder="Paste description, requirements, etc..."
              spellCheck={false}
              className="flex-1 w-full bg-[var(--surface)] border border-[var(--line)] rounded-md p-3 text-xs font-mono text-[var(--ink)] placeholder:text-[var(--muted)] resize-none focus:outline-none focus:border-[var(--accent)] leading-relaxed"
            />
          </div>
        </div>

        {/* Side Panel */}
        <div className="w-full lg:w-72 bg-[var(--bg-accent)] border-t lg:border-t-0 lg:border-l border-[var(--line)] p-5 flex flex-col gap-4 shrink-0">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-md p-3">
            <h3 className="text-[10px] font-bold text-[var(--accent-blue)] uppercase tracking-wider mb-1.5">
              INTELLIGENCE
            </h3>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              The AI will extract structured data to automate your resume
              tailoring.
            </p>
          </div>

          {/* Error Log Container */}
          {error && (
            <div className="bg-[rgba(248,81,73,0.05)] border border-[rgba(248,81,73,0.2)] rounded-md overflow-hidden flex flex-col text-xs">
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-[rgba(248,81,73,0.1)] border-b border-[rgba(248,81,73,0.1)] text-[10px] font-bold text-[var(--warning)] tracking-wider">
                <span>ERROR LOG</span>
                <button
                  type="button"
                  onClick={copyError}
                  className="p-0.5 text-[var(--warning)] hover:opacity-80"
                  title="Copy Error"
                >
                  {isCopied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <div className="p-2.5 max-h-48 overflow-y-auto font-mono text-[11px] text-[var(--warning)] whitespace-pre-wrap leading-relaxed">
                {error}
              </div>
            </div>
          )}

          {/* Run Extraction — icon-only primary action */}
          <div className="mt-auto pt-4 flex justify-center">
            <IconButton
              label={loading ? "Parsing…" : "Run Extraction"}
              tooltipPlacement="bottom"
              variant="accent"
              size="lg"
              icon={<Cpu />}
              onClick={handleParse}
              disabled={
                loading || (!rawJobDescription.trim() && !jobUrl.trim())
              }
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
