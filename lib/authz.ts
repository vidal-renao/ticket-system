import type { AvailabilityStatus, UserRole } from "@/lib/supabase/types";

type QueryClient = {
  // The Supabase client type is intentionally kept narrow here so this helper
  // works with both browser-session and service clients.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export interface CurrentProfile {
  id: string;
  role: UserRole;
  organization_id: string | null;
  full_name?: string | null;
  specialty?: string | null;
  availability_status?: AvailabilityStatus | null;
}

export function isStaffRole(
  role: string | null | undefined
): role is Exclude<UserRole, "customer"> {
  return role === "agent" || role === "manager" || role === "admin";
}

export async function getCurrentProfile(
  supabase: QueryClient,
  userId: string
): Promise<CurrentProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, role, organization_id, full_name, specialty, availability_status")
    .eq("id", userId)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    role: data.role,
    organization_id: data.organization_id,
    full_name: data.full_name ?? null,
    specialty: data.specialty ?? null,
    availability_status: data.availability_status ?? null,
  };
}
