"use client";

import type * as React from "react";
import { Tooltip } from "./Tooltip";

type IconButtonVariant = "soft" | "accent" | "danger" | "ghost" | "emerald";

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; // tooltip + aria-label
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  variant?: IconButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon: React.ReactNode;
};

/* Variant mapping — matches existing app palette */
const variantClasses: Record<IconButtonVariant, string> = {
  soft: "bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)] hover:bg-[var(--surface)]",
  ghost:
    "bg-transparent border border-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]",
  accent:
    "bg-[var(--accent)] border border-[var(--accent)] text-white hover:opacity-90 shadow-sm active:scale-[0.98]",
  emerald:
    "bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-500 shadow-sm",
  danger:
    "bg-transparent border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-white",
};

const sizeClasses: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-9 w-9 md:h-8 md:w-8", // 36px mobile touch, 32px desktop
  md: "h-10 w-10 md:h-9 md:w-9", // 40px mobile, 36px desktop
  lg: "h-11 w-11 md:h-10 md:w-10",
};

export function IconButton({
  label,
  tooltipPlacement = "top",
  variant = "soft",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  ...props
}: IconButtonProps) {
  const btn = (
    <button
      type="button"
      aria-label={label}
      title={label} // native fallback for accessibility / long-press
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center rounded-xl shrink-0 select-none",
        "transition-all duration-150 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        "touch-manipulation",
        sizeClasses[size],
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      <span className="flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon
        )}
      </span>
    </button>
  );

  // Wrap with viewport-safe Tooltip
  return (
    <Tooltip content={label} placement={tooltipPlacement} maxWidth={220}>
      {btn}
    </Tooltip>
  );
}

/* For anchors that look like buttons (e.g. Next Link) */
export function IconLink({
  label,
  href,
  tooltipPlacement = "top",
  variant = "soft",
  size = "md",
  icon,
  className = "",
  ...props
}: {
  label: string;
  href: string;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  variant?: IconButtonVariant;
  size?: "sm" | "md" | "lg";
  icon: React.ReactNode;
  className?: string;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const a = (
    <a
      href={href}
      aria-label={label}
      title={label}
      className={[
        "inline-flex items-center justify-center rounded-xl shrink-0 select-none",
        "transition-all duration-150 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        "touch-manipulation",
        sizeClasses[size],
        variantClasses[variant],
        className,
      ].join(" ")}
      {...(props as any)}
    >
      <span className="flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
    </a>
  );

  return (
    <Tooltip content={label} placement={tooltipPlacement} maxWidth={220}>
      {a}
    </Tooltip>
  );
}
