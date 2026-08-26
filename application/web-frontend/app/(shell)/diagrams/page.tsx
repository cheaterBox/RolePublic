"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  RotateCw,
  Share2,
  Sparkles,
  Wand2,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAiConfig } from "@/features/settings/api";
import { apiFetch } from "@/lib/api/client";

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

export default function DiagramsPage() {
  const [code, setCode] = useState(TEMPLATES.architecture);
  const [svgContent, setSvgContent] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          fontFamily: "Inter, sans-serif",
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

    const timer = setTimeout(renderMermaid, 250);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
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

  useEffect(() => {
    if (containerRef.current) {
      if (svgContent) {
        containerRef.current.innerHTML = svgContent;
      } else {
        containerRef.current.innerHTML = "";
      }
    }
  }, [svgContent]);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const cfg = await getAiConfig().catch(() => ({
        provider: "gemini",
        model: "gemini-1.5-pro",
      }));
      const res = await apiFetch<{ latex: string }>("/pdf/refine", {
        method: "POST",
        body: {
          provider: cfg.provider || "gemini",
          model: cfg.model || "gemini-1.5-pro",
          api_key: "vault_key",
          current_latex: code,
          instruction: `Generate or modify this Mermaid diagram according to: ${aiPrompt}. Return only raw valid Mermaid syntax.`,
        },
      });
      if (res?.latex) {
        setCode(
          res.latex
            .replace(/```mermaid/g, "")
            .replace(/```/g, "")
            .trim(),
        );
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
      {/* Top Header */}
      <header className="h-12 flex items-center justify-between px-4 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 select-none z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ink)]">
            <Share2 className="h-4 w-4 text-[var(--accent)]" />
            <span>Diagrams & Visual Architecture</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 bg-[var(--surface-soft)] border border-[var(--line)] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setCode(TEMPLATES.architecture)}
              className="px-2 py-0.5 rounded text-[10px] font-bold text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Architecture
            </button>
            <button
              type="button"
              onClick={() => setCode(TEMPLATES.sequence)}
              className="px-2 py-0.5 rounded text-[10px] font-bold text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Sequence
            </button>
            <button
              type="button"
              onClick={() => setCode(TEMPLATES.er)}
              className="px-2 py-0.5 rounded text-[10px] font-bold text-[var(--muted)] hover:text-[var(--ink)]"
            >
              ER Diagram
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 h-8 px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
            title="Copy Source"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {copied ? "Copied" : "Copy"}
            </span>
          </button>

          {svgContent && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="flex items-center gap-1 h-8 px-2.5 rounded bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
              title="Download SVG"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">SVG</span>
            </button>
          )}
        </div>
      </header>

      {/* AI Generate Prompt Bar */}
      <div className="px-4 py-2 bg-[var(--surface-soft)] border-b border-[var(--line)] flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
        <input
          type="text"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="Generate with AI: e.g. Add Redis cache cluster and rate limiter node..."
          className="flex-1 bg-[var(--surface)] border border-[var(--line)] rounded-lg px-2.5 py-1 text-xs text-[var(--ink)] focus:outline-hidden"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAiGenerate();
          }}
        />
        <button
          type="button"
          disabled={isGenerating || !aiPrompt.trim()}
          onClick={handleAiGenerate}
          className="flex items-center gap-1 px-3 py-1 bg-[var(--accent)] text-white text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {isGenerating ? (
            <RotateCw className="h-3 w-3 animate-spin" />
          ) : (
            <Wand2 className="h-3 w-3" />
          )}
          <span>Generate</span>
        </button>
      </div>

      {/* Error Bar */}
      {renderError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate">{renderError}</span>
        </div>
      )}

      {/* Split Studio */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left: Mermaid Source Code Editor */}
        <div className="w-full lg:w-96 xl:w-[420px] flex flex-col min-w-0 bg-[#0d0f14] border-b lg:border-b-0 lg:border-r border-[var(--line)] overflow-hidden shrink-0">
          <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-mono text-[var(--muted)] select-none">
            <span>diagram.mmd</span>
            <span>{code.split("\n").length} lines</span>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full bg-[#0d0f14] p-4 font-mono text-xs text-[#e6edf3] border-0 resize-none focus:outline-hidden leading-relaxed select-text overflow-y-auto"
          />
        </div>

        {/* Right: Live Rendered SVG Diagram Canvas */}
        <div className="flex-1 bg-zinc-950 flex flex-col min-w-0 overflow-hidden relative">
          <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] select-none">
            <span>Live Vector Canvas</span>
            {isRendering && (
              <span className="flex items-center gap-1 text-[var(--accent)] font-mono">
                <RotateCw className="h-3 w-3 animate-spin" />
                <span>Rendering…</span>
              </span>
            )}
          </div>

          <div className="flex-1 p-6 overflow-auto flex items-center justify-center min-h-[300px]">
            <div
              ref={containerRef}
              className={`w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:h-auto shadow-2xl ${
                !svgContent ? "hidden" : ""
              }`}
            />
            {!svgContent && (
              <div className="text-center p-8 text-xs text-[var(--muted)]">
                <Workflow className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p>
                  Type Mermaid code or choose a template to preview diagram.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
