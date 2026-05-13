import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import TutorialStartClient from "./TutorialStartClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "チュートリアル",
};

export default async function TutorialPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <main className="px-4 py-10">
      <TutorialStartClient />
    </main>
  );
}
