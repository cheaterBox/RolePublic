import { describe, expect, test } from "bun:test";
import { buildApiUrl, getHealthUrl } from "./env";

describe("env", () => {
  test("buildApiUrl uses relative /api when base empty", () => {
    delete process.env.NEXT_PUBLIC_API_BASE;
    expect(buildApiUrl("/jobs")).toBe("/api/jobs");
    expect(buildApiUrl("/themes/active")).toBe("/api/themes/active");
  });

  test("buildApiUrl prepends base when set", () => {
    process.env.NEXT_PUBLIC_API_BASE = "http://localhost:8080";
    expect(buildApiUrl("/jobs")).toBe("http://localhost:8080/api/jobs");
    expect(buildApiUrl("jobs")).toBe("http://localhost:8080/api/jobs");
    delete process.env.NEXT_PUBLIC_API_BASE;
  });

  test("getHealthUrl", () => {
    delete process.env.NEXT_PUBLIC_API_BASE;
    expect(getHealthUrl()).toBe("/health");
    process.env.NEXT_PUBLIC_API_BASE = "http://localhost:8080/";
    expect(getHealthUrl()).toBe("http://localhost:8080/health");
    delete process.env.NEXT_PUBLIC_API_BASE;
  });
});
