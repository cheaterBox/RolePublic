import { apiFetch } from "@/lib/api/client";
import type {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  UserSummary,
} from "./types";

export function loginApi(payload: LoginPayload) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function registerApi(payload: RegisterPayload) {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: payload,
  });
}

export function getMeApi() {
  return apiFetch<{ user: UserSummary }>("/auth/me");
}
