"use client";

import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileText,
  Globe,
  Layers,
  Loader2,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { saveJob } from "@/features/jobs/api";
import { useParse } from "@/features/jobs/hooks/useParse";
import { resolveAiCredentials } from "@/lib/ai/storage";

interface JobParserProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialRawJd?: string;
  initialUrl?: string;
}

export function JobParser({
  isOpen,
  onClose,
  onCreated,
  initialRawJd = "",
  initialUrl = "",
}: JobParserProps) {
  const [rawJd, setRawJd] = useState(initialRawJd);
  const [jobUrl, setJobUrl] = useState(initialUrl);
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-2.5-pro");
  const [apiKey, setApiKey] = useState("");
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const { result, loading, error, parse } = useParse();

  useEffect(() => {
    if (initialRawJd) setRawJd(initialRawJd);
    if (initialUrl) setJobUrl(initialUrl);
  }, [initialRawJd, initialUrl]);

  useEffect(() => {
    async function loadConfig() {
      try {
        const cfg = resolveAiCredentials();
        if (cfg?.provider) setProvider(cfg.provider);
        if (cfg?.model) setModel(cfg.model);
        if (cfg?.apiKey) {
          setHasSavedKey(true);
        } else {
          setHasSavedKey(false);
        }
      } catch (err) {
        console.error("Failed to load AI config", err);
      }
    }
    if (isOpen) {
      void loadConfig();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!rawJd.trim() && !jobUrl.trim()) return;
    if (!apiKey.trim() && !hasSavedKey) return;

    await parse({
      provider,
      model,
      api_key: apiKey.trim() || resolveAiCredentials()?.apiKey || "",
      custom_base_url: resolveAiCredentials()?.customBaseUrl || undefined,
      raw_jd: rawJd,
      job_url: jobUrl.trim() || null,
    });
  };

  const handleSaveToVault = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const details = result.details;
      const newId = `job_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      await saveJob({
        id: newId,
        company_name: details.company_name || "Unknown Company",
        job_title: details.job_title || "Untitled Role",
        work_model: details.work_model || "Remote",
        employment_type: details.employment_type || "Full-time",
        status: "saved",
        raw_jd: result.raw_description || rawJd,
        requirements: JSON.stringify(details.requirements || []),
        core_responsibilities: JSON.stringify(
          details.core_responsibilities || [],
        ),
        job_url: jobUrl.trim() || null,
        created_at: new Date().toISOString(),
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to save job:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in-50">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-border/80 bg-card shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4 bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Rig AI Structured Job Extractor
              </h3>
              <p className="text-xs text-muted-foreground">
                Extract schema, required skills, and core responsibilities
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Provider & Model Selectors */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-bold text-muted-foreground uppercase">
                AI Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
              >
                <option value="deepseek">DeepSeek</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="groq">Groq</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono font-bold text-muted-foreground uppercase">
                Model
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gemini-1.5-pro"
                className="w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono font-bold text-muted-foreground uppercase">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasSavedKey ? "Using Vault Encrypted Key" : "Paste API key..."
                }
                className="w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Job URL Input */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono font-bold text-muted-foreground uppercase flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span>Job Posting URL (Optional)</span>
            </label>
            <input
              type="text"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="https://linkedin.com/jobs/view/... or company career portal"
              className="w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Raw JD Textarea */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono font-bold text-muted-foreground uppercase flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>Raw Job Description Text</span>
            </label>
            <textarea
              value={rawJd}
              onChange={(e) => setRawJd(e.target.value)}
              rows={6}
              placeholder="Paste unstructured job description, qualifications, and requirements..."
              className="w-full rounded-xl border border-border/70 bg-background p-3 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Structured Output Result Card */}
          {result && (
            <div className="rounded-2xl border border-primary/30 bg-secondary/40 p-4 space-y-4 animate-in fade-in-50">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <div className="text-base font-extrabold text-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span>{result.details.job_title}</span>
                    <span className="text-xs text-primary font-normal">
                      @ {result.details.company_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{result.details.work_model}</span>
                    <span>•</span>
                    <span>{result.details.employment_type}</span>
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Schema Extracted</span>
                </div>
              </div>

              {/* Requirements & Responsibilities Tags */}
              <div className="space-y-3">
                {result.details.requirements &&
                  result.details.requirements.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-mono font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <Tag className="h-3 w-3 text-primary" />
                        <span>
                          Extracted Technical Requirements (
                          {result.details.requirements.length}):
                        </span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {result.details.requirements.map((req, i) => (
                          <span
                            key={i}
                            className="rounded-lg border border-border/60 bg-card px-2 py-0.5 text-[11px] text-foreground"
                          >
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {result.details.core_responsibilities &&
                  result.details.core_responsibilities.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-mono font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <Layers className="h-3 w-3 text-purple-400" />
                        <span>
                          Core Responsibilities (
                          {result.details.core_responsibilities.length}):
                        </span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {result.details.core_responsibilities.map((resp, i) => (
                          <span
                            key={i}
                            className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-2 py-0.5 text-[11px] text-purple-300"
                          >
                            {resp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-4 bg-secondary/30">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {!result ? (
              <button
                onClick={handleParse}
                disabled={
                  loading ||
                  (!rawJd.trim() && !jobUrl.trim()) ||
                  (!apiKey.trim() && !hasSavedKey)
                }
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Extracting Structured Schema…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Run AI Extraction</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleSaveToVault}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500 transition-all"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving to SQLite…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Save to Job Vault</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
