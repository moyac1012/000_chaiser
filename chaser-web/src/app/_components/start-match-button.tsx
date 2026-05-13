"use client";

import { Button } from "@headlessui/react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import type { RoomMode } from "@/core/match/room";

function createRoomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function StartMatchButton({
  label,
  mode = "public",
}: {
  label: string;
  mode?: RoomMode;
}) {
  const router = useRouter();

  const handleClick = useCallback(() => {
    const roomId = createRoomId();
    const url =
      mode === "practice"
        ? `/rooms/${roomId}?mode=practice`
        : `/rooms/${roomId}`;
    router.push(url);
  }, [router, mode]);

  return (
    <Button
      type="button"
      onClick={handleClick}
      className="inline-flex w-full cursor-pointer items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    >
      {label}
    </Button>
  );
}
