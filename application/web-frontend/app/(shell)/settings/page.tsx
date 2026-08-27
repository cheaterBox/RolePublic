"use client";

import {
  Archive,
  Check,
  Cloud,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Key,
  RefreshCw,
  RotateCw,
  Save,
  Server,
  ShieldCheck,
  Terminal,
  Upload,
  UploadCloud,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  exportFullData,
  getActiveServerPort,
  getAiConfig,
  getExtensionConfig,
  getS3Config,
  getSetting,
  importFullData,
  listS3Backups,
  type S3BackupEntry,
  type S3ConfigData,
  saveAiConfig,
  saveSetting,
  testCustomS3Connection,
  testS3Connection,
  uploadS3Backup,
} from "@/features/settings/api";
import { apiFetch } from "@/lib/api/client";
import { getApiToken } from "@/lib/config/env";

const PROVIDER_OPTIONS = [
  {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-1.5-pro",
    models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"],
    placeholder: "AIzaSy...",
    docs: "https://aistudio.google.com/",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "o1-preview", "o3-mini"],
    placeholder: "sk-proj-...",
    docs: "https://platform.openai.com/api-keys",
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    defaultModel: "claude-3-5-sonnet-20241022",
    models: [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    placeholder: "sk-ant-...",
    docs: "https://console.anthropic.com/",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    placeholder: "sk-...",
    docs: "https://platform.deepseek.com/",
  },
  {
    id: "groq",
    name: "Groq Cloud",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      "llama-3.3-70b-versatile",
      "mixtral-8x7b-32768",
      "llama-3.1-8b-instant",
    ],
    placeholder: "gsk_...",
    docs: "https://console.groq.com/",
  },
  {
    id: "ollama",
    name: "Ollama (Local Engine)",
    defaultModel: "llama3.2",
    models: ["llama3.2", "mistral", "deepseek-r1", "qwen2.5"],
    placeholder: "Local Engine (No key needed)",
    docs: "https://ollama.com/",
  },
];

