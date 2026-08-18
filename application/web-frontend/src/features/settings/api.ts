import { apiFetch } from "@/lib/api/client";
import type { AiConfig } from "@/lib/api/types";

export function getAiConfig() {
  return apiFetch<AiConfig>("/settings/ai");
}

export function saveAiConfig(p: {
  provider: string;
  model: string;
  api_key?: string | null;
}) {
  return apiFetch<void>("/settings/ai", { method: "POST", body: p });
}

export function getSetting(key: string, def = "") {
  return apiFetch<{ value: string }>(
    `/settings?key=${encodeURIComponent(key)}&default=${encodeURIComponent(def)}`,
  );
}

export function saveSetting(key: string, value: string) {
  return apiFetch<void>("/settings", { method: "POST", body: { key, value } });
}

export function getExtensionConfig() {
  return apiFetch<{ port: string; secret: string }>("/settings/extension");
}

export function getActiveServerPort() {
  return apiFetch<{ port: string }>("/settings/port");
}
