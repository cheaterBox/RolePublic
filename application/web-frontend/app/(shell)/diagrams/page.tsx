"use client";

import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  Hand,
  Maximize2,
  Move,
  PaintBucket,
  Palette,
  RotateCw,
  Settings2,
  Share2,
  Sparkles,
  Wand2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { IconButton } from "@/components/ui/IconButton";
import { getAiConfig } from "@/features/settings/api";
import { apiFetch } from "@/lib/api/client";
import "github-markdown-css/github-markdown.css";

const TEMPLATES: Record<string, string> = {
  architecture: `graph TD
    Client[Web & Desktop Client] -->|HTTPS / WSS| APIGateway[Axum API Gateway :8080]
    APIGateway -->|JWT / RBAC| AuthModule[Auth & Identity]
    APIGateway -->|Task Queue| Worker[Tectonic PDF Worker Pool]
    APIGateway -->|Pub/Sub| Redis[(Redis Cluster)]
    APIGateway -->|Read/Write| Postgres[(PostgreSQL 16 Multi-Tenant)]
    Worker -->|Snapshots & Exports| S3[(MinIO / AWS S3)]
    APIGateway -->|LLM Prompts| AI[Gemini 1.5 Pro / Bedrock]`,

  sequence: `sequenceDiagram
    autonumber
    actor Alice as Author (Alice)
    actor Bob as Co-Author (Bob)
    participant WS as WebSocket Hub
    participant DB as Postgres (Changes Table)

    Alice->>WS: Write Tracked Edit ("main.tex")
    WS->>DB: Compute & Record Diff (+3 lines)
    DB-->>WS: Change Logged (rev_847)
    WS-->>Bob: Broadcast WsServerMessage::FileUpdated
    Bob->>Bob: Auto-render updated LaTeX buffer`,

  er: `erDiagram
    USERS ||--o{ DOCUMENT_COLLABORATORS : has
    DOCUMENTS ||--o{ DOCUMENT_COLLABORATORS : includes
    DOCUMENTS ||--o{ DOCUMENT_REVISIONS : contains
    DOCUMENTS ||--o{ DOCUMENT_CHANGES : tracks
    DOCUMENTS ||--o{ DOCUMENT_COMMENTS : anchors

    USERS {
        string id PK
        string email UK
        string full_name
        string role
    }
    DOCUMENTS {
        string id PK
        string title
        string owner_id FK
    }
    DOCUMENT_CHANGES {
        string id PK
        string doc_id FK
        string user_name
        string diff_patch
    }`,
};

// ── Mermaid theme & attractive presets ──
type MermaidTheme = "dark" | "forest" | "neutral" | "base" | "default";
const MERMAID_THEMES: { id: MermaidTheme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "forest", label: "Forest" },
  { id: "default", label: "Light" },
  { id: "neutral", label: "Neutral" },
  { id: "base", label: "Base" },
];

const CANVAS_BACKGROUNDS: { id: string; label: string; color: string }[] = [
  { id: "dark", label: "Dark #0d1117", color: "#0d1117" },
  { id: "zinc", label: "Zinc #09090b", color: "#09090b" },
  { id: "slate", label: "Slate #1e293b", color: "#1e293b" },
  { id: "light", label: "Light #ffffff", color: "#ffffff" },
  { id: "ivory", label: "Ivory #fffbeb", color: "#fffbeb" },
  { id: "midnight", label: "Midnight #161b22", color: "#161b22" },
];

const ATTRACTIVE_PRESETS: Record<
  string,
  { label: string; vars: Record<string, string> }
