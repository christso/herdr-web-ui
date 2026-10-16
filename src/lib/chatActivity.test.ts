import { describe, expect, test } from "bun:test";
import { standaloneChatActivity } from "./chatActivity.ts";

describe("standalone chat activity", () => {
  test("keeps thinking visible, idle quiet and blocked panes quiet", () => {
    expect(standaloneChatActivity("thinking", true)).toBe("thinking");
    expect(standaloneChatActivity("idle", false)).toBeNull();
    expect(standaloneChatActivity("working", false, true)).toBeNull();
  });
});
