"use client";

import { Button } from "@headlessui/react";
import {
  BlocklyWorkspace,
  type ToolboxDefinition,
} from "@kuband/react-blockly";
import "blockly/blocks";
import Editor from "@monaco-editor/react";
import type * as BlocklyType from "blockly";
import type { WorkspaceSvg } from "blockly/core";
import * as Blockly from "blockly/core";
import { javascriptGenerator } from "blockly/javascript";
import * as BlocklyJa from "blockly/msg/ja";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BotCheatSheet from "@/app/my/bots/components/BotCheatSheet";
import BoardView from "@/components/BoardView";
import type {
  Action,
  CommandKind,
  Direction,
  GameState,
  Position,
  Tile,
} from "@/core/engine";
import {
  buildChaserToolboxDefinition,
  CHASER_CREATE_VARIABLE_CALLBACK,
  registerChaserBlocks,
} from "@/lib/blockly/chaserBlocks";
import { registerChaserTypes } from "@/lib/bot/monacoSetup";
import { useUnsavedChangesWarning } from "@/lib/editor/useUnsavedChangesWarning";
import { TUTORIAL_STEPS } from "@/lib/tutorial/definitions";
import { getTutorialMapAsset } from "@/lib/tutorial/maps";
import {
  runTutorialStep,
  type TutorialMapRunSummary,
  type TutorialRunFailure,
  type TutorialStepRunResult,
} from "@/lib/tutorial/runner";
import {
  formatTutorialLanguageLabel,
  isTutorialLanguage,
  type TutorialLanguage,
  type TutorialMapDefinition,
} from "@/lib/tutorial/types";

type TutorialProgress = {
  language: TutorialLanguage;
  currentStepId: string | null;
  completedSteps: string[];
  updatedAt: string | null;
};

