import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(120);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { messages },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}

/**
 * DELETE /api/conversations/[id]
 * Deletes a conversation and ONLY its associated messages and memories
 * Does NOT delete goals, tasks, or other user data
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const serviceClient = await createServiceRoleClient();

  // Verify the conversation belongs to this user
  const { data: conv } = await serviceClient
    .from("conversations")
    .select("id, user_id, message_count")
    .eq("id", id)
    .single();

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Delete in parallel for better performance
    const [memoryDelete, messageDelete, convDelete] = await Promise.all([
      serviceClient.from("memories").delete().eq("conversation_id", id),
      serviceClient.from("messages").delete().eq("conversation_id", id),
      serviceClient.from("conversations").delete().eq("id", id).select()
    ]);

    if (convDelete.error) {
      return NextResponse.json({ error: convDelete.error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: "Conversation and associated data deleted successfully"
    });
  } catch (error: any) {
    console.error("Conversation deletion error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
