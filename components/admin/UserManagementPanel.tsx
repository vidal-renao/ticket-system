"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import {
  PasswordResetDialog,
  type PasswordResetOutcome,
} from "@/components/admin/PasswordResetDialog";
import {
  UserPlus, User, Building2, Search, Pencil, Trash2, CheckCircle2,
  ChevronDown, ChevronUp, Loader2, AlertTriangle, MailQuestion, KeyRound,
  Snowflake, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { hasNoFirstAccess, NO_FIRST_ACCESS_LABEL } from "@/lib/customer-onboarding";
import { accountState, isActionableRole, type AccountState } from "@/lib/user-lifecycle";
import { ConfirmDeleteAccount } from "@/components/admin/ConfirmDeleteAccount";

interface UserRow {
  id: string;
  full_name: string | null;
  role: string;
  specialty: string | null;
  availability_status: "online" | "offline" | "busy" | null;
  is_active: boolean | null;
  avatar_url: string | null;
  company_name: string | null;
  email: string | null;
  customer_type: "individual" | "company" | null;
  reference_code: string | null;
  organization_id: string | null;
  invited_at: string | null;
  last_seen_at: string | null;
  deleted_at: string | null;
}

interface Team {
  id: string;
  name: string;
}

interface UserManagementPanelProps {
  users: UserRow[];
  teams: Team[];
  currentUserId: string;
  isAdmin: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  admin:    "text-red-300 bg-red-500/10 border-red-500/20",
  manager:  "text-amber-300 bg-amber-500/10 border-amber-500/20",
  agent:    "text-indigo-300 bg-indigo-500/10 border-indigo-500/20",
  customer: "text-green-300 bg-green-500/10 border-green-500/20",
};

type FilterRole =
  | "all"
  | "agent"
  | "manager"
  | "admin"
  | "customer_individual"
  | "customer_company"
  | "incomplete"
  | "no_first_access"
  | "deleted";

function isIncompleteProfile(u: UserRow): boolean {
  if (!u.organization_id) return true;
  if (u.role === "customer" && !u.customer_type) return true;
  return false;
}

/**
 * An invited account that has never reached the application. Distinct from an
 * incomplete profile: every field here is filled in correctly -- which is
 * exactly why this needed its own marker. Alpen Logistics looked complete and
 * active for a day while nobody could sign into it.
 */
function isAwaitingFirstAccess(u: UserRow): boolean {
  return hasNoFirstAccess({ invitedAt: u.invited_at, lastSeenAt: u.last_seen_at });
}

/**
 * Active, frozen or deleted, said the same way in the card and the table.
 *
 * There used to be two states here and the word for the second one was
 * "Inactive", which described what it did to routing and said nothing about
 * whether the person could still sign in -- they could. Both halves are real
 * now, so the label has to carry the difference.
 */
function AccountStateLabel({ state, className = "" }: { state: AccountState; className?: string }) {
  if (state === "deleted") {
    return (
      <span className={`flex items-center gap-1 text-xs text-red-400 ${className}`}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Deleted
      </span>
    );
  }
  if (state === "frozen") {
    return (
      <span className={`flex items-center gap-1 text-xs text-sky-300 ${className}`}>
        <Snowflake className="h-3.5 w-3.5" aria-hidden="true" /> Frozen
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 text-xs text-green-400 ${className}`}>
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Active
    </span>
  );
}

export function UserManagementPanel({
  users: initialUsers,
  teams,
  currentUserId,
  isAdmin,
}: UserManagementPanelProps) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<FilterRole>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editSpecialty, setEditSpecialty] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [resetOutcome, setResetOutcome] = useState<PasswordResetOutcome | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);

  const filtered = users
    .filter((u) => {
      // Deleted accounts are loaded so they can be restored, but they are out
      // of every other view: an administrator scanning the directory is asking
      // about people who are still here.
      if (filterRole === "deleted") return Boolean(u.deleted_at);
      if (u.deleted_at) return false;
      if (filterRole === "all") return true;
      if (filterRole === "incomplete") return isIncompleteProfile(u);
      if (filterRole === "no_first_access") return isAwaitingFirstAccess(u);
      if (filterRole === "customer_individual") return u.role === "customer" && u.customer_type === "individual";
      if (filterRole === "customer_company") return u.role === "customer" && u.customer_type === "company";
      return u.role === filterRole;
    })
    .filter((u) => {
      const q = search.toLowerCase();
      return !q || (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) || u.role.includes(q) || (u.company_name ?? "").toLowerCase().includes(q) ||
        (u.specialty ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const na = a.full_name ?? "";
      const nb = b.full_name ?? "";
      return sortAsc ? na.localeCompare(nb) : nb.localeCompare(na);
    });

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    setEditRole(u.role);
    setEditSpecialty(u.specialty ?? "");
  }

  async function saveEdit(u: UserRow) {
    setSavingId(u.id);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: editRole, specialty: editSpecialty || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Update failed");
    } else {
      setUsers((prev) => prev.map((p) =>
        p.id === u.id ? { ...p, role: editRole, specialty: editSpecialty || null } : p
      ));
      toast.success("User updated");
      setEditingId(null);
    }
    setSavingId(null);
  }

  /**
   * Freeze or lift the freeze. One state with two halves -- out of routing and
   * barred from signing in -- so it goes through the endpoint that keeps both
   * in step, never a bare is_active write.
   */
  async function toggleFreeze(u: UserRow) {
    const freezing = u.is_active !== false;
    setSavingId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: freezing ? "freeze" : "unfreeze" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update the account");
        return;
      }
      setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, is_active: !freezing } : p)));
      toast.success(freezing ? "Account frozen \u2014 sign-in blocked" : "Account unfrozen");
    } catch {
      toast.error("Failed to update the account");
    } finally {
      setSavingId(null);
    }
  }

  async function confirmDelete() {
    const u = pendingDelete;
    if (!u) return;
    const action = u.deleted_at ? "restore" : "delete";
    setSavingId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmation: action.toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update the account");
        return;
      }
      setUsers((prev) =>
        prev.map((p) =>
          p.id === u.id
            ? {
                ...p,
                deleted_at: action === "delete" ? new Date().toISOString() : null,
                // Deleting freezes, and restoring leaves it frozen: the server
                // says so and the row has to agree, or the freeze button would
                // offer to freeze something already frozen.
                is_active: false,
              }
            : p
        )
      );
      toast.success(
        action === "delete"
          ? "Account deleted \u2014 history kept"
          : "Account restored, still frozen"
      );
      setPendingDelete(null);
    } catch {
      toast.error("Failed to update the account");
    } finally {
      setSavingId(null);
    }
  }

  /**
   * Start a recovery for somebody else. The administrator never sees or sets
   * the password -- this only mints the link the person would have requested
   * themselves, and the reset screen does the rest.
   */
  async function sendPasswordReset(u: UserRow) {
    setSavingId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/password-reset`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not start the password reset");
        return;
      }
      setResetOutcome({
        name: u.full_name?.trim() || data.email,
        email: data.email,
        actionLink: data.action_link,
        emailSent: Boolean(data.email_sent),
      });
    } catch {
      toast.error("Could not start the password reset");
    } finally {
      setSavingId(null);
    }
  }

  const inputCls =
    "px-3 py-1.5 rounded-lg text-sm bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-primary)] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors";

  return (
    <div>
      {/* Directory controls */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <div className="relative col-span-2 min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            aria-label="Search users"
            className={`${inputCls} pl-8 w-full`}
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as FilterRole)}
          aria-label="Filter users by role"
          className={`${inputCls} w-full`}
        >
          <option value="all">All</option>
          <option value="admin">Admins</option>
          <option value="manager">Managers</option>
          <option value="agent">Employees/agents</option>
          <option value="customer_individual">Individual customers</option>
          <option value="customer_company">Companies</option>
          <option value="incomplete">Incomplete profiles</option>
          <option value="no_first_access">{NO_FIRST_ACCESS_LABEL}</option>
          <option value="deleted">Deleted</option>
        </select>
        <button
          type="button"
          onClick={() => setSortAsc(!sortAsc)}
          aria-label={`Sort by name ${sortAsc ? "descending" : "ascending"}`}
          className={`${inputCls} flex w-full items-center justify-center gap-1.5`}
        >
          {sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Name
        </button>
        <div className="col-span-2 grid grid-cols-3 gap-2 sm:ml-auto sm:flex sm:items-center">
          <Button size="sm" variant="secondary" className="w-full whitespace-nowrap sm:w-auto" onClick={() => setCreateOpen(true)}>
            <UserPlus className="w-3.5 h-3.5" /> New Employee
          </Button>
          <Button size="sm" variant="secondary" className="w-full whitespace-nowrap sm:w-auto" onClick={() => router.push("/admin/customers/individual/new")}>
            <User className="w-3.5 h-3.5" /> New Individual Customer
          </Button>
          <Button size="sm" variant="secondary" className="w-full whitespace-nowrap sm:w-auto" onClick={() => router.push("/admin/customers/company/new")}>
            <Building2 className="w-3.5 h-3.5" /> New Company
          </Button>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-muted)] mb-3">
        {filtered.length} of {users.length} users
      </p>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-surface-600)] px-5 py-10 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">No users match these filters</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Change the role filter or search for a different name, email or company.</p>
        </div>
      )}

      {/* Mobile directory cards keep every action visible without horizontal scrolling. */}
      <div className="space-y-3 md:hidden">
        {filtered.map((u) => {
          const isEditing = editingId === u.id;
          const isSaving = savingId === u.id;
          const isSelf = u.id === currentUserId;

          return (
            <article
              key={u.id}
              className={`rounded-2xl border border-[var(--color-surface-600)] bg-[var(--color-surface-900)] p-4 shadow-sm shadow-black/20 ${!u.is_active ? "opacity-60" : ""}`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <PresenceAvatar
                  name={u.full_name ?? "?"}
                  avatarUrl={u.avatar_url}
                  status={u.availability_status}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                      {u.full_name ?? "—"}
                    </h2>
                    {isSelf && <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">You</span>}
                  </div>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-[var(--color-text-muted)]">
                    {u.email ?? u.id.slice(0, 8)}
                  </p>
                </div>
              </div>

              {isEditing && isAdmin ? (
                <div className="mt-4 grid gap-3 rounded-xl border border-[var(--color-surface-700)] bg-[var(--color-surface-800)] p-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--color-text-secondary)]">Role</label>
                    <select aria-label="Role" value={editRole} onChange={(e) => setEditRole(e.target.value)} className={`${inputCls} w-full`}>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="agent">Agent</option>
                      <option value="customer">Customer</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--color-text-secondary)]">Specialty</label>
                    <input
                      value={editSpecialty}
                      onChange={(e) => setEditSpecialty(e.target.value)}
                      placeholder="Software, hardware, networking…"
                      aria-label="Specialty"
                      className={`${inputCls} w-full`}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge className={ROLE_COLORS[u.role] ?? ""}>
                    {u.role === "customer" && u.customer_type ? u.customer_type : u.role}
                  </Badge>
                  <span className="rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-1 text-[11px] text-[var(--color-text-muted)]">
                    {u.company_name ?? u.specialty ?? "No specialty"}
                  </span>
                  {u.reference_code && (
                    <span className="rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-muted)]">
                      {u.reference_code}
                    </span>
                  )}
                  {isIncompleteProfile(u) && (
                    <span className="flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Incomplete
                    </span>
                  )}
                  {isAwaitingFirstAccess(u) && (
                    <span className="flex items-center gap-1 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-300">
                      <MailQuestion className="h-3 w-3" /> {NO_FIRST_ACCESS_LABEL}
                    </span>
                  )}
                  <AccountStateLabel state={accountState(u)} className="ml-auto" />
                </div>
              )}

              {isAdmin && (
                <div className="mt-4 flex items-center gap-2 border-t border-[var(--color-surface-700)] pt-3">
                  {isEditing ? (
                    <>
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => saveEdit(u)} disabled={isSaving}>
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save changes"}
                      </Button>
                      <Button size="sm" variant="ghost" className="flex-1" onClick={() => setEditingId(null)} disabled={isSaving}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" className="flex-1" onClick={() => startEdit(u)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      {/* Administrators and managers are out of scope on
                          purpose: they are the people who would use this screen
                          to recover, so the recovery must not run through it. */}
                      {!isSelf && isActionableRole(u.role) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1"
                          onClick={() => sendPasswordReset(u)}
                          disabled={isSaving}
                        >
                          {isSaving
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><KeyRound className="h-3.5 w-3.5" /> Reset password</>
                          }
                        </Button>
                      )}
                      {!isSelf && isActionableRole(u.role) && !u.deleted_at && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          onClick={() => toggleFreeze(u)}
                          disabled={isSaving}
                        >
                          {isSaving
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : u.is_active !== false
                              ? <><Snowflake className="h-3.5 w-3.5" /> Freeze</>
                              : <><CheckCircle2 className="h-3.5 w-3.5" /> Unfreeze</>
                          }
                        </Button>
                      )}
                      {!isSelf && isActionableRole(u.role) && (
                        <Button
                          size="sm"
                          variant={u.deleted_at ? "secondary" : "danger"}
                          className="flex-1"
                          onClick={() => setPendingDelete(u)}
                          disabled={isSaving}
                        >
                          {u.deleted_at
                            ? <><Undo2 className="h-3.5 w-3.5" /> Restore</>
                            : <><Trash2 className="h-3.5 w-3.5" /> Delete</>
                          }
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Desktop directory table */}
      <div className="hidden overflow-x-auto rounded-xl border border-[var(--color-surface-600)] md:block">
        <table className="min-w-[760px] w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-600)] bg-[var(--color-surface-800)]">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">User</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Role</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Specialty / Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Status</th>
              {isAdmin && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-surface-700)]">
            {filtered.map((u) => {
              const isEditing = editingId === u.id;
              const isSaving = savingId === u.id;
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className={`transition-colors hover:bg-[var(--color-surface-800)] ${!u.is_active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PresenceAvatar
                        name={u.full_name ?? "?"}
                        avatarUrl={u.avatar_url}
                        status={u.availability_status}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {u.full_name ?? "—"}
                          {isSelf && <span className="ml-1.5 text-[10px] text-indigo-400">(you)</span>}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-muted)] font-mono">
                          {u.email ?? u.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isEditing && isAdmin ? (
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="px-2 py-1 rounded text-xs bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-primary)]"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="agent">Agent</option>
                        <option value="customer">Customer</option>
                      </select>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className={ROLE_COLORS[u.role] ?? ""}>
                          {u.role === "customer" && u.customer_type ? u.customer_type : u.role}
                        </Badge>
                        {isIncompleteProfile(u) && (
                          <span title="Incomplete profile" className="flex items-center gap-1 rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                        {isAwaitingFirstAccess(u) && (
                          <span
                            title={`${NO_FIRST_ACCESS_LABEL} — invited, but has never signed in to the application`}
                            className="flex items-center gap-1 rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300"
                          >
                            <MailQuestion className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    {isEditing && isAdmin ? (
                      <input
                        value={editSpecialty}
                        onChange={(e) => setEditSpecialty(e.target.value)}
                        placeholder="specialty"
                        className="px-2 py-1 rounded text-xs bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-primary)] w-full"
                      />
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {u.company_name ?? u.specialty ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <AccountStateLabel state={accountState(u)} />
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => saveEdit(u)}
                              disabled={isSaving}
                            >
                              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                              disabled={isSaving}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(u)}
                              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                              title="Edit user"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {!isSelf && isActionableRole(u.role) && (
                              <button
                                type="button"
                                onClick={() => sendPasswordReset(u)}
                                disabled={isSaving}
                                className="p-1.5 rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-indigo-500/10 hover:text-indigo-400"
                                title="Send a password recovery link"
                              >
                                {isSaving
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <KeyRound className="w-3.5 h-3.5" />
                                }
                              </button>
                            )}
                            {!isSelf && isActionableRole(u.role) && !u.deleted_at && (
                              <button
                                type="button"
                                onClick={() => toggleFreeze(u)}
                                disabled={isSaving}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  u.is_active !== false
                                    ? "text-[var(--color-text-muted)] hover:bg-sky-500/10 hover:text-sky-400"
                                    : "text-[var(--color-text-muted)] hover:bg-green-500/10 hover:text-green-400"
                                }`}
                                title={u.is_active !== false ? "Freeze - blocks sign-in" : "Unfreeze"}
                              >
                                {isSaving
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : u.is_active !== false
                                    ? <Snowflake className="w-3.5 h-3.5" />
                                    : <CheckCircle2 className="w-3.5 h-3.5" />
                                }
                              </button>
                            )}
                            {!isSelf && isActionableRole(u.role) && (
                              <button
                                type="button"
                                onClick={() => setPendingDelete(u)}
                                disabled={isSaving}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  u.deleted_at
                                    ? "text-[var(--color-text-muted)] hover:bg-emerald-500/10 hover:text-emerald-400"
                                    : "text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-400"
                                }`}
                                title={u.deleted_at ? "Restore account" : "Delete account - history is kept"}
                              >
                                {u.deleted_at
                                  ? <Undo2 className="w-3.5 h-3.5" />
                                  : <Trash2 className="w-3.5 h-3.5" />
                                }
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateUserModal
        open={createOpen}
        teams={teams}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => router.refresh()}
      />

      <PasswordResetDialog outcome={resetOutcome} onClose={() => setResetOutcome(null)} />

      {pendingDelete && (
        <ConfirmDeleteAccount
          name={pendingDelete.full_name?.trim() || pendingDelete.email || "this account"}
          action={pendingDelete.deleted_at ? "restore" : "delete"}
          pending={savingId === pendingDelete.id}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
