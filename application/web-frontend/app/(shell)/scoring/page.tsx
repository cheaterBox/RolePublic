"use client";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { PageHeader } from "@/components/ui/PageHeader";
export default function Page() {
  const title = "Scoring";
  return (
    <VStack gap={4}>
      <PageHeader
        title={title}
        description="Feature slice ready — API client under src/features/scoring."
      />
      <Card padding={4}>
        <Text color="secondary">
          UI for this feature is stubbed. Connect NEXT_PUBLIC_API_BASE and use
          the client in src/features/scoring/api.ts.
        </Text>
      </Card>
    </VStack>
  );
}
