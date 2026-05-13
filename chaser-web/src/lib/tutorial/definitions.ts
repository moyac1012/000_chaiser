import type { CommandKind } from "@/core/engine";

import { TUTORIAL_MAPS } from "./maps";
import type { TutorialMapAsset, TutorialStepDefinition } from "./types";

const WALK_ONLY: CommandKind[] = ["walk"];
const WALK_LOOK: CommandKind[] = ["walk", "look"];
const WALK_SEARCH: CommandKind[] = ["walk", "search"];
const WALK_LOOK_SEARCH: CommandKind[] = ["walk", "look", "search"];
const WALK_PUT: CommandKind[] = ["walk", "put"];
const ALL_ACTIONS: CommandKind[] = ["walk", "look", "search", "put"];

const BLOCKS_WALK_BASIC = [
  "chaser_on_turn",
  "chaser_turn_end",
  "chaser_action_walk",
] as const;

const BLOCKS_WALK_SEQUENCE = [
  ...BLOCKS_WALK_BASIC,
  "controls_if",
  "logic_compare",
  "math_number",
  "chaser_turn_number",
] as const;

const BLOCKS_WALK_PATTERN = [...BLOCKS_WALK_SEQUENCE, "math_modulo"] as const;

const BLOCKS_WALK_BRANCH = [
  ...BLOCKS_WALK_PATTERN,
  "chaser_get_tile",
  "chaser_is_tile",
  "chaser_tile_value",
] as const;

const BLOCKS_WALK_MEMORY = [
  ...BLOCKS_WALK_BRANCH,
  "chaser_action_walk_last",
  "chaser_get_around",
  "chaser_last_direction",
  "chaser_state_create",
  "chaser_state_set",
  "chaser_state_get",
  "chaser_state_change",
  "chaser_direction_value",
] as const;

const BLOCKS_LOOK = [
  ...BLOCKS_WALK_MEMORY,
  "chaser_action_look_store",
  "chaser_view_get_around",
  "chaser_view_has_tile",
] as const;

const BLOCKS_SEARCH = [...BLOCKS_LOOK, "chaser_action_search_store"] as const;

const BASIC_JS_STARTER = `// TODO: 1ターンに1回だけ行動を選んでください。
function onTurn(api) {
  // 例: api.walkUp()
}
`;

const BASIC_BLOCKLY_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="chaser_on_turn" x="40" y="40">
    <statement name="DO">
      <block type="chaser_turn_end"></block>
    </statement>
  </block>
