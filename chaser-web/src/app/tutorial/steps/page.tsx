import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import TutorialStepsClient from "./TutorialStepsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "チュートリアル一覧",
};

export default async function TutorialStepsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <main className="px-4 py-10">
      <TutorialStepsClient />
    </main>
  );
}
