"use client";

import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RotateCw,
  ShieldCheck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { registerApi } from "@/features/auth/api";
import { saveAuthSession } from "@/features/auth/authStore";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await registerApi({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      saveAuthSession(res.token, res.user);
      router.push(redirectUrl);
    } catch (err: any) {
      setError(err.message || "Registration failed. Try a different email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in-50 zoom-in-95 duration-200">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)] mb-1 shadow-sm">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-black tracking-wider uppercase text-[var(--ink)] flex items-center justify-center gap-2">
          <span>RoleTect</span>
          <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded border border-[var(--accent)]/30">
            REGISTER
          </span>
        </h1>
        <p className="text-xs text-[var(--muted)]">
          Create your RoleTect Pro account to collaborate & build verified
          resumes
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold rounded-lg animate-in fade-in-50">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" />
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded-lg pl-9.5 pr-3 py-2 text-xs text-[var(--ink)] placeholder:text-zinc-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Work Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@company.com"
              className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded-lg pl-9.5 pr-3 py-2 text-xs text-[var(--ink)] placeholder:text-zinc-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Password (Min 8 characters)
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              {showPassword ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              <span>{showPassword ? "Hide" : "Show"}</span>
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" />
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[var(--surface-soft)] border border-[var(--line)] focus:border-[var(--accent)] rounded-lg pl-9.5 pr-3 py-2 text-xs font-mono text-[var(--ink)] placeholder:text-zinc-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? (
            <RotateCw className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <span>Create Account</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Footer Links */}
      <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs text-[var(--muted)]">
        <span>Already have an account?</span>
        <Link
          href={`/login${redirectUrl !== "/" ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
          className="font-bold text-[var(--accent)] hover:underline flex items-center gap-1"
        >
          <span>Sign In Instead</span>
        </Link>
      </div>
    </div>
  );
}
