"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { toast } from "sonner";
import { passwordSchema } from "@/lib/validation/security";

export interface Team {
  id: string;
  name: string;
}

interface CreateUserModalProps {
  open: boolean;
  teams: Team[];
  onClose: () => void;
  onSuccess: () => void;
}

const input =
  "min-h-11 w-full rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-surface-500)] focus:border-[var(--color-brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20";
const label = "mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]";

// Employee/agent onboarding only. Customer onboarding (individual or
// company) is a separate, dedicated flow -- see
// /admin/customers/individual/new and /admin/customers/company/new -- with
// its own routes, Zod schemas and Server Actions (Phase 4A.14 ADR-015),
// rather than a second type-toggle branch bolted onto this modal.
export function CreateUserModal({
  open,
  teams,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const fieldId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localTeams, setLocalTeams] = useState<Team[]>(teams);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamSaving, setTeamSaving] = useState(false);

  useEffect(() => {
    setLocalTeams(teams);
  }, [teams]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPassword("");
    setShowPwd(false);
    setTeamId("");
    setSpecialty("");
    setError(null);
    setCreatingTeam(false);
    setNewTeamName("");
  }, [open]);

  async function handleCreateTeam() {
    const trimmed = newTeamName.trim();
    if (!trimmed) return;
    setTeamSaving(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not create team");
        return;
      }
      setLocalTeams((prev) => [...prev, data.team].sort((a, b) => a.name.localeCompare(b.name)));
      setTeamId(data.team.id);
      setCreatingTeam(false);
      setNewTeamName("");
      toast.success(`Team "${data.team.name}" created`);
    } catch {
      toast.error("Network error — check the connection and try again");
    } finally {
      setTeamSaving(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => nameInputRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Password does not meet policy");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          type: "agent",
          team_id: teamId || undefined,
          specialty: specialty || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Account could not be created");
        return;
      }
      const adopted = Number(data.adoptedTicketCount ?? 0);
      toast.success(
        adopted > 0
          ? `Employee created — inherited ${adopted} unassigned ticket${adopted === 1 ? "" : "s"} from the backlog`
          : "Employee created successfully"
      );
      onSuccess();
      onClose();
    } catch {
      setError("Network error — check the connection and try again");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/70 p-0 backdrop-blur-sm sm:p-4">
      <button
        type="button"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close dialog"
      />

      <div className="flex min-h-full items-end justify-center sm:items-center">
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="relative flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.5rem] border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] shadow-[0_28px_90px_rgba(0,0,0,0.65)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[1.5rem]"
        >
          <div className="h-1 shrink-0 bg-gradient-to-r from-[var(--color-brand-500)] via-[var(--color-brand-300)] to-transparent" />

          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-surface-700)] px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex min-w-0 gap-3.5">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-brand-400)]/25 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-200)]">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-200)]">
                  Identity provisioning
                </p>
                <h2 id={titleId} className="mt-1 text-lg font-semibold text-[var(--color-text-primary)] sm:text-xl">
                  New employee
                </h2>
                <p id={descriptionId} className="mt-1 max-w-lg text-xs leading-5 text-[var(--color-text-muted)] sm:text-sm">
                  Create a specialist account and define how work is routed.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-700)] hover:text-[var(--color-text-primary)]"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${fieldId}-name`} className={label}>Full name</label>
                  <input
                    ref={nameInputRef}
                    id={`${fieldId}-name`}
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Jane Smith"
                    className={input}
                  />
                </div>

                <div>
                  <label htmlFor={`${fieldId}-email`} className={label}>Work email</label>
                  <input
                    id={`${fieldId}-email`}
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="jane@company.ch"
                    className={input}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor={`${fieldId}-password`} className={label}>Temporary password</label>
                  <div className="relative">
                    <input
                      id={`${fieldId}-password`}
                      required
                      type={showPwd ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="12+ characters with upper, lower, number and symbol"
                      minLength={12}
                      className={`${input} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((visible) => !visible)}
                      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-700)] hover:text-[var(--color-text-secondary)]"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <PasswordStrengthMeter password={password} className="mt-2" />
                </div>

                <div>
                  <label htmlFor={`${fieldId}-team`} className={label}>Team</label>
                  <select
                    id={`${fieldId}-team`}
                    value={creatingTeam ? "__create__" : teamId}
                    onChange={(event) => {
                      if (event.target.value === "__create__") {
                        setCreatingTeam(true);
                        setTeamId("");
                      } else {
                        setCreatingTeam(false);
                        setTeamId(event.target.value);
                      }
                    }}
                    className={input}
                  >
                    <option value="">No team assigned</option>
                    {localTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    <option value="__create__">+ Create new team…</option>
                  </select>
                  {creatingTeam && (
                    <div className="mt-2 flex gap-2">
                      <input
                        autoFocus
                        value={newTeamName}
                        onChange={(event) => setNewTeamName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCreateTeam();
                          }
                        }}
                        placeholder="e.g. VPN & Remote Access"
                        className={input}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateTeam}
                        disabled={teamSaving || !newTeamName.trim()}
                      >
                        {teamSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor={`${fieldId}-specialty`} className={label}>
                    Routing specialty <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
                  </label>
                  <select
                    id={`${fieldId}-specialty`}
                    value={specialty}
                    onChange={(event) => setSpecialty(event.target.value)}
                    className={input}
                  >
                    <option value="">Default to team name</option>
                    <option value="hardware">Hardware</option>
                    <option value="software">Software</option>
                    <option value="networking">Networking</option>
                    <option value="security">Security</option>
                    <option value="billing">Billing</option>
                    <option value="email">Email & Communication</option>
                    <option value="printing">Printer & Peripherals</option>
                    <option value="vpn">VPN & Remote Access</option>
                    <option value="m365">Microsoft 365</option>
                    <option value="active_directory">Active Directory & Accounts</option>
                    <option value="backup">Backup & Recovery</option>
                    <option value="mobile">Mobile Devices</option>
                    <option value="other">General Support</option>
                  </select>
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs leading-5 text-red-300">
                  {error}
                </p>
              )}
            </div>

            <footer className="flex shrink-0 gap-3 border-t border-[var(--color-surface-700)] bg-[var(--color-surface-900)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 sm:ml-auto sm:flex-none" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create employee"}
              </Button>
            </footer>
          </form>
        </section>
      </div>
    </div>
  );
}
