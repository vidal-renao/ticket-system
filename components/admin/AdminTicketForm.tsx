"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { CustomerPicker, type CustomerOption } from "@/components/admin/CustomerPicker";
import { Building2, User, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

interface Team {
  id: string;
  name: string;
}

type Mode = "existing" | "individual" | "company";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

const inputClass = [
  "w-full px-3 py-2.5 rounded-lg text-sm",
  "bg-[var(--color-surface-800)] border border-[var(--color-surface-600)]",
  "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
  "focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30",
  "transition-colors",
].join(" ");

/**
 * Filing a ticket for somebody who is on the phone.
 *
 * The customer may not exist yet, and making the administrator leave to create
 * one -- losing what they have typed -- is how a call turns into a note on
 * paper. So a new customer can be created inline, but *by the existing
 * onboarding endpoints*: this posts to /api/admin/customers/{individual,company}
 * and then files the ticket against the id that comes back. Two calls from
 * here rather than one endpoint that knows how to do both, because onboarding
 * is more than an insert -- reference codes, tenant, invitation, the
 * already-registered-elsewhere path -- and a second implementation of it would
 * drift from the first the way the two customer routes already did once.
 */
export function AdminTicketForm({
  customers,
  teams,
}: {
  customers: CustomerOption[];
  teams: Team[];
}) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("existing");
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Only what the onboarding schemas actually require. Everything else is
  // filled in later from the customer's own profile screen.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [loading, setLoading] = useState(false);

  /**
   * Creates the customer when one is being created, and returns the id the
   * ticket belongs to. Returns null when the caller has already been told what
   * is wrong.
   */
  async function resolveCustomerId(): Promise<string | null> {
    if (mode === "existing") {
      if (!customerId) {
        toast.error("Select the customer this ticket is for");
        return null;
      }
      return customerId;
    }

    const endpoint =
      mode === "individual"
        ? "/api/admin/customers/individual"
        : "/api/admin/customers/company";

    const payload =
      mode === "individual"
        ? { first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim() }
        : {
            legal_name: legalName.trim(),
            contact_person: contactPerson.trim(),
            contact_email: email.trim(),
          };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data?.user?.id) {
      // The onboarding endpoints have a second, deliberate step when the
      // address already belongs to an account elsewhere on this instance.
      // That decision is not one to take blind from a ticket form, so it is
      // handed back to the screen built for it.
      toast.error(data?.error ?? "Could not create the customer", { duration: 7000 });
      return null;
    }

    if (data.access_link) {
      // The onboarding screens hand this over on every alta; losing it here
      // would leave a customer who exists and cannot get in.
      toast.success("Customer created. Their sign-in link is on the user directory.", {
        duration: 6000,
      });
    }

    return data.user.id as string;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setLoading(true);
    try {
      const resolvedId = await resolveCustomerId();
      if (!resolvedId) return;

      const res = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: resolvedId,
          title: title.trim(),
          description: description.trim(),
          priority,
          ...(teamId && { team_id: teamId }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not create the ticket", { duration: 6000 });
        return;
      }

      toast.success("Ticket created for the customer");
      router.push(`/tickets/${data.ticket.id}`);
    } catch {
      toast.error("Could not create the ticket");
    } finally {
      setLoading(false);
    }
  }

  const modeButton = (value: Mode, icon: React.ReactNode, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
        mode === value
          ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/40"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-800)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">Customer</h2>

        <div className="mb-3 flex gap-1 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-1">
          {modeButton("existing", <Users className="h-3.5 w-3.5" />, "Existing")}
          {modeButton("individual", <User className="h-3.5 w-3.5" />, "New individual")}
          {modeButton("company", <Building2 className="h-3.5 w-3.5" />, "New company")}
        </div>

        {mode === "existing" ? (
          <CustomerPicker
            customers={customers}
            selectedId={customerId}
            onSelect={setCustomerId}
            disabled={loading}
          />
        ) : (
          <div className="space-y-3 rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-4">
            {mode === "individual" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  aria-label="First name"
                  required
                  className={inputClass}
                />
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  aria-label="Last name"
                  required
                  className={inputClass}
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Legal / registered name"
                  aria-label="Legal name"
                  required
                  className={inputClass}
                />
                <input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="Contact person"
                  aria-label="Contact person"
                  required
                  className={inputClass}
                />
              </div>
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email"
              required
              className={inputClass}
            />
            <p className="flex items-start gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <UserPlus className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              The account is created through the normal onboarding, invitation included.
              Remaining details can be filled in later from the user directory.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--color-text-secondary)]">Request</h2>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary"
          aria-label="Title"
          required
          maxLength={300}
          className={inputClass}
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What did the customer report?"
          aria-label="Description"
          required
          rows={6}
          maxLength={10000}
          className={inputClass}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={inputClass}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
              Team <span className="text-[var(--color-text-muted)]">(optional)</span>
            </span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputClass}>
              <option value="">Let routing decide</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <Button type="submit" loading={loading} className="w-full">
        Create ticket for customer
      </Button>
    </form>
  );
}
