import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <VStack gap={3} align="center">
      <Text weight="medium">{title}</Text>
      {description ? <Text color="secondary">{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onClick={onAction} />
      ) : null}
    </VStack>
  );
}
