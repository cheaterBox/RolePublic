import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

export default function DashboardPage() {
  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={1}>Dashboard</Heading>
        <Text color="secondary">
          Track jobs, resumes, and documents. Use the sidebar to navigate.
        </Text>
      </VStack>

      <HStack gap={4}>
        <Card variant="default" padding={4}>
          <VStack gap={2}>
            <Text weight="medium">Jobs</Text>
            <Text size="sm" color="secondary">
              Your applications live under /jobs. Add, parse, and update status
              there.
            </Text>
          </VStack>
        </Card>
        <Card variant="default" padding={4}>
          <VStack gap={2}>
            <Text weight="medium">Resumes</Text>
            <Text size="sm" color="secondary">
              Base templates and tailored outputs. Tailor against a job in the
              next step.
            </Text>
          </VStack>
        </Card>
        <Card variant="default" padding={4}>
          <VStack gap={2}>
            <Text weight="medium">Documents</Text>
            <Text size="sm" color="secondary">
              Multi-file LaTeX workspaces with file browser and main file
              control.
            </Text>
          </VStack>
        </Card>
      </HStack>

      <Card padding={4}>
        <VStack gap={2}>
          <Text weight="medium">Connection</Text>
          <Text size="sm" color="secondary">
            Set NEXT_PUBLIC_API_BASE and NEXT_PUBLIC_API_TOKEN to talk to the
            API. Health is at /health.
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
}
