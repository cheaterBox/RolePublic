import { VStack } from "@astryxdesign/core/Layout";
import { Skeleton } from "@astryxdesign/core/Skeleton";

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <VStack gap={2}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={48} />
      ))}
    </VStack>
  );
}
