import { afterEach, describe, expect, test } from "bun:test";
import { ApiError, apiFetch } from "./client";

const originalFetch = globalThis.fetch;

describe("apiFetch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("adds Authorization header from env", async () => {
    process.env.NEXT_PUBLIC_API_TOKEN = "test-token-12345";
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    await apiFetch("/jobs", { method: "GET" });
    expect(capturedHeaders.Authorization).toBe("Bearer test-token-12345");
    delete process.env.NEXT_PUBLIC_API_TOKEN;
  });

  test("throws ApiError on non-ok with JSON body", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "validation", message: "bad" }), {
        status: 422,
      })) as unknown as typeof fetch;

    await expect(apiFetch("/jobs")).rejects.toBeInstanceOf(ApiError);
    try {
      await apiFetch("/jobs");
    } catch (e) {
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).code).toBe("validation");
    }
  });

  test("builds /api prefix when NEXT_PUBLIC_API_BASE empty", async () => {
    delete process.env.NEXT_PUBLIC_API_BASE;
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    await apiFetch("/themes");
    expect(capturedUrl).toBe("/api/themes");
  });
});
