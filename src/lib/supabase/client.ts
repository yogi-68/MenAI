import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/** Singleton browser client — stable across renders (prevents effect infinite loops). */
export function createClient() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("placeholder")) {
    console.error("Supabase environment variables are not properly configured.");
  }

  browserClient = createBrowserClient(
    supabaseUrl || "https://placeholder.supabase.co",
    supabaseAnonKey || "placeholder",
    {
      global: {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
      db: {
        schema: "public",
      },
    }
  );

  return browserClient;
}
