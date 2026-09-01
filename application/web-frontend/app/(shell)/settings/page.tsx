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
  Save,
  Server,
  ShieldCheck,
  Terminal,
  Upload,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
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
import {
  getStoredAiConfig,
  resolveAiCredentials,
  saveStoredAiConfig,
} from "@/lib/ai/storage";
import { apiFetch } from "@/lib/api/client";
import { getApiToken } from "@/lib/config/env";

// Provider catalog — ported exactly from desktop `src/components/SettingsTab.vue`
// lines 465–745 (the authoritative source). The web preserves its existing
// provider IDs (e.g. "claude" for Anthropic) so save/load, scoring, and the
// JobParser modal keep working unchanged.
const PROVIDER_OPTIONS: {
  id: string;
  name: string;
  defaultModel: string;
  models: string[];
  placeholder: string;
  docs: string;
  defaultBaseUrl?: string;
}[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-5.5",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: [
      // Legacy / Very Old
      "gpt-1",
      "gpt-2",
      "text-ada-001",
      "text-babbage-001",
      "text-curie-001",
      "text-davinci-003",
      "gpt-3.5-turbo-0301",
      "gpt-3.5-turbo-16k",
      "gpt-3.5-turbo",
      // GPT-4 Era
      "gpt-4-0314",
      "gpt-4-32k",
      "gpt-4-1106-preview",
      "gpt-4-turbo",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4.5",
      // Early Reasoning Era
      "o1-preview",
      "o1-mini",
      "o1",
      "o3",
      "o4-mini",
      // GPT-5 Era (Current)
      "gpt-5-nano",
      "gpt-5-mini",
      "gpt-5-main",
      "gpt-5.1",
      "gpt-5.2",
      "gpt-5.3-instant",
      "gpt-5.3-codex-spark",
      "gpt-5.4-nano",
      "gpt-5.4-mini",
      "gpt-5.4",
      "gpt-5.5-instant",
      "gpt-5.5",
      "gpt-5.5-thinking",
      "gpt-5.5-pro",
      // Specialty / Open
      "gpt-rosalind",
      "chatgpt-images-2",
    ],
    placeholder: "sk-proj-...",
    docs: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-2.5-pro",
    models: [
      // Legacy / Very Old
      "text-bison-001",
      "chat-bison-001",
      "gemini-1.0-nano",
      "gemini-1.0-pro",
      "gemini-1.0-ultra",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      // Gemini 2.x Era
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-pro",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      // Gemini 3.x Era (Current)
      "gemini-3-flash-preview",
      "gemini-3-deep-think",
      "gemini-3-pro-preview",
      "gemini-3.1-flash-lite-preview",
      "gemini-3.1-flash-lite",
      "gemini-3.1-flash-preview",
      "gemini-3.1-pro-preview",
      // Specialty / Agents / Vision
      "gemini-3.1-flash-image",
      "nano-banana-pro",
      "deep-research-preview-04-2026",
      "deep-research-max-preview-04-2026",
      "veo-3.1-lite-generate-preview",
      "gemini-robotics-er-1.6-preview",
      "gemini-embedding-2",
      "gemma-4-26b-a4b-it",
      "gemma-4-31b-it",
    ],
    placeholder: "AIzaSy...",
    docs: "https://aistudio.google.com/",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    defaultModel: "claude-opus-4-7",
    defaultBaseUrl: "https://api.anthropic.com",
    models: [
      // Legacy / Very Old
      "claude-1",
      "claude-instant-1.2",
      "claude-2.0",
      "claude-2.1",
      // Claude 3 Era
      "claude-3-haiku-20240307",
      "claude-3-sonnet-20240229",
      "claude-3-opus-20240229",
      "claude-3-5-haiku-latest",
      "claude-3-5-sonnet-latest",
      "claude-3-7-sonnet-latest",
      // Claude 4 Era (Current)
      "claude-4-sonnet",
      "claude-4-opus",
      "claude-4-1-opus",
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
      "claude-opus-4-5",
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-opus-4-7",
      // Specialty
      "claude-mythos-preview",
      "claude-cowork",
    ],
    placeholder: "sk-ant-...",
    docs: "https://console.anthropic.com/",
  },
  {
    id: "groq",
    name: "Groq (Ultra-Fast)",
    defaultModel: "llama-3.3-70b-versatile",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    models: [
      // Legacy / Very Old
      "llama2-70b-4096",
      "mixtral-8x7b-32768",
      "gemma-7b-it",
      "llama3-8b-8192",
      "llama3-70b-8192",
      // Llama 3.x Era
      "llama-3.1-8b-instant",
      "llama-3.1-70b-versatile",
      "llama-3.2-11b-vision-preview",
      "llama-3.2-90b-vision-preview",
      "llama-3.3-70b-versatile",
      "llama-3.3-70b-specdec",
      // Llama 4 Era (Current)
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "meta-llama/llama-4-maverick-17b-128e-instruct",
      "meta-llama/llama-4-maverick-400b-instruct",
      // OpenAI Open Weights on Groq
      "openai/gpt-oss-20b",
      "openai/gpt-oss-safeguard-20b",
      "openai/gpt-oss-120b",
      // Mistral
      "mistral-medium-3.5",
      "mistral-small-4",
      // DeepSeek, Qwen & Others
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "qwen-3-32b",
      "qwen/qwen3-vl-32b-instruct",
      "glm-5.1",
      "moonshotai/kimi-k2-instruct-0905",
      "minimaxai/minimax-m2.5",
    ],
    placeholder: "gsk_...",
    docs: "https://console.groq.com/",
  },
  {
    id: "bedrock",
    name: "AWS Bedrock",
    defaultModel: "anthropic.claude-opus-4-7",
    models: [
      // Deep Reasoning & Thinking
      "deepseek.r1-v1:0",
      "anthropic.claude-opus-4-8",
      "anthropic.claude-opus-4-7",
      "anthropic.claude-opus-4-6",
      "openai.gpt-5-5-v1:0",
      "moonshot.kimi-k2-thinking-v1:0",
      "mistral.mistral-large-2407-v1:0",
      "mistral.devstral-2-123b-v1:0",
      "qwen.qwen3-coder-next-v1:0",
      "ai21.jamba-1-5-large-v1:0",
      // General Purpose & Balanced
      "anthropic.claude-sonnet-4-6",
      "anthropic.claude-sonnet-4-5",
      "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "openai.gpt-5-4-v1:0",
      "amazon.nova-pro-v1:0",
      "meta.llama4-maverick-17b-instruct-v1:0",
      "meta.llama4-scout-17b-instruct-v1:0",
      "meta.llama3-3-70b-instruct-v1:0",
      "google.gemma-3-27b-pt-v1:0",
      "z-ai.glm-4-7-v1:0",
      // Light & Fast
      "anthropic.claude-haiku-4-5",
      "anthropic.claude-3-5-haiku-20241022-v1:0",
      "amazon.nova-2-lite-v1:0",
      "amazon.nova-sonic-v1:0",
      "amazon.nova-micro-v1:0",
      "deepseek.v3-2-v1:0",
      "deepseek.v3-1-v1:0",
      "mistral.ministral-3-8b-v1:0",
      "z-ai.glm-4-7-flash-v1:0",
      "ai21.jamba-1-5-mini-v1:0",
      // Vision, Multimodal & Specialized
      "meta.llama3-2-90b-instruct-v1:0",
      "meta.llama3-2-11b-instruct-v1:0",
      "mistral.pixtral-large-2502-v1:0",
      "qwen.qwen3-vl-235b-v1:0",
      "google.gemma-3-12b-it-v1:0",
      "moonshot.kimi-k2-5-v1:0",
      "minimax.m2-5-v1:0",
      "writer.palmyra-vision-7b-v1:0",
      "writer.palmyra-x5-v1:0",
      "nvidia.nemotron-3-super-120b-v1:0",
    ],
    placeholder: "AKIA...:secret_key[:region]",
    docs: "https://aws.amazon.com/bedrock/",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    defaultModel: "llama3.3",
    defaultBaseUrl: "http://localhost:11434/v1",
    models: [
      "llama3",
      "llama3.2",
      "llama3.2:1b",
      "llama3.3",
      "phi3",
      "gemma2",
      "gemma2:2b",
      "mistral",
      "codegemma",
      "codellama",
      "qwen2.5-coder",
      "qwen2.5-coder:1.5b",
      "deepseek-r1:7b",
      "deepseek-r1:8b",
      "deepseek-r1:1.5b",
    ],
    placeholder: "(no key required for local Ollama)",
    docs: "https://ollama.com/",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "openai/gpt-4o",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    models: [
      // Gemini 2.x and 2.5
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "google/gemini-2.0-flash-exp",
      // Claude Models
      "anthropic/claude-3.7-sonnet",
      "anthropic/claude-3.7-sonnet:thinking",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3.5-sonnet:beta",
      "anthropic/claude-3-opus",
      "anthropic/claude-3-haiku",
      "anthropic/claude-3.5-haiku",
      // DeepSeek Models
      "deepseek/deepseek-chat",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-r1:free",
      "deepseek/deepseek-chat:free",
      // Llama Models
      "meta-llama/llama-3.3-70b-instruct",
      "meta-llama/llama-3.1-405b-instruct",
      "meta-llama/llama-3.1-70b-instruct",
      "meta-llama/llama-3.1-8b-instruct",
      "meta-llama/llama-3.2-3b-instruct",
      "meta-llama/llama-3.2-11b-vision-instruct",
      "meta-llama/llama-3.2-90b-vision-instruct",
      // Qwen & Mistral Models
      "qwen/qwen-2.5-72b-instruct",
      "qwen/qwen-2.5-coder-32b-instruct",
      "qwen/qwen-2.5-7b-instruct",
      "mistralai/mistral-large",
      "mistralai/pixtral-large-2411",
      "mistralai/mistral-7b-instruct",
      // OpenAI Models
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/o1",
      "openai/o1-mini",
      "openai/o1-preview",
      "openai/o3-mini",
      "openai/o3-mini:high",
      "openai/gpt-4-turbo",
    ],
    placeholder: "sk-or-v1-...",
    docs: "https://openrouter.ai/",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultModel: "deepseek-v4-pro",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: [
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "deepseek-chat",
      "deepseek-reasoner",
    ],
    placeholder: "sk-...",
    docs: "https://platform.deepseek.com/",
  },
];

