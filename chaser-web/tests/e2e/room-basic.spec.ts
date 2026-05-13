import { expect, test } from "@playwright/test";
import { upsertBot } from "./helpers/botApi";
import {
  authStatePathForTestInfo,
  ensurePlayerControls,
  setupAuthedPage,
} from "./helpers/e2eAuth";
import { initRoomForOwnerPage } from "./helpers/roomApi";
import { expectBoardSize, selectedMapSize } from "./helpers/roomUi";

const isBunUnitTest =
  typeof Bun !== "undefined" &&
  process.env.PLAYWRIGHT_TEST_BASE_DIR === undefined &&
  process.env.PW_TEST_WORKER_INDEX === undefined &&
  process.env.TEST_WORKER_INDEX === undefined;

const isPlaywrightRunner = !isBunUnitTest;

function makeRoomPath(label: string): string {
  return `/rooms/${label}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

async function waitForLog(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-testid="action-log-row"]').length > 0,
    null,
    { timeout: 20_000 },
  );
}

async function startMatchByOwner(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("ready-cool")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30_000 },
  );
  await expect(page.getByTestId("ready-hot")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30_000 },
  );

  const button = page.getByTestId("start-match");
  await button.waitFor({ timeout: 30_000 });

  const status = page.getByTestId("room-status");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await button.click();
    } catch {
      // When the match starts, the button disappears; that's fine.
    }
    try {
      await expect(status).toHaveText("対戦中", { timeout: 1_500 });
      return;
    } catch {
      await page.waitForTimeout(250);
    }
  }

  await expect(status).toHaveText("対戦中");
}

if (!isPlaywrightRunner) {
  console.warn(
    "[room-basic.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test("owner と player が参加し、spectator が更新を観戦できる", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
    const ownerStorageState = authStatePathForTestInfo("owner", test.info());
    const roomPath = makeRoomPath("test-playwright");
    const ownerContext = await browser.newContext({
      baseURL,
      storageState: ownerStorageState,
    });
    const playerContext = await browser.newContext({
      baseURL,
      storageState: authStatePathForTestInfo("player", test.info()),
    });
    const spectatorContext = await browser.newContext({
      baseURL,
      storageState: authStatePathForTestInfo("spectator", test.info()),
    });

    const ownerPage = await ownerContext.newPage();
    const playerPage = await playerContext.newPage();
    const viewerPage = await spectatorContext.newPage();
    await setupAuthedPage(ownerPage);
    await setupAuthedPage(playerPage);
    await setupAuthedPage(viewerPage);

    const ownerBotId = await upsertBot({
      page: ownerPage,
      code: "function onTurn(api){ api.walkRight(); }",
      name: "Right Walker",
    });
    const playerBotId = await upsertBot({
      page: playerPage,
      code: "let c=0; function onTurn(api){ c++; if(c%2===0){ api.walkUp(); return; } api.walkRight(); }",
      name: "Alt Walker",
    });

    await initRoomForOwnerPage({
      roomPath,
      page: ownerPage,
    });
    await ownerPage.goto(roomPath, { waitUntil: "domcontentloaded" });
    await playerPage.goto(`${roomPath}?intent=player`, {
      waitUntil: "domcontentloaded",
    });
    await viewerPage.goto(roomPath, { waitUntil: "domcontentloaded" });

    await ensurePlayerControls(ownerPage);
    await ensurePlayerControls(playerPage);
    await expect(viewerPage.getByTestId("spectator-panel")).toBeVisible();
    const boardSize = await selectedMapSize(ownerPage);

    await ownerPage.getByTestId("cool-bot-id").fill(String(ownerBotId));
    await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
      String(ownerBotId),
    );
    await ownerPage.getByTestId("join-slot-cool").click();
    await playerPage.getByTestId("hot-bot-id").fill(String(playerBotId));
    await expect(playerPage.getByTestId("hot-bot-id")).toHaveValue(
      String(playerBotId),
    );
    await playerPage.getByTestId("join-slot-hot").click();

    await startMatchByOwner(ownerPage);

    await waitForLog(viewerPage);
    await expectBoardSize(viewerPage, boardSize);

    await ownerContext.close();
    await playerContext.close();
    await spectatorContext.close();
  });
}
