"use client";

import { useState, useEffect } from "react";
import { X, UserPlus, Building2, Eye, EyeOff, Loader2 } from "lucide-react";
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
  defaultType?: "agent" | "customer";
  teams: Team[];
  onClose: () => void;
  onSuccess: () => void;
}

const input =
  "w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-surface-800)] border border-[var(--color-surface-600)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors";
const label = "block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5";

export function CreateUserModal({
  open,
  defaultType = "agent",
  teams,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const [type, setType]               = useState<"agent" | "customer">(defaultType);
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPwd, setShowPwd]         = useState(false);
  const [teamId, setTeamId]           = useState("");
  const [specialty, setSpecialty]     = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry]       = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setName(""); setEmail(""); setPassword(""); setShowPwd(false);
    setTeamId(""); setSpecialty(""); setCompanyName(""); setIndustry("");
    setError(null);
  }, [open, defaultType]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Password does not meet policy");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, password, type,
          ...(type === "agent" && {
            team_id: teamId || undefined,
            specialty: specialty || undefined,
          }),
          ...(type === "customer" && {
            company_name: companyName,
            industry: industry || undefined,
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create user"); return; }
      toast.success(`${type === "agent" ? "Employee" : "Company"} created successfully`);
      onSuccess();
      onClose();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md bg-[var(--color-surface-900)] border border-[var(--color-surface-600)] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-surface-700)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {type === "agent" ? "New Employee" : "New Company"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-700)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex gap-1 mx-5 mt-4 p-1 bg-[var(--color-surface-800)] rounded-lg border border-[var(--color-surface-700)]">
          {(["agent", "customer"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all ${
                type === t
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {t === "agent"
                ? <><UserPlus className="w-3.5 h-3.5" /> Employee</>
                : <><Building2 className="w-3.5 h-3.5" /> Company</>
              }
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div>
            <label className={label}>Full Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className={input}
            />
          </div>

          <div>
            <label className={label}>Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.ch"
              className={input}
            />
          </div>

          <div>
            <label className={label}>Password</label>
            <div className="relative">
              <input
                required
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 12 chars, upper/lower/number/symbol"
                minLength={12}
                className={`${input} pr-10`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordStrengthMeter password={password} className="mt-2" />
          </div>

          {type === "agent" && (
            <>
              <div>
                <label className={label}>Team</label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className={input}
                >
                  <option value="">No team assigned</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>
                  Specialty{" "}
                  <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
                </label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className={input}
                >
                  <option value="">Default (team name)</option>
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
            </>
          )}

          {type === "customer" && (
            <>
              <div>
                <label className={label}>Company Name</label>
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme AG"
                  className={input}
                />
              </div>
              <div>
                <label className={label}>
                  Industry{" "}
                  <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className={input}
                >
                  <option value="">Select industry</option>
                  <option value="Technology & IT">Technology & IT</option>
                  <option value="Finance & Banking">Finance & Banking</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Real Estate">Real Estate</option>
                  <option value="Retail & Commerce">Retail & Commerce</option>
                  <option value="Construction">Construction</option>
                  <option value="Education">Education</option>
                  <option value="Hospitality & Tourism">Hospitality & Tourism</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="flex-1" disabled={loading}>
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : type === "agent" ? "Create Employee" : "Create Company"
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
