"use client";

import { Button, Field, Input, Label, Select } from "@headlessui/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MapListResponse } from "@/app/api/maps/route";
import { DEFAULT_MAP_ID } from "@/core/map";
import type {
  GameResult,
  GameStatus,
  TournamentRegistrationMode,
  TournamentStatus,
} from "@/db/types";

type TournamentDetail = {
  id: string;
  name: string;
  ownerId: string;
  status: TournamentStatus;
  registrationMode: TournamentRegistrationMode;
  createdAt: string;
  finishedAt: string | null;
  participants: Array<{ userId: string; displayName: string }>;
  requests: Array<{ userId: string; displayName: string; createdAt: string }>;
  matchups: Array<{
    id: string;
    playerAId: string;
    playerBId: string;
    createdAt: string;
    games: Array<{
      id: string;
      coolUserId: string;
      hotUserId: string;
      coolBotId: number;
      hotBotId: number;
      roomId: string;
      result: GameResult | null;
      status: GameStatus;
      invalidReason: string | null;
      replayId: string | null;
      replayVisible: boolean;
      createdAt: string;
    }>;
  }>;
};

type TournamentDetailResponse = {
  tournament: TournamentDetail;
};

type CreateTournamentParticipantResponse = {
  tournamentId: string;
  userId: string;
};

type UpdateTournamentResponse = {
  tournamentId: string;
  registrationMode: TournamentRegistrationMode;
};

type CreateMatchupResponse = {
  matchup: {
    id: string;
    tournamentId: string;
    playerAId: string;
    playerBId: string;
    createdAt: string;
  };
};

type CreateGameResponse = {
  game: { id: string; roomId: string };
};

type ParticipantBotListItem = {
  id: number;
  name: string;
  language: string;
  updatedAt: string;
};

type ParticipantBotListResponse = {
  bots: ParticipantBotListItem[];
};

type ParticipantSearchUser = {
  userId: string;
  displayName: string;
  username: string | null;
  isParticipant: boolean;
};

type ParticipantSearchResponse = {
  users: ParticipantSearchUser[];
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

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusBadge(status: TournamentStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "draft":
      return {
        label: "draft",
        className: "border border-white/20 bg-white/10 text-slate-200",
      };
    case "running":
      return {
        label: "running",
        className:
          "border border-emerald-200/30 bg-emerald-400/20 text-emerald-100",
      };
    case "finished":
      return {
        label: "finished",
        className: "border border-amber-200/30 bg-amber-400/20 text-amber-100",
      };
  }
}

function registrationModeHint(mode: TournamentRegistrationMode): string {
  switch (mode) {
    case "public":
      return "ログイン済みユーザーが即時参加できます。";
    case "approval":
      return "参加申請を管理者が承認したユーザーのみ参加できます。";
    case "invite":
      return "管理者が参加者を追加した場合のみ参加できます。";
  }
}

type GameFormState = {
  coolUserId: string;
  hotUserId: string;
  coolBotId: string; // select value (string)
  hotBotId: string; // select value (string)
  mapId: string;
};

