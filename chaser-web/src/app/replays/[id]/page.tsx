import type { Metadata } from "next";
import ReplayViewerClient from "./ReplayViewerClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: id ? `リプレイ ${id}` : "リプレイ" };
}

function resolveStringParam(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function ReplayPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const from = resolveStringParam(query.from);
  const tournamentId = resolveStringParam(query.tournamentId);
  const backLink =
    (from === "tournament" || from === "tournament-viewer") && tournamentId
      ? {
          href: `/tournaments/${encodeURIComponent(tournamentId)}`,
          label: "大会にもどる",
        }
      : { href: "/replays", label: "リプレイ一覧にもどる" };

  return <ReplayViewerClient replayId={id} initialBackLink={backLink} />;
}
