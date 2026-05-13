import type { Metadata } from "next";
import RubyBotEditorClient from "./RubyBotEditorClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: id ? `Ruby ボット編集 ${id}` : "Ruby ボット編集" };
}

export default async function RubyBotEditorPage({ params }: PageProps) {
  const { id } = await params;
  return <RubyBotEditorClient botId={id} />;
}
