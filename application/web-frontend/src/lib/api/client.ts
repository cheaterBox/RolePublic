/**
 * Typed fetch client — matches api/src/bootstrap + api/src/error::AppError mapping.
 * No secret is ever logged. 401/422/4xx are surfaced as ApiError.
 */
import { buildApiUrl, getApiToken } from "../config/env";
import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  rawBody?: string | FormData | Blob;
};

async function parseError(res: Response): Promise<ApiError> {
  const status = res.status;
  try {
    const data = (await res.json()) as ApiErrorBody;
    return new ApiError(
      status,
      data.error ?? "error",
      data.message ?? res.statusText,
      data.details,
    );
  } catch {
    const text = await res.text().catch(() => res.statusText);
    return new ApiError(status, `http_${status}`, text || res.statusText);
  }
}

function authHeaders(): Record<string, string> {
  if (typeof window !== "undefined") {
    const userJwt = localStorage.getItem("roletect_jwt_token");
    if (userJwt) return { Authorization: `Bearer ${userJwt}` };
  }
  const token = getApiToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = buildApiUrl(path);
  const method = opts.method ?? "GET";

  const headers: Record<string, string> = {
    ...authHeaders(),
    ...opts.headers,
  };

  let body: string | FormData | Blob | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody as string | FormData | Blob;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method, headers, body, signal: opts.signal });

  if (!res.ok) throw await parseError(res);

  // 204 / empty
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// Health is public — no auth header, matches api/src/bootstrap public route.
export async function fetchHealth(): Promise<string> {
  const { getHealthUrl } = await import("../config/env");
  const url = getHealthUrl();
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok)
    throw new ApiError(res?.status ?? 503, "unavailable", "API engine offline");
  return res.text();
}
