import { apiFetch } from "@/lib/api/client";
import type {
  CreateResumeRequest,
  ResumeDetail,
  ResumeItem,
  TailoredContent,
  TailorResumeRequest,
} from "@/lib/api/types";

export function listResumes() {
  return apiFetch<ResumeItem[]>("/resumes");
}

export function getResume(id: string) {
  return apiFetch<ResumeDetail>(`/resumes/${id}`);
}

export function createResume(payload: CreateResumeRequest) {
  return apiFetch<{ id: string }>("/resumes", {
    method: "POST",
    body: payload,
  });
}

export function updateResume(detail: ResumeDetail) {
  return apiFetch<void>(`/resumes/${detail.id}`, {
    method: "PUT",
    body: detail,
  });
}

export function deleteResume(id: string) {
  return apiFetch<void>(`/resumes/${id}`, { method: "DELETE" });
}

export function getUsage(id: string) {
  return apiFetch<{ count: number }>(`/resumes/${id}/usage`);
}

export function tailorResume(payload: TailorResumeRequest) {
  return apiFetch<TailoredContent>("/resumes/tailor", {
    method: "POST",
    body: payload,
  });
}

export function getTailored(id: string) {
  return apiFetch<TailoredContent>(`/resumes/tailored/${id}`);
}

export function getLatestTailoredForJob(jobId: string) {
  return apiFetch<TailoredContent>(`/resumes/tailored/job/${jobId}/latest`);
}
