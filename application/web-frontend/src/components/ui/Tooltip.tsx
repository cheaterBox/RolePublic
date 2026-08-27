"use client";

import {
  arrow,
  autoUpdate,
  FloatingArrow,
  FloatingPortal,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import * as React from "react";

type TooltipProps = {
  content: string;
  children: React.ReactElement;
  placement?: "top" | "bottom" | "left" | "right";
  delay?: number;
  /** Max width before wrapping — clamped to viewport */
  maxWidth?: number;
};

export function Tooltip({
  content,
  children,
  placement = "top",
  delay = 120,
  maxWidth = 220,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const arrowRef = React.useRef(null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: "start",
        padding: 8,
      }),
      shift({
        padding: 8,
        crossAxis: true,
      }),
      arrow({ element: arrowRef, padding: 8 }),
    ],
  });

  const hover = useHover(context, {
    move: false,
    delay: { open: delay, close: 40 },
    handleClose: null,
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  // Support touch: tap to show briefly (useHover handles pointerType touch via delay)
  // Clone child to inject ref + props + aria
  const trigger = React.cloneElement(
    children as React.ReactElement<any>,
    {
      ref: refs.setReference,
      "aria-describedby": open ? context.floatingId : undefined,
      ...getReferenceProps(),
    } as any,
  );

  return (
    <>
      {trigger}
      {open && content && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{
              ...floatingStyles,
              maxWidth: `min(90vw, ${maxWidth}px)`,
              zIndex: 9999,
            }}
            {...getFloatingProps()}
            className="pointer-events-none select-none"
          >
            <div
              className="rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-[var(--ink)] shadow-xl"
              style={{
                maxWidth: `min(90vw, ${maxWidth}px)`,
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                whiteSpace: "normal",
                lineHeight: 1.4,
                // Clamp height, scroll if absurdly long (shouldn't happen)
                maxHeight: "min(40vh, 160px)",
                overflowY: "auto",
                overscrollBehavior: "contain",
              }}
            >
              {content}
            </div>
            <FloatingArrow
              ref={arrowRef}
              context={context}
              className="fill-[var(--surface-soft)] [&>path:first-of-type]:stroke-[var(--line)]"
              width={10}
              height={5}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
