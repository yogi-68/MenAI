import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder",
    {
      global: {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — can't set cookies
          }
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS. Only for server-side work that has
 * already established who the user is.
 *
 * Memoized: this was previously re-importing `@supabase/supabase-js` and
 * constructing a fresh client on every call, across ~30 call sites, several of
 * which sit on the chat request path.
 */
let _serviceRoleClient: SupabaseClient | null = null;

export async function createServiceRoleClient(): Promise<SupabaseClient> {
  if (_serviceRoleClient) return _serviceRoleClient;

  const { createClient } = await import("@supabase/supabase-js");
  _serviceRoleClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  return _serviceRoleClient;
}
