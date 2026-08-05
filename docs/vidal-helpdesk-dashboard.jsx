import React, { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Activity, Ticket as TicketIcon, ShieldCheck, AlertTriangle,
  CheckCircle2, Clock, MailCheck, Search, Radio, ChevronDown, Database,
} from "lucide-react";

/* ============================================================
   VIDAL ECOSYSTEM — Helpdesk SLA Console
   Org: Vidal Real Estate (enterprise) · project focgfmhgfmhmcbywwsej
   Snapshot: 2026-07-28. Datos reales de public.tickets + helpdesk.audit_runs.
   Para datos en vivo, ver el panel "Conectar datos en vivo" al final.
   ============================================================ */

// ---- PALETA (console suizo: slate profundo + oro de marca + estados funcionales)
const C = {
  bg: "#0B0F14", panel: "#121A23", panel2: "#0F161E", line: "#1E2A36",
  text: "#E6EDF3", muted: "#8A99A8", faint: "#5A6a78",
  gold: "#E0A82E",           // acento de marca (compliance / firma)
  emerald: "#10B981", blue: "#3B82F6", amber: "#F59E0B",
  red: "#EF4444", slate: "#64748B",
};

const FONT = "'Segoe UI', ui-sans-serif, system-ui, -apple-system, sans-serif";
const MONO = "'Cascadia Code', ui-monospace, 'Consolas', 'SF Mono', monospace";

// ---- DATOS REALES (snapshot 2026-07-28) --------------------------------------
const TICKETS = [
  { n: 73, title: "I can not setup my VPN",                        status: "in_progress", priority: "medium",   src: "portal", lang: "en", created: "2026-07-19T12:04:09Z", firstResp: null,                  resolved: null,                  closed: null,                  slaBreached: false },
  { n: 67, title: "I can not download my SF",                      status: "closed",      priority: "high",     src: "portal", lang: "en", created: "2026-07-18T18:39:05Z", firstResp: null,                  resolved: "2026-07-19T07:11:52Z", closed: "2026-07-19T08:23:53Z", slaBreached: false },
  { n: 66, title: "I can not use my DB Software",                  status: "open",        priority: "critical", src: "portal", lang: "en", created: "2026-04-29T01:40:43Z", firstResp: "2026-04-29T01:47:32Z", resolved: null,                  closed: null,                  slaBreached: false },
  { n: 65, title: "Error crítico en login (SLA Risk)",            status: "closed",      priority: "high",     src: "portal", lang: "en", created: "2026-04-29T01:17:49Z", firstResp: "2026-07-19T06:46:07Z", resolved: "2026-07-19T09:33:23Z", closed: "2026-07-19T09:33:53Z", slaBreached: false },
  { n: 64, title: "I can not use my DB Software",                  status: "open",        priority: "medium",   src: "portal", lang: "en", created: "2026-04-28T12:30:39Z", firstResp: null,                  resolved: null,                  closed: null,                  slaBreached: false },
  { n: 61, title: "El ordenador no enciende desde esta mañana",   status: "open",        priority: "high",     src: "portal", lang: "de", created: "2026-04-27T14:43:50Z", firstResp: "2026-04-27T14:50:55Z", resolved: null,                  closed: null,                  slaBreached: false },
  { n: 60, title: "NO puedo instalar una aplicacion de contabilidad", status: "open",    priority: "medium",   src: "portal", lang: "en", created: "2026-04-26T22:25:09Z", firstResp: null,                  resolved: null,                  closed: null,                  slaBreached: false },
];

