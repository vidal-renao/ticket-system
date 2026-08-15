import { NextResponse } from "next/server";
import { createClient, createServiceClientStatic } from "@/lib/supabase/server";

const NEW_CATEGORIES = [
  { name: "Email & Communication", slug: "email-communication", color: "#6366f1", icon: "mail" },
  { name: "Printer & Peripherals",  slug: "printer-peripherals",  color: "#8b5cf6", icon: "printer" },
  { name: "VPN & Remote Access",    slug: "vpn-remote-access",    color: "#0ea5e9", icon: "shield" },
  { name: "Microsoft 365",          slug: "microsoft-365",        color: "#0078d4", icon: "grid" },
  { name: "Active Directory & Accounts", slug: "active-directory-accounts", color: "#f59e0b", icon: "users" },
  { name: "Backup & Recovery",      slug: "backup-recovery",      color: "#10b981", icon: "database" },
  { name: "Performance & Speed",    slug: "performance-speed",    color: "#ef4444", icon: "zap" },
  { name: "Mobile Devices",         slug: "mobile-devices",       color: "#ec4899", icon: "smartphone" },
];

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClientStatic();
  const { data: profile } = await svc
    .from("hd_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = profile.organization_id;
  const results: string[] = [];

  for (const cat of NEW_CATEGORIES) {
    const { error } = await svc
      .from("categories")
      .upsert(
        { ...cat, organization_id: orgId, is_active: true, sort_order: 99 },
        { onConflict: "organization_id,slug" }
      );
    if (error) {
      results.push(`${cat.name}: ${error.message}`);
    } else {
      results.push(`${cat.name}: ok`);
    }
  }

  return NextResponse.json({ results });
}
