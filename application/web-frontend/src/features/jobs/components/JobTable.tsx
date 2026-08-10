"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import type { JobPayload } from "@/lib/api/types";

type Props = {
  jobs: JobPayload[];
  onView: (id: string) => void;
  onDelete: (id: string) => void;
};

export function JobTable({ jobs, onView, onDelete }: Props) {
  if (jobs.length === 0) return <Text color="secondary">No jobs yet.</Text>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-2">Title</th>
            <th className="py-2 pr-2">Company</th>
            <th className="py-2 pr-2">Status</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b last:border-0">
              <td className="py-2 pr-2">{j.job_title}</td>
              <td className="py-2 pr-2">{j.company_name}</td>
              <td className="py-2 pr-2">
                <Badge label={j.status} variant="neutral" />
              </td>
              <td className="py-2">
                <HStack gap={1} justify="end">
                  <Button
                    label="View"
                    variant="secondary"
                    onClick={() => onView(j.id)}
                  />
                  <Button
                    label="Delete"
                    variant="ghost"
                    onClick={() => onDelete(j.id)}
                  />
                </HStack>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
