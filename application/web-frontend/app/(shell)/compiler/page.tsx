"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileCode,
  FileText,
  Hammer,
  Layers,
  Maximize2,
  Minimize2,
  PanelLeft,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Terminal,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAiConfig } from "@/features/settings/api";
import { apiFetch } from "@/lib/api/client";
import type { CompilerState } from "@/lib/api/types";
import { buildApiUrl, getApiToken } from "@/lib/config/env";

interface TemplatePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  content: string;
}

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "faang_modern",
    name: "FAANG Modern Systems",
    category: "Software & Engineering",
    description:
      "Single-page ultra-high ATS match resume with bold metrics and clean typography.",
    content: `\\documentclass[10.5pt,a4paper]{article}
\\usepackage[margin=0.65in]{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem}
\\usepackage{titlesec}
\\usepackage{xcolor}

\\hypersetup{colorlinks=true, linkcolor=blue, urlcolor=teal}
\\titleformat{\\section}{\\large\\bfseries\\uppercase}{}{0em}{}[\\titlerule]
\\titlespacing*{\\section}{0pt}{8pt}{4pt}

\\begin{document}
\\pagestyle{empty}

\\begin{center}
  {\\Huge \\textbf{ALEX MORGAN}}\\\\
  \\vspace{3pt}
  San Francisco, CA $\\cdot$ \\href{mailto:alex.morgan@example.com}{alex.morgan@example.com} $\\cdot$ (555) 019-2834\\\\
  \\href{https://github.com/alexmorgan}{github.com/alexmorgan} $\\cdot$ \\href{https://linkedin.com/in/alexmorgan}{linkedin.com/in/alexmorgan}
\\end{center}

\\vspace{-6pt}
\\section{Executive Summary}
Staff Systems Engineer with 8+ years designing fault-tolerant, high-throughput distributed backends in Rust, TypeScript, and Go. Proven track record scaling async pipelines to 50,000+ RPS with sub-10ms p99 latency.

\\section{Technical Core}
\\textbf{Languages:} Rust, Go, TypeScript, C++, Python, SQL, LaTeX\\\\
\\textbf{Distributed Systems:} Tokio, Axum, PostgreSQL, Redis, Kafka, Docker, Kubernetes, AWS S3, Linux Internals

\\section{Professional Experience}
\\textbf{Senior Systems Engineer} \\hfill \\textit{Acme Cloud Infrastructure $\\cdot$ 2022 -- Present}
\\begin{itemize}[noitemsep,topsep=2pt,leftmargin=1.5em]
  \\item Architected zero-copy async data ingestion pipeline in Rust, processing 50,000+ RPS across distributed nodes.
  \\item Reduced end-to-end event latency by 45\\% using Tokio lock-free channels and custom memory ring buffers.
  \\item Authored automated failover and leader-election routines with Raft consensus, achieving 99.999\\% uptime.
\\end{itemize}

\\vspace{2pt}
\\textbf{Distributed Systems Engineer} \\hfill \\textit{HyperScale Data Corp $\\cdot$ 2019 -- 2022}
\\begin{itemize}[noitemsep,topsep=2pt,leftmargin=1.5em]
  \\item Implemented multi-region Redis caching cluster with write-behind persistence, reducing DB load by 60\\%.
  \\item Built real-time WebSocket collaborative document sync utilizing Conflict-Free Replicated Data Types (CRDTs).
  \\item Maintained automated CI/CD pipeline executing clippy, sanitizers, and integration tests across 12 microservices.
\\end{itemize}

\\section{Key Projects}
\\textbf{RoleTect Cloud Engine} $|$ \\textit{Rust, Axum, SQLx, Redis, Next.js} \\hfill \\href{https://github.com/example/roletect}{github.com/example/roletect}
\\begin{itemize}[noitemsep,topsep=2pt,leftmargin=1.5em]
  \\item Engineered low-latency resume tailoring engine running embedded Tectonic XeTeX compilation in dedicated thread stacks.
\\end{itemize}

\\section{Education}
\\textbf{B.S. in Computer Science} $|$ \\textit{University of California, Berkeley} \\hfill \\textit{2015 -- 2019}
\\end{document}`,
  },
  {
    id: "academic_cv",
    name: "Academic CV & Research",
    category: "Academic & Research",
    description:
      "Multi-page formal curriculum vitae format with research grants and publications.",
    content: `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem}
\\usepackage{titlesec}

\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]
\\titlespacing*{\\section}{0pt}{10pt}{5pt}

\\begin{document}
\\pagestyle{empty}

\\begin{center}
  {\\LARGE \\textbf{Dr. Elena Vance, Ph.D.}}\\\\
  \\vspace{2pt}
  Department of Computer Science $\\cdot$ Stanford University\\\\
  \\href{mailto:elena.vance@stanford.edu}{elena.vance@stanford.edu} $\\cdot$ \\href{https://scholar.google.com}{scholar.google.com/elena}
\\end{center}

\\section*{Research Interests}
Distributed Consensus Protocols, Memory-Safe Systems Programming, Formal Verification, and Cryptographic Verifiable Computing.

\\section*{Education}
\\textbf{Ph.D. in Computer Science}, Stanford University \\hfill \\textit{2018 -- 2023}\\\\
\\textit{Dissertation: High-Throughput Asynchronous State Machine Replication in Safe Rust}

\\vspace{3pt}
\\textbf{B.S. in Mathematics \\& Computer Science}, MIT \\hfill \\textit{2014 -- 2018}\\\\
\\textit{Summa Cum Laude, GPA: 3.98/4.00}

\\section*{Selected Publications}
\\begin{itemize}[noitemsep,topsep=2pt,leftmargin=1.5em]
  \\item \\textbf{E. Vance}, M. Stone. \\textit{"Zero-Overhead Memory Isolation in Embedded Runtimes."} SOSP 2024.
  \\item \\textbf{E. Vance}, K. Patel. \\textit{"Optimistic State Transitions in CRDT-based Collaboration."} OSDI 2022.
\\end{itemize}

\\section*{Teaching & Mentorship}
\\textbf{Lecturer: CS 240 -- Advanced Distributed Systems} \\hfill \\textit{Fall 2023, Fall 2024}\\\\
Led lectures, designed lab assignments in Rust, and advised 6 graduate research students.
\\end{document}`,
  },
  {
    id: "initial_cacher",
    name: "Tectonic Package Cacher (85+ Packages)",
    category: "Diagnostics & Setup",
    description:
      "Pre-fetches and caches all major mathematical, scientific, and layout TeX packages.",
    content: `\\documentclass[12pt, a4paper]{article}

% Core Engine & Typography
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{setspace}

% Mathematics & Theorems
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{amsfonts}
\\usepackage{amsthm}
\\usepackage{mathtools}
\\usepackage{bm}

% Graphics & Tables
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}

\\begin{document}
\\section*{Tectonic Engine Initial Cacher}
This document verifies that your local Tectonic XeTeX engine and package bundle are fully loaded and operational.

\\subsection*{Cached Categories}
\\begin{itemize}
  \\item \\textbf{Mathematics:} amsmath, amssymb, mathtools, bm, amsthm.
  \\item \\textbf{Typography & Layout:} geometry, microtype, setspace, enumitem.
  \\item \\textbf{Tables & Visuals:} booktabs, tabularx, xcolor, graphicx, hyperref.
\\end{itemize}

\\vspace{1cm}
\\begin{center}
  \\textbf{Engine Status: Operational.} Your workspace is primed for fast compilations!
\\end{center}
\\end{document}`,
  },
];

