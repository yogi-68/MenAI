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

  const { data: messages, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

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
    // Count what will be deleted for transparency
    const { count: messageCount } = await serviceClient
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", id);
    
    const { count: memoryCount } = await serviceClient
      .from("memories")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", id);

    // Delete memories associated with this specific conversation
    await serviceClient
      .from("memories")
      .delete()
      .eq("conversation_id", id);

    // Delete messages (CASCADE will handle this, but explicit for clarity)
    await serviceClient
      .from("messages")
      .delete()
      .eq("conversation_id", id);

    // Delete the conversation
    const { error } = await serviceClient
      .from("conversations")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      deleted: {
        messages: messageCount || 0,
        memories: memoryCount || 0
      }
    });
  } catch (error: any) {
    console.error("Conversation deletion error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