export default function TournamentAdminClient({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [registrationModeDraft, setRegistrationModeDraft] =
    useState<TournamentRegistrationMode>("invite");
  const [participantSearchQuery, setParticipantSearchQuery] = useState("");
  const [participantSearchResults, setParticipantSearchResults] = useState<
    ParticipantSearchUser[]
  >([]);
  const [participantSearchLoading, setParticipantSearchLoading] =
    useState(false);
  const [participantSearchDone, setParticipantSearchDone] = useState(false);
  const [participantSearchError, setParticipantSearchError] = useState<
    string | null
  >(null);
  const [matchupPlayerAId, setMatchupPlayerAId] = useState("");
  const [matchupPlayerBId, setMatchupPlayerBId] = useState("");

  const [gameForms, setGameForms] = useState<Record<string, GameFormState>>({});
  const [rematchReasons, setRematchReasons] = useState<Record<string, string>>(
    {},
  );

  const [participantBotsByUserId, setParticipantBotsByUserId] = useState<
    Record<string, ParticipantBotListItem[]>
  >({});
  const [participantBotsLoading, setParticipantBotsLoading] = useState<
    Record<string, boolean>
  >({});
  const [participantBotsError, setParticipantBotsError] = useState<
    Record<string, string | null>
  >({});

  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [mapList, setMapList] = useState<MapListResponse["maps"]>([]);
  const [mapListError, setMapListError] = useState<string | null>(null);

  const participantOptions = useMemo(() => {
    const participants = tournament?.participants ?? [];
    return participants.map((p) => ({
      userId: p.userId,
      label: p.displayName ? `${p.displayName} (${p.userId})` : p.userId,
    }));
  }, [tournament?.participants]);

  const participantNameById = useMemo(() => {
    const entries = tournament?.participants ?? [];
    return new Map(entries.map((p) => [p.userId, p.displayName]));
  }, [tournament?.participants]);

  const displayNameForUserId = useCallback(
    (userId: string) => {
      const name = participantNameById.get(userId)?.trim() ?? "";
      return name || userId;
    },
    [participantNameById],
  );

  const runParticipantSearch = useCallback(async () => {
    const query = participantSearchQuery.trim();
    setParticipantSearchError(null);
    setParticipantSearchDone(false);

    if (query.length < 2) {
      setParticipantSearchResults([]);
      setParticipantSearchDone(true);
      setParticipantSearchError("検索語は2文字以上で入力してください。");
      return;
    }

    setParticipantSearchLoading(true);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(
          tournamentId,
        )}/participants/search?query=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error(await readErrorMessage(res));
      }
      const data = (await res.json()) as ParticipantSearchResponse;
      setParticipantSearchResults(data.users ?? []);
      setParticipantSearchDone(true);
    } catch (err) {
      setParticipantSearchResults([]);
      setParticipantSearchDone(true);
      setParticipantSearchError((err as Error).message);
    } finally {
      setParticipantSearchLoading(false);
    }
  }, [participantSearchQuery, tournamentId]);

  useEffect(() => {
    let cancelled = false;
    setMapListError(null);
    fetch("/api/maps", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readErrorMessage(res));
        return (await res.json()) as MapListResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setMapList(data.maps ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setMapListError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournamentId)}/admin`,
        {
          cache: "no-store",
        },
      );
      if (!res.ok) {
        if (res.status === 401) {
          setLoadError("ログインが必要です。");
          setTournament(null);
          return;
        }
        throw new Error(await readErrorMessage(res));
      }
      const data = (await res.json()) as TournamentDetailResponse;
      setTournament(data.tournament);

      const nextForms: Record<string, GameFormState> = {};
      for (const matchup of data.tournament.matchups) {
        nextForms[matchup.id] = {
          coolUserId: matchup.playerAId,
          hotUserId: matchup.playerBId,
          coolBotId: "",
          hotBotId: "",
          mapId: DEFAULT_MAP_ID,
        };
      }
      setGameForms((prev) => ({ ...nextForms, ...prev }));
    } catch (err) {
      setLoadError((err as Error).message);
      setTournament(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!tournament) return;
    setRegistrationModeDraft(tournament.registrationMode);
  }, [tournament]);

  const ensureParticipantBots = useCallback(
    async (userId: string) => {
      if (!userId) return;
      if (participantBotsByUserId[userId]) return;
      if (participantBotsLoading[userId]) return;

      setParticipantBotsLoading((prev) => ({ ...prev, [userId]: true }));
      setParticipantBotsError((prev) => ({ ...prev, [userId]: null }));
      try {
        const res = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournamentId,
          )}/participants/${encodeURIComponent(userId)}/bots`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(await readErrorMessage(res));
        }
        const data = (await res.json()) as ParticipantBotListResponse;
        setParticipantBotsByUserId((prev) => ({
          ...prev,
          [userId]: data.bots ?? [],
        }));
      } catch (err) {
        setParticipantBotsError((prev) => ({
          ...prev,
          [userId]: (err as Error).message,
        }));
      } finally {
        setParticipantBotsLoading((prev) => ({ ...prev, [userId]: false }));
      }
    },
    [participantBotsByUserId, participantBotsLoading, tournamentId],
  );

  useEffect(() => {
    if (!tournament) return;

    const userIds = new Set<string>();
    for (const matchup of tournament.matchups) {
      const form = gameForms[matchup.id] ?? {
        coolUserId: matchup.playerAId,
        hotUserId: matchup.playerBId,
        coolBotId: "",
        hotBotId: "",
        mapId: DEFAULT_MAP_ID,
      };
      userIds.add(form.coolUserId);
      userIds.add(form.hotUserId);
    }

    for (const userId of userIds) {
      void ensureParticipantBots(userId);
    }
  }, [tournament, gameForms, ensureParticipantBots]);

  useEffect(() => {
    if (!tournament) return;

    setGameForms((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const matchup of tournament.matchups) {
        const form = next[matchup.id];
        if (!form) continue;

        const coolBots = participantBotsByUserId[form.coolUserId] ?? [];
        const hotBots = participantBotsByUserId[form.hotUserId] ?? [];

        const coolBotExists = form.coolBotId
          ? coolBots.some((b) => String(b.id) === form.coolBotId)
          : false;
        const hotBotExists = form.hotBotId
          ? hotBots.some((b) => String(b.id) === form.hotBotId)
          : false;

        const normalizedCoolBotId =
          coolBotExists || coolBots.length === 0 ? form.coolBotId : "";
        const normalizedHotBotId =
          hotBotExists || hotBots.length === 0 ? form.hotBotId : "";

        const autoCoolBotId =
          !normalizedCoolBotId && coolBots[0]
            ? String(coolBots[0].id)
            : normalizedCoolBotId;
        const autoHotBotId =
          !normalizedHotBotId && hotBots[0]
            ? String(hotBots[0].id)
            : normalizedHotBotId;

        if (
          autoCoolBotId !== form.coolBotId ||
          autoHotBotId !== form.hotBotId
        ) {
          next[matchup.id] = {
            ...form,
            coolBotId: autoCoolBotId,
            hotBotId: autoHotBotId,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tournament, participantBotsByUserId]);

  const resetActionNotice = useCallback(() => {
    setActionError(null);
    setActionMessage(null);
  }, []);

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (actionPending) return;
      setActionPending(true);
      setActionError(null);
      setActionMessage(null);
      try {
        await action();
        setActionMessage(`${label} を実行しました。`);
      } catch (err) {
        setActionError((err as Error).message);
      } finally {
        setActionPending(false);
      }
    },
    [actionPending],
  );

  if (loading) {
    return (
      <div
        className="room-panel room-panel--strong p-6 text-sm text-slate-700 room-fade"
        data-testid="tournament-admin-loading"
      >
        読み込み中…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="room-panel room-panel--strong p-6 room-fade"
        data-testid="tournament-admin-load-error"
      >
        <h1 className="text-lg font-semibold text-slate-900">
          大会の読み込みに失敗しました
        </h1>
        <p className="mt-2 text-sm text-rose-600">{loadError}</p>
        <Button
          type="button"
          className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 hover:bg-white"
          onClick={load}
          data-testid="tournament-admin-retry"
        >
          再読み込み
        </Button>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div
        className="room-panel room-panel--strong p-6 text-sm text-slate-700 room-fade"
        data-testid="tournament-admin-empty"
      >
        表示できる大会がありません。
      </div>
    );
  }

  const badge = statusBadge(tournament.status);
  const adminPath = `/tournaments/${encodeURIComponent(tournament.id)}/admin`;
  const showRequestsSection =
    tournament.registrationMode === "approval" ||
    tournament.requests.length > 0;

  return (
    <div className="space-y-8" data-testid="tournament-admin-page">
      <header className="space-y-4">
        <div className="room-hud room-fade">
          <div className="relative z-10 flex flex-wrap items-center gap-3">
            <div className="space-y-2">
              <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
                Tournament Admin
              </div>
              <h1
                className="text-2xl font-semibold text-white"
                data-testid="tournament-title"
              >
                大会管理
              </h1>
              <div
                className="text-sm text-slate-300"
                data-testid="tournament-name"
              >
                {tournament.name}
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${badge.className}`}
              data-testid="tournament-status"
            >
              {badge.label}
            </span>
          </div>
        </div>

        <div
          className="room-panel room-panel--strong p-5"
          data-testid="tournament-info"
        >
          <div className="mt-1 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <span className="font-semibold">大会ID:</span>{" "}
              <span className="font-mono text-xs">{tournament.id}</span>
            </div>
            <div>
              <span className="font-semibold">作成日時:</span>{" "}
              {formatDate(tournament.createdAt)}
            </div>
            <div className="sm:col-span-2">
              <span className="font-semibold">管理URL:</span>{" "}
              <Link
                href={adminPath}
                className="font-mono text-xs text-sky-700 underline"
                data-testid="tournament-admin-url"
              >
                {adminPath}
              </Link>
            </div>
          </div>
        </div>

        <div className="room-panel room-panel--strong p-5">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            data-testid="tournament-registration-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!tournament) return;
              if (registrationModeDraft === tournament.registrationMode) {
                return;
              }
              await runAction("参加受付の更新", async () => {
                const res = await fetch(
                  `/api/tournaments/${encodeURIComponent(tournamentId)}/admin`,
                  {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      registrationMode: registrationModeDraft,
                    }),
                  },
                );
                if (!res.ok) {
                  throw new Error(await readErrorMessage(res));
                }
                void ((await res.json()) as UpdateTournamentResponse);
                await load();
              });
            }}
          >
            <Field className="flex-1 space-y-1">
              <Label
                className="text-sm font-semibold text-slate-700"
                htmlFor="tournament-registration-mode"
              >
                参加受付
              </Label>
              <Select
                id="tournament-registration-mode"
                value={registrationModeDraft}
                onChange={(e) =>
                  setRegistrationModeDraft(
                    e.target.value as TournamentRegistrationMode,
                  )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
              >
                <option value="invite">招待制（管理者が追加）</option>
                <option value="approval">承認制（申請→承認）</option>
                <option value="public">公開（誰でも参加）</option>
              </Select>
              <p className="text-xs text-slate-500">
                {registrationModeHint(registrationModeDraft)}
              </p>
            </Field>
            <Button
              type="submit"
              disabled={
                actionPending ||
                registrationModeDraft === tournament.registrationMode
              }
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              更新
            </Button>
          </form>
        </div>

        {(actionError || actionMessage) && (
          <div className="space-y-2">
            {actionError ? (
              <div
                className="room-alert px-4 py-2 text-sm"
                data-testid="tournament-admin-action-error"
              >
                {actionError}
              </div>
            ) : null}
            {actionMessage ? (
              <div
                className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800"
                data-testid="tournament-admin-action-success"
              >
                {actionMessage}
              </div>
            ) : null}
            <Button
              type="button"
              className="text-xs font-semibold text-slate-600 underline"
              onClick={resetActionNotice}
              data-testid="tournament-admin-action-clear"
            >
              表示をクリア
            </Button>
          </div>
        )}
      </header>

      {showRequestsSection ? (
        <section className="space-y-4" data-testid="requests-section">
          <h2 className="text-lg font-semibold text-slate-900">参加申請</h2>
          <div className="room-panel room-panel--strong p-5">
            {tournament.registrationMode !== "approval" ? (
              <p className="mb-3 text-xs text-slate-500">
                現在の参加受付は承認制ではありません。過去の申請が残っている場合のみ表示されます。
              </p>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-white/70">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      表示名
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      userId
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      申請日時
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tournament.requests.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-slate-600" colSpan={4}>
                        参加申請はありません。
                      </td>
                    </tr>
                  ) : (
                    tournament.requests.map((request) => (
                      <tr key={request.userId} data-testid="request-row">
                        <td className="px-4 py-2 text-slate-900">
                          {request.displayName || request.userId}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-800">
                          {request.userId}
                        </td>
                        <td className="px-4 py-2 text-slate-700">
                          {formatDate(request.createdAt)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              disabled={actionPending}
                              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                              onClick={async () => {
                                await runAction("参加申請の承認", async () => {
                                  const res = await fetch(
                                    `/api/tournaments/${encodeURIComponent(
                                      tournamentId,
                                    )}/requests/${encodeURIComponent(
                                      request.userId,
                                    )}`,
                                    { method: "POST" },
                                  );
                                  if (!res.ok) {
                                    throw new Error(
                                      await readErrorMessage(res),
                                    );
                                  }
                                  await load();
                                });
                              }}
                            >
                              承認
                            </Button>
                            <Button
                              type="button"
                              disabled={actionPending}
                              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                              onClick={async () => {
                                const confirmed = window.confirm(
                                  `${request.displayName || request.userId} の申請を却下しますか？`,
                                );
                                if (!confirmed) return;
                                await runAction("参加申請の却下", async () => {
                                  const res = await fetch(
                                    `/api/tournaments/${encodeURIComponent(
                                      tournamentId,
                                    )}/requests/${encodeURIComponent(
                                      request.userId,
                                    )}`,
                                    { method: "DELETE" },
                                  );
                                  if (!res.ok) {
                                    throw new Error(
                                      await readErrorMessage(res),
                                    );
                                  }
                                  await load();
                                });
                              }}
                            >
                              却下
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-4" data-testid="participants-section">
        <h2 className="text-lg font-semibold text-slate-900">参加者管理</h2>

        <div className="room-panel room-panel--strong p-5">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            data-testid="participant-search-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await runParticipantSearch();
            }}
          >
            <Field className="flex-1 space-y-1">
              <Label
                className="text-sm font-semibold text-slate-700"
                htmlFor="participant-search"
              >
                ユーザー検索
              </Label>
              <Input
                id="participant-search"
                value={participantSearchQuery}
                onChange={(e) => {
                  const nextQuery = e.target.value;
                  setParticipantSearchQuery(nextQuery);
                  setParticipantSearchDone(false);
                  if (!nextQuery.trim()) {
                    setParticipantSearchResults([]);
                    setParticipantSearchError(null);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                data-testid="participant-search-input"
                placeholder="表示名 / username / email で検索"
                autoComplete="off"
                minLength={2}
                required
              />
            </Field>
            <Button
              type="submit"
              disabled={
                actionPending ||
                participantSearchLoading ||
                participantSearchQuery.trim().length < 2
              }
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              data-testid="participant-search-submit"
            >
              検索
            </Button>
          </form>

          <div className="mt-4 space-y-2">
            {participantSearchError ? (
              <div className="room-alert px-4 py-2 text-sm">
                {participantSearchError}
              </div>
            ) : null}
            {participantSearchLoading ? (
              <div className="text-sm text-slate-600">検索中…</div>
            ) : null}
          </div>

          {participantSearchDone && !participantSearchLoading ? (
            <div
              className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70"
              data-testid="participant-search-table"
            >
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-white/70">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      表示名
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      username
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      userId
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {participantSearchResults.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-slate-600" colSpan={4}>
                        該当するユーザーが見つかりませんでした。
                      </td>
                    </tr>
                  ) : (
                    participantSearchResults.map((user) => {
                      return (
                        <tr
                          key={user.userId}
                          data-testid="participant-search-row"
                        >
                          <td className="px-4 py-2 text-slate-900">
                            {user.displayName}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-600">
                            {user.username ? `@${user.username}` : "-"}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-800">
                            {user.userId}
                          </td>
                          <td className="px-4 py-2">
                            <Button
                              type="button"
                              disabled={actionPending || user.isParticipant}
                              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                              onClick={async () => {
                                if (user.isParticipant) return;
                                await runAction("参加者追加", async () => {
                                  const res = await fetch(
                                    `/api/tournaments/${encodeURIComponent(
                                      tournamentId,
                                    )}/participants`,
                                    {
                                      method: "POST",
                                      headers: {
                                        "content-type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        userId: user.userId,
                                      }),
                                    },
                                  );
                                  if (!res.ok) {
                                    throw new Error(
                                      await readErrorMessage(res),
                                    );
                                  }
                                  void ((await res.json()) as CreateTournamentParticipantResponse);
                                  setParticipantSearchResults((prev) =>
                                    prev.map((item) =>
                                      item.userId === user.userId
                                        ? { ...item, isParticipant: true }
                                        : item,
                                    ),
                                  );
                                  await load();
                                });
                              }}
                            >
                              {user.isParticipant ? "参加済み" : "追加"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          <div
            className="mt-5 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70"
            data-testid="participants-table"
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-white/70">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    表示名
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    userId
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tournament.participants.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-600" colSpan={3}>
                      参加者がまだいません。
                    </td>
                  </tr>
                ) : (
                  tournament.participants.map((p) => (
                    <tr key={p.userId} data-testid="participant-row">
                      <td className="px-4 py-2 text-slate-900">
                        {p.displayName || p.userId}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-800">
                        {p.userId}
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          type="button"
                          disabled={actionPending}
                          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          onClick={async () => {
                            const confirmed = window.confirm(
                              `${p.displayName || p.userId} を参加者から外しますか？`,
                            );
                            if (!confirmed) return;
                            await runAction("参加者削除", async () => {
                              const res = await fetch(
                                `/api/tournaments/${encodeURIComponent(
                                  tournamentId,
                                )}/participants/${encodeURIComponent(p.userId)}`,
                                { method: "DELETE" },
                              );
                              if (!res.ok) {
                                throw new Error(await readErrorMessage(res));
                              }
                              await load();
                            });
                          }}
                        >
                          削除
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-4" data-testid="matchups-section">
        <h2 className="text-lg font-semibold text-slate-900">
          対戦カード（Matchup）管理
        </h2>

        <div className="room-panel room-panel--strong p-5">
          <form
            className="grid gap-3 sm:grid-cols-3 sm:items-end"
            data-testid="matchup-add-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const playerAId = matchupPlayerAId.trim();
              const playerBId = matchupPlayerBId.trim();
              if (!playerAId || !playerBId) return;

              await runAction("Matchup 作成", async () => {
                const res = await fetch(
                  `/api/tournaments/${encodeURIComponent(
                    tournamentId,
                  )}/matchups`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ playerAId, playerBId }),
                  },
                );
                if (!res.ok) {
                  throw new Error(await readErrorMessage(res));
                }
                void ((await res.json()) as CreateMatchupResponse);
                setMatchupPlayerAId("");
                setMatchupPlayerBId("");
                await load();
              });
            }}
          >
            <Field className="space-y-1">
              <Label
                className="text-sm font-semibold text-slate-700"
                htmlFor="matchup-playerA"
              >
                playerAId
              </Label>
              <Select
                id="matchup-playerA"
                value={matchupPlayerAId}
                onChange={(e) => setMatchupPlayerAId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                data-testid="matchup-playerA-select"
                required
              >
                <option value="">選択…</option>
                {participantOptions.map((participant) => (
                  <option key={participant.userId} value={participant.userId}>
                    {participant.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field className="space-y-1">
              <Label
                className="text-sm font-semibold text-slate-700"
                htmlFor="matchup-playerB"
              >
                playerBId
              </Label>
              <Select
                id="matchup-playerB"
                value={matchupPlayerBId}
                onChange={(e) => setMatchupPlayerBId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                data-testid="matchup-playerB-select"
                required
              >
                <option value="">選択…</option>
                {participantOptions.map((participant) => (
                  <option key={participant.userId} value={participant.userId}>
                    {participant.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="submit"
              disabled={actionPending || !matchupPlayerAId || !matchupPlayerBId}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              data-testid="matchup-add-submit"
            >
              作成
            </Button>
          </form>

          <div
            className="mt-5 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70"
            data-testid="matchups-table"
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-white/70">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    Matchup ID
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    playerA
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    playerB
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    作成日時
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    games
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tournament.matchups.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-600" colSpan={5}>
                      Matchup がまだありません。
                    </td>
                  </tr>
                ) : (
                  tournament.matchups.map((m) => (
                    <tr key={m.id} data-testid="matchup-row">
                      <td className="px-4 py-2 font-mono text-xs text-slate-800">
                        {m.id}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-800">
                        {displayNameForUserId(m.playerAId)}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-800">
                        {displayNameForUserId(m.playerBId)}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {formatDate(m.createdAt)}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {m.games.length}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-6" data-testid="games-section">
        <h2 className="text-lg font-semibold text-slate-900">
          試合（Game）管理
        </h2>

        <div className="room-panel room-panel--strong p-5 text-sm text-slate-700">
          <p>
            Cool/Hot
            のボットは、参加者のボット一覧から選択できます（手入力は不要）。
          </p>
        </div>

        {tournament.matchups.length === 0 ? (
          <div className="room-panel room-panel--strong p-6 text-sm text-slate-700">
            まず Matchup を作成してください。
          </div>
        ) : null}

        {tournament.matchups.map((matchup) => {
          const form = gameForms[matchup.id] ?? {
            coolUserId: matchup.playerAId,
            hotUserId: matchup.playerBId,
            coolBotId: "",
            hotBotId: "",
            mapId: DEFAULT_MAP_ID,
          };
          const players = [matchup.playerAId, matchup.playerBId];
          const coolBots = participantBotsByUserId[form.coolUserId] ?? [];
          const hotBots = participantBotsByUserId[form.hotUserId] ?? [];
          const coolBotsLoading =
            participantBotsLoading[form.coolUserId] ?? false;
          const hotBotsLoading =
            participantBotsLoading[form.hotUserId] ?? false;
          const coolBotsError = participantBotsError[form.coolUserId] ?? null;
          const hotBotsError = participantBotsError[form.hotUserId] ?? null;

          return (
            <div
              key={matchup.id}
              className="room-panel room-panel--strong p-5"
              data-testid={`matchup-games-${matchup.id}`}
            >
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-slate-900">
                  Matchup:{" "}
                  <span className="font-mono text-xs text-slate-800">
                    {matchup.id}
                  </span>
                </div>
                <div className="text-sm text-slate-700">
                  playerA: {displayNameForUserId(matchup.playerAId)} / playerB:{" "}
                  {displayNameForUserId(matchup.playerBId)}
                </div>
              </div>

              <form
                className="mt-4 grid gap-3 lg:grid-cols-6 lg:items-end"
                data-testid={`create-game-form-${matchup.id}`}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const payload = {
                    matchupId: matchup.id,
                    coolUserId: form.coolUserId.trim(),
                    hotUserId: form.hotUserId.trim(),
                    coolBotId: form.coolBotId,
                    hotBotId: form.hotBotId,
                    mapId: form.mapId,
                  };
                  if (
                    !payload.coolUserId ||
                    !payload.hotUserId ||
                    !payload.coolBotId ||
                    !payload.hotBotId
                  ) {
                    return;
                  }

                  await runAction("Game 作成", async () => {
                    const res = await fetch("/api/games", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    if (!res.ok) {
                      throw new Error(await readErrorMessage(res));
                    }
                    void ((await res.json()) as CreateGameResponse);

                    setGameForms((prev) => ({
                      ...prev,
                      [matchup.id]: {
                        ...prev[matchup.id],
                        coolBotId: "",
                        hotBotId: "",
                      },
                    }));
                    await load();
                  });
                }}
              >
                <Field className="space-y-1">
                  <Label
                    className="text-xs font-semibold text-slate-700"
                    htmlFor={`cool-user-${matchup.id}`}
                  >
                    Cool userId
                  </Label>
                  <Select
                    id={`cool-user-${matchup.id}`}
                    value={form.coolUserId}
                    onChange={(e) =>
                      setGameForms((prev) => ({
                        ...prev,
                        [matchup.id]: {
                          ...form,
                          coolUserId: e.target.value,
                          coolBotId: "",
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    data-testid={`create-game-cool-user-${matchup.id}`}
                    required
                  >
                    {players.map((id) => (
                      <option key={id} value={id}>
                        {displayNameForUserId(id)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field className="space-y-1">
                  <Label
                    className="text-xs font-semibold text-slate-700"
                    htmlFor={`hot-user-${matchup.id}`}
                  >
                    Hot userId
                  </Label>
                  <Select
                    id={`hot-user-${matchup.id}`}
                    value={form.hotUserId}
                    onChange={(e) =>
                      setGameForms((prev) => ({
                        ...prev,
                        [matchup.id]: {
                          ...form,
                          hotUserId: e.target.value,
                          hotBotId: "",
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    data-testid={`create-game-hot-user-${matchup.id}`}
                    required
                  >
                    {players.map((id) => (
                      <option key={id} value={id}>
                        {displayNameForUserId(id)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field className="space-y-1">
                  <Label
                    className="text-xs font-semibold text-slate-700"
                    htmlFor={`cool-bot-${matchup.id}`}
                  >
                    Cool ボット
                  </Label>
                  <Select
                    id={`cool-bot-${matchup.id}`}
                    value={form.coolBotId}
                    onChange={(e) =>
                      setGameForms((prev) => ({
                        ...prev,
                        [matchup.id]: { ...form, coolBotId: e.target.value },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    data-testid={`create-game-cool-bot-${matchup.id}`}
                    required
                  >
                    <option value="">
                      {coolBotsLoading ? "読み込み中…" : "選択…"}
                    </option>
                    {coolBots.map((bot) => (
                      <option key={bot.id} value={String(bot.id)}>
                        {bot.name} (#{bot.id})
                      </option>
                    ))}
                  </Select>
                  {coolBotsError ? (
                    <div
                      className="text-xs text-red-700"
                      data-testid={`cool-bot-error-${matchup.id}`}
                    >
                      ボット一覧の取得に失敗: {coolBotsError}
                    </div>
                  ) : null}
                  {!coolBotsLoading &&
                  !coolBotsError &&
                  coolBots.length === 0 ? (
                    <div
                      className="text-xs text-slate-600"
                      data-testid={`cool-bot-empty-${matchup.id}`}
                    >
                      このユーザーのボットがありません。
                    </div>
                  ) : null}
                </Field>
                <Field className="space-y-1">
                  <Label
                    className="text-xs font-semibold text-slate-700"
                    htmlFor={`hot-bot-${matchup.id}`}
                  >
                    Hot ボット
                  </Label>
                  <Select
                    id={`hot-bot-${matchup.id}`}
                    value={form.hotBotId}
                    onChange={(e) =>
                      setGameForms((prev) => ({
                        ...prev,
                        [matchup.id]: { ...form, hotBotId: e.target.value },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    data-testid={`create-game-hot-bot-${matchup.id}`}
                    required
                  >
                    <option value="">
                      {hotBotsLoading ? "読み込み中…" : "選択…"}
                    </option>
                    {hotBots.map((bot) => (
                      <option key={bot.id} value={String(bot.id)}>
                        {bot.name} (#{bot.id})
                      </option>
                    ))}
                  </Select>
                  {hotBotsError ? (
                    <div
                      className="text-xs text-red-700"
                      data-testid={`hot-bot-error-${matchup.id}`}
                    >
                      ボット一覧の取得に失敗: {hotBotsError}
                    </div>
                  ) : null}
                  {!hotBotsLoading && !hotBotsError && hotBots.length === 0 ? (
                    <div
                      className="text-xs text-slate-600"
                      data-testid={`hot-bot-empty-${matchup.id}`}
                    >
                      このユーザーのボットがありません。
                    </div>
                  ) : null}
                </Field>
                <Field className="space-y-1">
                  <Label
                    className="text-xs font-semibold text-slate-700"
                    htmlFor={`map-${matchup.id}`}
                  >
                    マップ
                  </Label>
                  <Select
                    id={`map-${matchup.id}`}
                    value={form.mapId}
                    onChange={(e) =>
                      setGameForms((prev) => ({
                        ...prev,
                        [matchup.id]: { ...form, mapId: e.target.value },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    data-testid={`create-game-map-${matchup.id}`}
                    required
                  >
                    {mapList.length === 0 ? (
                      <option value={form.mapId}>
                        {mapListError ? "読み込み失敗" : "読み込み中…"}
                      </option>
                    ) : (
                      mapList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.width}x{m.height})
                        </option>
                      ))
                    )}
                  </Select>
                  {mapListError ? (
                    <div className="text-xs text-red-700">
                      マップ一覧の取得に失敗: {mapListError}
                    </div>
                  ) : null}
                </Field>
                <Button
                  type="submit"
                  disabled={
                    actionPending ||
                    !form.coolUserId ||
                    !form.hotUserId ||
                    !form.coolBotId ||
                    !form.hotBotId ||
                    form.coolUserId === form.hotUserId
                  }
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  data-testid={`create-game-submit-${matchup.id}`}
                >
                  対戦開始（Game 作成）
                </Button>
              </form>

              <div
                className="mt-5 overflow-hidden rounded border border-slate-200"
                data-testid={`games-table-${matchup.id}`}
              >
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-white/70">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        Game ID
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        status
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        result
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        Cool / Hot
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        bots
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        links
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        再試合
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matchup.games.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-slate-600" colSpan={7}>
                          Game がまだありません。
                        </td>
                      </tr>
                    ) : (
                      matchup.games.map((game) => {
                        const canRematch = game.status === "valid";
                        const rematchReason = rematchReasons[game.id] ?? "";
                        return (
                          <tr key={game.id} data-testid={`game-row-${game.id}`}>
                            <td className="px-4 py-2 font-mono text-xs text-slate-800">
                              {game.id}
                              <div className="mt-1 text-[11px] text-slate-500">
                                {formatDate(game.createdAt)}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-slate-700">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
                                {game.status}
                              </span>
                              {game.status === "invalid" &&
                              game.invalidReason ? (
                                <div className="mt-1 text-[11px] text-slate-600">
                                  reason: {game.invalidReason}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-2 text-slate-700">
                              {game.result ?? "-"}
                            </td>
                            <td className="px-4 py-2 text-slate-700">
                              <div className="font-mono text-xs">
                                C: {game.coolUserId}
                              </div>
                              <div className="font-mono text-xs">
                                H: {game.hotUserId}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-slate-700">
                              <div className="font-mono text-xs">
                                C: {game.coolBotId}
                              </div>
                              <div className="font-mono text-xs">
                                H: {game.hotBotId}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-slate-700">
                              <div className="flex flex-col gap-1">
                                <Link
                                  href={`/rooms/${encodeURIComponent(game.roomId)}`}
                                  className="text-sky-700 underline"
                                  data-testid={`game-room-link-${game.id}`}
                                >
                                  room
                                </Link>
                                {/* Delay replay links to reduce early spoilers. */}
                                {game.replayId && game.replayVisible ? (
                                  <Link
                                    href={`/replays/${encodeURIComponent(game.replayId)}`}
                                    className="text-sky-700 underline"
                                    data-testid={`game-replay-link-${game.id}`}
                                  >
                                    replay
                                  </Link>
                                ) : game.replayId ? (
                                  <span className="text-slate-500">
                                    リプレイ準備中
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-col gap-2">
                                <Input
                                  value={rematchReason}
                                  onChange={(e) =>
                                    setRematchReasons((prev) => ({
                                      ...prev,
                                      [game.id]: e.target.value,
                                    }))
                                  }
                                  disabled={!canRematch || actionPending}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50"
                                  placeholder="無効理由（任意）"
                                  data-testid={`rematch-reason-${game.id}`}
                                />
                                <Button
                                  type="button"
                                  disabled={!canRematch || actionPending}
                                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                                  data-testid={`rematch-submit-${game.id}`}
                                  onClick={async () => {
                                    await runAction("再試合", async () => {
                                      const payload: Record<string, unknown> = {
                                        gameId: game.id,
                                        matchupId: matchup.id,
                                        coolUserId: game.coolUserId,
                                        hotUserId: game.hotUserId,
                                        coolBotId: game.coolBotId,
                                        hotBotId: game.hotBotId,
                                      };
                                      const reason = rematchReason.trim();
                                      if (reason)
                                        payload.invalidReason = reason;

                                      const res = await fetch(
                                        "/api/games/rematch",
                                        {
                                          method: "POST",
                                          headers: {
                                            "content-type": "application/json",
                                          },
                                          body: JSON.stringify(payload),
                                        },
                                      );
                                      if (!res.ok) {
                                        throw new Error(
                                          await readErrorMessage(res),
                                        );
                                      }
                                      void ((await res.json()) as CreateGameResponse);
                                      setRematchReasons((prev) => ({
                                        ...prev,
                                        [game.id]: "",
                                      }));
                                      await load();
                                    });
                                  }}
                                >
                                  再試合
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