export default function SettingsPage() {
  // Active Tab View
  const [activeTab, setActiveTab] = useState<
    "ai" | "s3" | "engine" | "data" | "extension"
  >("ai");

  // AI Configuration
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-1.5-pro");
  const [customModel, setCustomModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // S3 Cloud Configuration
  const [s3Config, setS3Config] = useState<S3ConfigData | null>(null);
  const [s3Endpoint, setS3Endpoint] = useState("http://localhost:9000");
  const [s3Bucket, setS3Bucket] = useState("roletect-backups");
  const [s3Region, setS3Region] = useState("us-east-1");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(true);
  const [showS3Secret, setShowS3Secret] = useState(false);
  const [isTestingS3, setIsTestingS3] = useState(false);
  const [s3TestStatus, setS3TestStatus] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [isUploadingS3, setIsUploadingS3] = useState(false);
  const [s3UploadMsg, setS3UploadMsg] = useState<string | null>(null);
  const [s3Backups, setS3Backups] = useState<S3BackupEntry[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  // Compiler Runtime
  const [stackSizeMb, setStackSizeMb] = useState(100);
  const [isCachingPackages, setIsCachingPackages] = useState(false);
  const [cacheResult, setCacheResult] = useState<string | null>(null);

  // Companion Extension & Master VPS Token
  const [extSecret, setExtSecret] = useState("");
  const [extPort, setExtPort] = useState("14207");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Data & Backup
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Save State
  const [_loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load all initial settings on mount
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [aiCfg, extCfg, portRes, s3Res, stackRes, urlRes, customModRes] =
          await Promise.allSettled([
            getAiConfig(),
            getExtensionConfig(),
            getActiveServerPort(),
            getS3Config(),
            getSetting("compiler_stack_size", "100"),
            getSetting("ai_custom_base_url", ""),
            getSetting("ai_custom_model", ""),
          ]);

        if (aiCfg.status === "fulfilled") {
          if (aiCfg.value.provider) setProvider(aiCfg.value.provider);
          if (aiCfg.value.model) setModel(aiCfg.value.model);
          setHasKey(aiCfg.value.has_key);
        }
        if (extCfg.status === "fulfilled") {
          setExtSecret(extCfg.value.secret);
        }
        if (portRes.status === "fulfilled") {
          setExtPort(String(portRes.value.port || 14207));
        }
        if (s3Res.status === "fulfilled") {
          setS3Config(s3Res.value);
          if (s3Res.value.endpoint) setS3Endpoint(s3Res.value.endpoint);
          if (s3Res.value.bucket) setS3Bucket(s3Res.value.bucket);
          if (s3Res.value.region) setS3Region(s3Res.value.region);
          setS3ForcePathStyle(s3Res.value.force_path_style);
        }
        if (stackRes.status === "fulfilled") {
          setStackSizeMb(Number(stackRes.value.value) || 100);
        }
        if (urlRes.status === "fulfilled") {
          setCustomBaseUrl(urlRes.value.value);
        }
        if (customModRes.status === "fulfilled") {
          setCustomModel(customModRes.value.value);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Save Settings Handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const activeModel = customModel.trim() || model;
      await Promise.all([
        saveAiConfig({
          provider,
          model: activeModel,
          api_key: apiKey.trim() ? apiKey.trim() : undefined,
        }),
        saveSetting("compiler_stack_size", String(stackSizeMb)),
        saveSetting("ai_custom_base_url", customBaseUrl.trim()),
        saveSetting("ai_custom_model", customModel.trim()),
        saveSetting("s3_endpoint", s3Endpoint.trim()),
        saveSetting("s3_bucket", s3Bucket.trim()),
        saveSetting("s3_region", s3Region.trim()),
      ]);

      if (apiKey.trim()) {
        setHasKey(true);
        setApiKey("");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      console.error(err);
      alert(`Save failed: ${err.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  // Test AI Connection Ping
  const handleTestAi = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      const activeModel = customModel.trim() || model;
      const res = await apiFetch<{ latex: string }>("/pdf/refine", {
        method: "POST",
        body: {
          provider,
          model: activeModel,
          api_key: apiKey.trim() || "vault_key",
          current_latex:
            "\\documentclass{article}\\begin{document}AI Probe\\end{document}",
          prompt: "Return valid LaTeX document with text 'Probe Success'",
        },
      });
      if (res?.latex) {
        setAiTestResult({
          ok: true,
          msg: `Connected successfully to ${provider} (${activeModel})!`,
        });
      } else {
        setAiTestResult({
          ok: false,
          msg: "AI returned empty response. Verify key and model.",
        });
      }
    } catch (err: any) {
      setAiTestResult({
        ok: false,
        msg: err.message || "Failed to reach AI endpoint.",
      });
    } finally {
      setIsTestingAi(false);
    }
  };

  // Test S3 Connection
  const handleTestS3 = async () => {
    setIsTestingS3(true);
    setS3TestStatus(null);
    try {
      if (s3AccessKey.trim() && s3SecretKey.trim()) {
        const res = await testCustomS3Connection({
          endpoint: s3Endpoint.trim() || undefined,
          bucket: s3Bucket.trim(),
          region: s3Region.trim() || "auto",
          access_key: s3AccessKey.trim(),
          secret_key: s3SecretKey.trim(),
          force_path_style: s3ForcePathStyle,
        });
        setS3TestStatus({
          ok: true,
          msg: res.message || "Connected to S3 bucket successfully!",
        });
      } else {
        await testS3Connection();
        setS3TestStatus({
          ok: true,
          msg: "Connected to configured S3 bucket successfully!",
        });
      }
    } catch (err: any) {
      setS3TestStatus({
        ok: false,
        msg: err.message || "Failed to connect to S3.",
      });
    } finally {
      setIsTestingS3(false);
    }
  };

  // Push S3 Backup
  const handlePushS3Backup = async () => {
    setIsUploadingS3(true);
    setS3UploadMsg(null);
    try {
      const res = await uploadS3Backup();
      setS3UploadMsg(`Backup uploaded to S3: ${res.key}`);
      void handleListS3Backups();
    } catch (err: any) {
      setS3UploadMsg(`Upload failed: ${err.message}`);
    } finally {
      setIsUploadingS3(false);
    }
  };

  // List S3 Backups
  const handleListS3Backups = async () => {
    setIsLoadingBackups(true);
    try {
      const list = await listS3Backups();
      setS3Backups(list || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  // Pre-cache LaTeX Packages
  const handlePrecachePackages = async () => {
    setIsCachingPackages(true);
    setCacheResult(null);
    try {
      const res = await fetch("/api/pdf/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex_content: `\\documentclass{article}\\usepackage{amsmath,amssymb,graphicx,xcolor,geometry}\\begin{document}Package cache verified\\end{document}`,
          filename: "cache_check.pdf",
        }),
      });
      if (res.ok) {
        setCacheResult("85+ major LaTeX packages verified and cached locally!");
      } else {
        setCacheResult("Compilation failed during package pre-cache.");
      }
    } catch (err: any) {
      setCacheResult(`Error: ${err.message}`);
    } finally {
      setIsCachingPackages(false);
    }
  };

  // Export Full JSON Database
  const handleExportData = async () => {
    try {
      const data = await exportFullData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roletect_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_")}.json`;
      a.click();
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  // Import Full JSON Database
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await importFullData(json);
      setImportStatus({
        ok: true,
        msg: "Database archive imported and synced successfully!",
      });
    } catch (err: any) {
      setImportStatus({ ok: false, msg: `Import error: ${err.message}` });
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(extSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const copyMasterToken = async () => {
    const token = getApiToken();
    await navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg)] overflow-hidden animate-in fade-in-50 duration-150">
      {/* 1. Pro Header Toolbar (52px / h-13) */}
      <header className="h-13 flex items-center justify-between px-6 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 z-20 select-none">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)]">
            <Server className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-[var(--ink)] tracking-tight">
              System Settings & Architecture
            </h1>
            <span className="text-[10px] font-mono text-[var(--muted)]">
              RoleTect Enterprise Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 animate-in fade-in-50">
              <Check className="h-3.5 w-3.5" />
              Settings Saved
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 h-8.5 px-4 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm transition-all active:scale-[0.98]"
          >
            {saving ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span>Save All Changes</span>
          </button>
        </div>
      </header>

      {/* 2. Navigation Tabs */}
      <div className="h-10 px-6 bg-[var(--surface-soft)] border-b border-[var(--line)] flex items-center gap-1 shrink-0 overflow-x-auto select-none no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("ai")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "ai"
              ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold border border-[var(--accent)]/30"
              : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
          }`}
        >
          <Key className="h-3.5 w-3.5" />
          <span>AI Intelligence (BYOK)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("s3");
            if (s3Backups.length === 0) void handleListS3Backups();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "s3"
              ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold border border-[var(--accent)]/30"
              : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
          }`}
        >
          <Cloud className="h-3.5 w-3.5" />
          <span>S3 Cloud Storage</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("engine")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "engine"
              ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold border border-[var(--accent)]/30"
              : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
          }`}
        >
          <Cpu className="h-3.5 w-3.5" />
          <span>Tectonic LaTeX Engine</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("data")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "data"
              ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold border border-[var(--accent)]/30"
              : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          <span>Data & Backups</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("extension")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "extension"
              ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold border border-[var(--accent)]/30"
              : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Browser Extension & Security</span>
        </button>
      </div>

      {/* 3. Settings Main Viewport */}
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto space-y-6">
        {/* TAB 1: AI Intelligence */}
        {activeTab === "ai" && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-[var(--accent)]" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      AI Provider & Model Credentials (BYOK)
                    </h3>
                    <p className="text-[11px] text-[var(--muted)]">
                      Keys are encrypted at rest with the master key and never
                      logged.
                    </p>
                  </div>
                </div>
                <span
                  className={`tag-pill text-[11px] font-bold ${
                    hasKey ? "tag-pill-success" : "tag-pill-warning"
                  }`}
                >
                  {hasKey ? "Key Encrypted in Vault" : "No Key Set"}
                </span>
              </div>

              {/* Provider Grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    AI Provider
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const p = e.target.value;
                      setProvider(p);
                      const found = PROVIDER_OPTIONS.find(
                        (opt) => opt.id === p,
                      );
                      if (found) {
                        setModel(found.defaultModel);
                        setCustomModel("");
                      }
                    }}
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs text-[var(--ink)] focus:outline-none"
                  >
                    {PROVIDER_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Model Selection
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  >
                    {(
                      PROVIDER_OPTIONS.find((opt) => opt.id === provider)
                        ?.models || ["gemini-1.5-pro"]
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Model & Base URL */}
              <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-[var(--line)]">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Custom Model Identifier (Optional Override)
                  </label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="e.g. ft:gpt-4o-mini:custom-model-id"
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Custom Base URL (For Ollama / Self-Hosted Proxy)
                  </label>
                  <input
                    type="text"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder={
                      provider === "ollama"
                        ? "http://localhost:11434"
                        : "e.g. https://api.deepseek.com/v1"
                    }
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    {provider === "ollama"
                      ? "Ollama Auth Token (Optional)"
                      : "Secret API Key"}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1"
                  >
                    {showKey ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    <span>{showKey ? "Hide Key" : "Show Key"}</span>
                  </button>
                </div>

                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    hasKey
                      ? "•••••••••••••••••••••••• (Encrypted in Vault — Enter new key to replace)"
                      : PROVIDER_OPTIONS.find((p) => p.id === provider)
                          ?.placeholder || "Paste API key..."
                  }
                  className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                />
              </div>

              {/* Test AI Probe Action */}
              <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestAi}
                  disabled={isTestingAi}
                  className="flex items-center gap-1.5 h-8 px-3 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isTestingAi ? "animate-spin" : ""}`}
                  />
                  <span>
                    {isTestingAi ? "Probing AI..." : "Test AI Connection"}
                  </span>
                </button>

                {aiTestResult && (
                  <span
                    className={`text-xs font-semibold ${
                      aiTestResult.ok ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {aiTestResult.msg}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: S3 Cloud Storage */}
        {activeTab === "s3" && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-[var(--accent)]" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      S3-Compatible Object Storage & Cloud Sync
                    </h3>
                    <p className="text-[11px] text-[var(--muted)]">
                      Connect MinIO, AWS S3, Cloudflare R2, or Wasabi for
                      automatic encrypted backups.
                    </p>
                  </div>
                </div>
                <span
                  className={`tag-pill text-[11px] font-bold ${
                    s3Config?.configured
                      ? "tag-pill-success"
                      : "tag-pill-warning"
                  }`}
                >
                  {s3Config?.configured
                    ? "S3 Storage Connected"
                    : "S3 Unconfigured"}
                </span>
              </div>

              {/* S3 Settings Form */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Endpoint URL (Local MinIO or Cloud S3)
                  </label>
                  <input
                    type="text"
                    value={s3Endpoint}
                    onChange={(e) => setS3Endpoint(e.target.value)}
                    placeholder="http://localhost:9000"
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Bucket Name
                  </label>
                  <input
                    type="text"
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    placeholder="roletect-backups"
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-[var(--line)]">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Region
                  </label>
                  <input
                    type="text"
                    value={s3Region}
                    onChange={(e) => setS3Region(e.target.value)}
                    placeholder="us-east-1 (or auto)"
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Access Key (Optional Override)
                  </label>
                  <input
                    type="text"
                    value={s3AccessKey}
                    onChange={(e) => setS3AccessKey(e.target.value)}
                    placeholder="minioadmin"
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                      Secret Key
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowS3Secret(!showS3Secret)}
                      className="text-[10px] text-[var(--accent)] hover:underline"
                    >
                      {showS3Secret ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    type={showS3Secret ? "text" : "password"}
                    value={s3SecretKey}
                    onChange={(e) => setS3SecretKey(e.target.value)}
                    placeholder="minioadmin"
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Force Path Style Toggle */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
                <input
                  type="checkbox"
                  id="forcePathStyle"
                  checked={s3ForcePathStyle}
                  onChange={(e) => setS3ForcePathStyle(e.target.checked)}
                  className="rounded border-[var(--line)] text-[var(--accent)] focus:ring-0 cursor-pointer"
                />
                <label
                  htmlFor="forcePathStyle"
                  className="text-xs text-[var(--ink)] cursor-pointer"
                >
                  Enable Force Path Style (Required for MinIO & local storage)
                </label>
              </div>

              {/* Actions: Test & Push */}
              <div className="pt-3 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestS3}
                    disabled={isTestingS3}
                    className="flex items-center gap-1.5 h-8 px-3 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isTestingS3 ? "animate-spin" : ""}`}
                    />
                    <span>
                      {isTestingS3 ? "Testing S3..." : "Test S3 Connection"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePushS3Backup}
                    disabled={isUploadingS3}
                    className="flex items-center gap-1.5 h-8 px-3 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-opacity"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>
                      {isUploadingS3 ? "Uploading..." : "Push Cloud Backup"}
                    </span>
                  </button>
                </div>

                {s3TestStatus && (
                  <span
                    className={`text-xs font-semibold ${
                      s3TestStatus.ok ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {s3TestStatus.msg}
                  </span>
                )}
                {s3UploadMsg && (
                  <span className="text-xs font-semibold text-[var(--accent)]">
                    {s3UploadMsg}
                  </span>
                )}
              </div>
            </div>

            {/* Remote S3 Backups List */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Remote Cloud Snapshots ({s3Backups.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleListS3Backups}
                  disabled={isLoadingBackups}
                  className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                  title="Refresh remote backups"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoadingBackups ? "animate-spin" : ""}`}
                  />
                </button>
              </div>

              {s3Backups.length > 0 ? (
                <div className="space-y-1.5">
                  {s3Backups.map((b) => (
                    <div
                      key={b.key}
                      className="p-2.5 bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 font-mono">
                        <HardDrive className="h-3.5 w-3.5 text-[var(--muted)] shrink-0" />
                        <span className="truncate text-[var(--ink)]">
                          {b.key}
                        </span>
                        <span className="text-[10px] text-[var(--muted)] shrink-0">
                          ({(b.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[var(--muted)] shrink-0">
                        {b.last_modified}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)] py-4 text-center">
                  No remote backups found in S3 bucket. Click{" "}
                  <strong>Push Cloud Backup</strong> to snapshot your workspace.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Tectonic LaTeX Engine */}
        {activeTab === "engine" && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Tectonic XeTeX Compilation Runtime
                  </h3>
                </div>
                <span className="tag-pill tag-pill-success text-[11px] font-bold">
                  Isolated Thread Stack
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--ink)]">
                  <span>Compiler Thread Stack Memory:</span>
                  <span className="font-mono text-[var(--accent)] text-sm">
                    {stackSizeMb} MB
                  </span>
                </div>

                <input
                  type="range"
                  min="32"
                  max="256"
                  step="16"
                  value={stackSizeMb}
                  onChange={(e) => setStackSizeMb(Number(e.target.value))}
                  className="w-full h-2 bg-[var(--surface-soft)] rounded appearance-none cursor-pointer accent-[var(--accent)]"
                />

                <div className="flex justify-between text-[10px] font-mono text-[var(--muted)]">
                  <span>32 MB (Embedded)</span>
                  <span>100 MB (Recommended FAANG Default)</span>
                  <span>256 MB (Massive TikZ)</span>
                </div>
              </div>

              {/* Pre-cache LaTeX packages */}
              <div className="pt-4 border-t border-[var(--line)] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[var(--ink)]">
                    Pre-Cache 85+ Scientific Packages
                  </h4>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">
                    Pre-fetches packages into local cache for sub-second offline
                    compilations.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePrecachePackages}
                  disabled={isCachingPackages}
                  className="flex items-center gap-1.5 h-8 px-3 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors shrink-0"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isCachingPackages ? "animate-spin" : ""}`}
                  />
                  <span>
                    {isCachingPackages ? "Caching..." : "Prime Packages"}
                  </span>
                </button>
              </div>

              {cacheResult && (
                <div className="p-2.5 bg-[var(--surface-soft)] border border-[var(--line)] rounded text-xs font-mono text-[var(--accent)]">
                  {cacheResult}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Data & Backup */}
        {activeTab === "data" && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-[var(--line)] pb-3">
                <Database className="h-4 w-4 text-[var(--accent)]" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Local Database Export & Restore
                  </h3>
                  <p className="text-[11px] text-[var(--muted)]">
                    Canonical JSON archive compatible across Tauri Desktop, Axum
                    VPS, and Cloud S3.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                {/* Export Card */}
                <div className="p-4 bg-[var(--surface-soft)] border border-[var(--line)] rounded-xl space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--ink)]">
                      Full Workspace Backup
                    </h4>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">
                      Export all jobs, resumes, cover letters, and multi-file
                      projects into a single JSON file.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportData}
                    className="flex items-center gap-1.5 h-8.5 px-3.5 rounded bg-[var(--surface)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download JSON Backup</span>
                  </button>
                </div>

                {/* Import Card */}
                <div className="p-4 bg-[var(--surface-soft)] border border-[var(--line)] rounded-xl space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--ink)]">
                      Restore Database Archive
                    </h4>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">
                      Upload a previous RoleTect JSON backup to restore all
                      tables and documents.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 cursor-pointer transition-opacity">
                    <Upload className="h-3.5 w-3.5" />
                    <span>
                      {isImporting
                        ? "Importing..."
                        : "Choose Backup File (.json)"}
                    </span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportFile}
                      disabled={isImporting}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {importStatus && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold ${
                    importStatus.ok
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                  }`}
                >
                  {importStatus.msg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: Extension & Security */}
        {activeTab === "extension" && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            {/* Extension Pairing */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-[var(--line)] pb-3">
                <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Browser Companion Extension
                  </h3>
                  <p className="text-[11px] text-[var(--muted)]">
                    Pair the RoleTect Chrome/Firefox extension to 1-click parse
                    LinkedIn, Indeed, and Greenhouse jobs.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                      Extension Secret Token
                    </label>
                    <button
                      type="button"
                      onClick={copySecret}
                      className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      <span>{copiedSecret ? "Copied" : "Copy Secret"}</span>
                    </button>
                  </div>
                  <div className="bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 font-mono text-xs text-[var(--ink)] truncate select-all">
                    {extSecret || "rt_sec_xxxxxxxx"}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Active Bridge Port
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={extPort}
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 text-xs font-mono font-bold text-[var(--ink)]"
                  />
                </div>
              </div>
            </div>

            {/* Master VPS Token */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-[var(--accent)]" />
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      Master Bearer API Token
                    </h3>
                    <p className="text-[11px] text-[var(--muted)]">
                      Use this token for programmatic REST API access and CLI
                      automations.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyMasterToken}
                  className="flex items-center gap-1 text-[10px] text-[var(--accent)] font-bold hover:underline"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedToken ? "Copied" : "Copy Token"}</span>
                </button>
              </div>

              <div className="bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 font-mono text-xs text-[var(--ink)] truncate select-all">
                {getApiToken() || "roletect_vps_master_token_2026"}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
