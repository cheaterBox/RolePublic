"use client";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";

export default function App() {
  return (
    <VStack gap={4}>
      <HStack gap={2}>
        <Button label="Primary Action" onClick={() => alert("Clicked!")} />
        <Button label="Secondary" variant="secondary" />
      </HStack>
    </VStack>
  );
}
