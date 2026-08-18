"use client";

import {
  Activity,
  Briefcase,
  Cloud,
  Code,
  Cpu,
  Download,
  Files,
  FileText,
  Home,
  Inbox,
  Mail,
  Menu,
  Palette,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api/client";
import { navItems } from "@/lib/nav/config";

const iconMap: Record<string, typeof Home> = {
  Home,
  Briefcase,
  Inbox,
  FileText,
  Mail,
  Files,
  Cpu,
  Palette,
  Cloud,
  Download,
  Settings,
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkApi = async () => {
      try {
        await fetchHealth();
        if (mounted) setApiConnected(true);
      } catch {
        if (mounted) setApiConnected(false);
      }
    };
    void checkApi();
    const interval = setInterval(checkApi, 20000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* SIDEBAR - Desktop Icon Bar (48px - 56px matching Desktop App.vue) */}
      <aside className="hidden md:flex w-14 flex-col items-center justify-between border-r border-[var(--line)] bg-[var(--bg-accent)] py-3 shrink-0 select-none z-30">
        {/* Top Logo / Brand Dot */}
        <div className="flex flex-col items-center gap-4 w-full">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-soft)] transition-colors group"
          >
            <div className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] group-hover:scale-125 transition-transform" />
          </Link>

          <div className="w-6 h-[1px] bg-[var(--line)]" />

          {/* Nav Items */}
          <nav className="flex flex-col items-center gap-1.5 w-full">
            {navItems.map((item) => {
              const Icon = iconMap[item.iconName] || FileText;
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <div
                  key={item.href}
                  className="relative flex items-center justify-center w-full"
                  onMouseEnter={() => setActiveTooltip(item.label)}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  <Link
                    href={item.href}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                      isActive
                        ? "text-[var(--ink)] bg-[var(--surface-soft)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-[var(--accent)] rounded-r" />
                    )}
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </Link>

                  {/* Flying Tooltip (matching App.vue flying-message sidebar-tooltip) */}
                  {activeTooltip === item.label && (
                    <div className="absolute left-full ml-2.5 z-50 rounded-md bg-[var(--bg-accent)] border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] whitespace-nowrap shadow-xl pointer-events-none">
                      {item.label}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Bottom External Links / Status */}
        <div className="flex flex-col items-center gap-2 w-full">
          <div className="w-6 h-[1px] bg-[var(--line)]" />
          <a
            href="https://github.com/AhmedTrooper/roletect-app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
            title="GitHub Community"
          >
            <Code className="h-4 w-4" />
          </a>
        </div>
      </aside>

      {/* MOBILE DRAWER OVERLAY */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* MOBILE SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-[var(--bg-accent)] border-r border-[var(--line)] z-50 flex flex-col transform transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--line)] px-4">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            <span>RoleTect</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = iconMap[item.iconName] || FileText;
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold ${
                  isActive
                    ? "bg-[var(--surface-soft)] text-[var(--ink)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Minimal Bar */}
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-accent)] px-4 select-none z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1 rounded text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold tracking-tight text-[var(--muted)]">
              <span>RoleTect</span>
              <span>/</span>
              <span className="text-[var(--ink)] font-semibold">
                {navItems.find(
                  (i) =>
                    pathname === i.href ||
                    (i.href !== "/" && pathname.startsWith(i.href)),
                )?.label || "Workspace"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
              <Activity className="h-3 w-3 text-[var(--accent)]" />
              <span>{apiConnected ? "Engine Ready" : "Local Mode"}</span>
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
