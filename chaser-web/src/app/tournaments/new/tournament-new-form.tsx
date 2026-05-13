"use client";

import {
  Button,
  Description,
  Field,
  Input,
  Label,
  Select,
} from "@headlessui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TournamentRegistrationMode } from "@/db/types";

type CreateTournamentResponse = {
  tournament: { id: string };
};

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: unknown };
    if (typeof json?.error === "string" && json.error) return json.error;
  } catch {
    // ignore
  }
  return text || `request failed (${res.status})`;
}

export default function NewTournamentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [registrationMode, setRegistrationMode] =
    useState<TournamentRegistrationMode>("invite");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const showNameError = nameTouched && !trimmedName;
  const canSubmit = Boolean(trimmedName) && !submitting;

  return (
    <form
      className="space-y-4"
      data-testid="tournament-new-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setNameTouched(true);
        if (!canSubmit) return;

        setSubmitting(true);
        setError(null);
        try {
          const res = await fetch("/api/tournaments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, registrationMode }),
          });
          if (!res.ok) {
            if (res.status === 401) {
              router.push("/sign-in");
              return;
            }
            throw new Error(await readErrorMessage(res));
          }
          const data = (await res.json()) as CreateTournamentResponse;
          const tournamentId = data?.tournament?.id;
          if (!tournamentId) {
            throw new Error("invalid response");
          }
          router.push(`/tournaments/${encodeURIComponent(tournamentId)}/admin`);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <Field className="space-y-2">
        <Label className="text-sm font-semibold text-slate-700" htmlFor="name">
          大会名
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
          placeholder="例: CHaser Cup 2025"
          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          data-testid="tournament-new-name"
          autoComplete="off"
          invalid={showNameError}
          required
        />
        {showNameError ? (
          <Description className="text-xs text-red-600">
            大会名は必須です。
          </Description>
        ) : null}
      </Field>

      <Field className="space-y-2">
        <Label
          className="text-sm font-semibold text-slate-700"
          htmlFor="registration-mode"
        >
          参加受付
        </Label>
        <Select
          id="registration-mode"
          value={registrationMode}
          onChange={(e) =>
            setRegistrationMode(e.target.value as TournamentRegistrationMode)
          }
          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          data-testid="tournament-registration-mode"
          required
        >
          <option value="invite">招待制（管理者が追加）</option>
          <option value="approval">承認制（申請→承認）</option>
          <option value="public">公開（誰でも参加）</option>
        </Select>
        <Description className="text-xs text-slate-500">
          後から大会管理画面で変更できます。
        </Description>
      </Field>

      {error ? (
        <div
          className="room-alert px-4 py-2 text-sm"
          data-testid="tournament-new-error"
        >
          作成に失敗しました: {error}
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        data-testid="tournament-create-submit"
      >
        {submitting ? "作成中…" : "大会を作成"}
      </Button>
    </form>
  );
}
