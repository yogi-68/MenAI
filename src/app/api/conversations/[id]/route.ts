import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { CHAT_INITIAL_LIMIT, CHAT_PAGE_SIZE } from "@/lib/chat/constants";

const MAX_LIMIT = 100;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");
  const limitRaw = Number(searchParams.get("limit") || CHAT_INITIAL_LIMIT);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : CHAT_PAGE_SIZE));

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let query = supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: rows, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const page = (rows || []).slice().reverse();
  const hasMore = (rows?.length ?? 0) === limit;
  const nextBefore = page.length > 0 ? page[0].created_at : null;

  return NextResponse.json(
    { messages: page, hasMore, nextBefore },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}

/**
 * DELETE /api/conversations/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const serviceClient = await createServiceRoleClient();

  const { data: conv } = await serviceClient
    .from("conversations")
    .select("id, user_id, message_count")
    .eq("id", id)
    .single();

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const [, , convDelete] = await Promise.all([
      serviceClient.from("memories").delete().eq("conversation_id", id),
      serviceClient.from("messages").delete().eq("conversation_id", id),
      serviceClient.from("conversations").delete().eq("id", id).select(),
    ]);

    if (convDelete.error) {
      return NextResponse.json({ error: convDelete.error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Conversation and associated data deleted successfully",
    });
  } catch (error: unknown) {
    console.error("Conversation deletion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
