"use client";

import { Check, Code, Copy, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function AboutPage() {
  const [copied, setCopied] = useState(false);
  const identifier = "com.ahmedtrooper.roletect";

  const copyIdentifier = async () => {
    await navigator.clipboard.writeText(identifier);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_-20%,rgba(35,134,54,0.08),transparent_70%)] overflow-y-auto animate-in fade-in-50 duration-200">
      <div className="w-full max-w-lg bg-[rgba(22,25,35,0.7)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden">
        {/* Top Glow Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-60" />

        {/* Header with App Ring */}
        <header className="flex flex-col items-center gap-5 mb-8">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 border border-[var(--line)] rounded-2xl rotate-45" />
            <div className="w-14 h-14 bg-[var(--bg-accent)] border border-[var(--line)] rounded-xl flex items-center justify-center z-10 shadow-lg">
              <div className="w-3 h-3 bg-[var(--accent)] rounded-full shadow-[0_0_20px_var(--accent)]" />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-b from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              RoleTect
            </h1>
            <div className="inline-flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1 rounded-full mt-2">
              <ShieldCheck className="h-3 w-3 text-[var(--accent)]" />
              <span className="text-[10px] font-extrabold tracking-wider uppercase text-[var(--accent)]">
                Secure Enterprise Cloud Engine
              </span>
            </div>
          </div>
        </header>

        {/* Tagline */}
        <div className="text-center mb-8">
          <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
            The precision engine for high-performance LaTeX resume tailoring and
            Overleaf-grade multi-user collaboration.
          </p>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div
            onClick={copyIdentifier}
            className="bg-white/[0.02] border border-[var(--line)] rounded-2xl p-4 cursor-pointer hover:border-[var(--muted)] transition-colors"
          >
            <div className="flex justify-between items-center text-[10px] font-bold text-[var(--muted)] tracking-wider mb-1">
              <span>IDENTIFIER</span>
              {copied ? (
                <Check className="h-3 w-3 text-[var(--accent)]" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </div>
            <span className="font-mono text-xs text-[var(--ink)] block truncate">
              {identifier}
            </span>
          </div>

          <div className="bg-white/[0.02] border border-[var(--line)] rounded-2xl p-4">
            <div className="text-[10px] font-bold text-[var(--muted)] tracking-wider mb-1">
              VERSION
            </div>
            <span className="font-mono text-xs text-[var(--ink)] block">
              v0.2.0-cloud
            </span>
          </div>

          <div className="bg-white/[0.02] border border-[var(--line)] rounded-2xl p-4">
            <div className="text-[10px] font-bold text-[var(--muted)] tracking-wider mb-1">
              ENGINE
            </div>
            <span className="font-mono text-xs text-[var(--ink)] block">
              Axum + Tectonic TeX
            </span>
          </div>

          <div className="bg-white/[0.02] border border-[var(--line)] rounded-2xl p-4">
            <div className="text-[10px] font-bold text-[var(--muted)] tracking-wider mb-1">
              STORAGE
            </div>
            <span className="font-mono text-xs text-[var(--ink)] block">
              Postgres / SQLite + S3
            </span>
          </div>
        </div>

        {/* Description Box */}
        <div className="bg-[var(--bg-accent)] rounded-2xl p-5 mb-8 border-l-4 border-[var(--accent)] text-xs leading-relaxed text-[var(--muted)]">
          RoleTect integrates sovereign AI LLM orchestration with professional
          TeX typesetting and collaborative revision tracking. Built for
          professionals who treat their career narrative as a precision
          specification.
        </div>

        {/* Action Link */}
        <div className="mb-8">
          <a
            href="https://github.com/AhmedTrooper/roletect-app"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-[var(--surface-soft)] border border-[var(--line)] rounded-xl text-xs font-bold text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--surface)] transition-all shadow-md"
          >
            <Code className="h-4 w-4 text-[var(--accent)]" />
            <span>GitHub Community, Releases & Documentation</span>
          </a>
        </div>

        {/* Footer */}
        <footer className="text-center pt-4 border-t border-[var(--line)] text-[10px] font-mono tracking-widest text-[var(--muted)] uppercase">
          © 2025–2026 MD. RAMJAN MIAH (AHMEDTROOPER) • ALL RIGHTS RESERVED
        </footer>
      </div>
    </div>
  );
}
