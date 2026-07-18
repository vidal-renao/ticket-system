"use client";

import { motion } from "framer-motion";
import { Zap, Shield, Globe, BarChart3, Clock, Star } from "lucide-react";

const ICON_MAP = {
  Zap, Shield, Globe, BarChart3, Clock, Star,
} as const;

type IconName = keyof typeof ICON_MAP;

interface FeatureItem {
  iconName: IconName;
  title: string;
  desc: string;
}

interface AnimatedFeatureGridProps {
  features: FeatureItem[];
}

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

export function AnimatedFeatureGrid({ features }: AnimatedFeatureGridProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      className="grid grid-cols-1 overflow-hidden rounded-2xl border border-white/8 bg-white/8 md:grid-cols-2 lg:grid-cols-3"
    >
      {features.map((feature) => {
        const Icon = ICON_MAP[feature.iconName];
        return (
          <motion.div
            key={feature.title}
            variants={item}
            className="group bg-[var(--color-surface-900)] p-6 transition-colors duration-300 hover:bg-[var(--color-surface-850)] cursor-default"
          >
            <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-brand-400)]/20 bg-[var(--color-brand-500)]/8 transition-colors group-hover:bg-[var(--color-brand-500)]/16">
              <Icon className="h-5 w-5 text-[var(--color-brand-300)]" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
              {feature.title}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              {feature.desc}
            </p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
