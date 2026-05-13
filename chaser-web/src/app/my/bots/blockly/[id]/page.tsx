import type { Metadata } from "next";
import BlocklyBotEditorClient from "./BlocklyBotEditorClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: id ? `Blockly ボット編集 ${id}` : "Blockly ボット編集" };
}

export default async function BlocklyBotEditorPage({ params }: PageProps) {
  const { id } = await params;
  return <BlocklyBotEditorClient botId={id} />;
}
