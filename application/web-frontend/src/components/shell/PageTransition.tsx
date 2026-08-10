"use client";

import { motion } from "motion/react";
import { useMotionEnabled } from "@/lib/motion/presets";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const enabled = useMotionEnabled();

  if (!enabled) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
