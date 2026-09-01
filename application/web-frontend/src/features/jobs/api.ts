import { apiFetch } from "@/lib/api/client";
import type { JobParseResult, JobPayload } from "@/lib/api/types";

export function listJobs() {
  return apiFetch<JobPayload[]>("/jobs");
}

export function getJob(id: string) {
  return apiFetch<JobPayload>(`/jobs/${id}`);
}

export function saveJob(job: JobPayload) {
  return apiFetch<void>("/jobs", { method: "POST", body: job });
}

export function deleteJob(id: string) {
  return apiFetch<void>(`/jobs/${id}`, { method: "DELETE" });
}

export function deleteJobsBatch(ids: string[]) {
  return apiFetch<void>("/jobs/batch", { method: "POST", body: { ids } });
}

export function deleteAllJobs() {
  return apiFetch<void>("/jobs/all", { method: "DELETE" });
}

export function updateStatus(id: string, status: string, metadata?: unknown) {
  return apiFetch<void>(`/jobs/${id}/status`, {
    method: "POST",
    body: { status, metadata },
  });
}

export const updateJobStatus = updateStatus;

export function updateMetadata(id: string, field: string, value: string) {
  return apiFetch<void>(`/jobs/${id}/metadata`, {
    method: "POST",
    body: { field, value },
  });
}

export function getJd(id: string) {
  return apiFetch<{
    raw_jd: string;
    requirements: string | null;
    core_responsibilities: string | null;
  }>(`/jobs/${id}/jd`);
}

export function parseJd(payload: {
  provider: string;
  model: string;
  api_key: string;
  raw_jd: string;
  job_url?: string | null;
  custom_base_url?: string | null;
}) {
  return apiFetch<JobParseResult>("/jobs/parse", {
    method: "POST",
    body: payload,
  });
}

export const parseJobDescription = parseJd;
