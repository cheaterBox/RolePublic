/**
 * AI config persistence — localStorage (unencrypted for now).
 * Stored as JSON under STORAGE_KEY. Later will be migrated to encrypted IndexedDB.
 */

export const STORAGE_KEY = "roletect_ai_config";

export type StoredAiConfig = {
  provider: string;
  model: string;
  apiKey: string;
  customModel?: string;
  customBaseUrl?: string;
};

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export function saveStoredAiConfig(cfg: StoredAiConfig): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // quota or privacy mode — ignore
  }
}

export function getStoredAiConfig(): StoredAiConfig | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAiConfig>;
    if (!parsed.provider || !parsed.model) return null;
    return {
      provider: String(parsed.provider),
      model: String(parsed.model),
      apiKey: String(parsed.apiKey ?? ""),
      customModel: parsed.customModel ? String(parsed.customModel) : undefined,
      customBaseUrl: parsed.customBaseUrl
        ? String(parsed.customBaseUrl)
        : undefined,
    };
  } catch {
    return null;
  }
}

export function clearStoredAiConfig(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getEffectiveModel(cfg: StoredAiConfig): string {
  const custom = cfg.customModel?.trim();
  if (custom) return custom;
  return cfg.model;
}

export function getEffectiveProvider(cfg: StoredAiConfig): string {
  // normalize legacy alias "claude" -> "anthropic"
  const p = cfg.provider.trim().toLowerCase();
  if (p === "claude") return "anthropic";
  return p;
}

export type ResolvedAiCredentials = {
  provider: string;
  model: string;
  apiKey: string;
  customBaseUrl?: string;
};

export function resolveAiCredentials(): ResolvedAiCredentials | null {
  const cfg = getStoredAiConfig();
  if (!cfg) return null;
  const apiKey = cfg.apiKey.trim();
  if (!apiKey) return null;
  return {
    provider: getEffectiveProvider(cfg),
    model: getEffectiveModel(cfg),
    apiKey,
    customBaseUrl: cfg.customBaseUrl?.trim() || undefined,
  };
}
