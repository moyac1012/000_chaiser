"use client";

import { Button } from "@headlessui/react";
import {
  BlocklyWorkspace,
  type ToolboxDefinition,
} from "@kuband/react-blockly";
import "blockly/blocks";
import type * as BlocklyType from "blockly";
import type { WorkspaceSvg } from "blockly/core";
import * as Blockly from "blockly/core";
import { javascriptGenerator } from "blockly/javascript";
import * as BlocklyJa from "blockly/msg/ja";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildChaserToolboxDefinition,
  CHASER_CREATE_VARIABLE_CALLBACK,
  registerChaserBlocks,
} from "@/lib/blockly/chaserBlocks";
import { useUnsavedChangesWarning } from "@/lib/editor/useUnsavedChangesWarning";
import BotCheatSheet from "../../components/BotCheatSheet";
import LocalTrainingArena from "../../components/LocalTrainingArena";

let blocksRegistered = false;
type BlocklyJsGenerator = typeof javascriptGenerator;
function ensureChaserBlocksRegistered() {
  if (blocksRegistered) return;
  // blockly/msg/ja は型定義上 default を含むため、そのままだと setLocale の
  // 期待する辞書型に合わない。実態はキー/文字列のマップなのでキャストで受け入れる。
  Blockly.setLocale(BlocklyJa as unknown as Record<string, string>);
  registerChaserBlocks(
    Blockly as unknown as typeof BlocklyType,
    javascriptGenerator,
  );
  blocksRegistered = true;
}

type BotPayload = {
  id: number;
  name: string;
  language: "js" | "blockly" | "ruby";
  code: string;
  blocklyXml: string;
  updatedAt: string;
};

const EMPTY_XML =
  '<xml xmlns="https://developers.google.com/blockly/xml"></xml>';

function setFlyoutScrollbarVisible(workspace: WorkspaceSvg, visible: boolean) {
  const parent = workspace.getParentSvg()?.parentElement;
  if (!parent) return;
  const scrollbar = parent.querySelector<SVGElement>(".blocklyFlyoutScrollbar");
  if (!scrollbar) return;
  if (visible) {
    scrollbar.style.removeProperty("display");
    scrollbar.removeAttribute("display");
  } else {
    scrollbar.style.setProperty("display", "none", "important");
  }
}

function wrapOnTurn(rawBody: string) {
  const trimmed = rawBody.trim();
  if (/function\s+onTurn/.test(trimmed)) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }
  if (!trimmed) {
    return "function onTurn(api) {\n  // TODO: ブロックを配置して行動を組み立ててください。\n}\n";
  }
  const indented = trimmed
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `function onTurn(api) {\n${indented}\n}\n`;
}

function normalizeGeneratedCode(code: string) {
  return code
    .replace(/^\s+\n/, "")
    .replace(/\n\s+$/, "\n")
    .replace(/[ \t]+\n/g, "\n");
}

function formatSavedAtJa(savedAtIso: string | null, nowMs: number): string {
  if (!savedAtIso) return "まだ保存していません";
  const savedAtMs = Date.parse(savedAtIso);
  if (!Number.isFinite(savedAtMs)) return "保存時刻: -";
  const diffMs = Math.max(0, nowMs - savedAtMs);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 20) return "たった今 保存";
  if (diffSec < 60) return `${diffSec}秒前に保存`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前に保存`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前に保存`;
  const date = new Date(savedAtMs);
  return `保存: ${date.toLocaleString()}`;
}

interface BlocklyBotEditorClientProps {
  botId: string;
}

