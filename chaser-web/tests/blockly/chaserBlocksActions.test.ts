import { describe, expect, it } from "bun:test";

import type * as BlocklyType from "blockly";
import "blockly/blocks";
import * as Blockly from "blockly/core";
import { javascriptGenerator } from "blockly/javascript";

import { registerChaserBlocks } from "@/lib/blockly/chaserBlocks";

function generateCode(state: unknown): string {
  registerChaserBlocks(
    Blockly as unknown as typeof BlocklyType,
    javascriptGenerator,
  );
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state as never, workspace);
  return javascriptGenerator.workspaceToCode(workspace);
}

describe("Blockly chaser action blocks", () => {
  it("generates walk/put as statements without implicit return", () => {
    const code = generateCode({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "chaser_on_turn",
            x: 0,
            y: 0,
            inputs: {
              DO: {
                block: {
                  type: "chaser_action_walk",
                  fields: { DIR: "Up" },
                },
              },
            },
          },
        ],
      },
    });
    expect(code).toContain("api.walkUp();");
    expect(code).not.toContain("return;");
  });

  it("requires explicit turn end in onTurn", () => {
    const code = generateCode({
      blocks: {
        languageVersion: 0,
        blocks: [{ type: "chaser_on_turn", x: 0, y: 0 }],
      },
    });

    expect(code).toContain("let __chaserTurnEnded = false;");
    expect(code).toContain("ターンを終えるブロックを置いてください");
  });

  it("returns when turn end block is used after reporter actions", () => {
    const code = generateCode({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "chaser_on_turn",
            x: 0,
            y: 0,
            inputs: {
              DO: {
                block: {
                  type: "chaser_discard_value",
                  inputs: {
                    VALUE: {
                      block: {
                        type: "chaser_action_search",
                        fields: { DIR: "Right" },
                      },
                    },
                  },
                  next: { block: { type: "chaser_turn_end" } },
                },
              },
            },
          },
        ],
      },
    });

    const searchIndex = code.indexOf("api.searchRight()");
    const returnIndex = code.indexOf("return;", searchIndex);
    expect(searchIndex).toBeGreaterThanOrEqual(0);
    expect(returnIndex).toBeGreaterThan(searchIndex);
    expect(code).toContain("__chaserTurnEnded = true;");
  });

  it("stores observation results with helper blocks", () => {
    const memoId = "memo-var";
    const scoutId = "scout-var";
    const code = generateCode({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "chaser_on_turn",
            x: 0,
            y: 0,
            inputs: {
              DO: {
                block: {
                  type: "chaser_action_look_store",
                  fields: { DIR: "Up", VAR: { id: memoId } },
                  next: {
                    block: {
                      type: "chaser_action_search_store",
                      fields: { DIR: "Right", VAR: { id: scoutId } },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      variables: [
        { name: "memo", id: memoId },
        { name: "scout", id: scoutId },
      ],
    });

    expect(code).toContain('__chaserLastAction = { kind: "look", dir: "Up" };');
    expect(code).toContain("memo = api.lookUp();");
    expect(code).toContain(
      '__chaserLastAction = { kind: "search", dir: "Right" };',
    );
    expect(code).toContain("scout = api.searchRight();");
  });

  it("generates walk-last using last direction fallback", () => {
    const code = generateCode({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "chaser_on_turn",
            x: 0,
            y: 0,
            inputs: {
              DO: {
                block: {
                  type: "chaser_action_walk_last",
                  fields: { DIR: "Left" },
                },
              },
            },
          },
        ],
      },
    });

    expect(code).toContain("__chaserLastAction");
    expect(code).toContain('api["walk" + __dir]();');
    expect(code).not.toContain("return;");
  });

  it("provides current turn number and increments each turn", () => {
    const code = generateCode({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "chaser_on_turn",
            x: 0,
            y: 0,
            inputs: {
              DO: {
                block: {
                  type: "chaser_discard_value",
                  inputs: {
                    VALUE: {
                      block: {
                        type: "chaser_turn_number",
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });

    expect(code).toContain("__chaserTurn =");
    expect(code).toContain("__chaserTurn;");
  });

  it("generates a random safe walk action", () => {
    const code = generateCode({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "chaser_on_turn",
            x: 0,
            y: 0,
            inputs: {
              DO: {
                block: {
                  type: "chaser_action_walk_random",
                },
              },
            },
          },
        ],
      },
    });

    expect(code).toContain("Math.random()");
    expect(code).toContain("api.around[1]");
    expect(code).toContain("api.around[7]");
    expect(code).toContain("api.around[3]");
    expect(code).toContain("api.around[5]");
    expect(code).toContain(
      '__chaserLastAction = { kind: "walk", dir: __dir };',
    );
    expect(code).toContain('api["walk" + __dir]();');
    expect(code).not.toContain("return;");
  });

  it("provides easy tile/view checks", () => {
    const code = generateCode({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: "chaser_on_turn",
            x: 0,
            y: 0,
            inputs: {
              DO: {
                block: {
                  type: "controls_if",
                  inputs: {
                    IF0: {
                      block: {
                        type: "chaser_is_tile",
                        fields: { DIR: "Right", TILE: "2" },
                      },
                    },
                    DO0: {
                      block: {
                        type: "chaser_discard_value",
                        inputs: {
                          VALUE: {
                            block: {
                              type: "chaser_view_has_tile",
                              fields: { TILE: "2" },
                              inputs: {
                                VIEW: {
                                  block: {
                                    type: "chaser_action_search",
                                    fields: { DIR: "Up" },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });

    expect(code).toContain("api.around[5] === 2");
    expect(code).toContain(".includes(2)");
  });
});