</xml>`;

const variant = (asset: TutorialMapAsset) => ({
  mapId: asset.map.id,
  goal: asset.goal,
});

const STEP_01_A = TUTORIAL_MAPS["tutorial-step-01-a"];
const STEP_02_A = TUTORIAL_MAPS["tutorial-step-02-a"];
const STEP_03_A = TUTORIAL_MAPS["tutorial-step-03-a"];
const STEP_04_A = TUTORIAL_MAPS["tutorial-step-04-a"];
const STEP_05_A = TUTORIAL_MAPS["tutorial-step-05-a"];
const STEP_06_A = TUTORIAL_MAPS["tutorial-step-06-a"];
const STEP_07_A = TUTORIAL_MAPS["tutorial-step-07-a"];
const STEP_08_A = TUTORIAL_MAPS["tutorial-step-08-a"];
const STEP_08_B = TUTORIAL_MAPS["tutorial-step-08-b"];
const STEP_09_A = TUTORIAL_MAPS["tutorial-step-09-a"];
const STEP_09_B = TUTORIAL_MAPS["tutorial-step-09-b"];
const STEP_10_A = TUTORIAL_MAPS["tutorial-step-10-a"];
const STEP_10_B = TUTORIAL_MAPS["tutorial-step-10-b"];
const STEP_11_A = TUTORIAL_MAPS["tutorial-step-11-a"];
const STEP_11_B = TUTORIAL_MAPS["tutorial-step-11-b"];
const STEP_12_A = TUTORIAL_MAPS["tutorial-step-12-a"];
const STEP_12_B = TUTORIAL_MAPS["tutorial-step-12-b"];
const STEP_13_A = TUTORIAL_MAPS["tutorial-step-13-a"];
const STEP_14_A = TUTORIAL_MAPS["tutorial-step-14-a"];
const STEP_14_B = TUTORIAL_MAPS["tutorial-step-14-b"];
const STEP_15_A = TUTORIAL_MAPS["tutorial-step-15-a"];
const STEP_16_A = TUTORIAL_MAPS["tutorial-step-16-a"];
const STEP_16_B = TUTORIAL_MAPS["tutorial-step-16-b"];
const STEP_17_A = TUTORIAL_MAPS["tutorial-step-17-a"];
const STEP_18_A = TUTORIAL_MAPS["tutorial-step-18-a"];
const STEP_18_B = TUTORIAL_MAPS["tutorial-step-18-b"];
const STEP_19_A = TUTORIAL_MAPS["tutorial-step-19-a"];
const STEP_19_B = TUTORIAL_MAPS["tutorial-step-19-b"];
const STEP_20_A = TUTORIAL_MAPS["tutorial-step-20-a"];
const STEP_21_A = TUTORIAL_MAPS["tutorial-step-21-a"];
const STEP_21_B = TUTORIAL_MAPS["tutorial-step-21-b"];
const STEP_22_A = TUTORIAL_MAPS["tutorial-step-22-a"];
const STEP_23_A = TUTORIAL_MAPS["tutorial-step-23-a"];
const STEP_23_B = TUTORIAL_MAPS["tutorial-step-23-b"];
const STEP_24_A = TUTORIAL_MAPS["tutorial-step-24-a"];
const STEP_24_B = TUTORIAL_MAPS["tutorial-step-24-b"];

export const TUTORIAL_STEPS: TutorialStepDefinition[] = [
  {
    id: "step-01-walk-up",
    title: "上に進んでみよう",
    summary: "上に1マスだけ進む",
    description: [
      "1ターンに1回だけ行動を選びます。",
      "行動したらそのターンは終わり、次のターンになります。",
      "タイルの凡例: 0床/1キャラ/2ブロック/3アイテム。",
      "まずは上に1マス進んでゴールへ到達しましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_BASIC,
    validation: { kind: "reachGoal", maxActions: 1 },
    mapVariants: [variant(STEP_01_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "上方向に1回だけ歩けばクリアできます。",
      "行動は1ターンに1回だけなので、1回だけ歩くようにします。",
    ],
  },
  {
    id: "step-02-walk-repeat",
    title: "連続して上に進もう",
    summary: "毎ターン同じ方向へ進む",
    description: [
      "同じ行動を毎ターン返すと、少しずつ前進できます。",
      "ゴールまで連続で進んでみましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_BASIC,
    validation: { kind: "reachGoal", maxActions: 6 },
    mapVariants: [variant(STEP_02_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "毎ターン上へ歩くようにして、少しずつ進みます。",
      "ゴールまでの回数だけ同じ行動を続けます。",
    ],
  },
  {
    id: "step-03-walk-right",
    title: "右に進んでみよう",
    summary: "右へ進み続ける",
    description: [
      "今度は右方向へ進みます。",
      "ゴールまで右へ進んでみましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_BASIC,
    validation: { kind: "reachGoal", maxActions: 6 },
    mapVariants: [variant(STEP_03_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: ["右へ歩く行動だけを繰り返します。", "曲がらずに右へ進み続けます。"],
  },
  {
    id: "step-04-l-maze",
    title: "曲がってゴールへ",
    summary: "上と右を組み合わせて進む",
    description: [
      "通路の形に合わせて方向を変えます。",
      "上に進んだあと、右に曲がってゴールへ進みましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_SEQUENCE,
    validation: { kind: "reachGoal", maxActions: 12 },
    mapVariants: [variant(STEP_04_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "最初は上、途中で右に曲がります。",
      "ターン数で「上に進む期間」「右に進む期間」を分けると作りやすいです。",
    ],
  },
  {
    id: "step-05-two-turns",
    title: "3回曲がって進もう",
    summary: "上→右→上→右の順で進む",
    description: [
      "曲がる回数が増えます。",
      "通路の形に合わせて3回曲がってゴールへ進みましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_SEQUENCE,
    validation: { kind: "reachGoal", maxActions: 14 },
    mapVariants: [variant(STEP_05_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "上→右→上→右の順で方向を切り替えます。",
      "ターン数ごとに進む向きを決めると迷いません。",
    ],
  },
  {
    id: "step-06-repeat-pattern",
    title: "繰り返しパターンで進む",
    summary: "同じ動きを繰り返して前進する",
    description: [
      "同じ並びの動きを繰り返すと遠くまで進めます。",
      "右→上のパターンを作って進みましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_PATTERN,
    validation: { kind: "reachGoal", maxActions: 12 },
    mapVariants: [variant(STEP_06_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "右→上を交互に繰り返すパターンで進みます。",
      "ターン数を2で割った余りで「右/上」を切り替えられます。",
    ],
  },
  {
    id: "step-07-turn-limit-basic",
    title: "ターン以内でゴール",
    summary: "最短ルートを選ぶ",
    description: [
      "制限手数以内にゴールへ到達する必要があります。",
      "遠回りを避けて最短で進みましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_PATTERN,
    validation: { kind: "reachGoal", maxActions: 8 },
    mapVariants: [variant(STEP_07_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "ゴールまでの最短手数を数えて、その回数だけ動きます。",
      "余計な曲がりや戻りをしないようにします。",
    ],
  },
  {
    id: "step-08-up-down-branch",
    title: "上か下を選んで進もう",
    summary: "if で上下を選ぶ",
    description: [
      "2つのマップを同じコードでクリアします。",
      "上下どちらが安全かを if で判断して進みましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_BRANCH,
    validation: { kind: "reachGoal", maxActions: 2 },
    mapVariants: [variant(STEP_08_A), variant(STEP_08_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "上下のマスを調べて、ブロック(2)がない方へ進みます。",
      "if の条件は「上がブロックなら下へ」のように単純でOKです。",
    ],
  },
  {
    id: "step-09-branch-left-right",
    title: "左右を見て進もう",
    summary: "if で左右を選ぶ",
    description: [
      "2つのマップを同じコードでクリアします。",
      "進んだ先で左右に分かれるので、if で進行方向を決めましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_BRANCH,
    validation: { kind: "reachGoal", maxActions: 10 },
    mapVariants: [variant(STEP_09_A), variant(STEP_09_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "分岐に着いたら左右のマスを調べて、空いている方へ進みます。",
      "分岐に来るまでは同じ方向（上）で進んでOKです。",
    ],
  },
  {
    id: "step-10-remember-direction",
    title: "向きを覚えて進もう",
    summary: "一度決めた向きで進み続ける",
    description: [
      "左右どちらかを選んだら、その向きで進み続けます。",
      "最初に選んだ向きを覚えて進みましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_MEMORY,
    validation: { kind: "reachGoal", maxActions: 8 },
    mapVariants: [variant(STEP_10_A), variant(STEP_10_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "最初の分岐で決めた向きを覚えておきます。",
      "変数や「前に進んだ向き」を使って、同じ方向に進み続けます。",
    ],
  },
  {
    id: "step-11-zigzag-loop",
    title: "ジグザグに進もう",
    summary: "同じパターンで2マップを進む",
    description: [
      "同じ動きを繰り返すと、長い道でも進めます。",
      "2つのマップを同じコードでクリアしましょう。",
    ],
    level: "beginner",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_WALK_MEMORY,
    validation: { kind: "reachGoal", maxActions: 12 },
    mapVariants: [variant(STEP_11_A), variant(STEP_11_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "右に2回→上に2回、を繰り返すと進めます。",
      "ターン数で「今は右の番/上の番」を切り替えます。",
    ],
  },
  {
    id: "step-12-look-branch",
    title: "分岐を観測して進もう",
    summary: "移動せずに先の様子を観測する",
    description: [
      "look は移動せずに 3×3 を観測できます。",
      "左右の道のどちらかが途中で塞がっています。",
      "観測したターンは移動できないので、結果を覚えて次のターンに進みましょう。",
    ],
    level: "intermediate",
    allowedActions: WALK_LOOK,
    blocklyBlocks: BLOCKS_LOOK,
    validation: { kind: "reachGoal", maxActions: 7 },
    mapVariants: [variant(STEP_12_A), variant(STEP_12_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "分岐の手前で「広く見る」を使い、左右の通路を確認します。",
      "見た結果を変数に入れて、次のターンで進む方向を決めます。",
    ],
  },
  {
    id: "step-13-look-dead-end",
    title: "観測で行き止まりを見抜く",
    summary: "近くの分岐を観測して選ぶ",
    description: [
      "around だけでは先のブロックが見えません。",
      "look で先の様子を見て進む方向を決めましょう。",
      "観測したターンは移動できないので、結果を覚えて次のターンに進みます。",
    ],
    level: "intermediate",
    allowedActions: WALK_LOOK,
    blocklyBlocks: BLOCKS_LOOK,
    validation: { kind: "reachGoal", maxActions: 7 },
    mapVariants: [variant(STEP_13_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "around だけでは先が見えないので、分岐前に「広く見る」を使います。",
      "見た結果にブロック(2)がある方向は避けます。",
    ],
  },
  {
    id: "step-14-search-branch",
    title: "遠くまで観測して進もう",
    summary: "直線の先を探索して安全な道へ",
    description: [
      "search は指定方向の直線 9 マスを観測します。",
      "行き止まりが近い道を避けて進みましょう。",
      "観測したターンは移動できないので、結果を覚えて次のターンに進みます。",
    ],
    level: "intermediate",
    allowedActions: WALK_SEARCH,
    blocklyBlocks: BLOCKS_SEARCH,
    validation: { kind: "reachGoal", maxActions: 9 },
    mapVariants: [variant(STEP_14_A), variant(STEP_14_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "分岐の前で「まっすぐ見る」を使い、遠くのブロックを確認します。",
      "ブロックが近い方向を避けると安全です。",
    ],
  },
  {
    id: "step-15-search-dead-end",
    title: "遠くの様子で遠回りを避ける",
    summary: "遠くのブロックまでの距離で判断する",
    description: [
      "search は直線の先までを一気に確認できます。",
      "行き止まりが近い方向を避けましょう。",
      "観測したターンは移動できないので、結果を覚えて次のターンに進みます。",
    ],
    level: "intermediate",
    allowedActions: WALK_SEARCH,
    blocklyBlocks: BLOCKS_SEARCH,
    validation: { kind: "reachGoal", maxActions: 7 },
    mapVariants: [variant(STEP_15_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "直線のどこにブロックがあるかを見て、遠い方へ進みます。",
      "探索結果を変数に入れて、次のターンで方向を決めます。",
    ],
  },
  {
    id: "step-16-look-search-combo",
    title: "近くと遠くの観測を組み合わせよう",
    summary: "look と search を使い分ける",
    description: [
      "look は近距離の 3×3、search は直線 9 マスを観測します。",
      "近い分岐は look、遠い分岐は search で確認して進みましょう。",
      "観測結果を覚えて、次のターンに進行方向を決めます。",
    ],
    level: "intermediate",
    allowedActions: WALK_LOOK_SEARCH,
    blocklyBlocks: BLOCKS_SEARCH,
    validation: { kind: "reachGoal", maxActions: 12 },
    mapVariants: [variant(STEP_16_A), variant(STEP_16_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "近い分岐は「広く見る」、遠い分岐は「まっすぐ見る」を使い分けます。",
      "観測したターンは動けないので、見る→歩くの2ターンで考えます。",
    ],
  },
  {
    id: "step-17-item-intro",
    title: "アイテムを取ってからゴール",
    summary: "アイテムを1つ回収する",
    description: [
      "アイテムを取ると自分のアイテム数が増えます。",
      "アイテム取得時、直前にいたマスに自動的にブロックが置かれます。",
      "アイテムを取ってからゴールに向かいましょう。",
    ],
    level: "intermediate",
    allowedActions: WALK_ONLY,
    blocklyBlocks: BLOCKS_LOOK,
    validation: { kind: "reachGoal", requireAllItems: true, maxActions: 8 },
    mapVariants: [variant(STEP_17_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "アイテム(3)を取ると、1つ前のマスがブロックになります。",
      "アイテムを取ったあとに通れる道が残るように進みます。",
    ],
  },
  {
    id: "step-18-collect-items",
    title: "アイテムを全部集めよう",
    summary: "全アイテム取得後にゴールへ",
    description: [
      "アイテムを取ると自分のアイテム数が増えます。",
      "すべてのアイテムを取得してからゴールに到達しましょう。",
    ],
    level: "intermediate",
    allowedActions: WALK_LOOK,
    blocklyBlocks: BLOCKS_LOOK,
    validation: { kind: "reachGoal", requireAllItems: true, maxActions: 18 },
    mapVariants: [variant(STEP_18_A), variant(STEP_18_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "すべてのアイテムを取ってからゴールに向かいます。",
      "どの順番で取ると行き止まりにならないか考えます。",
    ],
  },
  {
    id: "step-19-avoid-trap-item",
    title: "危険なアイテムを避けよう",
    summary: "3方向がブロックのアイテムは危険",
    description: [
      "アイテム取得時、直前にいたマスにブロックが置かれます。",
      "3方向をブロックに囲まれたアイテムを取ると負けになることがあります。",
      "安全なルートでゴールを目指しましょう。",
    ],
    level: "intermediate",
    allowedActions: WALK_LOOK,
    blocklyBlocks: BLOCKS_LOOK,
    validation: { kind: "reachGoal", maxActions: 18 },
    mapVariants: [variant(STEP_19_A), variant(STEP_19_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "アイテムの周りがブロックだらけなら危険です。",
      "安全なアイテムから取って、逃げ道を残します。",
    ],
  },
  {
    id: "step-20-search-items",
    title: "探索しながらアイテム回収",
    summary: "観測を使って全アイテム取得",
    description: [
      "観測しながらアイテムの位置を把握します。",
      "look と search で位置を確認し、すべてのアイテムを取ってからゴールへ進みましょう。",
    ],
    level: "intermediate",
    allowedActions: WALK_LOOK_SEARCH,
    blocklyBlocks: BLOCKS_SEARCH,
    validation: { kind: "reachGoal", requireAllItems: true, maxActions: 20 },
    mapVariants: [variant(STEP_20_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "最初に観測して、アイテムのある方向を決めます。",
      "近いアイテムから順に回収すると安全です。",
    ],
  },
  {
    id: "step-21-put-intro",
    title: "ブロックで勝ってみよう",
    summary: "相手のいるマスにブロックを置く",
    description: [
      "相手の隣にいるとき、put で即勝利できます。",
      "相手の位置を見て方向を決めましょう。",
    ],
    level: "advanced",
    allowedActions: WALK_PUT,
    validation: { kind: "winByPut", maxActions: 2 },
    mapVariants: [variant(STEP_21_A), variant(STEP_21_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "相手(1)が隣にいる方向に put すると即勝利です。",
      "上下左右のどこに相手がいるかを確認します。",
    ],
  },
  {
    id: "step-22-approach-put",
    title: "近づいてブロックを置く",
    summary: "隣に移動してブロックを置く",
    description: [
      "相手の隣に移動してから put を使います。",
      "近づいて勝利を狙いましょう。",
    ],
    level: "advanced",
    allowedActions: WALK_PUT,
    validation: { kind: "winByPut", maxActions: 5 },
    mapVariants: [variant(STEP_22_A)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "まず相手の隣に移動します。",
      "隣に着いたら、その方向へ put します。",
    ],
  },
  {
    id: "step-23-put-caution",
    title: "ブロックを置くときの危険に注意",
    summary: "自分を囲んでしまわないようにする",
    description: [
      "put で自分がブロックに囲まれると即負けです。",
      "安全な位置へ移動してから put を使いましょう。",
    ],
    level: "advanced",
    allowedActions: WALK_PUT,
    validation: { kind: "winByPut", maxActions: 3 },
    mapVariants: [variant(STEP_23_A), variant(STEP_23_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "put の後に自分が囲まれると負けになります。",
      "安全な位置に移動してから put します。",
    ],
  },
  {
    id: "step-24-final-hunt-put",
    title: "探索して put で勝とう",
    summary: "探索で相手を見つけて put",
    description: [
      "look と search で相手の位置を探します。",
      "分岐を観測して無駄な移動を減らし、相手の隣に着いたら put で勝利しましょう。",
    ],
    level: "advanced",
    allowedActions: ALL_ACTIONS,
    validation: { kind: "winByPut", maxActions: 9 },
    mapVariants: [variant(STEP_24_A), variant(STEP_24_B)],
    starterCode: BASIC_JS_STARTER,
    starterBlocklyXml: BASIC_BLOCKLY_XML,
    hints: [
      "look/search で相手の方向を探して、無駄な移動を減らします。",
      "相手の隣に着いたら put で勝利します。",
    ],
  },
];
