import { describe, expect, test } from "bun:test";

import { getUnsupportedBotRuntimeReason } from "@/lib/bot/language";

describe("bot runtime language availability", () => {
  test("allows js and blockly in all surfaces", () => {
    expect(getUnsupportedBotRuntimeReason("js", "onlineMatch")).toBeNull();
    expect(
      getUnsupportedBotRuntimeReason("blockly", "localTraining"),
    ).toBeNull();
  });

  test("allows ruby again after worker isolation", () => {
    expect(getUnsupportedBotRuntimeReason("ruby", "onlineMatch")).toBeNull();
    expect(getUnsupportedBotRuntimeReason("ruby", "localTraining")).toBeNull();
  });
});
