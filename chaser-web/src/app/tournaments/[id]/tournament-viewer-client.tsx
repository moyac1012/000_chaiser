"use client";

import { Button } from "@headlessui/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  GameResult,
  GameStatus,
  TournamentRegistrationMode,
  TournamentStatus,
} from "@/db/types";

type PublicUser = {
  displayName: string;
};

type TournamentDetail = {
  id: string;
  name: string;
  status: TournamentStatus;
  registrationMode: TournamentRegistrationMode;
  createdAt: string;
  finishedAt: string | null;
  viewer: {
    status: "owner" | "participant" | "requested" | "none";
    canJoin: boolean;
    canRequest: boolean;
  };
  participants: PublicUser[];
  matchups: Array<{
    id: string;
    playerA: PublicUser;
    playerB: PublicUser;
    createdAt: string;
    games: Array<{
      id: string;
      cool: PublicUser;
      hot: PublicUser;
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

function resultLabel(result: GameResult | null): string {
  switch (result) {
    case "cool":
      return "cool";
    case "hot":
      return "hot";
    case "draw":
      return "draw";
    default:
      return "-";
  }
}

function registrationModeLabel(mode: TournamentRegistrationMode): string {
  switch (mode) {
    case "public":
      return "公開（誰でも参加）";
    case "approval":
      return "承認制（申請→承認）";
    case "invite":
      return "招待制";
  }
}

function registrationModeHint(mode: TournamentRegistrationMode): string {
  switch (mode) {
    case "public":
      return "ログイン済みユーザーはすぐに参加できます。";
    case "approval":
      return "参加申請後、管理者の承認が必要です。";
    case "invite":
      return "管理者の追加が必要です。";
  }
}

function safeDisplayName(user: PublicUser | null | undefined): string {
  const name = user?.displayName?.trim() ?? "";
  return name || "Unknown";
}

export default function TournamentViewerClient({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinPending, setJoinPending] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournamentId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        if (res.status === 401) {
          window.location.assign("/sign-in");
          return;
        }
        throw new Error(await readErrorMessage(res));
      }
      const data = (await res.json()) as TournamentDetailResponse;
      setTournament(data.tournament);
    } catch (err) {
      setLoadError((err as Error).message);
      setTournament(null);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  const requestParticipation = useCallback(async () => {
    if (joinPending) return;
    setJoinPending(true);
    setJoinError(null);
    setJoinMessage(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournamentId)}/participation`,
        { method: "POST" },
      );
      if (!res.ok) {
        if (res.status === 401) {
          window.location.assign("/sign-in");
          return;
        }
        throw new Error(await readErrorMessage(res));
      }
      const data = (await res.json()) as { status?: string };
      if (data.status === "requested") {
        setJoinMessage("参加申請を送信しました。");
      } else if (data.status === "joined" || data.status === "participant") {
        setJoinMessage("参加しました。");
      } else {
        setJoinMessage("操作が完了しました。");
      }
      await load();
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setJoinPending(false);
    }
  }, [joinPending, load, tournamentId]);

  const cancelParticipationRequest = useCallback(async () => {
    if (joinPending) return;
    setJoinPending(true);
    setJoinError(null);
    setJoinMessage(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournamentId)}/participation`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        if (res.status === 401) {
          window.location.assign("/sign-in");
          return;
        }
        throw new Error(await readErrorMessage(res));
      }
      setJoinMessage("参加申請を取り消しました。");
      await load();
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setJoinPending(false);
    }
  }, [joinPending, load, tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const participantNames = useMemo(() => {
    return (tournament?.participants ?? []).map((p) => safeDisplayName(p));
  }, [tournament?.participants]);

  if (loading) {
    return (
      <div
        className="room-panel room-panel--strong p-6 text-sm text-slate-700 room-fade"
        data-testid="tournament-viewer-loading"
      >
        読み込み中…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="room-panel room-panel--strong p-6 room-fade"
        data-testid="tournament-viewer-load-error"
      >
        <h1 className="text-lg font-semibold text-slate-900">
          大会の読み込みに失敗しました
        </h1>
        <p className="mt-2 text-sm text-rose-600">{loadError}</p>
        <Button
          type="button"
          className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 hover:bg-white"
          onClick={() => void load()}
          data-testid="tournament-viewer-retry"
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
        data-testid="tournament-viewer-empty"
      >
        表示できる大会がありません。
      </div>
    );
  }

  const badge = statusBadge(tournament.status);

  return (
    <div className="space-y-8" data-testid="tournament-viewer-page">
      <header className="room-hud room-fade">
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <div className="space-y-2">
            <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
              Tournament
            </div>
            <h1
              className="text-2xl font-semibold text-white"
              data-testid="tournament-name"
            >
              {tournament.name}
            </h1>
            <p className="text-sm text-slate-300">
              参加受付と対戦状況を確認できます。
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${badge.className}`}
            data-testid="tournament-status"
          >
            {badge.label}
          </span>
        </div>
      </header>

      <section
        className="space-y-4 room-fade room-fade--delay-1"
        data-testid="registration-section"
      >
        <h2 className="text-lg font-semibold text-slate-900">参加受付</h2>
        <div className="room-panel room-panel--strong p-5">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-900">
              {registrationModeLabel(tournament.registrationMode)}
            </div>
            <p className="text-sm text-slate-600">
              {registrationModeHint(tournament.registrationMode)}
            </p>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-700">
            {tournament.viewer.status === "owner" ? (
              <p>この大会の管理者です。</p>
            ) : null}
            {tournament.viewer.status === "participant" ? (
              <p>参加済みです。</p>
            ) : null}
            {tournament.viewer.status === "requested" ? (
              <div className="space-y-2">
                <p>参加申請済みです。承認をお待ちください。</p>
                <Button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  onClick={cancelParticipationRequest}
                  disabled={joinPending}
                  data-testid="tournament-cancel-request"
                >
                  申請を取り消す
                </Button>
              </div>
            ) : null}
            {tournament.viewer.status === "none" &&
            (tournament.viewer.canJoin || tournament.viewer.canRequest) ? (
              <Button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={requestParticipation}
                disabled={joinPending}
                data-testid="tournament-join-submit"
              >
                {tournament.viewer.canJoin ? "参加する" : "参加申請する"}
              </Button>
            ) : null}
            {tournament.viewer.status === "none" &&
            !tournament.viewer.canJoin &&
            !tournament.viewer.canRequest ? (
              <p>
                {tournament.status === "finished"
                  ? "大会は終了しました。"
                  : "この大会は招待制です。"}
              </p>
            ) : null}
          </div>

          {joinError ? (
            <div className="room-alert mt-3 px-4 py-2 text-sm">{joinError}</div>
          ) : null}
          {joinMessage ? (
            <div className="mt-3 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
              {joinMessage}
            </div>
          ) : null}
        </div>
      </section>

      <section
        className="space-y-4 room-fade room-fade--delay-2"
        data-testid="participants-section"
      >
        <h2 className="text-lg font-semibold text-slate-900">参加者</h2>
        <div className="room-panel room-panel--strong p-5">
          {participantNames.length === 0 ? (
            <p className="text-sm text-slate-600">参加者がまだいません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tournament.participants.map((p, index) => (
                <li
                  key={`${tournament.id}-participant-${index}`}
                  className="py-2 text-sm text-slate-800"
                  data-testid="participant-row"
                >
                  {safeDisplayName(p)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        className="space-y-4 room-fade room-fade--delay-3"
        data-testid="matchups-section"
      >
        <h2 className="text-lg font-semibold text-slate-900">対戦一覧</h2>
        <div className="space-y-4">
          {tournament.matchups.length === 0 ? (
            <div className="room-panel room-panel--strong p-5 text-sm text-slate-700">
              対戦カードがまだありません。
            </div>
          ) : (
            tournament.matchups.map((matchup) => (
              <div
                key={matchup.id}
                className="room-panel room-panel--strong overflow-hidden"
                data-testid="matchup-row"
              >
                <div className="bg-white/70 px-5 py-3">
                  <div className="text-sm font-semibold text-slate-900">
                    {safeDisplayName(matchup.playerA)} vs{" "}
                    {safeDisplayName(matchup.playerB)}
                  </div>
                </div>

                <div className="px-5 py-4">
                  {matchup.games.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      この対戦の試合がまだありません。
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {matchup.games.map((game) => {
                        const isInvalid = game.status === "invalid";
                        return (
                          <div
                            key={game.id}
                            className={`rounded-2xl border px-4 py-3 text-sm ${
                              isInvalid
                                ? "border-slate-200 bg-slate-50 text-slate-500"
                                : "border-slate-200/80 bg-white/80 text-slate-800"
                            }`}
                            data-testid="game-row"
                          >
                            {isInvalid ? (
                              <div className="space-y-1">
                                <div className="font-semibold">無効試合</div>
                                {game.invalidReason ? (
                                  <div>理由: {game.invalidReason}</div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="grid gap-1 sm:grid-cols-3">
                                  <div>
                                    <span className="font-semibold">Cool:</span>{" "}
                                    {safeDisplayName(game.cool)}
                                  </div>
                                  <div>
                                    <span className="font-semibold">Hot:</span>{" "}
                                    {safeDisplayName(game.hot)}
                                  </div>
                                  <div>
                                    <span className="font-semibold">勝者:</span>{" "}
                                    {resultLabel(game.result)}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                  <Link
                                    href={`/rooms/${encodeURIComponent(game.roomId)}?from=tournament&tournamentId=${encodeURIComponent(
                                      tournament.id,
                                    )}`}
                                    className="text-sky-700 underline hover:text-sky-800"
                                    data-testid={`game-room-link-${game.id}`}
                                  >
                                    room を開く
                                  </Link>
                                  {/* Delay replay links to reduce early spoilers. */}
                                  {game.replayId && game.replayVisible ? (
                                    <Link
                                      href={`/replays/${encodeURIComponent(
                                        game.replayId,
                                      )}?from=tournament&tournamentId=${encodeURIComponent(
                                        tournament.id,
                                      )}`}
                                      className="text-sky-700 underline hover:text-sky-800"
                                      data-testid={`game-replay-link-${game.id}`}
                                    >
                                      リプレイを見る
                                    </Link>
                                  ) : game.replayId ? (
                                    <span className="text-slate-500">
                                      リプレイ準備中
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">
                                      リプレイ未作成
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 text-[11px] text-slate-500">
                                  <span
                                    className="font-mono"
                                    data-testid={`game-room-id-${game.id}`}
                                  >
                                    roomId: {game.roomId}
                                  </span>
                                  {game.replayId && game.replayVisible ? (
                                    <span
                                      className="ml-3 font-mono"
                                      data-testid={`game-replay-id-${game.id}`}
                                    >
                                      replayId: {game.replayId}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
