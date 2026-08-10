import { apiFetch } from "@/lib/api/client";
import type { ScoreResumeResult } from "@/lib/api/types";

export function scoreResume(p: {
  provider: string;
  model: string;
  api_key: string;
  resume_id: string;
  job_id: string;
}) {
  return apiFetch<ScoreResumeResult>("/scoring/score", {
    method: "POST",
    body: p,
  });
}