> = {
  default: {
    label: "Default",
    vars: {
      primaryColor: "#238636",
      primaryTextColor: "#ffffff",
      primaryBorderColor: "#238636",
      lineColor: "#8b949e",
      secondaryColor: "#1f6feb",
      tertiaryColor: "#1d222e",
    },
  },
  ocean: {
    label: "Ocean",
    vars: {
      primaryColor: "#1f6feb",
      primaryTextColor: "#ffffff",
      primaryBorderColor: "#1f6feb",
      lineColor: "#388bfd",
      secondaryColor: "#58a6ff",
      tertiaryColor: "#0d419d",
    },
  },
  forest: {
    label: "Forest",
    vars: {
      primaryColor: "#2ea043",
      primaryTextColor: "#ffffff",
      primaryBorderColor: "#2ea043",
      lineColor: "#3fb950",
      secondaryColor: "#238636",
      tertiaryColor: "#0f5323",
    },
  },
  sunset: {
    label: "Sunset",
    vars: {
      primaryColor: "#f0883e",
      primaryTextColor: "#0d1117",
      primaryBorderColor: "#f0883e",
      lineColor: "#f85149",
      secondaryColor: "#ffab70",
      tertiaryColor: "#ff7b72",
    },
  },
  pastel: {
    label: "Pastel",
    vars: {
      primaryColor: "#8a63d2",
      primaryTextColor: "#ffffff",
      primaryBorderColor: "#8a63d2",
      lineColor: "#bc8cff",
      secondaryColor: "#a371f7",
      tertiaryColor: "#d2a8ff",
    },
  },
  neon: {
    label: "Neon",
    vars: {
      primaryColor: "#ff7b72",
      primaryTextColor: "#0d1117",
      primaryBorderColor: "#ff7b72",
      lineColor: "#ffab70",
      secondaryColor: "#f0883e",
      tertiaryColor: "#ffa198",
    },
  },
};

