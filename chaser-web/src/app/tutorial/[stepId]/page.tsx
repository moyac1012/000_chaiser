import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import TutorialStepClient from "./TutorialStepClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "チュートリアル",
};

export default async function TutorialStepPage({
  params,
}: {
  params: Promise<{ stepId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { stepId } = await params;

  return (
    <main className="px-4 py-10">
      <TutorialStepClient stepId={stepId} />
    </main>
  );
}
