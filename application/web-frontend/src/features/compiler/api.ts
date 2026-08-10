import { apiFetch } from "@/lib/api/client";
import type { CompilerState } from "@/lib/api/types";

export function getCompilerState() {
  return apiFetch<CompilerState>("/compiler/state");
}
export function saveCompilerState(s: CompilerState) {
  return apiFetch<void>("/compiler/state", { method: "POST", body: s });
}