export default function CompilerPage() {
  const [latex, setLatex] = useState(TEMPLATE_PRESETS[0].content);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [showRefineBar, setShowRefineBar] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [compilationError, setCompilationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const sidebarWidth = 250;
  const _previewWidth = 520;
  const [zoomLevel, setZoomLevel] = useState(100);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [searchTemplate, setSearchTemplate] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState("faang_modern");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);

  // Load saved state on mount
  useEffect(() => {
    void (async () => {
      try {
        const state = await apiFetch<CompilerState>("/compiler/state");
        if (state?.latex_content?.trim()) {
          setLatex(state.latex_content);
        }
      } catch {
        // Use default preset
      }
    })();
  }, []);

  // Update cursor position on keyup / click
  const updateCursorPosition = () => {
    if (!textareaRef.current) return;
    const text = textareaRef.current.value;
    const selStart = textareaRef.current.selectionStart;
    const lines = text.slice(0, selStart).split("\n");
    const currentLine = lines.length;
    const currentCol = lines[lines.length - 1].length + 1;
    setCursorPos({ line: currentLine, col: currentCol });
  };

  // Extract document outline from LaTeX (\section, \subsection)
  const outline = useMemo(() => {
    const lines = latex.split("\n");
    const items: { line: number; title: string; level: number }[] = [];
    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      const secMatch = trimmed.match(/^\\section\*?\{([^}]+)\}/);
      if (secMatch) {
        items.push({ line: idx + 1, title: secMatch[1], level: 1 });
        return;
      }
      const subMatch = trimmed.match(/^\\subsection\*?\{([^}]+)\}/);
      if (subMatch) {
        items.push({ line: idx + 1, title: subMatch[1], level: 2 });
      }
    });
    return items;
  }, [latex]);

  const jumpToLine = (lineNumber: number) => {
    if (!textareaRef.current) return;
    const lines = latex.split("\n");
    let charIndex = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      charIndex += lines[i].length + 1;
    }
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(
      charIndex,
      charIndex + (lines[lineNumber - 1]?.length || 0),
    );
    updateCursorPosition();
  };

  // Compile LaTeX handler
  const handleCompile = async () => {
    if (!latex.trim()) return;
    setIsCompiling(true);
    setCompilationError(null);

    try {
      // Save state to API
      void apiFetch("/compiler/state", {
        method: "POST",
        body: { latex_content: latex },
      });

      const token = getApiToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(buildApiUrl("/pdf/compile"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          latex_content: latex,
          filename: "roletect_compiler_output.pdf",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || err.error || "LaTeX compilation failed");
      }

      const blob = await res.blob();
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch (err: any) {
      setCompilationError(
        err.message || "Compilation failed. Review error diagnostics.",
      );
    } finally {
      setIsCompiling(false);
    }
  };

  // AI Fix Handler
  const handleAiFix = async () => {
    if (!compilationError) return;
    setIsFixing(true);
    try {
      const cfg = await getAiConfig().catch(() => ({
        provider: "gemini",
        model: "gemini-1.5-pro",
      }));
      const res = await apiFetch<{ latex: string }>("/pdf/fix", {
        method: "POST",
        body: {
          provider: cfg.provider || "gemini",
          model: cfg.model || "gemini-1.5-pro",
          api_key: "vault_key",
          broken_latex: latex,
          error_logs: compilationError,
        },
      });
      if (res?.latex) {
        setLatex(res.latex);
        setCompilationError(null);
        setTimeout(() => void handleCompile(), 100);
      }
    } catch (err: any) {
      alert(`AI Fix error: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  // AI Refine Handler
  const handleAiRefine = async () => {
    if (!refinePrompt.trim()) return;
    setIsRefining(true);
    try {
      const cfg = await getAiConfig().catch(() => ({
        provider: "gemini",
        model: "gemini-1.5-pro",
      }));
      const res = await apiFetch<{ refined_latex?: string; latex?: string }>(
        "/pdf/refine",
        {
          method: "POST",
          body: {
            provider: cfg.provider || "gemini",
            model: cfg.model || "gemini-1.5-pro",
            api_key: "vault_key",
            current_latex: latex,
            prompt: refinePrompt,
          },
        },
      );
      const newLatex = res.refined_latex || res.latex;
      if (newLatex) {
        setLatex(newLatex);
        setRefinePrompt("");
        setShowRefineBar(false);
        setTimeout(() => void handleCompile(), 100);
      }
    } catch (err: any) {
      alert(`AI Refine error: ${err.message}`);
    } finally {
      setIsRefining(false);
    }
  };

  const handleCopySource = async () => {
    await navigator.clipboard.writeText(latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyPreset = (preset: TemplatePreset) => {
    if (latex.trim() && latex !== preset.content) {
      if (
        !confirm(
          `Switch to "${preset.name}"? Unsaved changes will be replaced.`,
        )
      ) {
        return;
      }
    }
    setLatex(preset.content);
    setActiveTemplateId(preset.id);
    setCompilationError(null);
    setTimeout(() => void handleCompile(), 100);
  };

  const filteredPresets = useMemo(() => {
    if (!searchTemplate.trim()) return TEMPLATE_PRESETS;
    const q = searchTemplate.toLowerCase();
    return TEMPLATE_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [searchTemplate]);

  return (
    <div
      className={`flex flex-col h-full bg-[var(--bg)] select-none ${
        isFullscreen ? "fixed inset-0 z-50" : ""
      }`}
    >
      {/* 1. Pro Command Bar (52px / h-13) */}
      <header className="h-13 flex items-center justify-between px-3 sm:px-4 bg-[var(--bg-accent)] border-b border-[var(--line)] shrink-0 z-20 gap-2">
        {/* Left branding & stats */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
            title={isSidebarOpen ? "Collapse Sidebar" : "Open Sidebar"}
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)] shrink-0">
              <Terminal className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--ink)] tracking-tight truncate">
                  Tectonic Studio
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  XeTeX Engine
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center / Mobile View Switcher */}
        <div className="flex md:hidden items-center bg-[var(--surface)] p-1 rounded-xl border border-[var(--line)] shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setMobileTab("editor")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
              mobileTab === "editor"
                ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-xs"
                : "bg-transparent text-[var(--muted)] border-transparent hover:text-[var(--ink)]"
            }`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
              mobileTab === "preview"
                ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-xs"
                : "bg-transparent text-[var(--muted)] border-transparent hover:text-[var(--ink)]"
            }`}
          >
            PDF
          </button>
        </div>

        {/* Right Tools & Compilation */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* AI Refine Toggle */}
          <button
            type="button"
            onClick={() => setShowRefineBar(!showRefineBar)}
            className={`flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showRefineBar
                ? "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                : "bg-[var(--surface-soft)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--muted)] shadow-2xs"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">AI Refine</span>
          </button>

          {/* Copy Source */}
          <button
            type="button"
            onClick={handleCopySource}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-medium text-[var(--ink)] hover:border-[var(--muted)] transition-colors shadow-2xs cursor-pointer"
            title="Copy LaTeX source"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="hidden md:inline">
              {copied ? "Copied" : "Copy"}
            </span>
          </button>

          {/* Primary Compile Action */}
          <button
            type="button"
            onClick={handleCompile}
            disabled={isCompiling}
            className="flex items-center gap-1.5 sm:gap-2 h-8.5 px-3.5 sm:px-4 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 border border-[var(--accent)] shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            title="Compile to PDF (Ctrl+Enter)"
          >
            {isCompiling ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Hammer className="h-3.5 w-3.5" />
            )}
            <span>Compile</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.2 rounded bg-black/25 text-[10px] font-mono">
              Ctrl+Enter
            </kbd>
          </button>

          {/* Download PDF */}
          {pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              download="roletect_compiler_output.pdf"
              className="flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm"
              title="Download compiled PDF"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden md:inline">PDF</span>
            </a>
          )}

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Studio"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {/* 2. AI Refinement Bar (Expandable) */}
      {showRefineBar && (
        <div className="px-4 py-2.5 bg-[var(--surface-soft)] border-b border-[var(--line)] flex items-center gap-2 z-10 animate-in slide-in-from-top-2 duration-150">
          <Wand2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
          <input
            type="text"
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAiRefine();
            }}
            placeholder="Describe surgical edit (e.g. 'Add a section on Distributed Raft Consensus in Rust', 'Tighten margins to 0.5in')..."
            className="flex-1 bg-[var(--bg)] border border-[var(--line)] focus:border-[var(--accent)] rounded px-3 py-1.5 text-xs text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAiRefine}
            disabled={isRefining || !refinePrompt.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 shrink-0 transition-opacity"
          >
            {isRefining ? (
              <RotateCw className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            <span>Apply AI Edit</span>
          </button>
        </div>
      )}

      {/* 3. Diagnostic Error Banner */}
      {compilationError && (
        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/30 flex items-start justify-between gap-3 text-xs text-rose-600 dark:text-rose-400 z-10 animate-in slide-in-from-top-1">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-bold">XeTeX Compilation Diagnostic:</span>
              <p className="font-mono text-[11px] mt-0.5 line-clamp-2 select-text opacity-90">
                {compilationError}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAiFix}
            disabled={isFixing}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0 transition-colors shadow-sm"
          >
            {isFixing ? (
              <RotateCw className="h-3 w-3 animate-spin" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            <span>Auto-Repair LaTeX</span>
          </button>
        </div>
      )}

      {/* 4. 3-Pane Resizable Layout */}
      <div ref={splitRef} className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Pane: Templates & Outline Sidebar */}
        {isSidebarOpen && (
          <aside
            style={{ width: `${sidebarWidth}px` }}
            className="hidden lg:flex bg-[var(--bg-accent)] border-r border-[var(--line)] flex-col shrink-0 overflow-hidden"
          >
            {/* Sidebar search header */}
            <div className="p-3 border-b border-[var(--line)]">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-[var(--muted)]" />
                <input
                  type="text"
                  value={searchTemplate}
                  onChange={(e) => setSearchTemplate(e.target.value)}
                  placeholder="Filter templates..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--line)] focus:border-[var(--accent)] rounded text-xs text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none"
                />
              </div>
            </div>

            {/* Presets List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Starter Templates
              </div>
              {filteredPresets.map((preset) => {
                const isActive = activeTemplateId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`w-full text-left p-2.5 rounded text-xs transition-colors group flex flex-col gap-1 ${
                      isActive
                        ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold border border-[var(--accent)]/30"
                        : "text-[var(--ink)] hover:bg-[var(--surface-soft)] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{preset.name}</span>
                      {isActive && (
                        <Check className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--muted)] line-clamp-2 leading-relaxed font-normal">
                      {preset.description}
                    </span>
                  </button>
                );
              })}

              {/* Document Outline */}
              {outline.length > 0 && (
                <div className="pt-3">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
                    <span>Document Outline</span>
                    <Layers className="h-3 w-3" />
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {outline.map((sec) => (
                      <button
                        key={`${sec.line}-${sec.title}`}
                        type="button"
                        onClick={() => jumpToLine(sec.line)}
                        className={`w-full text-left px-2 py-1 rounded text-[11px] font-mono truncate hover:bg-[var(--surface-soft)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors flex items-center gap-1.5 ${
                          sec.level === 2 ? "pl-5 text-[10px]" : ""
                        }`}
                      >
                        <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-50" />
                        <span className="truncate">{sec.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="p-2 border-t border-[var(--line)] text-[10px] font-mono text-[var(--muted)] flex items-center justify-between px-3">
              <span>{TEMPLATE_PRESETS.length} presets</span>
              <span>LaTeX Core</span>
            </div>
          </aside>
        )}

        {/* Center Pane: Pro Code Editor */}
        <main
          className={`flex-1 min-w-0 min-h-0 bg-[#0d1117] flex-col overflow-hidden ${
            mobileTab === "editor" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Editor subheader */}
          <div className="h-8 flex items-center justify-between px-3 bg-[#161b22] border-b border-[#30363d] text-[11px] font-mono text-zinc-400 select-none">
            <div className="flex items-center gap-2">
              <FileCode className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="text-zinc-200 font-semibold">document.tex</span>
              <span className="text-zinc-500">|</span>
              <span className="text-zinc-400">
                {latex.split("\n").length} lines
              </span>
              <span className="text-zinc-500">|</span>
              <span className="text-zinc-400">{latex.length} chars</span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span>UTF-8</span>
              <span>LaTeX Mode</span>
            </div>
          </div>

          {/* Code Textarea with custom font & scroll */}
          <div className="flex-1 relative overflow-hidden flex">
            <textarea
              ref={textareaRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              onClick={updateCursorPosition}
              onKeyUp={updateCursorPosition}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleCompile();
                }
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                  e.preventDefault();
                  void handleCompile();
                }
                if (e.key === "Tab") {
                  e.preventDefault();
                  const target = e.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  const val = target.value;
                  setLatex(`${val.substring(0, start)}  ${val.substring(end)}`);
                  setTimeout(() => {
                    target.selectionStart = target.selectionEnd = start + 2;
                    updateCursorPosition();
                  }, 0);
                }
              }}
              spellCheck={false}
              className="flex-1 w-full h-full bg-[#0d1117] p-4 font-mono text-[13px] text-zinc-100 leading-relaxed border-0 resize-none focus:outline-none select-text overflow-y-auto"
              style={{
                tabSize: 2,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            />
          </div>

          {/* Editor Status Footer */}
          <div className="h-6.5 px-3 bg-[#161b22] border-t border-[#30363d] text-[10px] font-mono text-zinc-400 flex items-center justify-between select-none">
            <div className="flex items-center gap-3">
              <span>
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-emerald-400">Live Sync Ready</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">
                Shortcuts: Ctrl+Enter (Compile) | Ctrl+S (Save)
              </span>
            </div>
          </div>
        </main>

        {/* Right Pane: Vector PDF Output Viewer */}
        <section
          className={`w-full md:w-[440px] lg:w-[480px] xl:w-[540px] 2xl:w-[600px] bg-[var(--bg-accent)] border-l border-[var(--line)] flex-col shrink-0 min-h-0 overflow-hidden ${
            mobileTab === "preview" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* PDF Viewer Header */}
          <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-accent)] border-b border-[var(--line)] select-none">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>PDF Vector Canvas</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] font-mono text-[var(--muted)] w-9 text-center">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] ml-1"
                title="Reset Zoom"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleCompile}
                disabled={isCompiling}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] ml-1"
                title="Re-render PDF"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isCompiling ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* PDF Canvas Container */}
          <div className="flex-1 bg-zinc-900/90 overflow-auto flex items-center justify-center p-4">
            {isCompiling ? (
              <div className="flex flex-col items-center gap-3 text-xs text-zinc-400">
                <RotateCw className="h-7 w-7 animate-spin text-[var(--accent)]" />
                <span className="font-medium">
                  Compiling in Tectonic XeTeX engine…
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  100MB Isolated Thread Stack
                </span>
              </div>
            ) : pdfBlobUrl ? (
              <div
                className="h-full w-full flex items-center justify-center transition-transform origin-top"
                style={{ transform: `scale(${zoomLevel / 100})` }}
              >
                <iframe
                  src={pdfBlobUrl}
                  title="Tectonic PDF Canvas"
                  className="h-full w-full bg-white shadow-2xl rounded-sm border-0"
                />
              </div>
            ) : (
              <div className="text-center p-8 space-y-3 text-zinc-400 max-w-xs">
                <div className="h-12 w-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-500">
                  <FileCode className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-zinc-200">
                    No PDF Generated Yet
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Click <strong>Compile</strong> or press{" "}
                    <kbd className="px-1 py-0.5 bg-zinc-800 rounded font-mono text-[10px]">
                      Ctrl+Enter
                    </kbd>{" "}
                    to build your high-fidelity vector PDF.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCompile}
                  className="px-4 py-2 rounded bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  Compile Default Template
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