export default function DiagramsPage() {
  const [mode, setMode] = useState<"mermaid" | "markdown">("mermaid");
  const [code, setCode] = useState(TEMPLATES.architecture);
  const [markdownCode, setMarkdownCode] = useState(
    `# RoleTect — Visual Docs\n\n> Privacy-first vault • Tectonic LaTeX • Cloud backup\n\n## Features\n\n- **LaTeX** — CodeMirror with syntax & bracket matching\n- **Mermaid** — live architecture diagrams\n- **Markdown** — rich docs with tables & code\n\n## Quick Example\n\n\`\`\`mermaid\ngraph TD\n  Client --> API[Axum API]\n  API --> DB[(Postgres)]\n  API --> Worker[Tectonic]\n\`\`\`\n\n| Metric | Value |\n|---|---|\n| Latency | 45% ↓ |\n| RPS | 50k+ |\n`,
  );
  const [svgContent, setSvgContent] = useState<string>("");
  const [markdownHtml, setMarkdownHtml] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Mermaid appearance & pan/zoom ──
  const [mermaidTheme, setMermaidTheme] = useState<MermaidTheme>("dark");
  const [canvasBg, setCanvasBg] = useState<string>("#09090b");
  const [attractivePreset, setAttractivePreset] = useState<string>("default");
  const [isPanEnabled, setIsPanEnabled] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const panZoomRef = useRef<any>(null);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [showPaletteMenu, setShowPaletteMenu] = useState(false);

  // Mermaid live render — theme / palette / background aware
  useEffect(() => {
    if (mode !== "mermaid") return;
    let mounted = true;

    async function renderMermaid() {
      if (!code.trim()) {
        setSvgContent("");
        setRenderError(null);
        return;
      }

      setIsRendering(true);
      setRenderError(null);

      try {
        const mermaid = (await import("mermaid")).default;
        const presetVars =
          ATTRACTIVE_PRESETS[attractivePreset]?.vars ??
          ATTRACTIVE_PRESETS.default.vars;
        // Use canvas background as mermaid background for cohesive look
        const themeVars: Record<string, string> = {
          ...presetVars,
          background: canvasBg,
          mainBkg: presetVars.primaryColor,
        };
        mermaid.initialize({
          startOnLoad: false,
          theme: mermaidTheme,
          securityLevel: "loose",
          fontFamily: "Inter, Geist Sans, sans-serif",
          themeVariables: themeVars,
        });

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);

        if (mounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        if (mounted) {
          setRenderError(err.message || "Invalid Mermaid syntax");
        }
      } finally {
        if (mounted) {
          setIsRendering(false);
        }
      }
    }

    const timer = setTimeout(renderMermaid, 220);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [code, mode, mermaidTheme, canvasBg, attractivePreset]);

  // Markdown live render — only when mode === markdown
  useEffect(() => {
    if (mode !== "markdown") return;
    let mounted = true;
    const timer = setTimeout(async () => {
      try {
        const MarkdownIt = (await import("markdown-it")).default;
        const md = new MarkdownIt({
          html: false,
          linkify: true,
          typographer: true,
        });
        const raw = md.render(markdownCode);
        // sanitize if DOM available
        let html = raw;
        try {
          const DOMPurify = (await import("dompurify")).default;
          html = DOMPurify.sanitize(raw);
        } catch {}
        if (mounted) {
          setMarkdownHtml(html);
          setRenderError(null);
        }
      } catch (err: any) {
        if (mounted) setRenderError(err.message || "Markdown render error");
      }
    }, 200);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [markdownCode, mode]);

  const handleCopy = async () => {
    const text = mode === "mermaid" ? code : markdownCode;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    if (!markdownCode.trim()) return;
    const blob = new Blob([markdownCode], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Inject SVG and wire pan/zoom (dragging + wheel + controls)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!svgContent) {
      el.innerHTML = "";
      if (panZoomRef.current) {
        try {
          panZoomRef.current.destroy();
        } catch {}
        panZoomRef.current = null;
      }
      return;
    }
    el.innerHTML = svgContent;
    const svg = el.querySelector("svg") as unknown as SVGElement | null;
    if (!svg) return;
    // Full-bleed for panZoom — remove mermaid's inline size constraints so fit uses entire viewport
    svg.removeAttribute("style");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.maxWidth = "none";
    svg.style.maxHeight = "none";
    svg.style.display = "block";

    // Cleanup previous instance
    if (panZoomRef.current) {
      try {
        panZoomRef.current.destroy();
      } catch {}
      panZoomRef.current = null;
    }

    // Defer to next frame so SVG is in DOM
    const timer = setTimeout(async () => {
      try {
        const mod: any = await import("svg-pan-zoom");
        const svgPanZoomFn = mod.default ?? mod;
        const instance = (svgPanZoomFn as any)(svg, {
          zoomEnabled: true,
          controlIconsEnabled: false,
          fit: true,
          center: true,
          minZoom: 0.2,
          maxZoom: 10,
          zoomScaleSensitivity: 0.2,
          panEnabled: isPanEnabled,
          dblClickZoomEnabled: true,
          mouseWheelZoomEnabled: true,
          preventMouseEventsDefault: false,
          onZoom: (z: number) => setZoomLevel(Math.round(z * 100)),
        });
        panZoomRef.current = instance;
        // Fit after init
        try {
          instance.resize();
          instance.fit();
          instance.center();
        } catch {}
      } catch (e) {
        // Fallback: no panZoom, just static
        console.warn("svg-pan-zoom init failed", e);
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      if (panZoomRef.current) {
        try {
          panZoomRef.current.destroy();
        } catch {}
        panZoomRef.current = null;
      }
    };
  }, [svgContent, isPanEnabled, canvasBg]);

  // Keep panZoom enabled state in sync without re-rendering SVG
  useEffect(() => {
    if (panZoomRef.current) {
      try {
        if (isPanEnabled) panZoomRef.current.enablePan();
        else panZoomRef.current.disablePan();
      } catch {}
    }
  }, [isPanEnabled]);

  const handleZoomIn = () => {
    if (panZoomRef.current) {
      try {
        panZoomRef.current.zoomIn();
      } catch {}
    } else {
      setZoomLevel((z) => Math.min(400, z + 20));
    }
  };
  const handleZoomOut = () => {
    if (panZoomRef.current) {
      try {
        panZoomRef.current.zoomOut();
      } catch {}
    } else {
      setZoomLevel((z) => Math.max(20, z - 20));
    }
  };
  const handleZoomReset = () => {
    if (panZoomRef.current) {
      try {
        panZoomRef.current.resetZoom();
        panZoomRef.current.fit();
        panZoomRef.current.center();
        setZoomLevel(100);
      } catch {}
    } else {
      setZoomLevel(100);
    }
  };
  const handleZoomFit = () => {
    if (panZoomRef.current) {
      try {
        panZoomRef.current.fit();
        panZoomRef.current.center();
      } catch {}
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const cfg = await getAiConfig().catch(() => ({
        provider: "gemini",
        model: "gemini-1.5-pro",
      }));
      const isMd = mode === "markdown";
      const current = isMd ? markdownCode : code;
      const instruction = isMd
        ? `Generate or modify this Markdown document according to: ${aiPrompt}. Return only raw valid Markdown.`
        : `Generate or modify this Mermaid diagram according to: ${aiPrompt}. Return only raw valid Mermaid syntax.`;
      const res = await apiFetch<{ latex: string }>("/pdf/refine", {
        method: "POST",
        body: {
          provider: cfg.provider || "gemini",
          model: cfg.model || "gemini-1.5-pro",
          api_key: "vault_key",
          current_latex: current,
          instruction,
        },
      });
      if (res?.latex) {
        const cleaned = res.latex
          .replace(/```mermaid/g, "")
          .replace(/```markdown/g, "")
          .replace(/```/g, "")
          .trim();
        if (isMd) setMarkdownCode(cleaned);
        else setCode(cleaned);
        setAiPrompt("");
      }
    } catch (err: any) {
      console.error(err);
      alert(`AI Generation error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] animate-in fade-in-50 duration-150">
      {/* Top Header — icon-only + tooltip, mode toggle */}
      <header className="h-12 flex items-center justify-between px-3 sm:px-4 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 select-none z-20 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)] shrink-0">
            <Share2 className="h-4 w-4 text-[var(--accent)]" />
            <span className="hidden sm:inline">
              Diagrams & Visual Architecture
            </span>
            <span className="sm:hidden">Diagrams</span>
          </div>

          {/* Mode toggle — Mermaid / Markdown */}
          <div className="flex items-center bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg p-0.5 gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setMode("mermaid")}
              className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${mode === "mermaid" ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
            >
              <Workflow className="h-3 w-3" />
              Mermaid
            </button>
            <button
              type="button"
              onClick={() => setMode("markdown")}
              className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${mode === "markdown" ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
            >
              <BookOpen className="h-3 w-3" />
              Markdown
            </button>
          </div>

          {mode === "mermaid" && (
            <div className="hidden lg:flex items-center gap-1 bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setCode(TEMPLATES.architecture)}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
              >
                Architecture
              </button>
              <button
                type="button"
                onClick={() => setCode(TEMPLATES.sequence)}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
              >
                Sequence
              </button>
              <button
                type="button"
                onClick={() => setCode(TEMPLATES.er)}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
              >
                ER
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <IconButton
            label={
              copied
                ? "Copied!"
                : `Copy ${mode === "mermaid" ? "Mermaid" : "Markdown"} source`
            }
            tooltipPlacement="bottom"
            variant="soft"
            size="sm"
            icon={
              copied ? <Check className="text-[var(--accent)]" /> : <Copy />
            }
            onClick={handleCopy}
          />
          {mode === "mermaid" && svgContent && (
            <IconButton
              label="Download SVG"
              tooltipPlacement="bottom"
              variant="soft"
              size="sm"
              icon={<Download />}
              onClick={handleDownloadSvg}
            />
          )}
          {mode === "markdown" && markdownCode.trim() && (
            <IconButton
              label="Download Markdown"
              tooltipPlacement="bottom"
              variant="soft"
              size="sm"
              icon={<Download />}
              onClick={handleDownloadMarkdown}
            />
          )}
        </div>
      </header>

      {/* AI Generate Prompt Bar — icon-only generate */}
      <div className="px-3 sm:px-4 py-2 bg-[var(--surface-soft)] border-b border-[var(--line)] flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
        <input
          type="text"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder={
            mode === "mermaid"
              ? "Generate Mermaid: e.g. Add Redis cache and rate limiter..."
              : "Generate Markdown: e.g. Add API table and changelog..."
          }
          className="flex-1 min-w-0 bg-[var(--surface)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAiGenerate();
          }}
        />
        <IconButton
          label={
            isGenerating
              ? "Generating…"
              : `Generate ${mode === "mermaid" ? "Mermaid" : "Markdown"} with AI`
          }
          tooltipPlacement="bottom"
          variant="accent"
          size="sm"
          icon={
            isGenerating ? <RotateCw className="animate-spin" /> : <Wand2 />
          }
          onClick={handleAiGenerate}
          disabled={isGenerating || !aiPrompt.trim()}
          loading={isGenerating}
        />
      </div>

      {/* Error Bar */}
      {renderError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate">{renderError}</span>
        </div>
      )}

      {/* Split Studio — CodeMirror production editors */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left: Source Code Editor — Mermaid / Markdown */}
        <div className="w-full lg:w-96 xl:w-[420px] flex flex-col min-w-0 bg-[#0d1117] border-b lg:border-b-0 lg:border-r border-[var(--line)] overflow-hidden shrink-0">
          <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-mono text-[var(--muted)] select-none">
            <span className="flex items-center gap-1.5">
              {mode === "mermaid" ? (
                <Workflow className="h-3 w-3 text-[var(--accent)]" />
              ) : (
                <FileText className="h-3 w-3 text-[var(--accent)]" />
              )}
              <span>{mode === "mermaid" ? "diagram.mmd" : "document.md"}</span>
            </span>
            <span>
              {(mode === "mermaid" ? code : markdownCode).split("\n").length}{" "}
              lines
            </span>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden bg-[#0d1117]">
            {mode === "mermaid" ? (
              <CodeEditor
                key="mermaid"
                value={code}
                onChange={setCode}
                language="mermaid"
                height="100%"
                placeholder="graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[OK]
  B -->|No| D[Retry]"
              />
            ) : (
              <CodeEditor
                key="markdown"
                value={markdownCode}
                onChange={setMarkdownCode}
                language="markdown"
                height="100%"
                placeholder="# Title

Write **markdown** with lists, tables, and `code`...

```mermaid
graph TD
  A-->B
```"
              />
            )}
          </div>
        </div>

        {/* Right: Live Preview — Mermaid vector (pan/zoom) or Markdown */}
        <div className="flex-1 bg-zinc-950 flex flex-col min-w-0 overflow-hidden relative">
          <div className="h-8 flex items-center justify-between px-2 sm:px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] select-none gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">
                {mode === "mermaid" ? "Live Vector Canvas" : "Markdown Preview"}
              </span>
              {isRendering && mode === "mermaid" && (
                <span className="hidden sm:flex items-center gap-1 text-[var(--accent)] font-mono">
                  <RotateCw className="h-3 w-3 animate-spin" />
                  <span>Rendering…</span>
                </span>
              )}
              {mode === "mermaid" && (
                <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-[10px] font-mono text-[var(--muted)]">
                  {zoomLevel}%
                </span>
              )}
            </div>

            {mode === "mermaid" ? (
              <div className="flex items-center gap-1 shrink-0">
                {/* Background */}
                <div className="relative">
                  <IconButton
                    label={`Canvas Background: ${CANVAS_BACKGROUNDS.find((b) => b.color === canvasBg)?.label ?? canvasBg}`}
                    tooltipPlacement="bottom"
                    variant="soft"
                    size="sm"
                    icon={<PaintBucket />}
                    onClick={() => {
                      setShowBgMenu((v) => !v);
                      setShowPaletteMenu(false);
                      setShowThemeMenu(false);
                    }}
                  />
                  {showBgMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl p-2 z-50">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-1 pb-1">
                        Background
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {CANVAS_BACKGROUNDS.map((bg) => (
                          <button
                            key={bg.id}
                            type="button"
                            onClick={() => {
                              setCanvasBg(bg.color);
                              setShowBgMenu(false);
                            }}
                            className={`h-9 rounded-lg border flex flex-col items-center justify-center gap-0.5 ${canvasBg === bg.color ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--muted)]"}`}
                            title={bg.label}
                          >
                            <span
                              className="h-4 w-4 rounded-full border border-black/10"
                              style={{ background: bg.color }}
                            />
                            <span className="text-[8px] font-bold text-[var(--muted)]">
                              {bg.id}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 px-1">
                        <input
                          type="color"
                          value={canvasBg}
                          onChange={(e) => setCanvasBg(e.target.value)}
                          className="h-6 w-6 rounded border border-[var(--line)] p-0 bg-transparent cursor-pointer"
                          title="Custom background"
                        />
                        <span className="text-[10px] font-mono text-[var(--muted)] truncate">
                          {canvasBg}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Attractive palette */}
                <div className="relative">
                  <IconButton
                    label={`Attractive Colors: ${ATTRACTIVE_PRESETS[attractivePreset]?.label ?? attractivePreset}`}
                    tooltipPlacement="bottom"
                    variant="soft"
                    size="sm"
                    icon={<Palette />}
                    onClick={() => {
                      setShowPaletteMenu((v) => !v);
                      setShowBgMenu(false);
                      setShowThemeMenu(false);
                    }}
                  />
                  {showPaletteMenu && (
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl p-2 z-50 max-h-[min(60vh,340px)] overflow-auto">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-1 pb-1">
                        Attractive Palettes
                      </div>
                      <div className="space-y-1">
                        {Object.entries(ATTRACTIVE_PRESETS).map(([id, p]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setAttractivePreset(id);
                              setShowPaletteMenu(false);
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left border ${attractivePreset === id ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]" : "border-transparent hover:bg-[var(--surface-soft)] text-[var(--ink)]"}`}
                          >
                            <span
                              className="h-3 w-3 rounded-full shrink-0 border border-black/10"
                              style={{ background: p.vars.primaryColor }}
                            />
                            <span
                              className="h-3 w-3 rounded-full shrink-0 border border-black/10"
                              style={{ background: p.vars.lineColor }}
                            />
                            <span className="text-xs font-bold">{p.label}</span>
                            <span className="ml-auto text-[10px] font-mono text-[var(--muted)]">
                              {id}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Theme */}
                <div className="relative">
                  <IconButton
                    label={`Mermaid Theme: ${mermaidTheme}`}
                    tooltipPlacement="bottom"
                    variant="soft"
                    size="sm"
                    icon={<Settings2 />}
                    onClick={() => {
                      setShowThemeMenu((v) => !v);
                      setShowBgMenu(false);
                      setShowPaletteMenu(false);
                    }}
                  />
                  {showThemeMenu && (
                    <div className="absolute right-0 top-full mt-2 w-40 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl p-1 z-50">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] px-2 py-1">
                        Theme
                      </div>
                      {MERMAID_THEMES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setMermaidTheme(t.id);
                            setShowThemeMenu(false);
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold ${mermaidTheme === t.id ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-4 w-px bg-[var(--line)] mx-0.5 hidden sm:block" />

                {/* Pan toggle + Zoom */}
                <IconButton
                  label={
                    isPanEnabled
                      ? "Dragging Enabled — drag to pan"
                      : "Dragging Disabled"
                  }
                  tooltipPlacement="bottom"
                  variant={isPanEnabled ? "accent" : "ghost"}
                  size="sm"
                  icon={
                    isPanEnabled ? (
                      <Hand className="h-3.5 w-3.5" />
                    ) : (
                      <Move className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={() => setIsPanEnabled((v) => !v)}
                />
                <IconButton
                  label="Zoom Out"
                  tooltipPlacement="bottom"
                  variant="soft"
                  size="sm"
                  icon={<ZoomOut />}
                  onClick={handleZoomOut}
                />
                <IconButton
                  label="Zoom In"
                  tooltipPlacement="bottom"
                  variant="soft"
                  size="sm"
                  icon={<ZoomIn />}
                  onClick={handleZoomIn}
                />
                <IconButton
                  label="Reset & Fit"
                  tooltipPlacement="bottom"
                  variant="soft"
                  size="sm"
                  icon={<Maximize2 />}
                  onClick={handleZoomReset}
                />
                <button
                  type="button"
                  onClick={handleZoomFit}
                  className="hidden sm:inline-flex text-[10px] font-mono text-[var(--muted)] hover:text-[var(--ink)] px-1"
                >
                  Fit
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-[var(--muted)] hidden sm:inline">
                  Live
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            )}
          </div>

          {mode === "mermaid" ? (
            <div
              className="flex-1 overflow-hidden flex flex-col min-h-[300px] relative"
              style={{ background: canvasBg }}
              onClick={() => {
                setShowBgMenu(false);
                setShowPaletteMenu(false);
                setShowThemeMenu(false);
              }}
            >
              {/* Full-bleed vector viewport — no padding so diagram fills container, not boxed in small inner div */}
              <div
                ref={containerRef}
                className={`flex-1 w-full h-full min-h-0 overflow-hidden ${!svgContent ? "hidden" : ""}`}
                style={{
                  cursor: isPanEnabled ? "grab" : "default",
                  touchAction: isPanEnabled ? "none" : "auto",
                  background: canvasBg,
                }}
              />
              {!svgContent && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-xs text-[var(--muted)] max-w-sm mx-auto text-center pointer-events-none">
                  <Workflow className="h-10 w-10 mx-auto opacity-20 mb-3" />
                  <p className="font-semibold text-[var(--ink)]">
                    No diagram yet
                  </p>
                  <p className="mt-1">Type Mermaid code or pick a template.</p>
                  <p className="mt-1 text-[10px] opacity-60">
                    Drag to pan • Wheel to zoom • Pinch on mobile
                  </p>
                </div>
              )}
              {/* Zoom badge */}
              {svgContent && (
                <div className="absolute bottom-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--surface-soft)]/90 backdrop-blur border border-[var(--line)] text-[10px] font-mono text-[var(--muted)] shadow-lg">
                  <span>{zoomLevel}%</span>
                  <span className="opacity-30">•</span>
                  <span className="hidden sm:inline">
                    {isPanEnabled ? "drag" : "static"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-auto bg-[#0d1117] p-6 min-h-[300px]">
              {markdownHtml ? (
                <article
                  className="markdown-body max-w-none prose prose-invert prose-sm"
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--ink)",
                    fontSize: "13px",
                    lineHeight: 1.65,
                  }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with dompurify
                  dangerouslySetInnerHTML={{ __html: markdownHtml }}
                />
              ) : (
                <div className="text-center p-8 text-xs text-[var(--muted)]">
                  <BookOpen className="h-8 w-8 mx-auto opacity-30 mb-2" />
                  <p>Write markdown on the left — live preview appears here.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
