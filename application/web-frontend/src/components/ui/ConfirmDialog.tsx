"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <Dialog isOpen={open} onOpenChange={(v) => !v && onClose()}>
      <VStack gap={4}>
        <Text weight="medium">{title}</Text>
        {description ? <Text color="secondary">{description}</Text> : null}
        <HStack gap={2} justify="end">
          <Button label="Cancel" variant="secondary" onClick={onClose} />
          <Button label={confirmLabel} variant="primary" onClick={onConfirm} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
