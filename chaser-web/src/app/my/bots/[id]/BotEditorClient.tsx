"use client";

import { Button } from "@headlessui/react";
import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerChaserTypes } from "@/lib/bot/monacoSetup";
import { useUnsavedChangesWarning } from "@/lib/editor/useUnsavedChangesWarning";
import BotCheatSheet from "../components/BotCheatSheet";
import LocalTrainingArena from "../components/LocalTrainingArena";

type BotPayload = {
  id: number;
  name: string;
  language: "js" | "blockly" | "ruby";
  code: string;
  updatedAt: string;
};

const starterCode = `// これはサンプルボットです。onTurn(api) の中で 1 回だけ行動メソッドを呼べば OK です。
let step = 0

function onTurn(api) {
  step++
  // 偶数ターンは右、奇数ターンは下に歩く単純なボット
  if (step % 2 === 0) {
    api.walkRight()
    return
  }
  api.walkDown()
}
`;

interface BotEditorClientProps {
  botId: string;
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

export default function BotEditorClient({ botId }: BotEditorClientProps) {
  const [bot, setBot] = useState<BotPayload | null>(null);
  const [code, setCode] = useState(starterCode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "try">("edit");
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const lastSavedCodeRef = useRef<string>(starterCode);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const editorPanelRef = useRef<HTMLDivElement | null>(null);
  const tryPanelRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const title = useMemo(
    () => (bot ? `${bot.name} (ID: ${bot.id})` : `ボット #${botId}`),
    [bot, botId],
  );

  useUnsavedChangesWarning({
    enabled: dirty,
    message:
      "未保存の変更があります。移動すると変更が失われます。よろしいですか？",
  });

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
          if (json.language !== "js") {
            const nextPath =
              json.language === "blockly"
                ? `/my/bots/blockly/${json.id}`
                : `/my/bots/ruby/${json.id}`;
            router.replace(nextPath);
            return;
          }
          setBot(json);
          setCode(json.code || starterCode);
          lastSavedCodeRef.current = json.code || starterCode;
          setDirty(false);
          setLastSavedAt(json.updatedAt);
        } else if (res.status === 404) {
          setBot(null);
          setCode(starterCode);
          lastSavedCodeRef.current = starterCode;
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

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bots/${botId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "failed to save bot");
      }
      const json = (await res.json()) as BotPayload;
      setBot(json);
      lastSavedCodeRef.current = code;
      setDirty(false);
      setLastSavedAt(json.updatedAt);
      showToast("保存しました");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCodeChange = (val: string | undefined) => {
    const next = val ?? "";
    setCode(next);
    setDirty(next !== lastSavedCodeRef.current);
  };

  const focusPanel = (target: "edit" | "try") => {
    const isWide = window.matchMedia("(min-width: 1280px)").matches;
    if (!isWide) return;
    const el = target === "edit" ? editorPanelRef.current : tryPanelRef.current;
    el?.scrollIntoView({ block: "nearest" });
  };

  const saveStatusLabel = dirty ? "未保存" : "保存済み";
  const saveStatusTone = dirty
    ? "border-amber-200/40 bg-amber-400/20 text-amber-100"
    : "border-emerald-200/40 bg-emerald-400/20 text-emerald-100";
  const savedAtLabel = formatSavedAtJa(lastSavedAt, nowMs);
  const gameShell = "mx-auto w-full px-4 sm:px-6 lg:px-8";

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
                  JavaScript
                  ボットのコードを編集して保存すると、対戦ルームでそのまま実行できます。
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  ローカル実行（ためす）は「編集中のコード」を実行します。対戦ルームは「保存済みのコード」を実行します。
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  type="button"
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
        className={`${gameShell} flex flex-1 min-h-0 flex-col gap-3 pb-6 pt-4`}
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
            className={`${activeTab === "edit" ? "block" : "hidden"} xl:block min-h-0`}
          >
            <div className="room-panel room-panel--strong flex h-full flex-col overflow-hidden">
              <div className="border-b border-slate-200/70 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                JavaScript（ボット）
              </div>
              <div className="min-h-0 flex-1">
                <Editor
                  height="100%"
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
              </div>
            </div>
          </div>

          <div
            ref={tryPanelRef}
            className={`${activeTab === "try" ? "block" : "hidden"} xl:block min-h-0`}
          >
            <div className="flex h-full flex-col gap-3 overflow-hidden">
              <div className="room-panel room-panel--strong px-4 py-3 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">
                  ローカル実行: 編集中のコードを実行
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  対戦ルームでは保存済みのコードが実行されます（まず「保存」してください）。
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <LocalTrainingArena
                  getCode={() => code}
                  ready={!loading}
                  language="js"
                />
              </div>
            </div>
          </div>
        </div>

        <BotCheatSheet mode="js" />
      </main>
    </div>
  );
}
