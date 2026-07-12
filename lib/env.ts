import { z } from "zod";

const publicSupabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

const serviceSupabaseSchema = publicSupabaseSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

function invalidEnvironment(error: z.ZodError) {
  const names = error.issues.map((issue) => issue.path.join(".")).join(", ");
  return new Error(`Invalid runtime environment: ${names}`);
}

export function getPublicSupabaseEnv() {
  const result = publicSupabaseSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) throw invalidEnvironment(result.error);
  return result.data;
}

export function getServiceSupabaseEnv() {
  const result = serviceSupabaseSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) throw invalidEnvironment(result.error);
  return result.data;
}