// Feed de ciclo de vida derivado de los timestamps reales
const EVENTS = [
  { n: 73, evt: "created",        at: "2026-07-19T12:04:09Z", priority: "medium" },
  { n: 65, evt: "closed",         at: "2026-07-19T09:33:53Z", priority: "high" },
  { n: 65, evt: "resolved",       at: "2026-07-19T09:33:23Z", priority: "high" },
  { n: 67, evt: "closed",         at: "2026-07-19T08:23:53Z", priority: "high" },
  { n: 67, evt: "resolved",       at: "2026-07-19T07:11:52Z", priority: "high" },
  { n: 65, evt: "first_response", at: "2026-07-19T06:46:07Z", priority: "high" },
  { n: 67, evt: "created",        at: "2026-07-18T18:39:05Z", priority: "high" },
  { n: 66, evt: "first_response", at: "2026-04-29T01:47:32Z", priority: "critical" },
  { n: 66, evt: "created",        at: "2026-04-29T01:40:43Z", priority: "critical" },
  { n: 65, evt: "created",        at: "2026-04-29T01:17:49Z", priority: "high" },
  { n: 64, evt: "created",        at: "2026-04-28T12:30:39Z", priority: "medium" },
  { n: 61, evt: "first_response", at: "2026-04-27T14:50:55Z", priority: "high" },
  { n: 61, evt: "created",        at: "2026-04-27T14:43:50Z", priority: "high" },
  { n: 60, evt: "created",        at: "2026-04-26T22:25:09Z", priority: "medium" },
];

// Panel "Companies" tal cual el último SLA report (helpdesk.audit_runs, 28 Jul)
const COMPANIES = [
  { name: "Pharma Cosmetics", active: 1 },
  { name: "Unassigned",       active: 4 },
];

const AUDIT = {
  lastDelivery: "2026-07-28T20:31:28Z",
  status: "provider_confirmed",
  recipient: "htcpacoxo31@gmail.com",
  cron: "0 6 * * *",
  compliance: 100,
};

// título del ticket por número (para el feed)
const titleOf = Object.fromEntries(TICKETS.map((t) => [t.n, t.title]));

// ---- META de estados / prioridades / eventos --------------------------------
const STATUS = {
  open:        { label: "Abierto",     color: C.amber },
  in_progress: { label: "En progreso", color: C.blue },
  closed:      { label: "Cerrado",     color: C.slate },
};
const PRIORITY = {
  critical: { label: "Crítica", color: C.red },
  high:     { label: "Alta",    color: C.amber },
  medium:   { label: "Media",   color: C.blue },
  low:      { label: "Baja",    color: C.slate },
};
const EVT = {
  created:        { label: "Creado",           color: C.blue,    Icon: TicketIcon },
  first_response: { label: "Primera respuesta", color: C.gold,    Icon: Clock },
  resolved:       { label: "Resuelto",         color: C.emerald, Icon: CheckCircle2 },
  closed:         { label: "Cerrado",          color: C.slate,   Icon: ShieldCheck },
};

// ---- helpers de fecha (Europe/Zurich) ---------------------------------------
const NOW = new Date("2026-07-28T21:05:00Z");
const zh = (iso, opts) =>
  new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Zurich", ...opts });
