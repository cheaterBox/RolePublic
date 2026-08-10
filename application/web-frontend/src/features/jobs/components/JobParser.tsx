"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";
import { saveJob } from "@/features/jobs/api";
import { useParse } from "@/features/jobs/hooks/useParse";
import { getAiConfig } from "@/features/settings/api";

export function JobParser({ onCreated }: { onCreated: () => void }) {
  const [rawJd, setRawJd] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const { result, loading, error, parse } = useParse();
  const [saving, setSaving] = useState(false);

  const handleParseAndSave = async () => {
    if (!rawJd.trim() && !jobUrl.trim()) return;
    // load AI config for provider/model if not overridden
    let provider = "openai";
    let model = "gpt-4o";
    try {
      const cfg = await getAiConfig();
      provider = cfg.provider || provider;
      model = cfg.model || model;
    } catch {
      // fallback
    }
    if (!apiKey.trim()) {
      return;
    }
    const res = await parse({
      provider,
      model,
      api_key: apiKey,
      raw_jd: rawJd,
      job_url: jobUrl || null,
    });
    // Build JobPayload like desktop jobs.ts: generate id, map details
    const details = res.details;
    const jobPayload = {
      id: Math.random().toString(36).substring(2, 12),
      company_name: details.company_name,
      job_title: details.job_title,
      work_model: details.work_model,
      employment_type: details.employment_type,
      status: "Drafting",
      raw_jd: res.raw_description || rawJd,
      requirements: JSON.stringify(details.requirements || []),
      core_responsibilities: JSON.stringify(
        details.core_responsibilities || [],
      ),
      job_url: jobUrl.trim() || null,
    } as unknown as import("@/lib/api/types").JobPayload;
    setSaving(true);
    try {
      await saveJob(jobPayload);
      onCreated();
      setRawJd("");
      setJobUrl("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Text weight="medium">Parse with Intelligence</Text>
        <Text size="sm" color="secondary">
          Paste manually for best accuracy. URL extraction is fallback, like
          desktop JobParserTab.
        </Text>
        <TextInput
          label="Job URL (optional)"
          value={jobUrl}
          onChange={setJobUrl}
          placeholder="https://..."
        />
        <TextArea
          label="Raw description"
          value={rawJd}
          onChange={setRawJd}
          rows={6}
          placeholder="Paste description..."
        />
        <TextInput
          label="API key"
          value={apiKey}
          onChange={setApiKey}
          placeholder="sk-..."
          type="password"
        />
        {error ? <Text color="secondary">{error}</Text> : null}
        {result ? (
          <Card variant="muted" padding={3}>
            <VStack gap={1}>
              <Text weight="medium">
                {result.details.job_title} — {result.details.company_name}
              </Text>
              <Text size="sm" color="secondary">
                {result.details.work_model} • {result.details.employment_type}
              </Text>
              {!result.details.is_valid_job ? (
                <Text size="sm">Not a valid job per AI</Text>
              ) : null}
            </VStack>
          </Card>
        ) : null}
        <Button
          label={loading || saving ? "Processing…" : "Run extraction"}
          onClick={handleParseAndSave}
          isDisabled={
            loading ||
            saving ||
            (!rawJd.trim() && !jobUrl.trim()) ||
            !apiKey.trim()
          }
        />
      </VStack>
    </Card>
  );
}
