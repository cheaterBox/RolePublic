"use client";

import { CheckCircle2, Copy, Layout } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { createResume } from "@/features/resumes/api";
import { apiFetch } from "@/lib/api/client";
import type { Theme } from "@/lib/api/types";

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [_loading, setLoading] = useState(true);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneSuccess, setCloneSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [themesList, active] = await Promise.all([
        apiFetch<Theme[]>("/themes").catch(() => []),
        apiFetch<Theme | null>("/themes/active").catch(() => null),
      ]);
      if (themesList.length > 0) {
        setThemes(themesList);
      } else {
        setThemes(builtInThemes);
      }
      if (active) setActiveThemeId(active.id);
    } catch (err) {
      console.error(err);
      setThemes(builtInThemes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetActive = async (id: string) => {
    try {
      await apiFetch("/themes/active", {
        method: "POST",
        body: { theme_id: id },
      });
      setActiveThemeId(id);
    } catch (err) {
      console.error(err);
      setActiveThemeId(id);
    }
  };

  const handleCloneToResumes = async (theme: Theme) => {
    setCloningId(theme.id);
    try {
      await createResume({
        name: `${theme.name} Base Template`,
        category: "LaTeX Themes",
        latex_content:
          defaultThemeCode[theme.id] || defaultThemeCode["awesome-cv"],
      });
      setCloneSuccess(theme.id);
      setTimeout(() => setCloneSuccess(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setCloningId(null);
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto p-4 sm:p-8 md:p-10 animate-in fade-in-50 duration-200">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="border-b border-[var(--line)] pb-5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
            Themes Gallery
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            ATS-tested LaTeX resume typography packages ready for 1-click
            cloning.
          </p>
        </header>

        {/* Themes Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => {
            const isActive = activeThemeId === theme.id;
            const isCloned = cloneSuccess === theme.id;

            return (
              <div
                key={theme.id}
                className={`rounded-xl border p-5 flex flex-col justify-between space-y-4 shadow-md transition-all ${
                  isActive
                    ? "border-[var(--accent)] bg-[rgba(35,134,54,0.08)] ring-1 ring-[var(--accent)]"
                    : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-soft)] text-[var(--accent-blue)] border border-[var(--line)]">
                      <Layout className="h-4 w-4" />
                    </div>
                    {isActive && (
                      <span className="tag-pill tag-pill-success font-mono font-bold">
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-[var(--ink)]">
                      {theme.name}
                    </h3>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      {themeDescriptions[theme.id] ||
                        "Clean typography with structured columns and ATS optimization."}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="border-t border-[var(--line)] pt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetActive(theme.id)}
                    className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
                      isActive
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--surface-soft)] text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {isActive ? "Selected" : "Set Active"}
                  </button>

                  <IconButton
                    label={isCloned ? "Cloned!" : "Clone to Resumes"}
                    tooltipPlacement="bottom"
                    variant="soft"
                    size="sm"
                    icon={
                      isCloned ? (
                        <CheckCircle2 className="text-[var(--accent)]" />
                      ) : (
                        <Copy />
                      )
                    }
                    onClick={() => handleCloneToResumes(theme)}
                    disabled={cloningId === theme.id}
                    loading={cloningId === theme.id}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const builtInThemes: Theme[] = [
  { id: "awesome-cv", name: "Awesome-CV", config: "", is_builtin: true },
  { id: "modern-cv", name: "ModernCV Classic", config: "", is_builtin: true },
  { id: "alta-cv", name: "AltaCV Two-Column", config: "", is_builtin: true },
  { id: "deedy-cv", name: "Deedy Clean", config: "", is_builtin: true },
  {
    id: "classic-ats",
    name: "Standard ATS Single-Column",
    config: "",
    is_builtin: true,
  },
  {
    id: "minimalist-tech",
    name: "Minimalist Systems",
    config: "",
    is_builtin: true,
  },
];

const themeDescriptions: Record<string, string> = {
  "awesome-cv":
    "Tech-focused template with subtle highlights, FontAwesome icons, and bold section headers.",
  "modern-cv":
    "European standard CV format with prominent contact header and organized timeline blocks.",
  "alta-cv":
    "Two-column resume layout ideal for displaying skills and experience side by side.",
  "deedy-cv":
    "Single-page software engineering resume designed for high information density.",
  "classic-ats": "Guaranteed 100% parseable standard single-column structure.",
  "minimalist-tech":
    "Clean typographical layout focusing strictly on measurable achievements.",
};

const defaultThemeCode: Record<string, string> = {
  "awesome-cv": `\\documentclass[11pt, a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem}

\\begin{document}
\\begin{center}
  {\\Huge \\textbf{Alex Morgan}}\\\\
  \\vspace{2pt}
  Engineering Lead $\\cdot$ \\href{mailto:user@example.com}{user@example.com}
\\end{center}
\\end{document}`,
};
