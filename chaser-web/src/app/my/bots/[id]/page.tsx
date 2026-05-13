import type { Metadata } from "next";
import BotEditorClient from "./BotEditorClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: id ? `ボット編集 ${id}` : "ボット編集" };
}

export default async function BotEditorPage({ params }: PageProps) {
  const { id } = await params;
  return <BotEditorClient botId={id} />;
}
