/**
 * Structure of the admin user manual (/admin/manual).
 *
 * The prose lives in messages/{de,en,es}.json under `manual`; this file only
 * fixes the order of the stages, which keys each stage renders and which
 * screenshots belong to it. Every statement in the manual was checked against
 * the code paths named in the comments below.
 */

/**
 * Customer reopen window and auto-close delay, in hours. Mirrors
 * REOPEN_WINDOW_HOURS (app/api/tickets/[id]/reopen/route.ts and
 * components/tickets/CustomerResolutionActions.tsx) and AUTO_CLOSE_AFTER_HOURS
 * (app/api/cron/sla/route.ts). tests/domain/manual-content.test.ts fails if
 * those sources drift away from this value.
 */
export const MANUAL_CUSTOMER_WINDOW_HOURS = 48;

export type ManualRole = "admin" | "specialist" | "customer";

export interface ManualImage {
  src: string;
  width: number;
  height: number;
  /** Key under `manual.stages.<stage>` holding the alt text. */
  altKey: string;
}

export interface ManualStage {
  id: "intake" | "routing" | "execution" | "adminOk" | "resolved" | "customerOk";
  roles: ManualRole[];
  /** Keys under `manual.stages.<stage>`, rendered as an ordered list. */
  steps: string[];
  images: ManualImage[];
}

export const MANUAL_STAGES: ManualStage[] = [
  {
    // app/api/admin/tickets/route.ts, components/admin/AdminTicketForm.tsx
    id: "intake",
    roles: ["admin", "customer"],
    steps: ["step1", "step2", "step3"],
    images: [
      { src: "/manual/01-intake-form.webp", width: 760, height: 994, altKey: "img1Alt" },
      { src: "/manual/02-ticket-created-admin.webp", width: 810, height: 565, altKey: "img2Alt" },
    ],
  },
  {
    // lib/ai/triage-runner.ts (findAutomaticAssignment), lib/ticket-routing.ts,
    // components/admin/AdminTicketActions.tsx, lib/ticket-workflow.ts
    id: "routing",
    roles: ["admin"],
    steps: ["step1", "step2", "step3"],
    images: [{ src: "/manual/03-admin-queue.webp", width: 1010, height: 668, altKey: "img1Alt" }],
  },
  {
    // components/tickets/TicketWorkflowActions.tsx, components/tickets/TicketComments.tsx,
    // app/api/comments/route.ts
    id: "execution",
    roles: ["specialist"],
    steps: ["step1", "step2", "step3", "step4"],
    images: [
      { src: "/manual/04-agent-start-work.webp", width: 810, height: 500, altKey: "img1Alt" },
      { src: "/manual/05-agent-in-progress.webp", width: 540, height: 428, altKey: "img2Alt" },
      { src: "/manual/06-agent-reply-and-note.webp", width: 518, height: 370, altKey: "img3Alt" },
    ],
  },
  {
    // app/api/tickets/[id]/review/route.ts, lib/ticket-workflow.ts
    id: "adminOk",
    roles: ["specialist", "admin"],
    steps: ["step1", "step2", "step3", "step4"],
    images: [
      { src: "/manual/07-agent-ready-confirm.webp", width: 518, height: 228, altKey: "img1Alt" },
      { src: "/manual/08-agent-submitted-review.webp", width: 540, height: 418, altKey: "img2Alt" },
      { src: "/manual/09-admin-review.webp", width: 540, height: 502, altKey: "img3Alt" },
      { src: "/manual/10-admin-approve-confirm.webp", width: 540, height: 588, altKey: "img4Alt" },
    ],
  },
  {
    // app/api/tickets/[id]/review/route.ts, app/api/tickets/[id]/route.ts (resolve guard)
    id: "resolved",
    roles: ["admin"],
    steps: ["step1", "step2", "step3"],
    images: [{ src: "/manual/11-admin-resolved.webp", width: 540, height: 438, altKey: "img1Alt" }],
  },
  {
    // components/tickets/CustomerResolutionActions.tsx, app/api/tickets/[id]/confirm/route.ts,
    // app/api/tickets/[id]/reopen/route.ts, app/api/cron/sla/route.ts, vercel.json
    id: "customerOk",
    roles: ["customer"],
    steps: ["step1", "step2", "step3", "step4", "step5"],
    images: [
      { src: "/manual/12-customer-confirm.webp", width: 262, height: 206, altKey: "img1Alt" },
      { src: "/manual/13-customer-closed.webp", width: 540, height: 276, altKey: "img2Alt" },
      { src: "/manual/14-customer-my-tickets.webp", width: 912, height: 748, altKey: "img3Alt" },
    ],
  },
];

/** Keys under `manual.goodToKnow`, in display order. */
export const MANUAL_GOOD_TO_KNOW = ["sla", "ai", "internal", "forceClose", "labels"] as const;
