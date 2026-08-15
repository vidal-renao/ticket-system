import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/marketing/LandingPage";
import type { UserRole } from "@/lib/supabase/types";

/**
 * Root path (/) — default locale (de) with localePrefix:"as-needed".
 * Shows landing page for unauthenticated users; redirects authenticated users.
 */
export default async function RootPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <LandingPage locale="de" />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("hd_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role as UserRole | undefined;
    if (role === "customer") redirect("/tickets");
    redirect("/dashboard");
  }

  return <LandingPage locale="de" />;
}
