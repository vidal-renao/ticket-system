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
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
    >
      {features.map((feature) => {
        const Icon = ICON_MAP[feature.iconName];
        return (
          <motion.div
            key={feature.title}
            variants={item}
            className="group p-6 rounded-2xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] hover:border-indigo-500/40 hover:bg-[var(--color-surface-800)] hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 cursor-default"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:bg-indigo-600/25 group-hover:border-indigo-500/40 transition-colors">
              <Icon className="w-5 h-5 text-indigo-400" />
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
