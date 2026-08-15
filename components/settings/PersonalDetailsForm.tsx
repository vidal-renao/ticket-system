"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { normalizeSupabaseErrorMessage, selfServiceProfileSchema } from "@/lib/validation/security";

const input =
  "min-h-11 w-full rounded-xl border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-surface-500)] focus:border-[var(--color-brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/20";
const label = "mb-1.5 block text-xs font-semibold text-[var(--color-text-secondary)]";

interface PersonalDetailsFormProps {
  initial: {
    full_name: string | null;
    phone: string | null;
    locale: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
    website: string | null;
    contact_person: string | null;
  };
  showAddress: boolean;
  showCompanyContact: boolean;
}

// Self-service editable fields only. Email, role, organization_id,
// customer_type and reference_code are never part of this form and the
// database enforces that even if the client were tampered with (only
// full_name/phone/locale/address/city/postal_code/country/website/
// contact_person carry an UPDATE grant for `authenticated`).
export function PersonalDetailsForm({ initial, showAddress, showCompanyContact }: PersonalDetailsFormProps) {
  const fieldId = useId();
  const [fullName, setFullName] = useState(initial.full_name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [locale, setLocale] = useState(initial.locale ?? "de");
  const [address, setAddress] = useState(initial.address ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [postalCode, setPostalCode] = useState(initial.postal_code ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [contactPerson, setContactPerson] = useState(initial.contact_person ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const payload = {
      full_name: fullName || undefined,
      phone: phone || undefined,
      locale: locale as "de" | "fr" | "it" | "en",
      ...(showAddress && {
        address: address || undefined,
        city: city || undefined,
        postal_code: postalCode || undefined,
        country: country || undefined,
      }),
      ...(showCompanyContact && {
        website: website || undefined,
        contact_person: contactPerson || undefined,
      }),
    };

    const parsed = selfServiceProfileSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Session expired — please sign in again");
        return;
      }
      const { error: updateError } = await supabase
        .from("hd_profiles")
        .update(parsed.data)
        .eq("id", user.id);
      if (updateError) {
        setError(normalizeSupabaseErrorMessage(updateError));
        return;
      }
      toast.success("Profile updated");
    } catch {
      setError("Network error — check the connection and try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${fieldId}-name`} className={label}>Full name</label>
          <input id={`${fieldId}-name`} value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-phone`} className={label}>Phone</label>
          <input id={`${fieldId}-phone`} value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${fieldId}-locale`} className={label}>Language</label>
          <select id={`${fieldId}-locale`} value={locale} onChange={(e) => setLocale(e.target.value)} className={input}>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </select>
        </div>
        {showCompanyContact && (
          <div>
            <label htmlFor={`${fieldId}-contact`} className={label}>Contact person</label>
            <input id={`${fieldId}-contact`} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={input} />
          </div>
        )}
        {showCompanyContact && (
          <div className="sm:col-span-2">
            <label htmlFor={`${fieldId}-website`} className={label}>Website</label>
            <input id={`${fieldId}-website`} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={input} />
          </div>
        )}
        {showAddress && (
          <>
            <div className="sm:col-span-2">
              <label htmlFor={`${fieldId}-address`} className={label}>Address</label>
              <input id={`${fieldId}-address`} value={address} onChange={(e) => setAddress(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor={`${fieldId}-city`} className={label}>City</label>
              <input id={`${fieldId}-city`} value={city} onChange={(e) => setCity(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor={`${fieldId}-postal`} className={label}>Postal code</label>
              <input id={`${fieldId}-postal`} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor={`${fieldId}-country`} className={label}>Country</label>
              <input id={`${fieldId}-country`} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} className={input} />
            </div>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save changes
      </Button>
    </form>
  );
}
