import { expect, test } from "@playwright/test";
import { upsertBot } from "./helpers/botApi";
import {
  authStatePathForTestInfo,
  ensurePlayerControls,
  setupAuthedPage,
} from "./helpers/e2eAuth";
import { initRoomForOwnerPage } from "./helpers/roomApi";
import { expectBoardSize, selectedMapSize } from "./helpers/roomUi";

const RIGHT_WALKER_CODE = `function onTurn(api){ api.walkRight(); }`;
const ALT_CODE = `let c=0; function onTurn(api){ c++; if(c%2===0){ api.walkUp(); return; } api.walkRight(); }`;
const ERROR_CODE = `function onTurn(api){ throw new Error("boom") }`;
const TIMEOUT_CODE = `function onTurn(api){ while (true) {} }`;

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

async function waitForActionLogs(
  page: import("@playwright/test").Page,
  min: number,
) {
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid="action-log-row"]').length >=
      count,
    min,
    { timeout: 30_000 },
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
      await expect(status).toHaveText(/^(対戦中|終了)$/u, { timeout: 1_500 });
      return;
    } catch {
      await page.waitForTimeout(250);
    }
  }

  await expect(status).toHaveText(/^(対戦中|終了)$/u);
}

async function latestTurn(
  page: import("@playwright/test").Page,
): Promise<number> {
  const text = await page
    .locator('[data-testid="action-log-turn"]')
    .last()
    .textContent();
  if (!text) return 0;
  const match = text.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

async function playerPositions(
  page: import("@playwright/test").Page,
): Promise<Record<string, string>> {
  const coolPos = await page
    .locator('[data-testid="player-cool"]')
    .getAttribute("data-position");
  const hotPos = await page
    .locator('[data-testid="player-hot"]')
    .getAttribute("data-position");
  return { cool: coolPos ?? "", hot: hotPos ?? "" };
}

async function waitForSameLatestTurn(params: {
  a: import("@playwright/test").Page;
  b: import("@playwright/test").Page;
  timeoutMs?: number;
}): Promise<{ turnA: number; turnB: number }> {
  const deadline = Date.now() + (params.timeoutMs ?? 10_000);
  while (Date.now() < deadline) {
    const turnA = await latestTurn(params.a);
    const turnB = await latestTurn(params.b);
    if (turnA === turnB) return { turnA, turnB };
    await params.a.waitForTimeout(250);
  }
  return {
    turnA: await latestTurn(params.a),
    turnB: await latestTurn(params.b),
  };
}

if (!isPlaywrightRunner) {
  console.warn(
    "[rooms-ui.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test.describe
    .serial("rooms UI E2E", () => {
      test.describe.configure({ timeout: 180_000 });
      test("正常系: Bot 対戦が UI に反映され Replay 公開待ちまで表示される", async ({
        browser,
      }) => {
        const baseURL =
          test.info().project.use.baseURL ?? "http://localhost:3000";
        const ownerStorageState = authStatePathForTestInfo(
          "owner",
          test.info(),
        );
        const ownerCtx = await browser.newContext({
          baseURL,
          storageState: ownerStorageState,
        });
        const playerCtx = await browser.newContext({
          baseURL,
          storageState: authStatePathForTestInfo("player", test.info()),
        });

        const roomPath = makeRoomPath("test-e2e-normal");
        const ownerPage = await ownerCtx.newPage();
        const playerPage = await playerCtx.newPage();
        await setupAuthedPage(ownerPage);
        await setupAuthedPage(playerPage);

        const ownerBotId = await upsertBot({
          page: ownerPage,
          code: RIGHT_WALKER_CODE,
          name: "Right Walker",
        });
        const playerBotId = await upsertBot({
          page: playerPage,
          code: ALT_CODE,
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
        await ensurePlayerControls(ownerPage);
        await ensurePlayerControls(playerPage);
        const boardSize = await selectedMapSize(ownerPage);

        await expect(ownerPage.getByTestId("cool-bot-id")).toBeEnabled();
        await ownerPage.getByTestId("cool-bot-id").fill(String(ownerBotId));
        await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
          String(ownerBotId),
        );
        await ownerPage.getByTestId("join-slot-cool").click();
        await expect(playerPage.getByTestId("hot-bot-id")).toBeEnabled();
        await playerPage.getByTestId("hot-bot-id").fill(String(playerBotId));
        await expect(playerPage.getByTestId("hot-bot-id")).toHaveValue(
          String(playerBotId),
        );
        await playerPage.getByTestId("join-slot-hot").click();

        await startMatchByOwner(ownerPage);

        await expectBoardSize(ownerPage, boardSize);

        await ownerPage
          .getByTestId("winner-badge")
          .waitFor({ timeout: 30_000 });
        await expect(ownerPage.getByTestId("replay-pending")).toBeVisible();

        await ownerCtx.close();
        await playerCtx.close();
      });

      test("Worker error は即負けとして終了する", async ({ browser }) => {
        const baseURL =
          test.info().project.use.baseURL ?? "http://localhost:3000";
        const ownerStorageState = authStatePathForTestInfo(
          "owner",
          test.info(),
        );
        const ownerCtx = await browser.newContext({
          baseURL,
          storageState: ownerStorageState,
        });
        const playerCtx = await browser.newContext({
          baseURL,
          storageState: authStatePathForTestInfo("player", test.info()),
        });

        const roomPath = makeRoomPath("test-e2e-error");
        const ownerPage = await ownerCtx.newPage();
        const playerPage = await playerCtx.newPage();
        await setupAuthedPage(ownerPage);
        await setupAuthedPage(playerPage);

        const ownerBotId = await upsertBot({
          page: ownerPage,
          code: ERROR_CODE,
          name: "Error Bot",
        });
        const playerBotId = await upsertBot({
          page: playerPage,
          code: ALT_CODE,
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
        await ensurePlayerControls(ownerPage);
        await ensurePlayerControls(playerPage);

        await expect(ownerPage.getByTestId("cool-bot-id")).toBeEnabled();
        await ownerPage.getByTestId("cool-bot-id").fill(String(ownerBotId));
        await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
          String(ownerBotId),
        );
        await ownerPage.getByTestId("join-slot-cool").click();
        await expect(playerPage.getByTestId("hot-bot-id")).toBeEnabled();
        await playerPage.getByTestId("hot-bot-id").fill(String(playerBotId));
        await expect(playerPage.getByTestId("hot-bot-id")).toHaveValue(
          String(playerBotId),
        );
        await playerPage.getByTestId("join-slot-hot").click();
        await startMatchByOwner(ownerPage);

        const winnerBadge = ownerPage.getByTestId("winner-badge");
        await winnerBadge.waitFor({ timeout: 20_000 });
        await expect(winnerBadge).toContainText("Hot");

        await ownerCtx.close();
        await playerCtx.close();
      });

      test("Worker timeout は即負けとして終了する", async ({ browser }) => {
        const baseURL =
          test.info().project.use.baseURL ?? "http://localhost:3000";
        const ownerStorageState = authStatePathForTestInfo(
          "owner",
          test.info(),
        );
        const ownerCtx = await browser.newContext({
          baseURL,
          storageState: ownerStorageState,
        });
        const playerCtx = await browser.newContext({
          baseURL,
          storageState: authStatePathForTestInfo("player", test.info()),
        });

        const roomPath = makeRoomPath("test-e2e-timeout");
        const ownerPage = await ownerCtx.newPage();
        const playerPage = await playerCtx.newPage();
        await setupAuthedPage(ownerPage);
        await setupAuthedPage(playerPage);

        const ownerBotId = await upsertBot({
          page: ownerPage,
          code: TIMEOUT_CODE,
          name: "Timeout Bot",
        });
        const playerBotId = await upsertBot({
          page: playerPage,
          code: ALT_CODE,
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
        await ensurePlayerControls(ownerPage);
        await ensurePlayerControls(playerPage);

        await expect(ownerPage.getByTestId("cool-bot-id")).toBeEnabled();
        await ownerPage.getByTestId("cool-bot-id").fill(String(ownerBotId));
        await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
          String(ownerBotId),
        );
        await ownerPage.getByTestId("join-slot-cool").click();
        await expect(playerPage.getByTestId("hot-bot-id")).toBeEnabled();
        await playerPage.getByTestId("hot-bot-id").fill(String(playerBotId));
        await expect(playerPage.getByTestId("hot-bot-id")).toHaveValue(
          String(playerBotId),
        );
        await playerPage.getByTestId("join-slot-hot").click();
        await startMatchByOwner(ownerPage);

        const winnerBadge = ownerPage.getByTestId("winner-badge");
        await winnerBadge.waitFor({ timeout: 20_000 });
        await expect(winnerBadge).toContainText("Hot");

        await ownerCtx.close();
        await playerCtx.close();
      });

      test("観戦者ページが Board と ActionLog を同期する", async ({
        browser,
      }) => {
        const roomPath = makeRoomPath("test-e2e-spectator");
        const baseURL =
          test.info().project.use.baseURL ?? "http://localhost:3000";
        const ownerStorageState = authStatePathForTestInfo(
          "owner",
          test.info(),
        );
        const ownerCtx = await browser.newContext({
          baseURL,
          storageState: ownerStorageState,
        });
        const playerCtx = await browser.newContext({
          baseURL,
          storageState: authStatePathForTestInfo("player", test.info()),
        });
        const spectatorA = await browser.newContext({
          baseURL,
          storageState: authStatePathForTestInfo("spectator", test.info()),
        });
        const spectatorB = await browser.newContext({
          baseURL,
          storageState: authStatePathForTestInfo("spectator", test.info()),
        });

        const ownerPage = await ownerCtx.newPage();
        const playerPage = await playerCtx.newPage();
        const pageA = await spectatorA.newPage();
        const pageB = await spectatorB.newPage();
        await setupAuthedPage(ownerPage);
        await setupAuthedPage(playerPage);
        await setupAuthedPage(pageA);
        await setupAuthedPage(pageB);

        const ownerBotId = await upsertBot({
          page: ownerPage,
          code: RIGHT_WALKER_CODE,
          name: "Right Walker",
        });
        const playerBotId = await upsertBot({
          page: playerPage,
          code: ALT_CODE,
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
        await pageA.goto(roomPath, { waitUntil: "domcontentloaded" });
        await pageB.goto(roomPath, { waitUntil: "domcontentloaded" });
        await ensurePlayerControls(ownerPage);
        await ensurePlayerControls(playerPage);

        await expect(pageA.getByTestId("spectator-panel")).toBeVisible();
        await expect(pageB.getByTestId("spectator-panel")).toBeVisible();

        await expect(ownerPage.getByTestId("cool-bot-id")).toBeEnabled();
        await ownerPage.getByTestId("cool-bot-id").fill(String(ownerBotId));
        await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
          String(ownerBotId),
        );
        await ownerPage.getByTestId("join-slot-cool").click();
        await expect(playerPage.getByTestId("hot-bot-id")).toBeEnabled();
        await playerPage.getByTestId("hot-bot-id").fill(String(playerBotId));
        await expect(playerPage.getByTestId("hot-bot-id")).toHaveValue(
          String(playerBotId),
        );
        await playerPage.getByTestId("join-slot-hot").click();

        await startMatchByOwner(ownerPage);

        await waitForActionLogs(ownerPage, 3);
        await waitForActionLogs(pageA, 3);
        await waitForActionLogs(pageB, 3);

        const turnOwner = await latestTurn(ownerPage);
        const { turnA, turnB } = await waitForSameLatestTurn({
          a: pageA,
          b: pageB,
        });
        expect(turnOwner).toBeGreaterThanOrEqual(3);
        expect(turnA).toBe(turnB);

        const posA = await playerPositions(pageA);
        const posB = await playerPositions(pageB);
        expect(posA.cool).toBe(posB.cool);
        expect(posA.hot).toBe(posB.hot);

        await ownerCtx.close();
        await playerCtx.close();
        await spectatorA.close();
        await spectatorB.close();
      });
    });
}
