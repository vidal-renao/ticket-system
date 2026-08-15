"use client";

import { useId, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LinkExistingAccountPrompt, LinkedAccountNotice } from "@/components/admin/LinkExistingAccount";
import { toast } from "sonner";
import { createCompanyCustomerSchema } from "@/lib/validation/security";

const input =
  "min-h-11 w-full rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-surface-500)] focus:border-[var(--color-brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20";
const label = "mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]";

const LOCALES = [
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
] as const;

type FormState = "form" | "confirm" | "link-existing" | "success";

export function CompanyCustomerForm() {
  const router = useRouter();
  const fieldId = useId();
  const [state, setState] = useState<FormState>("form");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("CH");
  const [website, setWebsite] = useState("");
  const [taxId, setTaxId] = useState("");
  const [locale, setLocale] = useState<"de" | "fr" | "it" | "en">("de");
  const [adminNotes, setAdminNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationState, setInvitationState] = useState<string | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<string | null>(null);
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  function buildPayload() {
    return {
      legal_name: legalName,
      trade_name: tradeName || undefined,
      contact_email: contactEmail,
      contact_person: contactPerson,
      phone: phone || undefined,
      address: address || undefined,
      city: city || undefined,
      postal_code: postalCode || undefined,
      country: country || undefined,
      website: website || undefined,
      tax_id: taxId || undefined,
      locale,
      admin_notes: adminNotes || undefined,
    };
  }

  function handleReviewSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = createCompanyCustomerSchema.safeParse(buildPayload());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setError(null);
    setState("confirm");
  }

  async function confirmCreate(linkExisting = false) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/customers/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), link_existing_user: linkExisting }),
      });
      const data = await response.json();
      if (!response.ok) {
        // The address belongs to an account from another application.
        // Nothing was written; the admin decides whether to adopt it.
        if (response.status === 409 && data.requires_confirmation) {
          setLinkPrompt(data.error ?? "That address already has an account.");
          setState("link-existing");
          return;
        }
        setError(data.error ?? "Could not create the company");
        setState("form");
        return;
      }
      setInvitationState(data.invitationState ?? "invited");
      setAccessLink(data.access_link ?? null);
      setLinkNotice(data.notice ?? null);
      setState("success");
      toast.success("Company created — invitation sent");
    } catch {
      setError("Network error — check the connection and try again");
      setState("form");
    } finally {
      setLoading(false);
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-emerald-300" />
        <p className="text-sm font-semibold text-emerald-200">
          {invitationState === "linked_existing_user"
            ? "Linked to an existing account. No invitation was sent."
            : "Company created. A secure email invitation was sent to the contact."}
        </p>
        {invitationState === "linked_existing_user" && linkNotice && (
          <LinkedAccountNotice notice={linkNotice} accessLink={accessLink} />
        )}
        <Button className="mt-4" onClick={() => router.push("/admin/users")}>
          Back to user management
        </Button>
      </div>
    );
  }

  if (state === "link-existing") {
    return (
      <LinkExistingAccountPrompt
        email={contactEmail}
        message={linkPrompt ?? ""}
        loading={loading}
        onConfirm={() => confirmCreate(true)}
        onCancel={() => {
          setLinkPrompt(null);
          setState("form");
        }}
      />
    );
  }

  if (state === "confirm") {
    return (
      <div className="rounded-2xl border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text-primary)]">Confirm company</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--color-text-muted)]">Type</dt><dd>Company</dd>
          <dt className="text-[var(--color-text-muted)]">Legal name</dt><dd>{legalName}</dd>
          <dt className="text-[var(--color-text-muted)]">Contact</dt><dd>{contactPerson} ({contactEmail})</dd>
          <dt className="text-[var(--color-text-muted)]">Tenant</dt><dd>Vidal Real Estate</dd>
          <dt className="text-[var(--color-text-muted)]">Reference code</dt><dd>Se generará automáticamente</dd>
          <dt className="text-[var(--color-text-muted)]">Acceso</dt><dd>Invitación segura por email</dd>
        </dl>
        {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button type="button" variant="ghost" onClick={() => setState("form")} disabled={loading}>
            Back
          </Button>
          <Button type="button" onClick={() => confirmCreate()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send invitation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleReviewSubmit} className="space-y-4 rounded-2xl border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${fieldId}-legal`} className={label}>Razón social</label>
          <input id={`${fieldId}-legal`} required value={legalName} onChange={(e) => setLegalName(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-trade`} className={label}>Nombre comercial <span className="font-normal text-[var(--color-text-muted)]">(opcional)</span></label>
          <input id={`${fieldId}-trade`} value={tradeName} onChange={(e) => setTradeName(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-email`} className={label}>Email principal de acceso</label>
          <input id={`${fieldId}-email`} required type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-contact`} className={label}>Persona de contacto</label>
          <input id={`${fieldId}-contact`} required value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-phone`} className={label}>Teléfono <span className="font-normal text-[var(--color-text-muted)]">(opcional)</span></label>
          <input id={`${fieldId}-phone`} value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-website`} className={label}>Website <span className="font-normal text-[var(--color-text-muted)]">(opcional)</span></label>
          <input id={`${fieldId}-website`} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${fieldId}-address`} className={label}>Dirección <span className="font-normal text-[var(--color-text-muted)]">(opcional)</span></label>
          <input id={`${fieldId}-address`} value={address} onChange={(e) => setAddress(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-city`} className={label}>Ciudad <span className="font-normal text-[var(--color-text-muted)]">(opcional)</span></label>
          <input id={`${fieldId}-city`} value={city} onChange={(e) => setCity(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-postal`} className={label}>Código postal <span className="font-normal text-[var(--color-text-muted)]">(opcional)</span></label>
          <input id={`${fieldId}-postal`} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-country`} className={label}>País</label>
          <input id={`${fieldId}-country`} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-locale`} className={label}>Idioma preferido</label>
          <select id={`${fieldId}-locale`} value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)} className={input}>
            {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${fieldId}-tax`} className={label}>
            Datos fiscales <span className="font-normal text-[var(--color-text-muted)]">(opcional — auto-generado si vacío)</span>
          </label>
          <input id={`${fieldId}-tax`} value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="B1234567X" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${fieldId}-notes`} className={label}>Notas administrativas <span className="font-normal text-[var(--color-text-muted)]">(opcional)</span></label>
          <textarea id={`${fieldId}-notes`} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3} className={input} />
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <Button type="submit">Revisar y continuar</Button>
    </form>
  );
}
