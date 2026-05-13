"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type UnsavedWarningOptions = {
  enabled: boolean;
  message: string;
};

function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function findAnchorTarget(
  target: EventTarget | null,
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest("a[href]");
}

function isSameOrigin(url: URL): boolean {
  return url.origin === window.location.origin;
}

/**
 * Best-effort guard to prevent losing unsaved work.
 * - Blocks tab close/reload via beforeunload.
 * - Intercepts in-app link clicks and browser back via confirm.
 */
export function useUnsavedChangesWarning({
  enabled,
  message,
}: UnsavedWarningOptions): void {
  const router = useRouter();
  const enabledRef = useRef(enabled);
  const bypassRef = useRef(false);
  const revertingPopStateRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!enabledRef.current || bypassRef.current) return;
      if (!isPlainLeftClick(event)) return;

      const anchor = findAnchorTarget(event.target);
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const hrefAttr = anchor.getAttribute("href");
      if (!hrefAttr || hrefAttr.startsWith("#")) return;

      const url = new URL(anchor.href);
      const ok = window.confirm(message);
      if (!ok) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      bypassRef.current = true;
      event.preventDefault();
      event.stopPropagation();

      if (isSameOrigin(url)) {
        router.push(`${url.pathname}${url.search}${url.hash}`);
      } else {
        window.location.href = url.href;
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [message, router]);

  useEffect(() => {
    const handlePopState = () => {
      if (revertingPopStateRef.current) {
        revertingPopStateRef.current = false;
        return;
      }
      if (!enabledRef.current || bypassRef.current) return;
      const ok = window.confirm(message);
      if (!ok) {
        // Revert the back/forward navigation (best-effort).
        revertingPopStateRef.current = true;
        history.go(1);
        return;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [message]);
}
