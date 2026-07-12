import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const requiredSeedVariables = [
  "SEED_ORG_ID",
  "SEED_AGENT_ID",
  "SEED_AGENT_EMAIL",
  "SEED_AGENT_PASSWORD",
  "SEED_CUSTOMER_ID",
  "SEED_CUSTOMER_EMAIL",
  "SEED_CUSTOMER_PASSWORD",
];
const missingSeedVariables = requiredSeedVariables.filter((name) => !process.env[name]);
if (missingSeedVariables.length > 0) {
  console.error(`Missing seed variables: ${missingSeedVariables.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_ID = process.env.SEED_ORG_ID;
const TEAM_NAME = "Hardware";

const seedUsers = [
  {
    id: process.env.SEED_AGENT_ID,
    email: process.env.SEED_AGENT_EMAIL,
    password: process.env.SEED_AGENT_PASSWORD,
    full_name: "Empleado Hardware",
    role: "agent",
    specialty: "Hardware",
    availability_status: "online",
    company_name: null,
  },
  {
    id: process.env.SEED_CUSTOMER_ID,
    email: process.env.SEED_CUSTOMER_EMAIL,
    password: process.env.SEED_CUSTOMER_PASSWORD,
    full_name: "Vidal Real Estate Client",
    role: "customer",
    specialty: null,
    availability_status: "offline",
    company_name: "Vidal Real Estate Client",
    industry: "Inmobiliaria",
    tax_id: "CH-123.456.789",
  },
];

async function ensureUser(user) {
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const existing = existingUsers.users.find((entry) => entry.email === user.email);

  if (existing) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
      app_metadata: { provider: "email" },
    });
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.full_name },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const { error: orgError } = await supabase.from("organizations").upsert(
    {
      id: ORG_ID,
      name: "Vidal Real Estate",
      slug: "vidal-real-estate",
      plan: "enterprise",
      support_email: "support@vidallab.ch",
      is_active: true,
    },
    { onConflict: "id" }
  );
  if (orgError) throw orgError;

  await supabase
    .from("organizations")
    .update({
      settings: {
        sector: "Inmobiliaria",
        tax_id: "CH-123.456.789",
        seeded_by: "scripts/seed-vidal-real-estate.mjs",
      },
    })
    .eq("id", ORG_ID);

  const { data: teamData, error: teamError } = await supabase
    .from("teams")
    .upsert(
      {
        organization_id: ORG_ID,
        name: TEAM_NAME,
        description: "Hardware support specialists",
        is_active: true,
      },
      { onConflict: "organization_id,name" }
    )
    .select("id")
    .single();
  if (teamError) throw teamError;

  for (const user of seedUsers) {
    const userId = await ensureUser(user);

    let { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        organization_id: ORG_ID,
        full_name: user.full_name,
        role: user.role,
        specialty: user.specialty,
        team_id: user.role === "agent" ? teamData.id : null,
        availability_status: user.availability_status,
        is_active: true,
      },
      { onConflict: "id" }
    );
    if (profileError?.message?.includes("availability_status")) {
      ({ error: profileError } = await supabase.from("profiles").upsert(
        {
          id: userId,
          organization_id: ORG_ID,
          full_name: user.full_name,
          role: user.role,
          specialty: user.specialty,
          team_id: user.role === "agent" ? teamData.id : null,
          is_active: true,
        },
        { onConflict: "id" }
      ));
    }
    if (profileError) throw profileError;

    if (user.role === "customer") {
      const { error: customerError } = await supabase.from("customers_info").upsert(
        {
          id: userId,
          company_name: user.company_name,
          industry: user.industry,
          business_details: "Cuenta semilla premium para validacion del entorno HelpDesk AI.",
          tax_id: user.tax_id,
        },
        { onConflict: "id" }
      );
      if (customerError) throw customerError;
    }
  }

  console.log("Seed completed for Vidal Real Estate.");
}

main().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
