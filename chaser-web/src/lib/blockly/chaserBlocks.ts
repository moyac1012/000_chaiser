import type * as BlocklyType from "blockly";
import type { CommandKind } from "@/core/engine";

const COLOR_ACTION = "#f97316";
const COLOR_ON_TURN = "#2563eb";
const COLOR_VIEW = "#06b6d4";
const COLOR_STATE = "#22c55e";

const DIRECTIONS = [
  ["→ 右", "Right"],
  ["← 左", "Left"],
  ["↑ 上", "Up"],
  ["↓ 下", "Down"],
] as const;

const DIRECTION_AROUND_INDEX: Record<string, number> = {
  Up: 1,
  Down: 7,
  Left: 3,
  Right: 5,
};
const DEFAULT_LAST_DIR = "Up";

/**
 * docs/editor-blockly-actions.md の仕様:
 * - walk/put は「行動文ブロック (statement)」
 * - look/search は「行動式ブロック (reporter)」
 * - 行動はこのターンの行動として扱い、ターン終了は chaser_turn_end で明示する
 */
const ACTION_STATEMENT_BLOCKS = [
  {
    type: "chaser_action_walk",
    label: "歩く",
    method: "walk",
    tooltip: "1マス進む（このターンの行動）",
  },
  {
    type: "chaser_action_put",
    label: "ブロックを置く",
    method: "put",
    tooltip: "となりにブロックを置く（このターンの行動）",
  },
] as const satisfies Array<{
  type: string;
  label: string;
  method: "walk" | "put";
  tooltip: string;
}>;

const ACTION_REPORTER_BLOCKS = [
  {
    type: "chaser_action_look",
    label: "見る",
    method: "look",
    tooltip: "まわり 3×3 を見る（このターンの行動）",
  },
  {
    type: "chaser_action_search",
    label: "まっすぐ見る",
    method: "search",
    tooltip: "まっすぐ 9 マス先まで見る（このターンの行動）",
  },
] as const satisfies Array<{
  type: string;
  label: string;
  method: "look" | "search";
  tooltip: string;
}>;

const ACTION_STORE_BLOCKS = [
  {
    type: "chaser_action_look_store",
    prefix: "広く",
    method: "look",
    tooltip: "まわり 3×3 の結果を変数に入れる（このターンの行動）",
  },
  {
    type: "chaser_action_search_store",
    prefix: "まっすぐ",
    method: "search",
    tooltip: "直線 9 マスの結果を変数に入れる（このターンの行動）",
  },
] as const satisfies Array<{
  type: string;
  prefix: string;
  method: "look" | "search";
  tooltip: string;
}>;

const TILE_OPTIONS = [
  ["床 (0)", "0"],
  ["プレイヤー (1)", "1"],
  ["ブロック (2)", "2"],
  ["アイテム (3)", "3"],
] as const;

type BlocklyInstance = typeof BlocklyType;
type BlocklyJsGenerator =
  typeof import("blockly/javascript").javascriptGenerator;
type GeneratorWithOrder = BlocklyJsGenerator & {
  ORDER_NONE: number;
  ORDER_EQUALITY: number;
  ORDER_FUNCTION_CALL: number;
  ORDER_MEMBER: number;
  ORDER_ATOMIC: number;
};

type ToolboxItem = BlocklyType.utils.toolbox.ToolboxItemInfo;
type ToolboxCategoryWithContents = ToolboxItem & {
  kind: "category";
  contents: ToolboxItem[];
};

export const CHASER_CREATE_VARIABLE_CALLBACK = "CHASER_CREATE_VARIABLE";
const STATE_BLOCK_TYPES = [
  "chaser_state_create",
  "chaser_state_set",
  "chaser_state_get",
  "chaser_state_change",
] as const;

const hasCategoryContents = (
  item: ToolboxItem,
): item is ToolboxCategoryWithContents =>
  item.kind === "category" &&
  Array.isArray((item as { contents?: unknown }).contents);