type TutorialStepState = {
  stepId: string;
  language: TutorialLanguage;
  code: string;
  blocklyXml: string;
  updatedAt: string | null;
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

let blocksRegistered = false;
type BlocklyJsGenerator = typeof javascriptGenerator;

function ensureChaserBlocksRegistered() {
  if (blocksRegistered) return;
  Blockly.setLocale(BlocklyJa as unknown as Record<string, string>);
  registerChaserBlocks(
    Blockly as unknown as typeof BlocklyType,
    javascriptGenerator,
  );
  blocksRegistered = true;
}

function initTutorialState(def: TutorialMapDefinition): GameState {
  const map: Tile[][] = def.tiles.map((row) => [...row]);
  const cool = def.spawn.Cool;
  const hot = def.spawn.Hot;
  map[cool.y][cool.x] = 1;
  map[hot.y][hot.x] = 1;
  return {
    width: def.width,
    height: def.height,
    map,
    players: {
      Cool: { id: "Cool", pos: { ...cool }, items: 0 },
      Hot: { id: "Hot", pos: { ...hot }, items: 0 },
    },
    turn: 0,
    maxTurns: def.maxTurns,
    status: "running",
  };
}

function formatDirection(dir: Direction): string {
  switch (dir) {
    case "Up":
      return "上";
    case "Down":
      return "下";
    case "Left":
      return "左";
    case "Right":
      return "右";
  }
}

function formatActionKind(kind: CommandKind): string {
  switch (kind) {
    case "look":
      return "見る";
    case "search":
      return "探索";
    case "put":
      return "置く";
    default:
      return "歩く";
  }
}

function formatActionLabel(action: Action): string {
  return `${formatActionKind(action.kind)}(${formatDirection(action.dir)})`;
}

function formatFailure(failure: TutorialRunFailure | null): {
  title: string;
  detail?: string;
} | null {
  if (!failure) return null;
  switch (failure.reason) {
    case "runtimeInitFailed":
      return {
        title: "ボットの初期化に失敗しました。",
        detail: failure.message,
      };
    case "botFallback":
      return {
        title: "ボット実行中にエラーまたはタイムアウトが発生しました。",
        detail: failure.meta?.errorMessage ?? failure.message,
      };
    case "actionNotAllowed":
      return {
        title: "このステップでは使用できない行動が選ばれました。",
        detail: failure.action
          ? `選択された行動: ${formatActionLabel(failure.action)}`
          : failure.message,
      };
    case "goalBeforeItems":
      return {
        title: "アイテムがまだ残っています。",
        detail:
          typeof failure.itemsRemaining === "number"
            ? `残りアイテム数: ${failure.itemsRemaining}`
            : failure.message,
      };
    case "maxActionsExceeded":
      return { title: "手数制限を超えました。", detail: failure.message };
    case "gameEnded":
      return { title: "ゲームが途中で終了しました。", detail: failure.message };
    case "wrongWinCondition":
      return {
        title: "ゴール条件を満たせませんでした。",
        detail: failure.message,
      };
    case "aborted":
      return { title: "実行を中断しました。", detail: failure.message };
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

const ACTION_KIND_LABELS: Record<CommandKind, string> = {
  walk: "walk",
  look: "look",
  search: "search",
  put: "put",
};

const MAP_LEGEND_ITEMS = [
  {
    id: "cool",
    label: "Cool（あなた）",
    note: "操作するプレイヤー",
    color: "#1cc6b8",
    shape: "circle",
  },
  {
    id: "hot",
    label: "Hot（相手）",
    note: "表示のみ（操作しない）",
    color: "#ff7a3d",
    shape: "circle",
  },
  {
    id: "floor",
    label: "床",
    note: "何もないマス",
    color: "#f2e3c9",
    shape: "square",
  },
  {
    id: "block",
    label: "ブロック",
    note: "進めないマス",
    color: "#3a2116",
    shape: "square",
  },
  {
    id: "item",
    label: "アイテム",
    note: "踏むと獲得",
    color: "#ffb347",
    shape: "square",
  },
  {
    id: "goal",
    label: "ゴール",
    note: "到達でクリア",
    color: "#fcd34d",
    shape: "circle",
  },
] as const;

const TILE_SIZE = 32;
const PREVIEW_TILE_SIZE = 18;
const RUN_SPEED_MS = 420;
const RUN_START_DELAY_MS = 700;

export default function TutorialStepClient({ stepId }: { stepId: string }) {
  const searchParams = useSearchParams();
  const rawLanguage = searchParams.get("lang") ?? "js";
  const language = isTutorialLanguage(rawLanguage) ? rawLanguage : "js";

  const step = useMemo(
    () => TUTORIAL_STEPS.find((entry) => entry.id === stepId) ?? null,
    [stepId],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [progress, setProgress] = useState<TutorialProgress | null>(null);
  const [code, setCode] = useState("");
  const [blocklyXml, setBlocklyXml] = useState(EMPTY_XML);
  const [initialXml, setInitialXml] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const lastSavedValueRef = useRef<string>("");

  const [displayState, setDisplayState] = useState<GameState | null>(null);
  const [currentGoal, setCurrentGoal] = useState<Position | null>(null);
  const [currentMapIndex, setCurrentMapIndex] = useState(0);
  const [latestAction, setLatestAction] = useState<{
    playerId: "Cool";
    action: Action;
    turn?: number;
  } | null>(null);
  const [mapSummaries, setMapSummaries] = useState<TutorialMapRunSummary[]>([]);
  const [runResult, setRunResult] = useState<TutorialStepRunResult | null>(
    null,
  );
  const [runFailure, setRunFailure] = useState<TutorialRunFailure | null>(null);
  const [running, setRunning] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const workspaceRef = useRef<WorkspaceSvg | null>(null);
  const generatorRef = useRef<BlocklyJsGenerator | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const changeListenerRef = useRef<
    ((event: BlocklyType.Events.Abstract) => void) | null
  >(null);
  const [blocklyReady, setBlocklyReady] = useState(false);
  const [workspaceKey, setWorkspaceKey] = useState(0);

  useEffect(() => {
    ensureChaserBlocksRegistered();
    generatorRef.current = javascriptGenerator;
  }, []);

  useEffect(() => {
    if (!step) return;
    const asset = getTutorialMapAsset(step.mapVariants[0].mapId);
    setDisplayState(initTutorialState(asset.map));
    setCurrentGoal(step.mapVariants[0].goal);
    setCurrentMapIndex(0);
    setLatestAction(null);
    setMapSummaries([]);
    setRunResult(null);
    setRunFailure(null);
    setHasAttempted(false);
    setHintOpen(false);
  }, [step]);

  useEffect(() => {
    if (!step) return;
    setHasAttempted(false);
    setHintOpen(false);
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [stepRes, progressRes] = await Promise.all([
          fetch(`/api/tutorial/steps/${step.id}?language=${language}`),
          fetch(`/api/tutorial/progress?language=${language}`),
        ]);
        if (!stepRes.ok) {
          throw new Error(await stepRes.text());
        }
        if (!progressRes.ok) {
          throw new Error(await progressRes.text());
        }
        const stepJson = (await stepRes.json()) as TutorialStepState;
        const progressJson = (await progressRes.json()) as TutorialProgress;
        if (!active) return;

        setProgress(progressJson);
        setCode(stepJson.code ?? "");
        const xml =
          stepJson.blocklyXml ||
          (language === "blockly" ? step.starterBlocklyXml : EMPTY_XML);
        setInitialXml(xml);
        setBlocklyXml(xml);
        lastSavedValueRef.current =
          language === "blockly" ? xml : stepJson.code;
        setDirty(false);
        setLastSavedAt(stepJson.updatedAt ?? progressJson.updatedAt ?? null);
        setWorkspaceKey((prev) => prev + 1);
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
  }, [language, step]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (language !== "blockly") {
      setWorkspaceExpanded(false);
    }
  }, [language]);

  useUnsavedChangesWarning({
    enabled: dirty,
    message:
      "未保存の変更があります。移動すると変更が失われます。よろしいですか？",
  });

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const toolboxConfiguration = useMemo<ToolboxDefinition>(
    () =>
      buildChaserToolboxDefinition({
        allowedActions: step?.allowedActions,
        allowedBlocks: step?.blocklyBlocks,
      }),
    [step],
  );

  const mapPreviews = useMemo(() => {
    if (!step) return [];
    return step.mapVariants.map((variant, index) => {
      const asset = getTutorialMapAsset(variant.mapId);
      return {
        index,
        mapId: variant.mapId,
        name: asset.map.name,
        state: initTutorialState(asset.map),
        goal: variant.goal,
      };
    });
  }, [step]);

  const workspaceConfiguration = useMemo(
    () => ({
      trashcan: true,
      maxInstances: { chaser_on_start: 1, chaser_on_turn: 1 },
      renderer: "thrasos",
      theme: Blockly.Themes.Classic,
    }),
    [],
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

      // XML change is handled by onXmlChange.
    },
    [],
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
          injectionDiv.style.height = `${height > 0 ? height : 520}px`;
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
    [handleWorkspaceChange],
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
    if (!workspace || !generator) return "";
    const onStartBlock =
      workspace.getBlocksByType("chaser_on_start", false)[0] ?? null;
    const onTurnBlock =
      workspace.getBlocksByType("chaser_on_turn", false)[0] ?? null;
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
    setBlocklyXml(xml);
    setDirty(xml !== lastSavedValueRef.current);
  }, []);

  const handleCodeChange = (val: string | undefined) => {
    const next = val ?? "";
    setCode(next);
    setDirty(next !== lastSavedValueRef.current);
  };

  const saveStepState = useCallback(
    async (silent = false) => {
      if (!step) return;
      if (language === "blockly" && (!workspaceRef.current || !blocklyReady)) {
        setError("Blockly の準備中です。少し待ってからお試しください。");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const payload =
          language === "js"
            ? {
                language,
                code,
              }
            : (() => {
                const workspace = workspaceRef.current;
                if (!workspace) {
                  throw new Error("Blockly の準備ができていません。");
                }
                return {
                  language,
                  code: generateCode(),
                  blocklyXml:
                    blocklyXml ||
                    Blockly.Xml.domToText(
                      Blockly.Xml.workspaceToDom(workspace),
                    ),
                };
              })();
        const res = await fetch(`/api/tutorial/steps/${step.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = (await res.json()) as TutorialStepState;
        lastSavedValueRef.current =
          language === "blockly" ? json.blocklyXml : json.code;
        setDirty(false);
        setLastSavedAt(json.updatedAt ?? null);
        if (!silent) showToast("保存しました");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [blocklyReady, blocklyXml, code, generateCode, language, showToast, step],
  );

  const handleReset = () => {
    if (!step) return;
    if (!window.confirm("編集中の内容をリセットして初期状態に戻しますか？")) {
      return;
    }
    if (language === "js") {
      setCode(step.starterCode);
      setDirty(step.starterCode !== lastSavedValueRef.current);
    } else {
      const xml = step.starterBlocklyXml || EMPTY_XML;
      setInitialXml(xml);
      setBlocklyXml(xml);
      setWorkspaceKey((prev) => prev + 1);
      setDirty(xml !== lastSavedValueRef.current);
    }
  };

  const handleProgressUpdate = useCallback(
    async (nextStepId: string | null) => {
      const res = await fetch("/api/tutorial/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          currentStepId: nextStepId,
          completedSteps: step ? [step.id] : [],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as TutorialProgress;
        setProgress(json);
      }
    },
    [language, step],
  );

  const handleRun = useCallback(async () => {
    if (!step || running) return;
    setRunResult(null);
    setRunFailure(null);
    setMapSummaries([]);
    setHasAttempted(true);

    if (language === "blockly" && (!workspaceRef.current || !blocklyReady)) {
      setError("Blockly の準備中です。少し待ってからお試しください。");
      return;
    }

    const abort = new AbortController();
    abortRef.current?.abort();
    abortRef.current = abort;
    setRunning(true);

    const runCode = language === "blockly" ? generateCode() : code;

    try {
      const result = await runTutorialStep({
        step,
        code: runCode,
        language,
        speedMs: RUN_SPEED_MS,
        startDelayMs: RUN_START_DELAY_MS,
        signal: abort.signal,
        callbacks: {
          onMapStart: ({ state, goal, mapIndex }) => {
            if (abort.signal.aborted) return;
            setDisplayState(state);
            setCurrentGoal(goal);
            setCurrentMapIndex(mapIndex);
            setLatestAction(null);
          },
          onTurn: ({ action, state, actionIndex }) => {
            if (abort.signal.aborted) return;
            setDisplayState(state);
            setLatestAction({ playerId: "Cool", action, turn: actionIndex });
          },
          onMapEnd: ({ summary }) => {
            if (abort.signal.aborted) return;
            setMapSummaries((prev) => [...prev, summary]);
          },
          onFailure: (failure) => {
            if (abort.signal.aborted) return;
            setRunFailure(failure);
            setHintOpen(true);
          },
        },
      });

      setRunResult(result);
      if (!abort.signal.aborted && result.status === "success") {
        const stepIndex = TUTORIAL_STEPS.findIndex(
          (entry) => entry.id === step.id,
        );
        const nextStepId =
          stepIndex >= 0 ? (TUTORIAL_STEPS[stepIndex + 1]?.id ?? null) : null;
        await saveStepState(true);
        await handleProgressUpdate(nextStepId);
        showToast("クリアしました！");
      }
    } finally {
      setRunning(false);
    }
  }, [
    blocklyReady,
    code,
    generateCode,
    handleProgressUpdate,
    language,
    running,
    saveStepState,
    showToast,
    step,
  ]);

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  if (!step) {
    return (
      <div className="room-shell">
        <div className="room-panel room-panel--strong p-6">
          <p className="text-sm text-slate-600">ステップが見つかりません。</p>
          <Link
            href="/tutorial"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white"
          >
            チュートリアル一覧へ
          </Link>
        </div>
      </div>
    );
  }

  const failureMessage = formatFailure(runFailure);
  const stepIndex = TUTORIAL_STEPS.findIndex((entry) => entry.id === step.id);
  const nextStepId =
    stepIndex >= 0 ? (TUTORIAL_STEPS[stepIndex + 1]?.id ?? null) : null;
  const currentMapLabel = step
    ? `Map ${currentMapIndex + 1} / ${step.mapVariants.length}`
    : "Map -";

  const maxActions = step.validation.maxActions;
  const allowedActions = step.allowedActions.map(
    (kind) => ACTION_KIND_LABELS[kind],
  );
  const hintsAvailable = (step.hints?.length ?? 0) > 0;
  const isBlockly = language === "blockly";
  const layoutClassName =
    isBlockly && workspaceExpanded
      ? "grid gap-4"
      : "grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]";
  const workspaceHeightClass = isBlockly
    ? workspaceExpanded
      ? "min-h-[70vh]"
      : "min-h-[420px]"
    : "min-h-[320px]";

  return (
    <div className="room-shell space-y-6">
      <header className="room-hud room-fade">
        <div className="relative z-10 space-y-3">
          <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
            Tutorial Step {stepIndex + 1}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-white">
                {step.title}
              </h1>
              <p className="mt-1 text-sm text-slate-300">{step.summary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="room-hud-chip">
                  {formatTutorialLanguageLabel(language)}
                </span>
                <span className="room-hud-chip">
                  許可: {allowedActions.join(", ")}
                </span>
                {typeof maxActions === "number" ? (
                  <span className="room-hud-chip">
                    制限: {maxActions}ターン
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/tutorial/steps"
                className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                ステップ一覧
              </Link>
              <Link
                href={`/tutorial/${step.id}?lang=js`}
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                  language === "js"
                    ? "border-white/40 bg-white/90 text-slate-900"
                    : "border-white/30 bg-white/10 text-white"
                }`}
              >
                JS
              </Link>
              <Link
                href={`/tutorial/${step.id}?lang=blockly`}
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                  language === "blockly"
                    ? "border-white/40 bg-white/90 text-slate-900"
                    : "border-white/30 bg-white/10 text-white"
                }`}
              >
                Blockly
              </Link>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-200">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 uppercase tracking-[0.18em]">
              {progress?.completedSteps.includes(step.id) ? "完了" : "未完了"}
            </span>
            {loading ? (
              <span className="text-slate-300">読み込み中...</span>
            ) : toast ? (
              <span className="text-emerald-200">{toast}</span>
            ) : error ? (
              <span className="text-rose-200">{error}</span>
            ) : lastSavedAt ? (
              <span className="text-slate-300">
                最終保存: {new Date(lastSavedAt).toLocaleString()}
              </span>
            ) : (
              <span className="text-slate-300">まだ保存していません</span>
            )}
          </div>
        </div>
      </header>

      <section className="room-panel room-panel--strong p-6 room-fade room-fade--delay-1">
        <h2 className="text-sm font-semibold text-slate-900">ステップの説明</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {step.description.map((line) => (
            <li key={line}>- {line}</li>
          ))}
        </ul>
        {hintsAvailable ? (
          hasAttempted ? (
            <details
              className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-xs text-amber-900"
              open={hintOpen}
              onToggle={(event) => {
                setHintOpen((event.currentTarget as HTMLDetailsElement).open);
              }}
            >
              <summary className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
                ヒントを表示
              </summary>
              <ul className="mt-2 space-y-1">
                {step.hints?.map((hint) => (
                  <li key={hint}>- {hint}</li>
                ))}
              </ul>
            </details>
          ) : (
            <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              ヒントは一度実行すると表示されます。
            </div>
          )
        ) : null}
      </section>

      <div className={layoutClassName}>
        <div className="space-y-4">
          <div className="room-panel room-panel--strong flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              <span>
                {language === "blockly"
                  ? "Blockly ワークスペース"
                  : "JavaScript"}
              </span>
              {isBlockly ? (
                <button
                  type="button"
                  onClick={() => setWorkspaceExpanded((prev) => !prev)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
                >
                  {workspaceExpanded ? "通常サイズ" : "ワークスペースを広く"}
                </button>
              ) : null}
            </div>
            <div className={`flex-1 ${workspaceHeightClass}`}>
              {language === "blockly" ? (
                initialXml ? (
                  <BlocklyWorkspace
                    key={`${step.id}-${language}-${workspaceKey}`}
                    className="relative flex-1 min-h-0 bg-slate-900/5 [&_.injectionDiv]:h-full [&_.injectionDiv]:w-full [&_.blocklySvg]:h-full [&_.blocklySvg]:w-full"
                    initialXml={initialXml}
                    toolboxConfiguration={toolboxConfiguration}
                    workspaceConfiguration={workspaceConfiguration}
                    onXmlChange={handleXmlChange}
                    onInject={handleInject}
                    onDispose={handleDispose}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Blockly を準備しています...
                  </div>
                )
              ) : (
                <Editor
                  height="60vh"
                  defaultLanguage="javascript"
                  value={code}
                  onChange={handleCodeChange}
                  beforeMount={registerChaserTypes}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: "on",
                    automaticLayout: true,
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleRun}
              disabled={running || loading}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow disabled:opacity-60"
            >
              {running ? "実行中..." : "実行"}
            </Button>
            <Button
              type="button"
              onClick={handleStop}
              disabled={!running}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow disabled:opacity-50"
            >
              停止
            </Button>
            <Button
              type="button"
              onClick={() => saveStepState()}
              disabled={saving || !dirty}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </Button>
            <Button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow"
            >
              リセット
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="room-panel room-panel--strong p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span>Board</span>
              <span>{currentMapLabel}</span>
            </div>
            {mapPreviews.length > 1 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {mapPreviews.map((preview) => {
                  const isActive = preview.index === currentMapIndex;
                  return (
                    <div
                      key={preview.mapId}
                      title={preview.name}
                      className={`rounded-xl border bg-white/70 p-2 ${
                        isActive
                          ? "border-slate-900/70 ring-2 ring-slate-900/10"
                          : "border-slate-200/70"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        <span>Map {preview.index + 1}</span>
                        {isActive ? (
                          <span className="text-emerald-600">Now</span>
                        ) : null}
                      </div>
                      <div className="mt-2">
                        <div
                          className="relative"
                          style={{
                            width: preview.state.width * PREVIEW_TILE_SIZE,
                            height: preview.state.height * PREVIEW_TILE_SIZE,
                          }}
                        >
                          <BoardView
                            state={preview.state}
                            tileSize={PREVIEW_TILE_SIZE}
                          />
                          <div
                            className="pointer-events-none absolute flex items-center justify-center rounded-full border border-amber-200/70 bg-amber-200/70 text-[8px] font-semibold uppercase text-amber-900 shadow"
                            style={{
                              width: PREVIEW_TILE_SIZE - 6,
                              height: PREVIEW_TILE_SIZE - 6,
                              left: preview.goal.x * PREVIEW_TILE_SIZE + 3,
                              top: preview.goal.y * PREVIEW_TILE_SIZE + 3,
                            }}
                          >
                            Goal
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div className="mt-3">
              {displayState ? (
                <div
                  className="relative"
                  style={{
                    width: displayState.width * TILE_SIZE,
                    height: displayState.height * TILE_SIZE,
                  }}
                >
                  <BoardView
                    state={displayState}
                    tileSize={TILE_SIZE}
                    latestAction={latestAction}
                  />
                  {currentGoal ? (
                    <div
                      className="pointer-events-none absolute flex items-center justify-center rounded-full border border-amber-200/70 bg-amber-200/70 text-[10px] font-semibold uppercase text-amber-900 shadow"
                      style={{
                        width: TILE_SIZE - 6,
                        height: TILE_SIZE - 6,
                        left: currentGoal.x * TILE_SIZE + 3,
                        top: currentGoal.y * TILE_SIZE + 3,
                      }}
                    >
                      Goal
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  盤面を準備しています...
                </div>
              )}
            </div>
          </div>

          <div className="room-panel room-panel--strong p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              マップの見方
            </div>
            <div className="mt-3 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
              {MAP_LEGEND_ITEMS.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 h-4 w-4 shrink-0 border shadow-sm ${
                      item.shape === "circle" ? "rounded-full" : "rounded-sm"
                    }`}
                    style={{
                      backgroundColor: item.color,
                      borderColor: "rgba(15, 23, 42, 0.2)",
                    }}
                  />
                  <div>
                    <div className="font-semibold text-slate-700">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {item.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              このチュートリアルでは Cool が操作対象です。Goal マーカーの位置に
              到達するとクリアになります。
            </p>
          </div>

          <div className="room-panel room-panel--strong p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              実行結果
            </div>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              {running ? (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600">
                  実行中...
                </div>
              ) : runResult?.status === "success" ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                  クリア！すべてのマップを達成しました。
                </div>
              ) : runResult?.status === "aborted" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                  実行を中断しました。
                </div>
              ) : failureMessage ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                  <div className="font-semibold">{failureMessage.title}</div>
                  {failureMessage.detail ? (
                    <div className="text-xs">{failureMessage.detail}</div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  まだ実行していません。
                </div>
              )}

              {mapSummaries.length > 0 ? (
                <div className="space-y-2 text-xs text-slate-600">
                  {mapSummaries.map((summary, index) => (
                    <div
                      key={`${summary.mapId}-${index}`}
                      className="rounded-lg border border-slate-200/80 bg-white px-3 py-2"
                    >
                      <div className="font-semibold text-slate-700">
                        Map {index + 1}
                      </div>
                      <div className="mt-1">
                        手数: {summary.actions} / 使用アクション:{" "}
                        {summary.usedActionKinds
                          .map((kind) => ACTION_KIND_LABELS[kind])
                          .join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {runResult?.status === "success" && nextStepId ? (
            <Link
              href={`/tutorial/${nextStepId}?lang=${language}`}
              className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800"
            >
              次のステップへ
            </Link>
          ) : null}
        </div>
      </div>

      <BotCheatSheet mode={language} />
    </div>
  );
}