const fmtDate = (iso) => (iso ? zh(iso, { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtTime = (iso) => (iso ? zh(iso, { hour: "2-digit", minute: "2-digit" }) : "");
function ago(iso) {
  const s = (NOW - new Date(iso)) / 1000;
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600), m = Math.floor(s / 60);
  if (d >= 30) return `hace ${Math.floor(d / 30)} mes${Math.floor(d / 30) > 1 ? "es" : ""}`;
  if (d >= 1) return `hace ${d} día${d > 1 ? "s" : ""}`;
  if (h >= 1) return `hace ${h} h`;
  if (m >= 1) return `hace ${m} min`;
  return "ahora";
}

export default function App() {
  const [tab, setTab] = useState("overview");
  const [fStatus, setFStatus] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [q, setQ] = useState("");
  const [showConnect, setShowConnect] = useState(false);

  // ---- métricas
  const k = useMemo(() => {
    const active = TICKETS.filter((t) => t.status !== "closed");
    const by = (arr, key) =>
      arr.reduce((a, t) => ((a[t[key]] = (a[t[key]] || 0) + 1), a), {});
    return {
      total: TICKETS.length,
      active: active.length,
      open: TICKETS.filter((t) => t.status === "open").length,
      inProgress: TICKETS.filter((t) => t.status === "in_progress").length,
      closed: TICKETS.filter((t) => t.status === "closed").length,
      breaches: TICKETS.filter((t) => t.slaBreached).length,
      byStatus: by(TICKETS, "status"),
      byPriority: by(TICKETS, "priority"),
      byLang: by(TICKETS, "lang"),
      vip: 0,
    };
  }, []);

  const statusData = Object.entries(k.byStatus).map(([s, v]) => ({
    name: STATUS[s]?.label || s, value: v, color: STATUS[s]?.color || C.slate,
  }));
  const priorityData = ["critical", "high", "medium", "low"]
    .filter((p) => k.byPriority[p])
    .map((p) => ({ name: PRIORITY[p].label, value: k.byPriority[p], color: PRIORITY[p].color }));

  // creados vs resueltos por mes
  const flow = useMemo(() => {
    const b = {};
    const m = (iso) => zh(iso, { month: "short", year: "2-digit" });
    TICKETS.forEach((t) => {
      const key = m(t.created);
      b[key] = b[key] || { name: key, Creados: 0, Resueltos: 0 };
      b[key].Creados++;
      if (t.resolved) {
        const rk = m(t.resolved);
        b[rk] = b[rk] || { name: rk, Creados: 0, Resueltos: 0 };
        b[rk].Resueltos++;
      }
    });
    return Object.values(b);
  }, []);

  const filtered = TICKETS.filter(
    (t) =>
      (fStatus === "all" || t.status === fStatus) &&
      (fPriority === "all" || t.priority === fPriority) &&
      (q === "" || t.title.toLowerCase().includes(q.toLowerCase()) || String(t.n).includes(q))
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: FONT }}>
      <style>{css}</style>

      {/* ---------- TOP BAR ---------- */}
      <header style={{ borderBottom: `1px solid ${C.line}`, padding: "16px 22px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontWeight: 700, letterSpacing: 1.5, fontSize: 15 }}>
            VIDAL<span style={{ color: C.gold }}> ECOSYSTEM</span>
          </span>
          <span style={{ color: C.faint }}>·</span>
          <span style={{ color: C.muted, fontSize: 13, fontFamily: MONO }}>Helpdesk SLA Console</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: C.muted }}>
            Org <b style={{ color: C.text }}>Vidal Real Estate</b>
          </span>
          <span className="badge" style={{ borderColor: C.emerald, color: C.emerald }}>
            <ShieldCheck size={12} /> Swiss DSG
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.muted, fontFamily: MONO }}>
            <span className="pulse" /> cron 06:00 UTC · última entrega {fmtDate(AUDIT.lastDelivery)} {fmtTime(AUDIT.lastDelivery)}
          </span>
        </div>
      </header>

      {/* ---------- OPS RIBBON ---------- */}
      <div className="ribbon">
        <Metric label="Compliance" value={`${AUDIT.compliance}%`} color={C.gold} big />
        <Metric label="Activos" value={k.active} />
        <Metric label="Abiertos" value={k.open} color={C.amber} />
        <Metric label="En progreso" value={k.inProgress} color={C.blue} />
        <Metric label="Cerrados" value={k.closed} color={C.slate} />
        <Metric label="SLA breaches" value={k.breaches} color={k.breaches ? C.red : C.emerald} />
        <Metric label="VIP risks" value={k.vip} color={C.emerald} />
        <Metric label="Total" value={k.total} />
      </div>

      {/* ---------- TABS ---------- */}
      <nav style={{ display: "flex", gap: 4, padding: "0 22px", borderBottom: `1px solid ${C.line}` }}>
        {[
          ["overview", "Resumen", ShieldCheck],
          ["tickets", "Tickets", TicketIcon],
          ["activity", "Actividad", Activity],
        ].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className="tab"
            style={{ color: tab === id ? C.text : C.muted,
              borderBottom: `2px solid ${tab === id ? C.gold : "transparent"}` }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      <main style={{ padding: 22, maxWidth: 1180, margin: "0 auto" }}>
        {/* ============ OVERVIEW ============ */}
        {tab === "overview" && (
          <>
            <div className="grid3">
              <Card title="Estado de tickets">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ResponsiveContainer width="55%" height={168}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" innerRadius={44} outerRadius={70} paddingAngle={3} stroke="none">
                        {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<TT />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <Legend items={statusData} />
                </div>
              </Card>

              <Card title="Prioridad">
                <ResponsiveContainer width="100%" height={168}>
                  <BarChart data={priorityData} layout="vertical" margin={{ left: 6, right: 12 }}>
                    <CartesianGrid horizontal={false} stroke={C.line} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={62}
                      tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<TT />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                      {priorityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="Flujo mensual · creados vs resueltos">
                <ResponsiveContainer width="100%" height={168}>
                  <BarChart data={flow} margin={{ left: -18, right: 6 }}>
                    <CartesianGrid vertical={false} stroke={C.line} />
                    <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<TT />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="Creados" fill={C.blue} radius={[3, 3, 0, 0]} barSize={16} />
                    <Bar dataKey="Resueltos" fill={C.emerald} radius={[3, 3, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <div className="grid3" style={{ marginTop: 16 }}>
              <Card title="Companies · último SLA report">
                {COMPANIES.map((c) => (
                  <Row key={c.name} left={c.name}
                    right={<span style={{ fontFamily: MONO }}>{c.active} activo{c.active > 1 ? "s" : ""}</span>} />
                ))}
              </Card>

              <Card title="VIP risks">
                <Empty ok icon={ShieldCheck} text="Sin riesgos VIP detectados" />
              </Card>

              <Card title="Priority actions">
                <Empty ok icon={CheckCircle2} text="Sin seguimientos prioritarios" />
              </Card>
            </div>

            {/* Audit strip */}
            <Card title="Auditoría SLA · entrega" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
                <AuditItem icon={MailCheck} color={C.emerald} label="Última entrega"
                  value={`${fmtDate(AUDIT.lastDelivery)} · ${fmtTime(AUDIT.lastDelivery)} CEST`} />
                <AuditItem icon={CheckCircle2} color={C.emerald} label="Estado" value="provider_confirmed · sent" mono />
                <AuditItem icon={Clock} color={C.gold} label="Programación" value="0 6 * * * (diario 06:00 UTC)" mono />
                <AuditItem icon={Radio} color={C.emerald} label="Incidente 4A.16" value="cerrado" />
              </div>
            </Card>
          </>
        )}

        {/* ============ TICKETS ============ */}
        {tab === "tickets" && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
              <div className="search">
                <Search size={14} color={C.muted} />
                <input placeholder="Buscar título o nº…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Chips value={fStatus} set={setFStatus} all="Todos"
                opts={[["open", "Abiertos"], ["in_progress", "En progreso"], ["closed", "Cerrados"]]} />
              <Chips value={fPriority} set={setFPriority} all="Toda prioridad"
                opts={[["critical", "Crítica"], ["high", "Alta"], ["medium", "Media"]]} />
              <span style={{ color: C.faint, fontSize: 12, marginLeft: "auto", fontFamily: MONO }}>
                {filtered.length}/{TICKETS.length}
              </span>
            </div>

            <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.panel2, color: C.muted, textAlign: "left" }}>
                    <Th>#</Th><Th>Título</Th><Th>Estado</Th><Th>Prioridad</Th>
                    <Th>Idioma</Th><Th>Creado</Th><Th>SLA</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.n} className="trow">
                      <Td><span style={{ fontFamily: MONO, color: C.muted }}>#{t.n}</span></Td>
                      <Td><span style={{ color: C.text }}>{t.title}</span></Td>
                      <Td><Tag {...STATUS[t.status]} /></Td>
                      <Td><Tag {...PRIORITY[t.priority]} dot /></Td>
                      <Td><span style={{ fontFamily: MONO, textTransform: "uppercase", color: C.muted }}>{t.lang}</span></Td>
                      <Td><span style={{ color: C.muted }}>{fmtDate(t.created)}</span></Td>
                      <Td>
                        {t.slaBreached
                          ? <span style={{ color: C.red, display: "flex", alignItems: "center", gap: 5 }}><AlertTriangle size={13} /> breach</span>
                          : <span style={{ color: C.emerald, display: "flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={13} /> ok</span>}
                      </Td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: C.faint }}>
                      Ningún ticket con esos filtros.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ============ ACTIVITY ============ */}
        {tab === "activity" && (
          <Card title="Ciclo de vida · feed de eventos">
            <div style={{ position: "relative", paddingLeft: 8 }}>
              {EVENTS.map((e, i) => {
                const meta = EVT[e.evt];
                const Icon = meta.Icon;
                return (
                  <div key={i} className="feedrow">
                    <div className="feedline" style={{ background: i === EVENTS.length - 1 ? "transparent" : C.line }} />
                    <div className="feeddot" style={{ borderColor: meta.color, color: meta.color }}>
                      <Icon size={13} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ color: meta.color, fontWeight: 600, fontSize: 13 }}>{meta.label}</span>
                        <span style={{ fontFamily: MONO, color: C.muted, fontSize: 12 }}>#{e.n}</span>
                        <span style={{ color: C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {titleOf[e.n]}
                        </span>
                        <Tag {...PRIORITY[e.priority]} dot small />
                      </div>
                      <div style={{ color: C.faint, fontSize: 12, fontFamily: MONO, marginTop: 2 }}>
                        {fmtDate(e.at)} · {fmtTime(e.at)} · {ago(e.at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ---------- CONECTAR DATOS EN VIVO ---------- */}
        <div style={{ marginTop: 22 }}>
          <button onClick={() => setShowConnect((s) => !s)} className="connectBtn">
            <Database size={14} /> Conectar datos en vivo (Supabase Realtime)
            <ChevronDown size={14} style={{ transform: showConnect ? "rotate(180deg)" : "none", transition: ".2s" }} />
          </button>
          {showConnect && (
            <div className="codebox">
              <p style={{ color: C.muted, margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.6 }}>
                Snapshot del 28 Jul. Para que el feed se actualice <b>cada vez que se crea/resuelve un ticket</b>,
                sustituye el array <code>TICKETS</code> por una query + suscripción Realtime:
              </p>
              <pre>{CODE}</pre>
            </div>
          )}
        </div>

        <footer style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.line}`,
          color: C.faint, fontSize: 11.5, fontFamily: MONO, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>Snapshot 2026-07-28 · focgfmhgfmhmcbywwsej · public.tickets + helpdesk.audit_runs</span>
          <span>Swiss DSG Compliant | VIDAL Helpdesk AI Audit</span>
        </footer>
      </main>
    </div>
  );
}

/* ---------- subcomponentes ---------- */
function Metric({ label, value, color = C.text, big }) {
  return (
    <div style={{ padding: "12px 20px", borderRight: `1px solid ${C.line}`, minWidth: 92 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.faint }}>{label}</div>
      <div style={{ fontFamily: MONO, fontWeight: 700, color, fontSize: big ? 26 : 22, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}
function Card({ title, children, style }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, ...style }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 12.5, letterSpacing: .6, textTransform: "uppercase", color: C.muted, fontWeight: 600 }}>{title}</h3>
      {children}
    </section>
  );
}
function Legend({ items }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((d) => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color }} />
          <span style={{ color: C.muted, flex: 1 }}>{d.name}</span>
          <span style={{ fontFamily: MONO, color: C.text }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}
function Row({ left, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
      <span style={{ color: C.text }}>{left}</span>
      <span style={{ color: C.muted }}>{right}</span>
    </div>
  );
}
function Empty({ text, icon: Icon, ok }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "14px 0", color: ok ? C.emerald : C.muted, fontSize: 13 }}>
      <Icon size={16} /> {text}
    </div>
  );
}
function Tag({ label, color, dot, small }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
      padding: small ? "1px 7px" : "3px 9px", borderRadius: 20, fontSize: small ? 11 : 12,
      background: `${color}1a`, color, border: `1px solid ${color}33`, whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />} {label}
    </span>
  );
}
function AuditItem({ icon: Icon, color, label, value, mono }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Icon size={17} color={color} />
      <div>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: .5, color: C.faint }}>{label}</div>
        <div style={{ fontSize: 13, color: C.text, fontFamily: mono ? MONO : FONT }}>{value}</div>
      </div>
    </div>
  );
}
function Chips({ value, set, opts, all }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {[["all", all], ...opts].map(([v, l]) => (
        <button key={v} onClick={() => set(v)} className="chip"
          style={{ color: value === v ? C.bg : C.muted, background: value === v ? C.gold : "transparent",
            borderColor: value === v ? C.gold : C.line }}>
          {l}
        </button>
      ))}
    </div>
  );
}
function TT({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 11px", fontSize: 12.5 }}>
      <span style={{ color: C.muted }}>{p.name || p.payload.name}: </span>
      <b style={{ color: C.text, fontFamily: MONO }}>{p.value}</b>
    </div>
  );
}
const Th = ({ children }) => <th style={{ padding: "11px 14px", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5 }}>{children}</th>;
const Td = ({ children }) => <td style={{ padding: "11px 14px", borderTop: `1px solid ${C.line}` }}>{children}</td>;

/* ---------- snippet de producción (mostrado en el panel) ---------- */
const CODE = `import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// carga inicial
const { data } = await sb.from('tickets')
  .select('ticket_number,title,status,priority,detected_language,created_at,resolved_at,sla_breached')
  .is('deleted_at', null).order('created_at', { ascending: false })

// realtime: se dispara en cada INSERT/UPDATE de tickets
sb.channel('tickets-live')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'tickets' },
      (payload) => setTickets(prev => applyChange(prev, payload)))
  .subscribe()`;

/* ---------- CSS ---------- */
const css = `
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { height: 8px; width: 8px; }
  ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 8px; }
  .ribbon { display: flex; flex-wrap: wrap; background: ${C.panel2};
    border-bottom: 1px solid ${C.line}; }
  .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
    padding: 2px 9px; border-radius: 20px; border: 1px solid; }
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: ${C.emerald};
    box-shadow: 0 0 0 0 ${C.emerald}; animation: pulse 2.4s infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 ${C.emerald}66; } 70% { box-shadow: 0 0 0 7px ${C.emerald}00; } 100% { box-shadow: 0 0 0 0 ${C.emerald}00; } }
  @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
  .tab { display: inline-flex; align-items: center; gap: 7px; background: none; border: none;
    cursor: pointer; padding: 14px 16px; font-size: 13.5px; font-family: ${FONT};
    margin-bottom: -1px; transition: color .15s; }
  .tab:hover { color: ${C.text} !important; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 860px) { .grid3 { grid-template-columns: 1fr; } .ribbon > div { flex: 1 1 40%; } }
  .trow { transition: background .12s; }
  .trow:hover { background: ${C.panel2}; }
  .search { display: flex; align-items: center; gap: 8px; background: ${C.panel};
    border: 1px solid ${C.line}; border-radius: 8px; padding: 7px 11px; }
  .search input { background: none; border: none; outline: none; color: ${C.text};
    font-family: ${FONT}; font-size: 13px; width: 190px; }
  .chip { cursor: pointer; padding: 6px 12px; border-radius: 20px; border: 1px solid;
    font-size: 12px; font-family: ${FONT}; transition: .12s; }
  .chip:hover { border-color: ${C.gold}; }
  .feedrow { position: relative; display: flex; gap: 14px; padding: 6px 0 16px; }
  .feedline { position: absolute; left: 12px; top: 26px; bottom: 0; width: 2px; }
  .feeddot { width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid;
    display: flex; align-items: center; justify-content: center;
    background: ${C.bg}; z-index: 1; flex-shrink: 0; }
  .connectBtn { display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    background: ${C.panel}; border: 1px solid ${C.line}; color: ${C.muted};
    padding: 9px 14px; border-radius: 9px; font-size: 13px; font-family: ${FONT}; transition: .15s; }
  .connectBtn:hover { border-color: ${C.gold}; color: ${C.text}; }
  .codebox { margin-top: 10px; background: ${C.panel2}; border: 1px solid ${C.line};
    border-radius: 10px; padding: 14px; }
  .codebox code { background: ${C.line}; padding: 1px 5px; border-radius: 4px; font-family: ${MONO}; font-size: 12px; }
  .codebox pre { margin: 0; overflow-x: auto; font-family: ${MONO}; font-size: 12px;
    line-height: 1.55; color: #B9C4CF; }
`;
