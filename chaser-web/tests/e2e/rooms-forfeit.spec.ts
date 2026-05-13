import { expect, test } from "@playwright/test";
import { upsertBot } from "./helpers/botApi";
import {
  authStatePathForTestInfo,
  ensurePlayerControls,
  setupAuthedPage,
} from "./helpers/e2eAuth";
import { initRoomForOwnerPage } from "./helpers/roomApi";

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

if (!isPlaywrightRunner) {
  console.warn(
    "[rooms-forfeit.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test.describe
    .serial("rooms forfeit", () => {
      test.describe.configure({ timeout: 120_000 });
      test("Bot 例外(fallback)は即負けになる", async ({ browser }) => {
        const roomPath = makeRoomPath("forfeit-fallback");
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

        const ownerPage = await ownerCtx.newPage();
        const playerPage = await playerCtx.newPage();
        await setupAuthedPage(ownerPage);
        await setupAuthedPage(playerPage);

        const SAFE_CODE = "function onTurn(api){ api.lookUp(); }";
        const errorBotId = await upsertBot({
          page: ownerPage,
          code: 'function onTurn(api){ throw new Error("boom") }',
          name: "Error Bot",
        });
        const safeBotId = await upsertBot({
          page: playerPage,
          code: SAFE_CODE,
          name: "Look Up",
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

        await ownerPage.getByTestId("cool-bot-id").fill(String(errorBotId));
        await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
          String(errorBotId),
        );
        await ownerPage.getByTestId("join-slot-cool").click();
        await playerPage.getByTestId("hot-bot-id").fill(String(safeBotId));
        await expect(playerPage.getByTestId("hot-bot-id")).toHaveValue(
          String(safeBotId),
        );
        await playerPage.getByTestId("join-slot-hot").click();

        await startMatchByOwner(ownerPage);

        const winnerBadge = ownerPage.getByTestId("winner-badge");
        await winnerBadge.waitFor({ timeout: 20_000 });
        await expect(winnerBadge).toContainText("Hot");
        await expect(ownerPage.getByTestId("start-new-match")).toBeVisible();

        await ownerCtx.close();
        await playerCtx.close();
      });

      test("player socket 切断は即負けになる", async ({ browser }) => {
        const roomPath = makeRoomPath("forfeit-disconnect");
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

        const ownerPage = await ownerCtx.newPage();
        const playerPage = await playerCtx.newPage();
        await setupAuthedPage(ownerPage);
        await setupAuthedPage(playerPage);

        const SAFE_CODE = "function onTurn(api){ api.lookUp(); }";
        const coolBotId = await upsertBot({
          page: ownerPage,
          code: SAFE_CODE,
          name: "Look Up (Cool)",
        });
        const hotBotId = await upsertBot({
          page: playerPage,
          code: SAFE_CODE,
          name: "Look Up (Hot)",
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

        await ownerPage.getByTestId("cool-bot-id").fill(String(coolBotId));
        await ownerPage.getByTestId("join-slot-cool").click();
        await playerPage.getByTestId("hot-bot-id").fill(String(hotBotId));
        await playerPage.getByTestId("join-slot-hot").click();

        await startMatchByOwner(ownerPage);

        // 対戦開始後に player 側が切断されたことをサーバが検知できるよう、最小限だけ待つ。
        // （ActionLog の描画待ちに依存すると並列負荷でフレークしやすい）
        await ownerPage.waitForTimeout(300);

        await playerCtx.close();

        const winnerBadge = ownerPage.getByTestId("winner-badge");
        await winnerBadge.waitFor({ timeout: 30_000 });
        await expect(winnerBadge).toContainText("Cool");
        await expect(ownerPage.getByTestId("start-new-match")).toBeVisible();

        await ownerCtx.close();
      });
    });
}
