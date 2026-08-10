import { apiFetch } from "@/lib/api/client";
import type {
  CoverLetterDetail,
  CoverLetterItem,
  CreateCoverLetterRequest,
  TailorCoverLetterRequest,
  TailoredContent,
} from "@/lib/api/types";

export function listCoverLetters() {
  return apiFetch<CoverLetterItem[]>("/cover_letters");
}
export function getCoverLetter(id: string) {
  return apiFetch<CoverLetterDetail>(`/cover_letters/${id}`);
}
export function createCoverLetter(p: CreateCoverLetterRequest) {
  return apiFetch<{ id: string }>("/cover_letters", {
    method: "POST",
    body: p,
  });
}
export function deleteCoverLetter(id: string) {
  return apiFetch<void>(`/cover_letters/${id}`, { method: "DELETE" });
}
export function tailorCoverLetter(p: TailorCoverLetterRequest) {
  return apiFetch<TailoredContent>("/cover_letters/tailor", {
    method: "POST",
    body: p,
  });
}
