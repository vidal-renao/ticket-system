"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CanonicalTicketStatus } from "@/lib/ticket-lifecycle";
import type { TicketPriority } from "@/lib/supabase/types";
import {
  OPS_CANONICAL_STATUSES,
  OPS_PRIORITIES,
  type MonthlyFlowPoint,
  type OpsKpis,
} from "@/lib/ops/derive";
import { EmptyState, Panel } from "./primitives";
import { MONO, OPS, PRIORITY_COLOR, STATUS_COLOR } from "./tokens";

interface Slice {
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; fill?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-md border px-2.5 py-1.5 text-[12px]"
      style={{ background: OPS.panel2, borderColor: OPS.line, color: OPS.text, ...MONO }}
    >
      {label && <div style={{ color: OPS.muted }}>{label}</div>}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ background: entry.color ?? entry.fill ?? OPS.slate }}
          />
          <span style={{ color: OPS.muted }}>{entry.name}</span>
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: Slice[] }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-2 text-[12px]">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: item.color }}
          />
          <span className="flex-1 truncate" style={{ color: OPS.muted }}>
            {item.name}
          </span>
          <span style={{ ...MONO, color: OPS.text }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function OpsCharts({
  kpis,
  flow,
  animate,
}: {
  kpis: OpsKpis;
  flow: MonthlyFlowPoint[];
  animate: boolean;
}) {
  const t = useTranslations("ops");

  const statusData: Slice[] = OPS_CANONICAL_STATUSES.filter(
    (status) => kpis.byStatus[status] > 0
  ).map((status: CanonicalTicketStatus) => ({
    name: t(`status.${status}`),
    value: kpis.byStatus[status],
    color: STATUS_COLOR[status],
  }));

  const priorityData: Slice[] = OPS_PRIORITIES.filter(
    (priority) => kpis.byPriority[priority] > 0
  ).map((priority: TicketPriority) => ({
    name: t(`priority.${priority}`),
    value: kpis.byPriority[priority],
    color: PRIORITY_COLOR[priority],
  }));

  const flowData = flow.map((point) => ({
    name: point.key,
    [t("charts.created")]: point.created,
    [t("charts.resolved")]: point.resolved,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title={t("charts.status")}>
        {statusData.length === 0 ? (
          <EmptyState text={t("charts.noData")} />
        ) : (
          <div className="flex items-center gap-3">
            <ResponsiveContainer width="52%" height={168}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  innerRadius={42}
                  outerRadius={68}
                  paddingAngle={3}
                  stroke="none"
                  isAnimationActive={animate}
                >
                  {statusData.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <Legend items={statusData} />
          </div>
        )}
      </Panel>

      <Panel title={t("charts.priority")}>
        {priorityData.length === 0 ? (
          <EmptyState text={t("charts.noData")} />
        ) : (
          <ResponsiveContainer width="100%" height={168}>
            <BarChart data={priorityData} layout="vertical" margin={{ left: 6, right: 12 }}>
              <CartesianGrid horizontal={false} stroke={OPS.line} />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={70}
                tick={{ fill: OPS.muted, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={animate}>
                {priorityData.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title={t("charts.flow")}>
        {flowData.length === 0 ? (
          <EmptyState text={t("charts.noData")} />
        ) : (
          <ResponsiveContainer width="100%" height={168}>
            <BarChart data={flowData} margin={{ left: -18, right: 6 }}>
              <CartesianGrid vertical={false} stroke={OPS.line} />
              <XAxis
                dataKey="name"
                tick={{ fill: OPS.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: OPS.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar
                dataKey={t("charts.created")}
                fill={OPS.blue}
                radius={[3, 3, 0, 0]}
                barSize={16}
                isAnimationActive={animate}
              />
              <Bar
                dataKey={t("charts.resolved")}
                fill={OPS.emerald}
                radius={[3, 3, 0, 0]}
                barSize={16}
                isAnimationActive={animate}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}
