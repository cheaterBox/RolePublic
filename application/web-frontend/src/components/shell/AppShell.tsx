"use client";

import {
  Briefcase,
  ChevronDown,
  Cloud,
  Code,
  Cpu,
  Download,
  Files,
  FileText,
  Home,
  Inbox,
  Info,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Palette,
  Settings,
  Share2,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearAuthSession, getStoredUser } from "@/features/auth/authStore";
import type { UserSummary } from "@/features/auth/types";
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
  Share2,
  Palette,
  Cloud,
  Download,
  Settings,
  Info,
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<UserSummary | null>(null);

  useEffect(() => {
    const syncUser = () => {
      setCurrentUser(getStoredUser());
    };
    syncUser();
    window.addEventListener("roletect_auth_changed", syncUser);
    return () => window.removeEventListener("roletect_auth_changed", syncUser);
  }, []);

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

  // Click outside profile menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)] select-none">
      {/* TOP DESKTOP HEADER (52px, web-proportioned) */}
      <header className="h-13 shrink-0 bg-[var(--bg-accent)] border-b border-[var(--line)] flex items-center justify-between px-4 z-40 select-none backdrop-blur-md">
        {/* Left: Logo & Branding */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
          <Link
            href="/"
            className="text-xs sm:text-sm font-extrabold tracking-widest uppercase text-[var(--muted)] hover:text-[var(--ink)] transition-colors flex items-center gap-1.5"
          >
            <span>RoleTect</span>
            <span className="text-[10px] font-mono font-normal text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.2 rounded-sm border border-[var(--accent)]/30">
              PRO
            </span>
          </Link>
        </div>

        {/* Center: Current Workspace Context */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-[var(--muted)]">
          <span className="opacity-40">/</span>
          <span className="text-[var(--ink)] font-semibold">
            {navItems.find(
              (i) =>
                pathname === i.href ||
                (i.href !== "/" && pathname.startsWith(i.href)),
            )?.label || "Workspace"}
          </span>
        </div>

        {/* Right: Engine Status & Profile Dropdown */}
        <div className="flex items-center gap-2.5">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--surface-soft)] border border-[var(--line)] text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider">
            <span
              className={`h-2 w-2 rounded-full ${
                apiConnected
                  ? "bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]"
                  : "bg-amber-400"
              }`}
            />
            <span className="hidden sm:inline">
              {apiConnected ? "Engine Active" : "Connecting…"}
            </span>
          </div>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileMenu(!showProfileMenu);
              }}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--surface-soft)] border border-[var(--line)] text-xs font-medium text-[var(--ink)] hover:border-[var(--accent)] transition-colors cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="hidden md:inline font-bold truncate max-w-32">
                {currentUser?.full_name || "Pro Member"}
              </span>
              <ChevronDown className="h-3 w-3 text-[var(--muted)]" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-10 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-1.5 animate-in fade-in-50 zoom-in-95 duration-100">
                <div className="flex items-center gap-3 p-1.5">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)] flex items-center justify-center text-xs font-bold shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--ink)] truncate">
                      {currentUser?.full_name || "Staff Engineer"}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--muted)] truncate">
                      {currentUser?.email || "pro@roletect.io"}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-[var(--line)] my-1" />

                <div className="flex items-center justify-between px-2 py-1 text-xs">
                  <span className="text-[var(--muted)]">Role / Plan</span>
                  <span className="tag-pill tag-pill-success text-[11px] uppercase">
                    {currentUser?.role || "Enterprise"}
                  </span>
                </div>

                <div className="h-px bg-[var(--line)] my-1" />

                <Link
                  href="/settings"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-soft)] hover:text-[var(--accent)] transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings & API Keys</span>
                </Link>

                <Link
                  href="/cloud"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-soft)] hover:text-[var(--accent)] transition-colors"
                >
                  <Cloud className="h-4 w-4" />
                  <span>Cloud Backup & Sync</span>
                </Link>

                <div className="h-px bg-[var(--line)] my-1" />

                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearAuthSession();
                      setShowProfileMenu(false);
                      window.location.href = "/login";
                    }}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors w-full text-left cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Log Out</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href="/login"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-opacity"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      <span>Sign In</span>
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] text-xs font-bold hover:border-[var(--muted)] transition-colors"
                    >
                      <span>Register</span>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* BODY (Web Sidebar + Main Viewport) */}
      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR - Desktop Icon Bar (56px-60px for web clickability) */}
        <aside className="hidden md:flex w-14 lg:w-15 flex-col items-center justify-between border-r border-[var(--line)] bg-[var(--bg-accent)] py-3 shrink-0 select-none z-30">
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
                    className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                      isActive
                        ? "text-[var(--accent)] bg-[var(--surface-soft)] font-bold shadow-xs"
                        : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-[2.5px] bg-[var(--accent)] rounded-r" />
                    )}
                    <Icon
                      className="h-4.5 w-4.5"
                      strokeWidth={isActive ? 2.2 : 1.8}
                    />
                  </Link>

                  {/* Flying Tooltip */}
                  {activeTooltip === item.label && (
                    <div className="absolute left-full ml-3.5 z-50 rounded-lg bg-[var(--bg-accent)] border border-[var(--line)] px-3 py-1.5 text-xs font-bold text-[var(--ink)] whitespace-nowrap shadow-2xl pointer-events-none animate-in fade-in-50 zoom-in-95 duration-100">
                      {item.label}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Bottom External Links */}
          <div className="flex flex-col items-center gap-2 w-full pt-2.5 border-t border-[var(--line)]">
            <a
              href="https://github.com/AhmedTrooper/roletect-app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-soft)] transition-colors"
              title="GitHub Community"
            >
              <Code className="h-4 w-4" />
            </a>
          </div>
        </aside>

        {/* MOBILE DRAWER OVERLAY */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* MOBILE SIDEBAR DRAWER */}
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
                      ? "bg-[var(--surface-soft)] text-[var(--accent)] font-bold"
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
        <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}
