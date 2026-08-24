import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * The client /reset-password uses to redeem an emailed link.
 *
 * Two deliberate departures from `createClient()`:
 *
 * `detectSessionInUrl: false` -- the default is to spot the `?code=` and
 * exchange it the moment the client is constructed, swallowing whatever comes
 * back. That is how the screen ended up unable to tell an expired link from a
 * broken one; it only ever saw the absence of a session. Redeeming the code by
 * hand surfaces GoTrue's actual error, which is the whole difference between
 * "your link expired, here is a new one" and "Auth session missing!".
 *
 * `isSingleton: false` -- `createBrowserClient` caches the first client it
 * builds and hands it back to every later caller, options and all. Opting out
 * keeps this screen's auto-detection choice from leaking into the rest of the
 * app. The session still lands in cookies, so nothing else notices.
 */
export function createRecoveryClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: false,
      auth: { detectSessionInUrl: false },
    }
  );
}