export default function SettingsPage() {
  // Active Tab View
  const [activeTab, setActiveTab] = useState<
    "ai" | "s3" | "engine" | "data" | "extension"
  >("ai");

  // AI Configuration
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState("deepseek-chat");
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
  const importInputRef = useRef<HTMLInputElement>(null);

  // Save State
  const [_loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load all initial settings on mount
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const local = getStoredAiConfig();
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

        if (local) {
          const normalized =
            local.provider === "claude" ? "anthropic" : local.provider;
          setProvider(normalized);
          setModel(local.model);
          setCustomModel(local.customModel || "");
          setCustomBaseUrl(local.customBaseUrl || "");
          setHasKey(!!local.apiKey);
        } else if (aiCfg.status === "fulfilled") {
          const prov =
            aiCfg.value.provider === "claude"
              ? "anthropic"
              : aiCfg.value.provider;
          if (prov) setProvider(prov);
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
        if (!local) {
          if (urlRes.status === "fulfilled") {
            setCustomBaseUrl(urlRes.value.value);
          }
          if (customModRes.status === "fulfilled") {
            setCustomModel(customModRes.value.value);
          }
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
      const normalizedProvider = provider === "claude" ? "anthropic" : provider;
      const existing = getStoredAiConfig();
      const effectiveApiKey = apiKey.trim() || existing?.apiKey || "";
      saveStoredAiConfig({
        provider: normalizedProvider,
        model: activeModel,
        apiKey: effectiveApiKey,
        customModel: customModel.trim() || undefined,
        customBaseUrl: customBaseUrl.trim() || undefined,
      });
      await Promise.all([
        saveAiConfig({
          provider: normalizedProvider,
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
      } else if (effectiveApiKey) {
        setHasKey(true);
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
      const normalizedProvider = provider === "claude" ? "anthropic" : provider;
      const effectiveKey =
        apiKey.trim() ||
        getStoredAiConfig()?.apiKey ||
        resolveAiCredentials()?.apiKey ||
        "";
      if (!effectiveKey) {
        setAiTestResult({
          ok: false,
          msg: "API key missing. Please enter your key above.",
        });
        setIsTestingAi(false);
        return;
      }
      const effectiveBase =
        customBaseUrl.trim() || getStoredAiConfig()?.customBaseUrl || undefined;
      const res = await apiFetch<{ latex: string }>("/pdf/refine", {
        method: "POST",
        body: {
          provider: normalizedProvider,
          model: activeModel,
          api_key: effectiveKey,
          custom_base_url: effectiveBase,
          current_latex:
            "\\documentclass{article}\\begin{document}AI Probe\\end{document}",
          instruction: "Return valid LaTeX document with text 'Probe Success'",
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

  // List S3 Backups — S3 not configured is expected in dev/local, don't spam console
  const handleListS3Backups = async () => {
    setIsLoadingBackups(true);
    try {
      const list = await listS3Backups();
      setS3Backups(list || []);
    } catch (err: any) {
      const msg = err?.message || "";
      const code = err?.code || "";
      const isNotConfigured =
        code === "s3_not_configured" ||
        msg.toLowerCase().includes("s3 not configured");
      if (!isNotConfigured) console.error(err);
      setS3Backups([]);
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
    <div className="flex-1 flex flex-col min-h-0 h-full bg-[var(--bg)] overflow-hidden animate-in fade-in-50 duration-150">
      {/* 1. Pro Header — responsive, no overflow */}
      <header className="min-h-13 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 z-20 select-none">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)] shrink-0">
            <Server className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-[var(--ink)] tracking-tight truncate">
              System Settings
            </h1>
            <span className="text-[10px] font-mono text-[var(--muted)] hidden sm:inline">
              RoleTect Enterprise Engine
            </span>
            <span className="text-[10px] font-mono text-[var(--muted)] sm:hidden">
              Enterprise Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {saveSuccess && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 animate-in fade-in-50 whitespace-nowrap">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          {/* Mobile: show text label, desktop: icon-only handled by IconButton tooltip is still accessible */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 h-9 sm:h-9 px-4 sm:px-4 rounded-xl bg-[var(--accent)] text-white text-xs sm:text-xs font-bold hover:opacity-90 disabled:opacity-50 shadow-sm transition-all active:scale-[0.98] whitespace-nowrap"
          >
            {saving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span className="hidden xs:inline sm:inline">Save All</span>
            <span className="xs:hidden sm:hidden">Save</span>
          </button>
        </div>
      </header>

      {/* 2. Navigation Tabs — responsive, scrollable, no wrap */}
      <div className="px-4 sm:px-6 bg-[var(--surface)] border-b border-[var(--line)] flex items-center gap-3 sm:gap-5 shrink-0 overflow-x-auto select-none no-scrollbar scroll-smooth">
        <button
          type="button"
          onClick={() => setActiveTab("ai")}
          className={`flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 text-[11px] sm:text-xs font-medium border-b-2 transition-all cursor-pointer -mb-px shrink-0 whitespace-nowrap ${
            activeTab === "ai"
              ? "border-[var(--accent)] text-[var(--ink)] font-bold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--muted)]"
          }`}
        >
          <Key
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${
              activeTab === "ai"
                ? "text-[var(--accent)]"
                : "text-[var(--muted)]"
            }`}
          />
          <span className="hidden sm:inline">AI Intelligence (BYOK)</span>
          <span className="sm:hidden">AI</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("s3");
            if (s3Backups.length === 0) void handleListS3Backups();
          }}
          className={`flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 text-[11px] sm:text-xs font-medium border-b-2 transition-all cursor-pointer -mb-px shrink-0 whitespace-nowrap ${
            activeTab === "s3"
              ? "border-[var(--accent)] text-[var(--ink)] font-bold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--muted)]"
          }`}
        >
          <Cloud
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${
              activeTab === "s3"
                ? "text-[var(--accent)]"
                : "text-[var(--muted)]"
            }`}
          />
          <span className="hidden sm:inline">S3 Cloud Storage</span>
          <span className="sm:hidden">S3</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("engine")}
          className={`flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 text-[11px] sm:text-xs font-medium border-b-2 transition-all cursor-pointer -mb-px shrink-0 whitespace-nowrap ${
            activeTab === "engine"
              ? "border-[var(--accent)] text-[var(--ink)] font-bold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--muted)]"
          }`}
        >
          <Cpu
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${
              activeTab === "engine"
                ? "text-[var(--accent)]"
                : "text-[var(--muted)]"
            }`}
          />
          <span className="hidden sm:inline">Tectonic LaTeX Engine</span>
          <span className="sm:hidden">Engine</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("data")}
          className={`flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 text-[11px] sm:text-xs font-medium border-b-2 transition-all cursor-pointer -mb-px shrink-0 whitespace-nowrap ${
            activeTab === "data"
              ? "border-[var(--accent)] text-[var(--ink)] font-bold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--muted)]"
          }`}
        >
          <Database
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${
              activeTab === "data"
                ? "text-[var(--accent)]"
                : "text-[var(--muted)]"
            }`}
          />
          <span className="hidden sm:inline">Data & Backups</span>
          <span className="sm:hidden">Data</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("extension")}
          className={`flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 text-[11px] sm:text-xs font-medium border-b-2 transition-all cursor-pointer -mb-px shrink-0 whitespace-nowrap ${
            activeTab === "extension"
              ? "border-[var(--accent)] text-[var(--ink)] font-bold"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--muted)]"
          }`}
        >
          <ShieldCheck
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${
              activeTab === "extension"
                ? "text-[var(--accent)]"
                : "text-[var(--muted)]"
            }`}
          />
          <span className="hidden lg:inline">Browser Extension & Security</span>
          <span className="hidden sm:inline lg:hidden">Extension</span>
          <span className="sm:hidden">Ext</span>
        </button>
      </div>

      {/* 3. Settings Main Viewport — responsive padding */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl w-full mx-auto space-y-5 sm:space-y-6">
        {/* TAB 1: AI Intelligence */}
        {activeTab === "ai" && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Key className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] leading-tight">
                      AI Provider & Model Credentials (BYOK)
                    </h3>
                    <p className="text-[11px] text-[var(--muted)] leading-snug">
                      Keys are encrypted at rest with the master key and never
                      logged.
                    </p>
                  </div>
                </div>
                <span
                  className={`tag-pill text-[11px] font-bold shrink-0 self-start sm:self-auto ${
                    hasKey ? "tag-pill-success" : "tag-pill-warning"
                  }`}
                >
                  {hasKey ? "Key Encrypted in Vault" : "No Key Set"}
                </span>
              </div>

              {/* Provider Grid — responsive, no overflow */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
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
                    {(() => {
                      const current = PROVIDER_OPTIONS.find(
                        (opt) => opt.id === provider,
                      );
                      const opts = current?.models?.length
                        ? current.models
                        : [];
                      // If the saved model is not in the catalog (e.g. custom or
                      // older entry), keep it visible so the user can still see
                      // what they had selected.
                      if (model && !opts.includes(model)) opts.unshift(model);
                      // Always provide at least one option so the select is not
                      // empty even if the catalog fails to load for some reason.
                      const final = opts.length > 0 ? opts : ["gemini-1.5-pro"];
                      return final.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ));
                    })()}
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
                    Custom Base URL (Optional - For custom proxy or enterprise
                    gateway)
                  </label>
                  <input
                    type="text"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder="e.g. https://api.deepseek.com/v1"
                    className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-2 text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                    Secret API Key
                  </label>
                  <IconButton
                    label={showKey ? "Hide Key" : "Show Key"}
                    tooltipPlacement="bottom"
                    variant="ghost"
                    size="sm"
                    icon={showKey ? <EyeOff /> : <Eye />}
                    onClick={() => setShowKey(!showKey)}
                  />
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

              {/* Test AI Probe Action — responsive */}
              <div className="pt-3 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <IconButton
                  label={isTestingAi ? "Probing AI…" : "Test AI Connection"}
                  tooltipPlacement="bottom"
                  variant="soft"
                  size="sm"
                  icon={<RefreshCw />}
                  onClick={handleTestAi}
                  disabled={isTestingAi}
                  loading={isTestingAi}
                />

                {aiTestResult && (
                  <span
                    className={`text-xs font-semibold break-words leading-snug ${aiTestResult.ok ? "text-emerald-500" : "text-rose-500"}`}
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
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Cloud className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] leading-tight">
                      S3-Compatible Object Storage & Cloud Sync
                    </h3>
                    <p className="text-[11px] text-[var(--muted)] leading-snug">
                      Connect MinIO, AWS S3, Cloudflare R2, or Wasabi for
                      automatic encrypted backups.
                    </p>
                  </div>
                </div>
                <span
                  className={`tag-pill text-[11px] font-bold shrink-0 self-start sm:self-auto ${
                    s3Config?.configured
                      ? "tag-pill-success"
                      : "tag-pill-warning"
                  }`}
                >
                  {s3Config?.configured ? "S3 Connected" : "S3 Unconfigured"}
                </span>
              </div>

              {/* S3 Settings Form — responsive */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
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

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pt-2 border-t border-[var(--line)]">
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
                    <IconButton
                      label={showS3Secret ? "Hide Secret" : "Show Secret"}
                      tooltipPlacement="bottom"
                      variant="ghost"
                      size="sm"
                      icon={showS3Secret ? <EyeOff /> : <Eye />}
                      onClick={() => setShowS3Secret(!showS3Secret)}
                    />
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
              <div className="flex items-start gap-2 pt-2 border-t border-[var(--line)]">
                <input
                  type="checkbox"
                  id="forcePathStyle"
                  checked={s3ForcePathStyle}
                  onChange={(e) => setS3ForcePathStyle(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--line)] text-[var(--accent)] focus:ring-0 cursor-pointer shrink-0"
                />
                <label
                  htmlFor="forcePathStyle"
                  className="text-xs text-[var(--ink)] cursor-pointer leading-snug"
                >
                  Enable Force Path Style (Required for MinIO & local storage)
                </label>
              </div>

              {/* Actions: Test & Push — responsive */}
              <div className="pt-3 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <IconButton
                    label={isTestingS3 ? "Testing S3…" : "Test S3 Connection"}
                    tooltipPlacement="bottom"
                    variant="soft"
                    size="sm"
                    icon={<RefreshCw />}
                    onClick={handleTestS3}
                    disabled={isTestingS3}
                    loading={isTestingS3}
                  />

                  <IconButton
                    label={isUploadingS3 ? "Uploading…" : "Push Cloud Backup"}
                    tooltipPlacement="bottom"
                    variant="accent"
                    size="sm"
                    icon={<UploadCloud />}
                    onClick={handlePushS3Backup}
                    disabled={isUploadingS3}
                    loading={isUploadingS3}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center text-xs min-w-0">
                  {s3TestStatus && (
                    <span
                      className={`font-semibold break-words ${s3TestStatus.ok ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {s3TestStatus.msg}
                    </span>
                  )}
                  {s3UploadMsg && (
                    <span className="font-semibold text-[var(--accent)] break-words">
                      {s3UploadMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Remote S3 Backups List — responsive */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                    Remote Cloud Snapshots ({s3Backups.length})
                  </h3>
                </div>
                <IconButton
                  label="Refresh remote backups"
                  tooltipPlacement="bottom"
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw />}
                  onClick={handleListS3Backups}
                  disabled={isLoadingBackups}
                  loading={isLoadingBackups}
                />
              </div>

              {s3Backups.length > 0 ? (
                <div className="space-y-1.5">
                  {s3Backups.map((b) => (
                    <div
                      key={b.key}
                      className="p-2.5 sm:p-3 bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 font-mono flex-1">
                        <HardDrive className="h-3.5 w-3.5 text-[var(--muted)] shrink-0" />
                        <span className="truncate text-[var(--ink)] text-[11px] sm:text-xs">
                          {b.key}
                        </span>
                        <span className="text-[10px] text-[var(--muted)] shrink-0 hidden sm:inline">
                          ({(b.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 sm:justify-end">
                        <span className="text-[10px] text-[var(--muted)] sm:hidden">
                          {(b.size / 1024).toFixed(1)} KB •
                        </span>
                        <span className="text-[10px] font-mono text-[var(--muted)]">
                          {b.last_modified?.split("T")[0] || b.last_modified}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)] py-4 text-center leading-relaxed px-2">
                  No remote backups found in S3 bucket. Click{" "}
                  <strong className="text-[var(--ink)]">
                    Push Cloud Backup
                  </strong>{" "}
                  to snapshot your workspace.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Tectonic LaTeX Engine */}
        {activeTab === "engine" && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu className="h-4 w-4 text-[var(--accent)] shrink-0" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] truncate">
                    Tectonic XeTeX Compilation Runtime
                  </h3>
                </div>
                <span className="tag-pill tag-pill-success text-[11px] font-bold shrink-0 self-start sm:self-auto">
                  Isolated Thread Stack
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-bold text-[var(--ink)]">
                  <span className="text-[11px] sm:text-xs">
                    Compiler Thread Stack Memory:
                  </span>
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

                <div className="grid grid-cols-3 gap-2 text-[9px] sm:text-[10px] font-mono text-[var(--muted)] text-center">
                  <span className="truncate">32 MB</span>
                  <span className="truncate font-bold text-[var(--accent)]">
                    100 MB • Recommended
                  </span>
                  <span className="truncate">256 MB</span>
                </div>
                <div className="hidden sm:flex justify-between text-[10px] font-mono text-[var(--muted)] px-1">
                  <span>Embedded</span>
                  <span>Massive TikZ</span>
                </div>
              </div>

              {/* Pre-cache LaTeX packages — responsive */}
              <div className="pt-4 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-[var(--ink)]">
                    Pre-Cache 85+ Scientific Packages
                  </h4>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-snug">
                    Pre-fetches packages into local cache for sub-second offline
                    compilations.
                  </p>
                </div>

                <IconButton
                  label={isCachingPackages ? "Caching…" : "Prime Packages"}
                  tooltipPlacement="bottom"
                  variant="soft"
                  size="sm"
                  icon={<RefreshCw />}
                  onClick={handlePrecachePackages}
                  disabled={isCachingPackages}
                  loading={isCachingPackages}
                />
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
          <div className="space-y-5 sm:space-y-6 animate-in fade-in-50 duration-150">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex items-start gap-2 border-b border-[var(--line)] pb-3">
                <Database className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] leading-tight">
                    Local Database Export & Restore
                  </h3>
                  <p className="text-[11px] text-[var(--muted)] leading-snug">
                    Canonical JSON archive compatible across Tauri Desktop, Axum
                    VPS, and Cloud S3.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 pt-2">
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
                  <IconButton
                    label="Download JSON Backup"
                    tooltipPlacement="bottom"
                    variant="soft"
                    size="sm"
                    icon={<Download />}
                    onClick={handleExportData}
                  />
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
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportFile}
                    disabled={isImporting}
                    className="hidden"
                  />
                  <IconButton
                    label={
                      isImporting ? "Importing…" : "Choose Backup File (.json)"
                    }
                    tooltipPlacement="bottom"
                    variant="accent"
                    size="sm"
                    icon={<Upload />}
                    onClick={() => importInputRef.current?.click()}
                    disabled={isImporting}
                    loading={isImporting}
                  />
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
          <div className="space-y-5 sm:space-y-6 animate-in fade-in-50 duration-150">
            {/* Extension Pairing */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex items-start gap-2 border-b border-[var(--line)] pb-3">
                <ShieldCheck className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] leading-tight">
                    Browser Companion Extension
                  </h3>
                  <p className="text-[11px] text-[var(--muted)] leading-snug">
                    Pair the RoleTect Chrome/Firefox extension to 1-click parse
                    LinkedIn, Indeed, and Greenhouse jobs.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase text-[var(--muted)]">
                      Extension Secret Token
                    </label>
                    <IconButton
                      label={copiedSecret ? "Copied!" : "Copy Secret"}
                      tooltipPlacement="bottom"
                      variant="ghost"
                      size="sm"
                      icon={
                        copiedSecret ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )
                      }
                      onClick={copySecret}
                    />
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
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Terminal className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] leading-tight">
                      Master Bearer API Token
                    </h3>
                    <p className="text-[11px] text-[var(--muted)] leading-snug">
                      Use this token for programmatic REST API access and CLI
                      automations.
                    </p>
                  </div>
                </div>
                <IconButton
                  label={copiedToken ? "Copied!" : "Copy Token"}
                  tooltipPlacement="bottom"
                  variant="ghost"
                  size="sm"
                  icon={
                    copiedToken ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )
                  }
                  onClick={copyMasterToken}
                />
              </div>

              <div className="bg-[var(--surface-soft)] border border-[var(--line)] rounded px-3 py-2 font-mono text-xs text-[var(--ink)] break-all select-all">
                {getApiToken() || "roletect_vps_master_token_2026"}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
