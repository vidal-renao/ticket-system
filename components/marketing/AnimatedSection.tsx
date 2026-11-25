"use client";

import { MotionConfig, motion } from "framer-motion";
import type { ReactNode } from "react";

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/**
 * Scroll reveal for below-the-fold landing content only. The server renders
 * the hidden starting frame, so anything wrapped here is invisible until
 * hydration: never wrap the hero. `data-reveal` lets LandingPage's <noscript>
 * rule show it when JavaScript is off.
 */
export function AnimatedSection({ children, className, delay = 0 }: AnimatedSectionProps) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        data-reveal=""
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
