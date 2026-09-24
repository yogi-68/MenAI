import { redirect } from "next/navigation";

/**
 * The standalone goals page was replaced by the coach, which is where goals
 * are created and refined. Anyone landing here from an old link or bookmark
 * is sent somewhere that can actually help.
 */
export default function GoalsIndexPage() {
  redirect("/dashboard/chat?intent=new_goal");
}
