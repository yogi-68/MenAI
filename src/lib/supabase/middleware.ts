import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes — require auth + completed onboarding
  const protectedPaths = ["/dashboard", "/chat", "/journal", "/mood", "/meditation", "/profile"];
  const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));
  const isOnboarding = request.nextUrl.pathname.startsWith("/onboarding");

  if (!user && (isProtected || isOnboarding)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && isProtected) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    // No profile = deleted or never set up — send to onboarding (bootstrap runs there)
    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    const { data: progress } = await supabase
      .from("onboarding_progress")
      .select("completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!progress?.completed_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  // Redirect logged-in users from auth pages
  const authPaths = ["/login", "/signup"];
  const isAuthPage = authPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (user && isAuthPage) {
    // Check onboarding status before redirecting
    const { data: progress } = await supabase
      .from("onboarding_progress")
      .select("completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    
    const url = request.nextUrl.clone();
    // Redirect to onboarding if not completed, otherwise to dashboard
    url.pathname = progress?.completed_at ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
