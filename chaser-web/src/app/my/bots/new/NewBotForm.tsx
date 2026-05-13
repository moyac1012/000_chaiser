"use client";

import {
  Button,
  Description,
  Field,
  Fieldset,
  Input,
  Label,
  Legend,
  RadioGroup,
} from "@headlessui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Lang } from "@/app/api/bots/route";

export default function NewBotForm() {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Lang>("js");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lang: language }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "作成に失敗しました");
      }
      const json = (await res.json()) as { id: number };
      const nextPath =
        language === "blockly"
          ? `/my/bots/blockly/${json.id}`
          : language === "ruby"
            ? `/my/bots/ruby/${json.id}`
            : `/my/bots/${json.id}`;
      router.push(nextPath);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Field className="space-y-2">
        <Label
          htmlFor="bot-name"
          className="block text-sm font-medium text-slate-800"
        >
          ボット名
        </Label>
        <Input
          id="bot-name"
          data-testid="new-bot-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="自分のボットの名前"
          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <Description className="text-xs text-slate-500">
          あとからでも変更できます。未入力ならデフォルト名が付きます。
        </Description>
      </Field>

      <Fieldset className="space-y-3">
        <Legend className="text-sm font-medium text-slate-800">使う言語</Legend>
        <RadioGroup
          value={language}
          onChange={setLanguage}
          name="bot-language"
          className="grid gap-3 sm:grid-cols-3"
        >
          <RadioGroup.Option
            value="js"
            data-testid="bot-lang-js"
            className={({ checked }) =>
              `flex cursor-pointer items-start gap-3 rounded-2xl border bg-white/80 px-3 py-3 shadow-sm transition hover:border-slate-300 ${
                checked
                  ? "border-slate-300 ring-2 ring-slate-200"
                  : "border-slate-200/70"
              }`
            }
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">
                JavaScript
              </div>
              <div className="text-xs text-slate-500">
                JavaScript でボットを作ります。
              </div>
            </div>
          </RadioGroup.Option>
          <RadioGroup.Option
            value="blockly"
            data-testid="bot-lang-blockly"
            className={({ checked }) =>
              `flex cursor-pointer items-start gap-3 rounded-2xl border bg-white/80 px-3 py-3 shadow-sm transition hover:border-slate-300 ${
                checked
                  ? "border-slate-300 ring-2 ring-slate-200"
                  : "border-slate-200/70"
              }`
            }
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Blockly
              </div>
              <div className="text-xs text-slate-500">
                ブロックを並べてロジックを組み立てます。
              </div>
            </div>
          </RadioGroup.Option>
          <RadioGroup.Option
            value="ruby"
            data-testid="bot-lang-ruby"
            className={({ checked }) =>
              `flex cursor-pointer items-start gap-3 rounded-2xl border bg-white/80 px-3 py-3 shadow-sm transition hover:border-slate-300 ${
                checked
                  ? "border-slate-300 ring-2 ring-slate-200"
                  : "border-slate-200/70"
              }`
            }
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">Ruby</div>
              <div className="text-xs text-slate-500">
                Ruby でボットを作ります。
              </div>
            </div>
          </RadioGroup.Option>
        </RadioGroup>
      </Fieldset>

      {error ? (
        <div
          className="room-alert px-4 py-3 text-sm"
          data-testid="new-bot-error"
        >
          {error}
        </div>
      ) : null}

      <Field className="space-y-2">
        <Button
          type="button"
          onClick={handleCreate}
          disabled={submitting}
          data-testid="create-bot"
          className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? "作成中..." : "ボットを作成"}
        </Button>
        <Description className="text-xs text-slate-500">
          作成後、選択した言語のエディタが開きます。
        </Description>
      </Field>

      <div className="text-xs text-slate-600">
        初期コードはシンプルなサンプルで作成されます。あとでエディタから編集できます。
      </div>
    </div>
  );
}
