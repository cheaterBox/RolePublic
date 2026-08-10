"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonList } from "@/components/ui/SkeletonList";
import {
  createResume,
  deleteResume,
  listResumes,
} from "@/features/resumes/api";
import { ResumeList } from "@/features/resumes/components/ResumeList";
import type { ResumeItem } from "@/lib/api/types";

export default function ResumesPage() {
  const [items, setItems] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("general");
  const [latex, setLatex] = useState(
    "\\documentclass{article}\\begin{document}Hello\\end{document}",
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listResumes();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial load
  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!name) return;
    await createResume({ name, category, latex_content: latex });
    setName("");
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteResume(id);
    await load();
  };

  return (
    <VStack gap={6}>
      <PageHeader
        title="Resumes"
        description="Base templates. Create and manage LaTeX resumes."
      />

      {error ? (
        <Card padding={4}>
          <Text color="secondary">{error}</Text>
        </Card>
      ) : null}

      <Card padding={4}>
        <VStack gap={3}>
          <Text weight="medium">New resume</Text>
          <TextInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="My Resume"
          />
          <TextInput label="Category" value={category} onChange={setCategory} />
          <TextArea label="LaTeX" value={latex} onChange={setLatex} rows={5} />
          <Button label="Create" onClick={handleCreate} />
        </VStack>
      </Card>

      <Card padding={4}>
        {loading ? (
          <SkeletonList rows={3} />
        ) : (
          <ResumeList items={items} onDelete={handleDelete} />
        )}
      </Card>
    </VStack>
  );
}
