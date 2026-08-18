"use client";

import {
  Archive,
  Check,
  Cpu,
  Key,
  RotateCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  getActiveServerPort,
  getAiConfig,
  getExtensionConfig,
  saveAiConfig,
} from "@/features/settings/api";
import { apiFetch } from "@/lib/api/client";

export default function SettingsPage() {
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-1.5-pro");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Companion Extension
  const [extSecret, setExtSecret] = useState("");
  const [extPort, setExtPort] = useState("14207");
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Compiler Settings
  const [stackSizeMb, setStackSizeMb] = useState(100);

  const [_loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [aiCfg, extCfg, portRes] = await Promise.allSettled([
          getAiConfig(),
          getExtensionConfig(),
          getActiveServerPort(),
        ]);

        if (aiCfg.status === "fulfilled") {
          if (aiCfg.value.provider) setProvider(aiCfg.value.provider);
          if (aiCfg.value.model) setModel(aiCfg.value.model);
          setHasKey(aiCfg.value.has_key);
        }
        if (extCfg.status === "fulfilled") {
          setExtSecret(extCfg.value.secret);
          setExtPort(extCfg.value.port || "14207");
        }
        if (portRes.status === "fulfilled") {
          setExtPort(portRes.value.port || "14207");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAiConfig({
        provider,
        model,
        api_key: apiKey.trim() ? apiKey.trim() : undefined,
      });
      setSaveSuccess(true);
      setApiKey("");
      setHasKey(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(extSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleExportData = async () => {
    try {
      const data = await apiFetch("/data/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roletect_backup_${Date.now()}.json`;
      a.click();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-10 space-y-8 animate-in fade-in-50 duration-200">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            Configure AI providers, compilation engine, and extension
            integration.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? (
            <RotateCw className="h-4 w-4 animate-spin" />
          ) : saveSuccess ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          <span>{saveSuccess ? "Saved!" : "Save Settings"}</span>
        </button>
      </header>

      {/* SECTION 1: AI Provider */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 space-y-4 shadow-md">
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              AI Provider & Intelligence (BYOK)
            </h3>
          </div>
          <span
            className={`tag-pill ${
              hasKey ? "tag-pill-success" : "tag-pill-warning"
            }`}
          >
            {hasKey ? "Key Encrypted in Vault" : "No Key Set"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => {
                const p = e.target.value;
                setProvider(p);
                if (p === "gemini") setModel("gemini-1.5-pro");
                if (p === "openai") setModel("gpt-4o");
                if (p === "claude") setModel("claude-3-5-sonnet-20241022");
                if (p === "groq") setModel("llama-3.3-70b-versatile");
                if (p === "ollama") setModel("llama3.2");
              }}
              className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 text-xs text-[var(--ink)] focus:outline-none"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Anthropic Claude</option>
              <option value="groq">Groq Cloud</option>
              <option value="ollama">Ollama (Local Engine)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
              Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gemini-1.5-pro"
              className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
              API Key
            </label>
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-[10px] text-[var(--accent-blue)] hover:underline"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasKey
                ? "•••••••••••••••••••••••• (Encrypted in Vault)"
                : "Paste API key..."
            }
            className="w-full bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
          />
        </div>
      </div>

      {/* SECTION 2: Compiler Runtime */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 space-y-4 shadow-md">
        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-3">
          <Cpu className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
            Tectonic LaTeX Runtime
          </h3>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--ink)]">
            <span>Compiler Thread Stack Memory:</span>
            <span className="font-mono text-[var(--accent)]">
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
            <span>32 MB</span>
            <span>100 MB (Default)</span>
            <span>256 MB</span>
          </div>
        </div>
      </div>

      {/* SECTION 3: Extension Pairing */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 space-y-4 shadow-md">
        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-3">
          <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
            Browser Companion Extension
          </h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                Secret Token
              </label>
              <button
                type="button"
                onClick={copySecret}
                className="text-[10px] text-[var(--accent-blue)] hover:underline"
              >
                {copiedSecret ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 font-mono text-xs text-[var(--ink)] truncate select-all">
              {extSecret || "rt_sec_xxxxxxxx"}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
              Port
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

      {/* SECTION 4: Data Export */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
            Export Local Database Archive
          </h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Download full JSON export of all jobs, resumes, cover letters, and
            documents.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportData}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] shrink-0"
        >
          <Archive className="h-4 w-4" />
          <span>Export JSON</span>
        </button>
      </div>
    </div>
  );
}
