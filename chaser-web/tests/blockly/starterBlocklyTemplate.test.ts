import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";

import type * as BlocklyType from "blockly";
import "blockly/blocks";
import * as Blockly from "blockly/core";
import { javascriptGenerator } from "blockly/javascript";
import * as BlocklyJa from "blockly/msg/ja";

import { getTurnView, initGame } from "@/core/engine";
import { DEFAULT_MAP_ID } from "@/core/map";
import { registerChaserBlocks } from "@/lib/blockly/chaserBlocks";
import { WorkerBotExecutor } from "@/lib/bot/executor";

function extractStarterBlocklyXml(): string {
  const routePath = new URL("../../src/app/api/bots/route.ts", import.meta.url);
  const content = readFileSync(routePath, "utf8");
  const match = content.match(
    /const starterBlocklyXml = `([\s\S]*?)`\.trim\(\);/m,
  );
  if (!match) throw new Error("starterBlocklyXml not found");
  return match[1] ?? "";
}

describe("starterBlocklyXml", () => {
  it("loads, generates code, and runs in WorkerBotExecutor", async () => {
    // starterBlocklyXml は日本語ロケールでの利用を前提にしているため、
    // 標準ブロックのメッセージ解決が崩れないように locale をセットしてからロードする。
    Blockly.setLocale(BlocklyJa as unknown as Record<string, string>);
    registerChaserBlocks(
      Blockly as unknown as typeof BlocklyType,
      javascriptGenerator,
    );

    const xml = extractStarterBlocklyXml();
    const workspace = new Blockly.Workspace();
    const dom = Blockly.utils.xml.textToDom(xml);
    Blockly.Xml.domToWorkspace(dom, workspace);
    const code = javascriptGenerator.workspaceToCode(workspace);

    const baseState = initGame(DEFAULT_MAP_ID);
    const executor = new WorkerBotExecutor(code, { timeoutMs: 100 });

    // タイルをすべて床にして、テンプレの walk 分岐を確実に通す。
    const around = Array(9).fill(0);

    const first = await executor.runTurn({
      state: baseState,
      playerId: "Cool",
      around,
    });
    const second = await executor.runTurn({
      state: baseState,
      playerId: "Cool",
      around,
    });

    // 右がブロックではないので、毎ターン Right に歩く。
    expect(first.action).toEqual({ kind: "walk", dir: "Right" });
    expect(second.action).toEqual({ kind: "walk", dir: "Right" });

    // 念のため、生成コードが onTurn を含むことも確認しておく。
    expect(code).toContain("function onTurn(api)");

    // 生成コードが api.around を参照している前提なので、view 生成も成立することを確認。
    expect(getTurnView(baseState, "Cool").around).toHaveLength(9);
  });
});
