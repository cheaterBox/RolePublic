import { apiFetch } from "@/lib/api/client";

export function compileLatex(latex: string, filename?: string) {
  return apiFetch<{ pdf_base64?: string; message?: string }>("/pdf/compile", {
    method: "POST",
    body: { latex_content: latex, filename },
  });
}
export function refineLatex(p: {
  provider: string;
  model: string;
  api_key: string;
  current_latex: string;
  instruction: string;
  custom_base_url?: string | null;
}) {
  return apiFetch<{ latex: string }>("/pdf/refine", {
    method: "POST",
    body: p,
  });
}
