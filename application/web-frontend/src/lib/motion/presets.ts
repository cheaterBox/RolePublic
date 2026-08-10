/**
 * Motion presets — isolated so migration is one file.
 * All variants respect `prefers-reduced-motion` via the hook below.
 */
import { useReducedMotion } from "motion/react";

// Reduced-motion gate — use in every animated component.
export function useMotionEnabled(): boolean {
  const shouldReduce = useReducedMotion();
  return !shouldReduce;
}

// Spring for layout shifts (nav, sheets).
export const springSoft = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

export const springSnappy = {
  type: "spring" as const,
  stiffness: 400,
  damping: 28,
};

// Stagger container — use on lists.
export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: "easeOut" as const },
  },
};

export const fadeOnly = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.18, ease: "easeOut" as const },
  },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};
