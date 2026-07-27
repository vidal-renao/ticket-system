"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import {
  UserPlus, User, Building2, Search, Pencil, Trash2, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Loader2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

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
  | "incomplete";

function isIncompleteProfile(u: UserRow): boolean {
  if (!u.organization_id) return true;
  if (u.role === "customer" && !u.customer_type) return true;
  return false;
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

  const filtered = users
    .filter((u) => {
      if (filterRole === "all") return true;
      if (filterRole === "incomplete") return isIncompleteProfile(u);
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

  async function toggleActive(u: UserRow) {
    setSavingId(u.id);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    if (!res.ok) {
      toast.error("Failed to update status");
    } else {
      setUsers((prev) => prev.map((p) =>
        p.id === u.id ? { ...p, is_active: !u.is_active } : p
      ));
      toast.success(u.is_active ? "Account deactivated" : "Account activated");
    }
    setSavingId(null);
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
                  <span className={`ml-auto flex items-center gap-1 text-xs ${u.is_active !== false ? "text-green-400" : "text-[var(--color-text-muted)]"}`}>
                    {u.is_active !== false ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {u.is_active !== false ? "Active" : "Inactive"}
                  </span>
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
                      {!isSelf && (
                        <Button
                          size="sm"
                          variant={u.is_active !== false ? "danger" : "secondary"}
                          className="flex-1"
                          onClick={() => toggleActive(u)}
                          disabled={isSaving}
                        >
                          {isSaving
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : u.is_active !== false
                              ? <><Trash2 className="h-3.5 w-3.5" /> Deactivate</>
                              : <><CheckCircle2 className="h-3.5 w-3.5" /> Activate</>
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
                    {u.is_active !== false ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                        <XCircle className="w-3.5 h-3.5" /> Inactive
                      </span>
                    )}
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
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => toggleActive(u)}
                                disabled={isSaving}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  u.is_active !== false
                                    ? "text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10"
                                    : "text-[var(--color-text-muted)] hover:text-green-400 hover:bg-green-500/10"
                                }`}
                                title={u.is_active !== false ? "Deactivate" : "Activate"}
                              >
                                {isSaving
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : u.is_active !== false
                                    ? <Trash2 className="w-3.5 h-3.5" />
                                    : <CheckCircle2 className="w-3.5 h-3.5" />
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
    </div>
  );
}
