"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PresenceAvatar } from "@/components/ui/PresenceAvatar";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import {
  UserPlus, Building2, Search, Pencil, Trash2, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Loader2,
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

type FilterRole = "all" | "agent" | "manager" | "admin" | "customer";

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
  const [createType, setCreateType] = useState<"agent" | "customer">("agent");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editSpecialty, setEditSpecialty] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = users
    .filter((u) => filterRole === "all" || u.role === filterRole)
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
      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className={`${inputCls} pl-8 w-full`}
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as FilterRole)}
          className={inputCls}
        >
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="agent">Agent</option>
          <option value="customer">Customer</option>
        </select>
        <button
          type="button"
          onClick={() => setSortAsc(!sortAsc)}
          className={`${inputCls} flex items-center gap-1.5`}
        >
          {sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Name
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setCreateType("agent"); setCreateOpen(true); }}>
            <UserPlus className="w-3.5 h-3.5" /> New Employee
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setCreateType("customer"); setCreateOpen(true); }}>
            <Building2 className="w-3.5 h-3.5" /> New Company
          </Button>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-muted)] mb-3">
        {filtered.length} of {users.length} users
      </p>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-surface-600)]">
        <table className="w-full text-sm">
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
                      <Badge className={ROLE_COLORS[u.role] ?? ""}>{u.role}</Badge>
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
        defaultType={createType}
        teams={teams}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
