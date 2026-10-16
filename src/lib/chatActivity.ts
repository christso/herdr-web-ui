export type ChatActivity = "idle" | "thinking" | "working";

/** The standalone line fills the gap before a live turn has rendered a work block. */
export function standaloneChatActivity(activity: ChatActivity, workBlockLive: boolean, blocked = false): Exclude<ChatActivity, "idle"> | null {
  if (blocked) return null;
  if (activity === "idle") return null;
  if (activity === "thinking") return "thinking";
  return workBlockLive ? null : "working";
}
