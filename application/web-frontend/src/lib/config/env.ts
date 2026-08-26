/**
 * Runtime env — mirrors api/src/config.rs expectations.
 * NEXT_PUBLIC_API_BASE must point at the Axum server (e.g. http://localhost:8080).
 * Token is sent as Bearer on /api/* except /health (see api/src/bootstrap/mod.rs).
 */

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  return v?.trim() ?? "";
}

export function getApiBase(): string {
  // NEXT_PUBLIC_API_BASE is the only public base the browser may read.
  // Falls back to relative /api proxy if not set (useful in dev).
  const raw = requireEnv("NEXT_PUBLIC_API_BASE", "");
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

export function getApiToken(): string {
  return requireEnv("NEXT_PUBLIC_API_TOKEN", "roletect_vps_master_token_2026");
}

export function getHealthUrl(): string {
  const base = getApiBase();
  return base ? `${base}/health` : "/health";
}

export function buildApiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  // If base is empty, use relative /api prefix (Next rewrites or same-origin).
  if (!base) return `/api${p}`;
  // Base already includes host; ensure /api prefix.
  if (p.startsWith("/api/")) return `${base}${p}`;
  return `${base}/api${p}`;
}
