"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import type { ResumeItem } from "@/lib/api/types";

type Props = {
  items: ResumeItem[];
  onDelete: (id: string) => void;
};

export function ResumeList({ items, onDelete }: Props) {
  if (items.length === 0) return <Text color="secondary">No resumes yet.</Text>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-2">Name</th>
            <th className="py-2 pr-2">Category</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2 pr-2">{r.name}</td>
              <td className="py-2 pr-2">
                <Badge label={r.category} variant="neutral" />
              </td>
              <td className="py-2">
                <HStack gap={1} justify="end">
                  <Button
                    label="Delete"
                    variant="ghost"
                    onClick={() => onDelete(r.id)}
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
