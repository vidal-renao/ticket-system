"use client";

import { motion } from "framer-motion";
import { Server, Network, Activity, ExternalLink, Shield } from "lucide-react";

const pillars = [
  {
    num: "01",
    label: "BACKEND",
    icon: Server,
    title: "HelpDesk AI",
    desc: "Multi-tenant enterprise helpdesk built on Next.js 15, Supabase PostgreSQL, and Claude AI. Includes SLA workflows, RBAC, AI triage, and multilingual support.",
    badge: "DSG/nDSG Compliant",
    badgeIcon: Shield,
    href: "https://ticket-system-sigma-pink.vercel.app",
    color: "indigo",
  },
  {
    num: "02",
    label: "BRIDGE",
    icon: Network,
    title: "MCP Server",
    desc: "7 AI tools exposed via Model Context Protocol over HTTP/SSE. Enables AI agents and Claude Desktop to query, create, and update tickets programmatically.",
    badge: "7 MCP Tools",
    badgeIcon: null,
    href: "https://vidal-helpdesk-mcp.vercel.app",
    color: "violet",
  },
  {
    num: "03",
    label: "AUTOMATION",
    icon: Activity,
    title: "Audit Engine",
    desc: "GitHub Actions fires hourly. Vercel function queries Supabase, computes SLA compliance, and delivers executive HTML reports via Resend — fully autonomous.",
    badge: "Hourly CI/CD",
    badgeIcon: null,
    href: "https://github.com/vidal-renao",
    color: "emerald",
  },
] as const;

const colorMap = {
  indigo: {
    border: "hover:border-indigo-500/40",
    icon: "bg-indigo-600/10 border-indigo-500/20 group-hover:bg-indigo-600/25 group-hover:border-indigo-500/40",
    iconText: "text-indigo-400",
    badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
    num: "text-indigo-500/40",
    shadow: "hover:shadow-indigo-500/8",
  },
  violet: {
    border: "hover:border-violet-500/40",
    icon: "bg-violet-600/10 border-violet-500/20 group-hover:bg-violet-600/25 group-hover:border-violet-500/40",
    iconText: "text-violet-400",
    badge: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    num: "text-violet-500/40",
    shadow: "hover:shadow-violet-500/8",
  },
  emerald: {
    border: "hover:border-emerald-500/40",
    icon: "bg-emerald-600/10 border-emerald-500/20 group-hover:bg-emerald-600/25 group-hover:border-emerald-500/40",
    iconText: "text-emerald-400",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    num: "text-emerald-500/40",
    shadow: "hover:shadow-emerald-500/8",
  },
} as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const card = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export function PillarsSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-16"
        >
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">
            Architecture
          </p>
          <h2 className="text-3xl font-bold text-[var(--color-text-primary)]">
            Three pillars, one ecosystem
          </h2>
          <p className="mt-4 text-sm text-[var(--color-text-muted)] max-w-lg mx-auto leading-relaxed">
            Backend · Bridge · Automation — each layer designed to operate independently and compose seamlessly.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {pillars.map((pillar) => {
            const cl = colorMap[pillar.color];
            const Icon = pillar.icon;
            const BadgeIcon = pillar.badgeIcon;
            return (
              <motion.a
                key={pillar.num}
                variants={card}
                href={pillar.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative flex flex-col p-7 rounded-2xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] ${cl.border} hover:-translate-y-1.5 hover:shadow-xl ${cl.shadow} transition-all duration-300 no-underline`}
              >
                {/* Number */}
                <span className={`absolute top-5 right-6 text-4xl font-black ${cl.num} select-none`}>
                  {pillar.num}
                </span>

                {/* Label */}
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] mb-4">
                  {pillar.label}
                </span>

                {/* Icon */}
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-5 transition-colors ${cl.icon}`}>
                  <Icon className={`w-5 h-5 ${cl.iconText}`} />
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                  {pillar.title}
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>

                {/* Desc */}
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed flex-1">
                  {pillar.desc}
                </p>

                {/* Badge */}
                <div className="mt-5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold ${cl.badge}`}>
                    {BadgeIcon && <BadgeIcon className="w-3 h-3" />}
                    {pillar.badge}
                  </span>
                </div>
              </motion.a>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