export type ChaserToolboxOptions = {
  allowedActions?: CommandKind[];
  allowedBlocks?: readonly string[];
};

const filterToolboxContents = (
  contents: ToolboxItem[],
  allowedBlocks: Set<string>,
): ToolboxItem[] => {
  const filtered = contents.flatMap((item) => {
    if (hasCategoryContents(item)) {
      const childContents = filterToolboxContents(item.contents, allowedBlocks);
      if (childContents.length === 0) return [];
      return [{ ...item, contents: childContents }];
    }
    if (item.kind === "category") {
      return [];
    }
    if (item.kind === "block") {
      const blockType = (item as { type?: string }).type;
      if (!blockType) return [];
      return allowedBlocks.has(blockType) ? [item] : [];
    }
    return [item];
  });

  const trimmed = filtered.filter((item, index) => {
    if (item.kind !== "sep") return true;
    const hasBefore = filtered
      .slice(0, index)
      .some((entry) => entry.kind !== "sep");
    const hasAfter = filtered
      .slice(index + 1)
      .some((entry) => entry.kind !== "sep");
    return hasBefore && hasAfter;
  });

  const deduped: ToolboxItem[] = [];
  let previousSep = false;
  for (const item of trimmed) {
    if (item.kind === "sep") {
      if (previousSep) continue;
      previousSep = true;
    } else {
      previousSep = false;
    }
    deduped.push(item);
  }

  return deduped;
};

export function buildChaserToolboxDefinition(options?: ChaserToolboxOptions) {
  const allowedSet = options?.allowedActions
    ? new Set(options.allowedActions)
    : null;
  const allowedBlockSet = options?.allowedBlocks
    ? new Set(options.allowedBlocks)
    : null;
  const allowStateBlocks =
    !allowedBlockSet ||
    STATE_BLOCK_TYPES.some((blockType) => allowedBlockSet.has(blockType));
  const allowWalk = !allowedSet || allowedSet.has("walk");
  const allowedStatementActions = allowedSet
    ? ACTION_STATEMENT_BLOCKS.filter((action) => allowedSet.has(action.method))
    : ACTION_STATEMENT_BLOCKS;
  const allowedReporterActions = allowedSet
    ? ACTION_REPORTER_BLOCKS.filter((action) => allowedSet.has(action.method))
    : ACTION_REPORTER_BLOCKS;
  const allowedStoreActions = allowedSet
    ? ACTION_STORE_BLOCKS.filter((action) => allowedSet.has(action.method))
    : ACTION_STORE_BLOCKS;

  const toolboxDefinition = {
    kind: "categoryToolbox",
    contents: [
      {
        kind: "category",
        name: "スタート・行動",
        colour: COLOR_ON_TURN,
        contents: [
          { kind: "block", type: "chaser_on_start" },
          { kind: "block", type: "chaser_on_turn" },
          ...allowedStatementActions.map((action) => ({
            kind: "block",
            type: action.type,
          })),
          ...(allowWalk
            ? [
                { kind: "block", type: "chaser_action_walk_last" },
                { kind: "block", type: "chaser_action_walk_random" },
              ]
            : []),
          ...allowedReporterActions.map((action) => ({
            kind: "block",
            type: action.type,
          })),
          ...allowedStoreActions.map((action) => ({
            kind: "block",
            type: action.type,
          })),
          { kind: "block", type: "chaser_turn_end" },
        ],
      },
      {
        kind: "category",
        name: "まわりを見る",
        colour: COLOR_VIEW,
        contents: [
          { kind: "block", type: "chaser_get_tile" },
          { kind: "block", type: "chaser_is_tile" },
          { kind: "block", type: "chaser_get_around" },
          { kind: "block", type: "chaser_view_get_around" },
          { kind: "block", type: "chaser_view_has_tile" },
          { kind: "block", type: "chaser_discard_value" },
          { kind: "block", type: "chaser_tile_value" },
        ],
      },
      {
        kind: "category",
        name: "変数",
        colour: COLOR_STATE,
        contents: [
          ...(allowStateBlocks
            ? [
                {
                  kind: "button",
                  text: "%{BKY_NEW_VARIABLE}",
                  callbackkey: CHASER_CREATE_VARIABLE_CALLBACK,
                },
              ]
            : []),
          { kind: "block", type: "chaser_state_create" },
          { kind: "block", type: "chaser_state_set" },
          { kind: "block", type: "chaser_state_get" },
          { kind: "block", type: "chaser_state_change" },
          { kind: "block", type: "chaser_turn_number" },
          { kind: "block", type: "chaser_last_direction" },
          { kind: "block", type: "chaser_direction_value" },
        ],
      },
      { kind: "sep" },
      {
        kind: "category",
        name: "条件",
        colour: "210",
        contents: [
          { kind: "block", type: "controls_if" },
          { kind: "block", type: "logic_compare" },
          { kind: "block", type: "logic_operation" },
          { kind: "block", type: "logic_boolean" },
          { kind: "block", type: "logic_negate" },
        ],
      },
      {
        kind: "category",
        name: "数",
        colour: "230",
        contents: [
          { kind: "block", type: "math_number" },
          { kind: "block", type: "math_arithmetic" },
          { kind: "block", type: "math_modulo" },
          { kind: "block", type: "math_number_property" },
          { kind: "block", type: "math_random_int" },
          { kind: "block", type: "math_random_float" },
        ],
      },
    ],
  } satisfies BlocklyType.utils.toolbox.ToolboxDefinition;

  if (!options?.allowedBlocks) return toolboxDefinition;

  const allowedBlocks = new Set(options.allowedBlocks);
  return {
    ...toolboxDefinition,
    contents: filterToolboxContents(
      toolboxDefinition.contents as ToolboxItem[],
      allowedBlocks,
    ),
  } satisfies BlocklyType.utils.toolbox.ToolboxDefinition;
}

