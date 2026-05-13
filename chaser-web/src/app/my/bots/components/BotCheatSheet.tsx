export type BotCheatSheetMode = "js" | "blockly" | "ruby";

interface BotCheatSheetProps {
  mode: BotCheatSheetMode;
}

const apiReferenceItems = [
  {
    id: "api-around",
    name: "api.around",
    description: "ターン開始時点の 3×3（固定）",
    returns: "number[]（長さ 9）",
  },
  {
    id: "walk-up",
    name: "api.walkUp()",
    description: "上へ 1 マス移動する",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "walk-down",
    name: "api.walkDown()",
    description: "下へ 1 マス移動する",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "walk-left",
    name: "api.walkLeft()",
    description: "左へ 1 マス移動する",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "walk-right",
    name: "api.walkRight()",
    description: "右へ 1 マス移動する",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "look-up",
    name: "api.lookUp()",
    description: "上方向の 3×3 を観測する（移動しない）",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "look-down",
    name: "api.lookDown()",
    description: "下方向の 3×3 を観測する（移動しない）",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "look-left",
    name: "api.lookLeft()",
    description: "左方向の 3×3 を観測する（移動しない）",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "look-right",
    name: "api.lookRight()",
    description: "右方向の 3×3 を観測する（移動しない）",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "search-up",
    name: "api.searchUp()",
    description: "上方向に探索する（直線 9 マス）",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "search-down",
    name: "api.searchDown()",
    description: "下方向に探索する（直線 9 マス）",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "search-left",
    name: "api.searchLeft()",
    description: "左方向に探索する（直線 9 マス）",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "search-right",
    name: "api.searchRight()",
    description: "右方向に探索する（直線 9 マス）",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "put-up",
    name: "api.putUp()",
    description: "上の隣接マスにブロックを置く",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "put-down",
    name: "api.putDown()",
    description: "下の隣接マスにブロックを置く",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "put-left",
    name: "api.putLeft()",
    description: "左の隣接マスにブロックを置く",
    returns: "number[]（観測 / 長さ 9）",
  },
  {
    id: "put-right",
    name: "api.putRight()",
    description: "右の隣接マスにブロックを置く",
    returns: "number[]（観測 / 長さ 9）",
  },
] as const;

export default function BotCheatSheet({ mode }: BotCheatSheetProps) {
  const aroundIndexTiles = [
    { id: "idx-0", label: "0" },
    { id: "idx-1", label: "1" },
    { id: "idx-2", label: "2" },
    { id: "idx-3", label: "3" },
    { id: "idx-4", label: "4" },
    { id: "idx-5", label: "5" },
    { id: "idx-6", label: "6" },
    { id: "idx-7", label: "7" },
    { id: "idx-8", label: "8" },
  ] as const;

  const isJs = mode === "js";
  const isRuby = mode === "ruby";

  return (
    <details className="room-panel room-panel--strong group" open>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <h2 className="text-sm font-semibold text-slate-900">
          {isJs
            ? "ボットAPI チートシート / リファレンス"
            : isRuby
              ? "Ruby チートシート"
              : "Blockly チートシート"}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            ボットAPIでは 1ターン = 1アクション（公式ルールのターンは Cool+Hot）
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="h-4 w-4 text-slate-500 transition group-open:rotate-180"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </summary>

      <div className="border-t border-slate-200/70 px-4 py-4">
        <div className="max-h-[32vh] overflow-y-auto pr-1 lg:max-h-[40vh]">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="text-xs text-slate-700">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  まわりは{" "}
                  <code className="font-mono">
                    {isRuby ? "api.around" : "api.around"}
                  </code>{" "}
                  （長さ9、0〜8）
                </li>
                <li>
                  行動は{" "}
                  <code className="font-mono">
                    {isRuby
                      ? "api.walk_* / look_* / search_* / put_*"
                      : "api.walk*/look*/search*/put*"}
                  </code>{" "}
                  を<strong>1回だけ</strong>呼ぶ
                </li>
                <li>
                  2回目の行動呼び出しは{" "}
                  <code className="font-mono">
                    エラー: Action already used this turn
                  </code>
                </li>
                <li>
                  行動しないまま終了すると{" "}
                  <code className="font-mono">
                    エラー: No action taken this turn
                  </code>
                </li>
                {isJs || isRuby ? null : (
                  <li>
                    Blockly
                    では、行動を選んだあとに「ターンを終える」ブロックを置いて
                    ターンを終了します
                  </li>
                )}
                {isJs || isRuby ? null : (
                  <li>Blockly の補助ブロック: 現在のターン数 / どこかに歩く</li>
                )}
                {isRuby ? (
                  <li>
                    <code className="font-mono">puts</code> /{" "}
                    <code className="font-mono">print</code>{" "}
                    はコンソールに表示されます
                  </li>
                ) : null}
                {isRuby ? (
                  <li>
                    Ruby API 例: <code className="font-mono">api.walk_up</code>{" "}
                    / <code className="font-mono">api.look_up</code> /{" "}
                    <code className="font-mono">api.search_right</code>
                  </li>
                ) : null}
              </ul>

              {isJs ? (
                <pre className="mt-3 overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-4 text-slate-800">
                  {`function onTurn(api) {
  // 例: 上が床なら上へ、だめなら見る
  if (api.around[1] === 0) {
    api.walkUp()
    return
  }
  api.lookUp()
}`}
                </pre>
              ) : isRuby ? (
                <pre className="mt-3 overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-4 text-slate-800">
                  {`def onTurn(api)
  # 例: 上が床なら上へ、だめなら見る
  if api.around[1] == 0
    api.walk_up
    return
  end
  api.look_up
end`}
                </pre>
              ) : null}
            </div>

            <div className="text-xs text-slate-700">
              <div className="text-[11px] font-semibold text-slate-700">
                api.around のインデックス（3×3）
              </div>
              <div className="mt-2 inline-grid grid-cols-3 gap-1 text-[11px]">
                {aroundIndexTiles.map((tile) => (
                  <div
                    key={tile.id}
                    className="flex h-8 w-8 items-center justify-center rounded border border-slate-200/70 bg-white/70 font-mono text-slate-800"
                  >
                    {tile.label}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-slate-600">
                タイル値: 0=床 / 1=キャラ / 2=ブロック / 3=アイテム
              </div>
            </div>
          </div>

          {isJs ? (
            <div className="mt-4 border-t border-slate-200/70 pt-4">
              <h3 className="text-xs font-semibold text-slate-900">
                ボットAPI リファレンス（onTurn(api)）
              </h3>
              <div className="mt-2 overflow-x-auto rounded border border-slate-200/70 bg-white/70">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[220px_1fr_220px] gap-x-3 border-b border-slate-200/70 bg-white/70 px-3 py-2 text-[11px] font-semibold text-slate-700">
                    <div>メソッド / プロパティ</div>
                    <div>説明</div>
                    <div>戻り値</div>
                  </div>
                  <div className="divide-y divide-slate-200/70">
                    {apiReferenceItems.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[220px_1fr_220px] gap-x-3 px-3 py-2 text-[11px] text-slate-700"
                      >
                        <div className="font-mono text-slate-900">
                          {item.name}
                        </div>
                        <div>{item.description}</div>
                        <div className="font-mono">{item.returns}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-600">
                行動メソッドは呼んだ瞬間にターンを消費します（2 回目はエラー）。
              </div>
            </div>
          ) : null}

          {isJs || isRuby ? null : (
            <div className="mt-4 text-[11px] text-slate-600">
              補足: 変数はターンを跨いで保持されます。
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
