import { apiFetch } from "@/lib/api/client";
import type { Theme } from "@/lib/api/types";

export function listThemes() {
  return apiFetch<Theme[]>("/themes");
}
export function saveTheme(id: string, name: string, config: string) {
  return apiFetch<void>("/themes", {
    method: "POST",
    body: { id, name, config },
  });
}
export function deleteTheme(id: string) {
  return apiFetch<void>(`/themes/${id}`, { method: "DELETE" });
}
export function getActiveTheme() {
  return apiFetch<Theme | null>("/themes/active");
}
export function setActiveTheme(theme_id: string) {
  return apiFetch<void>("/themes/active", {
    method: "POST",
    body: { theme_id },
  });
}