export function registerChaserBlocks(
  Blockly: BlocklyInstance,
  generator: BlocklyJsGenerator,
) {
  const gen = generator as GeneratorWithOrder;
  if ((Blockly.Blocks as Record<string, unknown>).chaser_on_turn) return;

  // blockly/javascript の標準変数宣言（`var x;`）を Bot 向けに上書きし、
  // 変数が「ターンを跨ぐ状態」として使いやすいように初期値 0 を付与する。
  // 後方互換は不要（未ローンチ）なので、ここで生成コードの形を統一する。
  {
    const patchKey = "__chaserBotVarsInitPatched__";
    const generatorAny = gen as unknown as Record<string, unknown>;
    if (!generatorAny[patchKey]) {
      generatorAny[patchKey] = true;
      const originalInit = gen.init.bind(gen);
      gen.init = (workspace) => {
        originalInit(workspace);
        const defs = (
          gen as unknown as {
            definitions_?: Record<string, string>;
          }
        ).definitions_;
        if (!defs) return;
        // v12 以降は getAllVariables が deprecated なので VariableMap 経由に寄せる。
        const vars =
          workspace.getVariableMap?.().getAllVariables?.() ??
          workspace.getAllVariables();
        const names = vars.map((variable) =>
          gen.getVariableName(variable.getId()),
        );
        if (names.length === 0) {
          delete defs.variables;
        } else {
          defs.variables = names.map((name) => `var ${name} = 0;`).join("\n");
        }
        defs.__chaserLastAction = "var __chaserLastAction = null;";
        defs.__chaserTurn = "var __chaserTurn = 0;";
      };
    }
  }

  const blockJson = [
    {
      type: "chaser_on_start",
      message0: "最初に1回だけ",
      message1: "やること %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: COLOR_ON_TURN,
      tooltip: "最初の1回だけ動くブロックです（行動ブロックは使えません）。",
      helpUrl: "",
      hat: "cap",
    },
    {
      type: "chaser_on_turn",
      message0: "毎ターン",
      message1: "やること %1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: COLOR_ON_TURN,
      tooltip: "毎ターンここから始まります。",
      helpUrl: "",
      hat: "cap",
    },
    {
      type: "chaser_turn_end",
      message0: "ターンを終える",
      previousStatement: null,
      colour: COLOR_ON_TURN,
      tooltip: "このターンを終了します。行動を1回選んでから置いてください。",
    },
    {
      type: "chaser_state_create",
      message0: "変数を作る %1",
      args0: [
        {
          type: "field_variable",
          name: "VAR",
          variable: "x",
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR_STATE,
      tooltip: "変数を作ります。",
    },
    {
      type: "chaser_state_set",
      message0: "変数 %1 に %2 を入れる",
      args0: [
        {
          type: "field_variable",
          name: "VAR",
          variable: "x",
        },
        // look/search の観測配列も入れられるように、型チェックは付けない。
        { type: "input_value", name: "VALUE" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR_STATE,
      tooltip: "変数に値を入れます。",
    },
    {
      type: "chaser_state_get",
      message0: "変数 %1",
      args0: [
        {
          type: "field_variable",
          name: "VAR",
          variable: "x",
        },
      ],
      output: "Number",
      colour: COLOR_STATE,
      tooltip: "変数の値を読みます。",
    },
    {
      type: "chaser_state_change",
      message0: "変数 %1 を %2 だけ増減",
      args0: [
        {
          type: "field_variable",
          name: "VAR",
          variable: "x",
        },
        { type: "input_value", name: "DELTA", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR_STATE,
      tooltip: "変数を増減します（未初期化でも 0 として扱います）。",
    },
    {
      type: "chaser_turn_number",
      message0: "現在のターン数",
      output: "Number",
      colour: COLOR_STATE,
      tooltip: "現在のターン数（1始まり）を返します。",
    },
    {
      type: "chaser_last_direction",
      message0: "前に進んだ向き",
      output: "Direction",
      colour: COLOR_STATE,
      tooltip: `前に進んだ向きを返します（最初のターンは ${DEFAULT_LAST_DIR} 扱い）。`,
    },
    {
      type: "chaser_direction_value",
      message0: "向き %1",
      args0: [
        {
          type: "field_dropdown",
          name: "DIR",
          options: DIRECTIONS,
        },
      ],
      output: "Direction",
      colour: COLOR_STATE,
      tooltip: "向きを選ぶためのブロックです。",
    },
    // 学習の負荷を下げるため、定番の判定・移動を短いブロックで用意する。
    {
      type: "chaser_action_walk_last",
      message0: "前に進んだ向きで歩く（最初は %1）",
      args0: [
        {
          type: "field_dropdown",
          name: "DIR",
          options: DIRECTIONS,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR_ACTION,
      tooltip:
        "前に進んだ向きで歩きます（最初のターンは指定方向）。最後に「ターンを終える」を置いてください。",
    },
    {
      type: "chaser_action_walk_random",
      message0: "どこかに歩く",
      previousStatement: null,
      nextStatement: null,
      colour: COLOR_ACTION,
      tooltip:
        "ブロック(2)を避けてランダムに歩きます（全方向がブロックならランダムに歩く）。最後に「ターンを終える」を置いてください。",
    },
    ...ACTION_STATEMENT_BLOCKS.map((action) => ({
      type: action.type,
      message0: `${action.label} %1`,
      args0: [
        {
          type: "field_dropdown",
          name: "DIR",
          options: [
            ["↑ 上", "Up"],
            ["↓ 下", "Down"],
            ["← 左", "Left"],
            ["→ 右", "Right"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR_ACTION,
      tooltip: `${action.tooltip}。最後に「ターンを終える」を置いてください。`,
    })),
    ...ACTION_REPORTER_BLOCKS.map((action) => ({
      type: action.type,
      message0: `${action.label} %1`,
      args0: [
        {
          type: "field_dropdown",
          name: "DIR",
          options: [
            ["↑ 上", "Up"],
            ["↓ 下", "Down"],
            ["← 左", "Left"],
            ["→ 右", "Right"],
          ],
        },
      ],
      output: "Array",
      colour: COLOR_ACTION,
      tooltip: `${action.tooltip}。最後に「ターンを終える」を置いてください。`,
    })),
    ...ACTION_STORE_BLOCKS.map((action) => ({
      type: action.type,
      message0: `${action.prefix} %1 を見た結果を %2 に入れる`,
      args0: [
        {
          type: "field_dropdown",
          name: "DIR",
          options: DIRECTIONS,
        },
        {
          type: "field_variable",
          name: "VAR",
          variable: "x",
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR_ACTION,
      tooltip: `${action.tooltip}。最後に「ターンを終える」を置いてください。`,
    })),
    {
      type: "chaser_get_tile",
      message0: "方向 %1 のマス",
      args0: [
        {
          type: "field_dropdown",
          name: "DIR",
          options: DIRECTIONS,
        },
      ],
      output: "Number",
      colour: COLOR_VIEW,
      tooltip:
        "上下左右のマスの種類を返します (0:床 / 1:プレイヤー / 2:ブロック / 3:アイテム)",
    },
    {
      type: "chaser_is_tile",
      message0: "方向 %1 のマスは %2 ?",
      args0: [
        {
          type: "field_dropdown",
          name: "DIR",
          options: DIRECTIONS,
        },
        {
          type: "field_dropdown",
          name: "TILE",
          options: TILE_OPTIONS,
        },
      ],
      output: "Boolean",
      colour: COLOR_VIEW,
      tooltip: "指定方向のマスが特定のタイルか判定します。",
    },
    {
      type: "chaser_get_around",
      message0: "まわりの %1 番",
      args0: [{ type: "input_value", name: "INDEX", check: "Number" }],
      output: "Number",
      colour: COLOR_VIEW,
      tooltip: "まわりの見えた結果の 0〜8 番を返します。",
    },
    {
      type: "chaser_view_get_around",
      message0: "見た結果 %1 の %2 番",
      args0: [
        { type: "input_value", name: "VIEW" },
        { type: "input_value", name: "INDEX", check: "Number" },
      ],
      output: "Number",
      colour: COLOR_VIEW,
      tooltip: "見た結果の 0〜8 番を返します。",
    },
    {
      type: "chaser_view_has_tile",
      message0: "見た結果 %1 に %2 がある",
      args0: [
        { type: "input_value", name: "VIEW" },
        {
          type: "field_dropdown",
          name: "TILE",
          options: TILE_OPTIONS,
        },
      ],
      output: "Boolean",
      colour: COLOR_VIEW,
      tooltip: "見た結果の中に指定のマスがあるか調べます。",
    },
    {
      type: "chaser_discard_value",
      message0: "結果を使わない %1",
      args0: [{ type: "input_value", name: "VALUE" }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR_VIEW,
      tooltip: "見る/探索の結果をその場で使わないときに使います。",
    },
    {
      type: "chaser_tile_value",
      message0: "マスの種類 %1",
      args0: [
        {
          type: "field_dropdown",
          name: "TILE",
          options: TILE_OPTIONS,
        },
      ],
      output: "Number",
      colour: COLOR_VIEW,
      tooltip: "マスの種類を選ぶブロックです。",
    },
  ];

  Blockly.common.defineBlocksWithJsonArray(blockJson);

  gen.forBlock.chaser_on_start = (block: BlocklyType.Block) => {
    const statements = gen.statementToCode(block, "DO");
    const body = statements.trim()
      ? statements
      : "// TODO: 初期化の処理をここに書いてください。\n";
    return `${body}\n`;
  };

  gen.forBlock.chaser_on_turn = (block: BlocklyType.Block) => {
    const statements = gen.statementToCode(block, "DO");
    const body = statements.trim()
      ? statements
      : "  // TODO: ブロックを配置して行動を組み立ててください。\n";
    const turnLine =
      '  __chaserTurn = (typeof __chaserTurn === "number" ? __chaserTurn : 0) + 1;\n';
    const turnEndGuard =
      "  if (!__chaserTurnEnded) {\n" +
      '    throw new Error("ターンを終えるブロックを置いてください。");\n' +
      "  }\n";
    return `function onTurn(api) {\n${turnLine}  let __chaserTurnEnded = false;\n${body}${turnEndGuard}}\n`;
  };

  gen.forBlock.chaser_turn_end = () => {
    return "__chaserTurnEnded = true;\nreturn;\n";
  };

  gen.forBlock.chaser_state_create = () => "";

  gen.forBlock.chaser_state_set = (block: BlocklyType.Block) => {
    const varId = block.getFieldValue("VAR") ?? "";
    const value = gen.valueToCode(block, "VALUE", gen.ORDER_NONE) || "0";
    return `${gen.getVariableName(varId)} = ${value};\n`;
  };

  gen.forBlock.chaser_state_get = (block: BlocklyType.Block) => {
    const varId = block.getFieldValue("VAR") ?? "";
    const code = gen.getVariableName(varId);
    return [code, gen.ORDER_ATOMIC];
  };

  gen.forBlock.chaser_state_change = (block: BlocklyType.Block) => {
    const varId = block.getFieldValue("VAR") ?? "";
    const delta = gen.valueToCode(block, "DELTA", gen.ORDER_NONE) || "0";
    const name = gen.getVariableName(varId);
    return `${name} = (typeof ${name} === "number" ? ${name} : 0) + (${delta});\n`;
  };

  gen.forBlock.chaser_turn_number = () => {
    return ["__chaserTurn", gen.ORDER_ATOMIC];
  };

  gen.forBlock.chaser_last_direction = () => {
    const code = `(__chaserLastAction && __chaserLastAction.dir) || "${DEFAULT_LAST_DIR}"`;
    return [code, gen.ORDER_NONE];
  };

  gen.forBlock.chaser_direction_value = (block: BlocklyType.Block) => {
    const dir = block.getFieldValue("DIR") ?? "Right";
    return [`"${dir}"`, gen.ORDER_ATOMIC];
  };

  gen.forBlock.chaser_action_walk_last = (block: BlocklyType.Block) => {
    const fallback = (block.getFieldValue("DIR") as string | null) ?? "Up";
    const dirExpr = `(__chaserLastAction && __chaserLastAction.dir) || "${fallback}"`;
    return `(() => { const __dir = ${dirExpr}; __chaserLastAction = { kind: "walk", dir: __dir }; api["walk" + __dir](); })();\n`;
  };

  gen.forBlock.chaser_action_walk_random = () => {
    return (
      `(() => {\n` +
      `  const __dirs = ["Up", "Down", "Left", "Right"];\n` +
      `  const __candidates = [];\n` +
      `  if (api.around[${DIRECTION_AROUND_INDEX.Up}] !== 2) __candidates.push("Up");\n` +
      `  if (api.around[${DIRECTION_AROUND_INDEX.Down}] !== 2) __candidates.push("Down");\n` +
      `  if (api.around[${DIRECTION_AROUND_INDEX.Left}] !== 2) __candidates.push("Left");\n` +
      `  if (api.around[${DIRECTION_AROUND_INDEX.Right}] !== 2) __candidates.push("Right");\n` +
      `  const __pool = __candidates.length ? __candidates : __dirs;\n` +
      `  const __dir = __pool[Math.floor(Math.random() * __pool.length)];\n` +
      `  __chaserLastAction = { kind: "walk", dir: __dir };\n` +
      `  api["walk" + __dir]();\n` +
      `})();\n`
    );
  };

  for (const action of ACTION_STATEMENT_BLOCKS) {
    gen.forBlock[action.type] = (block: BlocklyType.Block) => {
      const dir = (block.getFieldValue("DIR") as string | null) ?? "Right";
      const funcName = `${action.method}${dir}`;
      // 行動文ブロックは行動を実行する（ターン終了は別ブロックで明示）。
      const lastAction = `{ kind: "${action.method}", dir: "${dir}" }`;
      return `__chaserLastAction = ${lastAction};\napi.${funcName}();\n`;
    };
  }

  for (const action of ACTION_REPORTER_BLOCKS) {
    gen.forBlock[action.type] = (block: BlocklyType.Block) => {
      const dir = (block.getFieldValue("DIR") as string | null) ?? "Right";
      const funcName = `${action.method}${dir}`;
      // 行動式（look/search）は値を返す。ターン終了は turn_end ブロックで明示する。
      const lastAction = `{ kind: "${action.method}", dir: "${dir}" }`;
      const code = `(() => { __chaserLastAction = ${lastAction}; return api.${funcName}(); })()`;
      return [code, gen.ORDER_FUNCTION_CALL];
    };
  }

  for (const action of ACTION_STORE_BLOCKS) {
    gen.forBlock[action.type] = (block: BlocklyType.Block) => {
      const dir = (block.getFieldValue("DIR") as string | null) ?? "Right";
      const varId = block.getFieldValue("VAR") ?? "";
      const funcName = `${action.method}${dir}`;
      const lastAction = `{ kind: "${action.method}", dir: "${dir}" }`;
      const name = gen.getVariableName(varId);
      return `__chaserLastAction = ${lastAction};\n${name} = api.${funcName}();\n`;
    };
  }

  gen.forBlock.chaser_get_tile = (block: BlocklyType.Block) => {
    const dir = block.getFieldValue("DIR") ?? "Right";
    const index = DIRECTION_AROUND_INDEX[dir] ?? DIRECTION_AROUND_INDEX.Right;
    const code = `api.around[${index}]`;
    return [code, gen.ORDER_MEMBER];
  };

  gen.forBlock.chaser_is_tile = (block: BlocklyType.Block) => {
    const dir = block.getFieldValue("DIR") ?? "Right";
    const tile = block.getFieldValue("TILE") ?? "0";
    const index = DIRECTION_AROUND_INDEX[dir] ?? DIRECTION_AROUND_INDEX.Right;
    const code = `api.around[${index}] === ${tile}`;
    return [code, gen.ORDER_EQUALITY];
  };

  gen.forBlock.chaser_get_around = (block: BlocklyType.Block) => {
    const index = gen.valueToCode(block, "INDEX", gen.ORDER_NONE) || "0";
    const code = `api.around[${index}]`;
    return [code, gen.ORDER_MEMBER];
  };

  gen.forBlock.chaser_view_get_around = (block: BlocklyType.Block) => {
    const view = gen.valueToCode(block, "VIEW", gen.ORDER_NONE) || "[]";
    const index = gen.valueToCode(block, "INDEX", gen.ORDER_NONE) || "0";
    const code = `(${view})[${index}]`;
    return [code, gen.ORDER_MEMBER];
  };

  gen.forBlock.chaser_view_has_tile = (block: BlocklyType.Block) => {
    const view = gen.valueToCode(block, "VIEW", gen.ORDER_NONE) || "[]";
    const tile = block.getFieldValue("TILE") ?? "0";
    const code = `(${view}).includes(${tile})`;
    return [code, gen.ORDER_FUNCTION_CALL];
  };

  gen.forBlock.chaser_discard_value = (block: BlocklyType.Block) => {
    const value =
      gen.valueToCode(block, "VALUE", gen.ORDER_NONE) || "undefined";
    return `${value};\n`;
  };

  gen.forBlock.chaser_tile_value = (block: BlocklyType.Block) => {
    const tile = block.getFieldValue("TILE") ?? "0";
    return [tile, gen.ORDER_ATOMIC];
  };
}
