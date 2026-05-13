import path from "node:path";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page, TestInfo } from "@playwright/test";

export type E2EUserKey = "owner" | "player" | "spectator";

export function authStatePath(key: E2EUserKey, workerIndex?: number): string {
  if (typeof workerIndex === "number") {
    return path.join(
      process.cwd(),
      "playwright",
      ".clerk",
      `${key}-w${workerIndex}.json`,
    );
  }
  return path.join(process.cwd(), "playwright", ".clerk", `${key}.json`);
}

export function authStatePathForTestInfo(
  key: E2EUserKey,
  testInfo: Pick<TestInfo, "parallelIndex" | "workerIndex">,
): string {
  const stableWorkerSlot =
    typeof testInfo.parallelIndex === "number"
      ? testInfo.parallelIndex
      : testInfo.workerIndex;
  return authStatePath(key, stableWorkerSlot);
}

export async function setupAuthedPage(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
}

function isTransientJoinError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /detached from the DOM|not enabled|not stable|Element is not attached|Execution context was destroyed|Timeout .* exceeded while waiting for/u.test(
    message,
  );
}

export async function ensurePlayerControls(page: Page): Promise<void> {
  const joinPanel = page.getByTestId("slot-join-panel");
  const joinPlayerButton = page.getByTestId("join-player");
  const coolBotInput = page.getByTestId("cool-bot-id");
  const hotBotInput = page.getByTestId("hot-bot-id");
  const coolJoinButton = page.getByTestId("join-slot-cool");
  const hotJoinButton = page.getByTestId("join-slot-hot");
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error(
        "player controls are not available because the page closed",
      );
    }

    if (await joinPanel.isVisible().catch(() => false)) {
      return;
    }
    if (await coolBotInput.isVisible().catch(() => false)) {
      return;
    }
    if (await hotBotInput.isVisible().catch(() => false)) {
      return;
    }
    if (await coolJoinButton.isVisible().catch(() => false)) {
      return;
    }
    if (await hotJoinButton.isVisible().catch(() => false)) {
      return;
    }

    if (await joinPlayerButton.isVisible().catch(() => false)) {
      if (await joinPlayerButton.isEnabled().catch(() => false)) {
        try {
          await joinPlayerButton.click({ timeout: 1_500 });
        } catch (error) {
          if (!isTransientJoinError(error)) {
            throw error;
          }
        }
      }
    }

    await page.waitForTimeout(250);
  }

  const assignedRole =
    (await page
      .getByTestId("assigned-role")
      .textContent()
      .catch(() => null)) ?? "missing";
  throw new Error(
    `player controls are not available on this page (assignedRole=${assignedRole})`,
  );
}
