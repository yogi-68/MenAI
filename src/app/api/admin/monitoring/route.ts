import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { fetchAdminMonitoring } from "@/lib/admin/monitoring";
import { fetchProductFunnel } from "@/lib/admin/product-funnel";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const [snapshot, funnel] = await Promise.all([
      fetchAdminMonitoring(),
      fetchProductFunnel(),
    ]);
    return NextResponse.json({ ...snapshot, funnel });
  } catch (error) {
    console.error("Admin monitoring error:", error);
    return NextResponse.json({ error: "Failed to load monitoring data" }, { status: 500 });
  }
}
