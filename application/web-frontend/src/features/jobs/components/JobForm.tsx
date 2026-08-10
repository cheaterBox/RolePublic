"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";
import type { JobPayload } from "@/lib/api/types";

type Props = {
  initial?: Partial<JobPayload>;
  onSubmit: (job: JobPayload) => Promise<void>;
  onCancel: () => void;
};

export function JobForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<Partial<JobPayload>>({
    id: initial?.id ?? "",
    company_name: initial?.company_name ?? "",
    job_title: initial?.job_title ?? "",
    work_model: initial?.work_model ?? "onsite",
    employment_type: initial?.employment_type ?? "full-time",
    status: initial?.status ?? "applied",
    raw_jd: initial?.raw_jd ?? "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.id || !form.company_name || !form.job_title) return;
    setSaving(true);
    try {
      await onSubmit(form as JobPayload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={3}>
      <TextInput
        label="Job ID"
        value={form.id ?? ""}
        onChange={(v) => setForm({ ...form, id: v })}
        placeholder="job-123"
      />
      <TextInput
        label="Company"
        value={form.company_name ?? ""}
        onChange={(v) => setForm({ ...form, company_name: v })}
      />
      <TextInput
        label="Title"
        value={form.job_title ?? ""}
        onChange={(v) => setForm({ ...form, job_title: v })}
      />
      <TextArea
        label="Raw JD"
        value={form.raw_jd ?? ""}
        onChange={(v) => setForm({ ...form, raw_jd: v })}
        rows={6}
      />
      <HStack gap={2}>
        <Button
          label={saving ? "Saving…" : "Save"}
          onClick={submit}
          isDisabled={saving}
        />
        <Button label="Cancel" variant="secondary" onClick={onCancel} />
      </HStack>
    </VStack>
  );
}