export default function BlocklyBotEditorClient({
  botId,
}: BlocklyBotEditorClientProps) {
  const [bot, setBot] = useState<BotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [codePreview, setCodePreview] = useState<string | null>(null);
  const [blocklyReady, setBlocklyReady] = useState(false);
  const [initialXml, setInitialXml] = useState<string | null>(null);
  const [workspaceXml, setWorkspaceXml] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "try">("edit");
  const [rightTab, setRightTab] = useState<"run" | "js">("run");
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const lastSavedXmlRef = useRef<string>(EMPTY_XML);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const editorPanelRef = useRef<HTMLDivElement | null>(null);
  const tryPanelRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const workspaceRef = useRef<WorkspaceSvg | null>(null);
  const generatorRef = useRef<BlocklyJsGenerator | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const changeListenerRef = useRef<
    ((event: BlocklyType.Events.Abstract) => void) | null
  >(null);
  const enforcingOnTurnRef = useRef(false);

  const title = useMemo(
    () => (bot ? `${bot.name} (ID: ${bot.id})` : `ボット #${botId}`),
    [bot, botId],
  );

  const toolboxConfiguration = useMemo<ToolboxDefinition>(
    () => buildChaserToolboxDefinition(),
    [],
  );

  const workspaceConfiguration = useMemo(
    () => ({
      trashcan: true,
      maxInstances: { chaser_on_start: 1, chaser_on_turn: 1 },
      renderer: "thrasos",
      theme: Blockly.Themes.Classic,
    }),
    [],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bots/${botId}`);
        if (res.ok) {
          const json = (await res.json()) as BotPayload;
          if (!active) return;
          if (json.language !== "blockly") {
            const nextPath =
              json.language === "ruby"
                ? `/my/bots/ruby/${json.id}`
                : `/my/bots/${json.id}`;
            router.replace(nextPath);
            return;
          }
          setBot(json);
          const xml = json.blocklyXml || EMPTY_XML;
          setInitialXml(xml);
          setWorkspaceXml(xml);
          lastSavedXmlRef.current = xml;
          setDirty(false);
          setLastSavedAt(json.updatedAt);
        } else if (res.status === 404) {
          setBot(null);
          setInitialXml(EMPTY_XML);
          setWorkspaceXml(EMPTY_XML);
          lastSavedXmlRef.current = EMPTY_XML;
          setDirty(false);
          setLastSavedAt(null);
        } else {
          const message = await res.text();
          throw new Error(message || "failed to load bot");
        }
      } catch (err) {
        if (!active) return;
        setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [botId, router]);

  useEffect(() => {
    const intervalId = setInterval(() => setNowMs(Date.now()), 20_000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    ensureChaserBlocksRegistered();
    generatorRef.current = javascriptGenerator;
  }, []);

  useUnsavedChangesWarning({
    enabled: dirty,
    message:
      "未保存の変更があります。移動すると変更が失われます。よろしいですか？",
  });

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const enforceSingleOnTurn = useCallback(
    (workspace: WorkspaceSvg) => {
      if (enforcingOnTurnRef.current) return;
      const targets = [
        { type: "chaser_on_turn", label: "自分のターンになったら" },
        { type: "chaser_on_start", label: "はじめに一度だけ" },
      ];
      const toRemove: BlocklyType.Block[] = [];
      const labels: string[] = [];

      for (const target of targets) {
        const blocks = workspace.getBlocksByType(target.type, false);
        if (blocks.length <= 1) continue;
        toRemove.push(...blocks.slice(1));
        labels.push(target.label);
      }
      if (toRemove.length === 0) return;

      enforcingOnTurnRef.current = true;
      Blockly.Events.disable();
      try {
        for (const block of toRemove) {
          block.dispose(true);
        }
      } finally {
        Blockly.Events.enable();
        enforcingOnTurnRef.current = false;
      }
      for (const label of labels) {
        showToast(`「${label}」ブロックは1つだけ配置できます。`);
      }
      Blockly.svgResize(workspace);
    },
    [showToast],
  );

  const handleWorkspaceChange = useCallback(
    (event: BlocklyType.Events.Abstract) => {
      const workspace = workspaceRef.current;
      if (!workspace) return;

      if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
        setTimeout(() => {
          const toolbox = workspace.getToolbox();
          const selected = toolbox?.getSelectedItem() ?? null;
          const hasSelection = Boolean(selected);
          setFlyoutScrollbarVisible(workspace, hasSelection);
          if (!hasSelection) {
            // Workaround: hide flyout on close so the scrollbar does not linger.
            toolbox?.getFlyout()?.hide();
            Blockly.svgResize(workspace);
          }
        }, 0);
      }

      if (
        event.type === Blockly.Events.BLOCK_CREATE ||
        event.type === Blockly.Events.FINISHED_LOADING
      ) {
        enforceSingleOnTurn(workspace);
      }
    },
    [enforceSingleOnTurn],
  );

  const handleInject = useCallback(
    (workspace: WorkspaceSvg) => {
      workspaceRef.current = workspace;
      generatorRef.current = javascriptGenerator;
      const parentSvg = workspace.getParentSvg();
      const injectionDiv = parentSvg?.parentElement as HTMLElement | null;
      const container = injectionDiv?.parentElement ?? null;
      const resize = () => {
        if (injectionDiv && container) {
          const { height } = container.getBoundingClientRect();
          if (height > 0) {
            injectionDiv.style.height = `${height}px`;
          } else {
            injectionDiv.style.height = "600px";
          }
          injectionDiv.style.width = "100%";
        }
        Blockly.svgResize(workspace);
      };
      resize();
      resizeObserverRef.current?.disconnect();
      if (container) {
        resizeObserverRef.current = new ResizeObserver(resize);
        resizeObserverRef.current.observe(container);
      }
      if (changeListenerRef.current) {
        workspace.removeChangeListener(changeListenerRef.current);
      }
      changeListenerRef.current = handleWorkspaceChange;
      workspace.addChangeListener(handleWorkspaceChange);
      enforceSingleOnTurn(workspace);
      setFlyoutScrollbarVisible(
        workspace,
        Boolean(workspace.getToolbox()?.getSelectedItem()),
      );
      workspace.registerButtonCallback(
        CHASER_CREATE_VARIABLE_CALLBACK,
        (button) => {
          const target = button.getTargetWorkspace();
          if (!target) return;
          Blockly.Variables.createVariableButtonHandler(target);
        },
      );
      setBlocklyReady(true);
    },
    [enforceSingleOnTurn, handleWorkspaceChange],
  );

  const handleDispose = useCallback(() => {
    const workspace = workspaceRef.current;
    if (workspace && changeListenerRef.current) {
      workspace.removeChangeListener(changeListenerRef.current);
    }
    changeListenerRef.current = null;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    workspaceRef.current = null;
    generatorRef.current = null;
    setBlocklyReady(false);
  }, []);

  const generateCode = useCallback(() => {
    const workspace = workspaceRef.current;
    const generator = generatorRef.current;
    if (!workspace || !generator) {
      return "";
    }
    const onStartBlock =
      workspace.getBlocksByType("chaser_on_start", false)[0] ?? null;
    const onTurnBlock =
      workspace.getBlocksByType("chaser_on_turn", false)[0] ?? null;
    // Only the onStart/onTurn blocks are evaluated; top-level strays are ignored.
    generator.init(workspace);
    const chunks: string[] = [];
    let body = "";
    if (onStartBlock) {
      const generated = generator.blockToCode(onStartBlock);
      if (Array.isArray(generated)) {
        chunks.push(generated[0] ?? "");
      } else if (typeof generated === "string") {
        chunks.push(generated);
      }
    }
    if (onTurnBlock) {
      const generated = generator.blockToCode(onTurnBlock);
      if (Array.isArray(generated)) {
        body = generated[0] ?? "";
      } else if (typeof generated === "string") {
        body = generated;
      }
    }
    if (body) {
      chunks.push(body);
    }
    const finished = normalizeGeneratedCode(
      generator.finish(chunks.join("\n")),
    );
    if (onTurnBlock) {
      return finished;
    }
    const stub = wrapOnTurn("");
    if (!finished.trim()) return stub;
    return `${finished.trimEnd()}\n\n${stub}`;
  }, []);

  const handleXmlChange = useCallback((xml: string) => {
    setWorkspaceXml(xml);
    setDirty(xml !== lastSavedXmlRef.current);
  }, []);

  const handleSave = async () => {
    const workspace = workspaceRef.current;
    if (!workspace || !blocklyReady) {
      setError("Blockly の初期化中です。少し待ってから再度お試しください。");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const xml =
        workspaceXml ??
        Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
      const code = generateCode();
      const res = await fetch(`/api/bots/${botId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, blocklyXml: xml }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "failed to save bot");
      }
      const json = (await res.json()) as BotPayload;
      setBot(json);
      lastSavedXmlRef.current = xml;
      setDirty(false);
      setLastSavedAt(json.updatedAt);
      showToast("保存しました");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (rightTab !== "js") return;
    if (!blocklyReady) {
      setCodePreview(null);
      return;
    }
    const timeoutId = setTimeout(() => {
      const code = generateCode();
      setCodePreview(code || null);
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [rightTab, blocklyReady, generateCode]);

  const saveStatusLabel = dirty ? "未保存" : "保存済み";
  const saveStatusTone = dirty
    ? "border-amber-200/40 bg-amber-400/20 text-amber-100"
    : "border-emerald-200/40 bg-emerald-400/20 text-emerald-100";
  const savedAtLabel = formatSavedAtJa(lastSavedAt, nowMs);
  const gameShell = "mx-auto w-full px-4 sm:px-6 lg:px-8";
  const mobilePanelHeight = "min-h-[24rem] sm:min-h-[28rem] xl:min-h-0";

  const focusPanel = (target: "edit" | "try") => {
    const isWide = window.matchMedia("(min-width: 1280px)").matches;
    if (!isWide) return;
    const el = target === "edit" ? editorPanelRef.current : tryPanelRef.current;
    el?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className={`${gameShell} pt-6`}>
        <header className="room-hud room-fade">
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
                  Bot Editor
                </p>
                <h1 className="text-xl font-semibold text-white">{title}</h1>
                <p className="text-sm text-slate-300">
                  ブロックを並べて「自分のターンになったら」の中身を作り、
                  JavaScript ボットと同じ形式で保存します。
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  ローカル実行（ためす）は「編集中のブロック」を実行します。対戦ルームは「保存済みのコード」を実行します。
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !blocklyReady || !dirty}
                  className="rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-900 shadow-sm disabled:opacity-60"
                >
                  {saving ? "保存中..." : dirty ? "保存" : "保存済み"}
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-200">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 uppercase tracking-[0.18em]">
                ID: {botId}
              </span>
              <span
                className={`rounded-full border px-3 py-1 uppercase tracking-[0.18em] ${saveStatusTone}`}
              >
                {saveStatusLabel}
              </span>
              <span className="text-xs text-slate-300">{savedAtLabel}</span>
              {toast ? (
                <span className="text-emerald-200">{toast}</span>
              ) : error ? (
                <span className="text-rose-200">{error}</span>
              ) : loading ? (
                <span className="text-slate-300">読み込み中...</span>
              ) : null}
            </div>
          </div>
        </header>
      </div>

      <main
        className={`${gameShell} flex flex-1 min-h-0 flex-col gap-4 pb-6 pt-4`}
      >
        <div className="flex items-center gap-2 xl:hidden">
          <Button
            type="button"
            onClick={() => {
              setActiveTab("edit");
              focusPanel("edit");
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${activeTab === "edit" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300"}`}
          >
            へんしゅう
          </Button>
          <Button
            type="button"
            onClick={() => {
              setActiveTab("try");
              focusPanel("try");
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${activeTab === "try" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300"}`}
          >
            ためす
          </Button>
        </div>

        <div className="grid flex-1 min-h-0 gap-3 xl:grid-cols-2 overflow-hidden">
          <div
            ref={editorPanelRef}
            className={`${activeTab === "edit" ? "block" : "hidden"} ${mobilePanelHeight} xl:block min-h-0`}
          >
            <div className="room-panel room-panel--strong flex h-full flex-col overflow-hidden">
              <div className="border-b border-slate-200/70 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Blockly ワークスペース
              </div>
              {initialXml ? (
                <BlocklyWorkspace
                  key={botId}
                  className="relative flex-1 min-h-0 bg-slate-900/5 [&_.injectionDiv]:h-full [&_.injectionDiv]:w-full [&_.blocklySvg]:h-full [&_.blocklySvg]:w-full"
                  // Height is handled via ResizeObserver in handleInject
                  initialXml={initialXml}
                  toolboxConfiguration={toolboxConfiguration}
                  workspaceConfiguration={workspaceConfiguration}
                  onXmlChange={handleXmlChange}
                  onInject={handleInject}
                  onDispose={handleDispose}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center bg-slate-900/5">
                  <span className="text-sm text-slate-600">
                    Blockly の準備中...
                  </span>
                </div>
              )}
            </div>
          </div>

          <div
            ref={tryPanelRef}
            className={`${activeTab === "try" ? "block" : "hidden"} ${mobilePanelHeight} xl:block min-h-0`}
          >
            <div className="flex h-full flex-col gap-3 overflow-hidden">
              <div className="room-panel room-panel--strong px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => setRightTab("run")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${rightTab === "run" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300"}`}
                    >
                      ローカル実行
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setRightTab("js")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${rightTab === "js" ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300"}`}
                    >
                      JS 表示
                    </Button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  {rightTab === "run"
                    ? "ローカル実行（ためす）は編集中のブロックを実行します。対戦ルームでは保存済みのコードが実行されます。"
                    : "生成された JavaScript を確認できます。内容は編集中のブロックに基づきます。"}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {rightTab === "run" ? (
                  <LocalTrainingArena
                    getCode={generateCode}
                    ready={blocklyReady && !!initialXml}
                    language="blockly"
                  />
                ) : (
                  <div className="room-panel room-panel--strong flex h-full flex-col">
                    <div className="border-b border-slate-200/70 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      生成された JavaScript
                    </div>
                    <pre className="flex-1 overflow-auto px-4 py-3 text-sm text-slate-800">
                      {codePreview ??
                        "生成中です。ブロックを変更すると自動で更新されます。"}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <BotCheatSheet mode="blockly" />
      </main>
    </div>
  );
}
