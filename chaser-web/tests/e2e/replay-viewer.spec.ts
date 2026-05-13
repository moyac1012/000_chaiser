import { expect, test } from "@playwright/test";
import { upsertBot } from "./helpers/botApi";
import {
  authStatePathForTestInfo,
  ensurePlayerControls,
  setupAuthedPage,
} from "./helpers/e2eAuth";
import { makeReplayVisible, roomIdFromRoomPath } from "./helpers/replayApi";
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
    "[replay-viewer.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test.describe
    .serial("Replay viewer", () => {
      test.describe.configure({ timeout: 180_000 });
      test("一覧→詳細でBoardとSliderが動く", async ({ browser }) => {
        // まず対戦を1つ完走させてリプレイを生成
        const roomPath = makeRoomPath("replay-e2e");
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

        const ownerBotId = await upsertBot({
          page: ownerPage,
          code: 'let t=0; function onTurn(api){ t++; if(t===1){ api.walkRight(); return; } throw new Error("boom") }',
          name: "Replay Cool (move then fail)",
        });
        const playerBotId = await upsertBot({
          page: playerPage,
          code: "function onTurn(api){ api.lookUp(); }",
          name: "Replay Hot (safe)",
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

        await ownerPage
          .getByTestId("winner-badge")
          .waitFor({ timeout: 30_000 });
        await ownerPage.waitForFunction(
          () =>
            document.querySelectorAll('[data-testid="action-log-row"]')
              .length >= 2,
          null,
          { timeout: 30_000 },
        );
        await expect(ownerPage.getByTestId("replay-pending")).toBeVisible();

        const replayId = await makeReplayVisible({
          page: ownerPage,
          roomId: roomIdFromRoomPath(roomPath),
        });
        const replayHref = `/replays/${encodeURIComponent(replayId)}`;
        await playerCtx.close();

        // 一覧ページで最新リプレイが出ること
        await ownerPage.goto("/replays", { waitUntil: "domcontentloaded" });
        await expect(ownerPage.getByTestId("replay-table")).toBeVisible();
        const rowLink = ownerPage.locator(
          `[data-testid="replay-row-link"][href="${replayHref}"]`,
        );
        await rowLink.first().waitFor({ state: "visible", timeout: 30_000 });
        await Promise.all([
          ownerPage.waitForURL(replayHref, {
            timeout: 20_000,
            waitUntil: "domcontentloaded",
          }),
          rowLink.first().click(),
        ]);

        // Board と Winner 表示
        await expect(ownerPage.getByTestId("board")).toBeVisible();
        await expect(ownerPage.getByTestId("replay-winner")).toContainText(
          /Winner/,
        );

        // Slider を動かすと盤面が変化する
        const slider = ownerPage.getByTestId("replay-slider");
        await expect(slider).toBeVisible();
        const max = Number.parseInt(
          (await slider.getAttribute("max")) ?? "0",
          10,
        );
        expect(max).toBeGreaterThan(0);

        const board = ownerPage.getByTestId("board");
        const initialTurn = (await board.getAttribute("data-turn")) ?? "";
        const maxValue = String(max);
        const currentValue = await slider.inputValue();
        const firstTarget = currentValue === maxValue ? "0" : maxValue;
        const secondTarget = currentValue === maxValue ? maxValue : "0";

        await slider.fill(firstTarget);
        await expect(slider).toHaveValue(firstTarget);
        if (initialTurn) {
          await expect(board).not.toHaveAttribute("data-turn", initialTurn);
        }
        const firstTurn = (await board.getAttribute("data-turn")) ?? "";

        await slider.fill(secondTarget);
        await expect(slider).toHaveValue(secondTarget);
        if (firstTurn) {
          await expect(board).not.toHaveAttribute("data-turn", firstTurn);
        }

        await ownerCtx.close();
      });
    });
}
