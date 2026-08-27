import { apiFetch } from "@/lib/api/client";
import type { AiConfig } from "@/lib/api/types";

export interface S3ConfigData {
  endpoint: string;
  bucket: string;
  region: string;
  force_path_style: boolean;
  has_credentials: boolean;
  configured: boolean;
}

export interface CustomS3Payload {
  endpoint?: string;
  bucket: string;
  region?: string;
  access_key: string;
  secret_key: string;
  force_path_style?: boolean;
}

export interface S3BackupEntry {
  key: string;
  size: number;
  last_modified: string;
}

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

export async function getExtensionConfig(): Promise<{
  secret: string;
  port: string;
}> {
  try {
    const [secRes, portRes] = await Promise.allSettled([
      apiFetch<{ secret: string }>("/settings/extension/secret"),
      apiFetch<{ port: number }>("/settings/server/active-port"),
    ]);
    const secret = secRes.status === "fulfilled" ? secRes.value.secret : "";
    const port =
      portRes.status === "fulfilled" ? String(portRes.value.port) : "14207";
    return { secret, port };
  } catch {
    return { secret: "", port: "14207" };
  }
}

export function getActiveServerPort() {
  return apiFetch<{ port: number }>("/settings/server/active-port");
}

export function getS3Config() {
  return apiFetch<S3ConfigData>("/cloud/config");
}

export function testS3Connection() {
  return apiFetch<{ status: string }>("/cloud/test", { method: "POST" });
}

export function testCustomS3Connection(payload: CustomS3Payload) {
  return apiFetch<{ status: string; message: string }>("/cloud/test-custom", {
    method: "POST",
    body: payload,
  });
}

export function uploadS3Backup() {
  return apiFetch<{ key: string }>("/cloud/upload", { method: "POST" });
}

export function listS3Backups() {
  return apiFetch<S3BackupEntry[]>("/cloud/list");
}

export function downloadS3Backup(key: string) {
  return apiFetch<{ backup: any }>("/cloud/download", {
    method: "POST",
    body: { key },
  });
}

export function exportFullData() {
  return apiFetch<any>("/data/export");
}

export function importFullData(data: any) {
  return apiFetch<void>("/data/import", {
    method: "POST",
    body: data,
  });
}
