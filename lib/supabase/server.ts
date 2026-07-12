import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseEnv, getServiceSupabaseEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicSupabaseEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies can be read but not set
          }
        },
      },
    }
  );
}

/** Service-role client — only for server-side trusted operations */
export async function createServiceClient() {
  const cookieStore = await cookies();
  const env = getServiceSupabaseEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

/**
 * Static service-role client for background jobs (fire-and-forget, post-response).
 * Does NOT use cookies() — safe to call outside the request lifecycle.
 */
export function createServiceClientStatic() {
  const env = getServiceSupabaseEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    }
  );
}
