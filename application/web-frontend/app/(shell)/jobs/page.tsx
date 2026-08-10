"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonList } from "@/components/ui/SkeletonList";
import { deleteJob, listJobs } from "@/features/jobs/api";
import { JobParser } from "@/features/jobs/components/JobParser";
import { JobTable } from "@/features/jobs/components/JobTable";
import type { JobPayload } from "@/lib/api/types";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listJobs();
      setJobs(data);
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

  const handleDelete = async (id: string) => {
    await deleteJob(id);
    await load();
  };

  return (
    <VStack gap={6}>
      <PageHeader
        title="Jobs"
        description="Applications tracked in the API. Create, inspect, and delete."
        actions={
          <Button label="New job" onClick={() => setShowForm((v) => !v)} />
        }
      />

      {error ? (
        <Card padding={4}>
          <Text color="secondary">{error}</Text>
        </Card>
      ) : null}

      {showForm ? <JobParser onCreated={load} /> : null}

      <Card padding={4}>
        {loading ? (
          <SkeletonList rows={3} />
        ) : (
          <JobTable jobs={jobs} onView={() => {}} onDelete={handleDelete} />
        )}
      </Card>
    </VStack>
  );
}
