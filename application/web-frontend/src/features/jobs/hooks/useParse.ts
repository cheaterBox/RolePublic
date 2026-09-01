"use client";

import { useState } from "react";
import { parseJd } from "@/features/jobs/api";
import type { JobParseResult } from "@/lib/api/types";

export function useParse() {
  const [result, setResult] = useState<JobParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parse = async (payload: {
    provider: string;
    model: string;
    api_key: string;
    raw_jd: string;
    job_url?: string | null;
    custom_base_url?: string | null;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const r = await parseJd(payload);
      setResult(r);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Parse failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { result, loading, error, parse };
}
