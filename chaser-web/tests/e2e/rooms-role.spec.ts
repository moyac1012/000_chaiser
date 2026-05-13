import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { upsertBot } from "./helpers/botApi";
import {
  authStatePathForTestInfo,
  ensurePlayerControls,
} from "./helpers/e2eAuth";
import { initRoomForOwnerPage } from "./helpers/roomApi";

const isBunUnitTest =
  typeof Bun !== "undefined" &&
  process.env.PLAYWRIGHT_TEST_BASE_DIR === undefined &&
  process.env.PW_TEST_WORKER_INDEX === undefined &&
  process.env.TEST_WORKER_INDEX === undefined;

const isPlaywrightRunner = !isBunUnitTest;

function makeRoomId(label: string): string {
  return `rooms-role-${label}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

async function gotoWithRetry(
  page: import("@playwright/test").Page,
  url: string,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return;
    } catch (err) {
      if (attempt < 2) {
        await page.waitForTimeout(300 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
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

async function forgeWsErrorMessage(params: {
  page: import("@playwright/test").Page;
  roomId: string;
  joinIntent: "spectator" | "player";
  afterJoinMessage: Record<string, unknown>;
}): Promise<string> {
  const { page, roomId, joinIntent, afterJoinMessage } = params;
  return page.evaluate(
    async ({ roomId, joinIntent, afterJoinMessage }) => {
      const fallbackUserId = `e2e-forge-${joinIntent}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const url = `ws://localhost:8080/ws/match?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(fallbackUserId)}`;
      return await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(url);
        const timeout = window.setTimeout(
          () => reject(new Error("timeout waiting for server error")),
          10_000,
        );

        let joined = false;

        ws.addEventListener("open", () => {
          ws.send(
            JSON.stringify({
              type: "join",
              roomId,
              intent: joinIntent,
            }),
          );
        });

        ws.addEventListener("message", (event) => {
          const msg = JSON.parse(String(event.data)) as {
            type: string;
            message?: string;
          };
          if (msg.type === "joined" && !joined) {
            joined = true;
            ws.send(JSON.stringify(afterJoinMessage));
            return;
          }
          if (msg.type === "error" && typeof msg.message === "string") {
            window.clearTimeout(timeout);
            ws.close();
            resolve(msg.message);
          }
        });

        ws.addEventListener("error", () => {
          window.clearTimeout(timeout);
          reject(new Error("websocket error"));
        });
      });
    },
    { roomId, joinIntent, afterJoinMessage },
  );
}

if (!isPlaywrightRunner) {
  console.warn(
    "[rooms-role.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test.describe
    .serial("/rooms role spec", () => {
      test("1) owner は player として参加できる（参加UIが出る）", async ({
        browser,
      }) => {
        const baseURL =
          test.info().project.use.baseURL ?? "http://127.0.0.1:3000";
        const ownerStorageState = authStatePathForTestInfo(
          "owner",
          test.info(),
        );
        const ownerCtx = await browser.newContext({
          baseURL,
          storageState: ownerStorageState,
        });
        const ownerPage = await ownerCtx.newPage();
        await setupClerkTestingToken({ page: ownerPage });

        const roomId = makeRoomId("owner-can-join");
        const roomPath = `/rooms/${roomId}`;
        await initRoomForOwnerPage({
          roomPath,
          page: ownerPage,
        });

        await ownerPage.goto("/");
        const botId = await upsertBot({
          page: ownerPage,
          code: "function onTurn(api){ api.walkRight(); }",
          name: "Owner Bot",
        });

        await ownerPage.goto(roomPath);
        await ensurePlayerControls(ownerPage);

        await expect(ownerPage.getByTestId("slot-join-panel")).toBeVisible();
        await expect(ownerPage.getByTestId("cool-bot-id")).toBeEnabled();
        await ownerPage.getByTestId("cool-bot-id").fill(String(botId));
        await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
          String(botId),
        );
        await ownerPage.getByTestId("join-slot-cool").click();

        await expect(ownerPage.getByTestId("assigned-role")).toContainText(
          "Cool",
        );
        await expect(ownerPage.getByTestId("stop-cool")).toHaveCount(0);

        await ownerCtx.close();
      });

      test("2) owner + player 状態で対戦開始でき、進行する", async ({
        browser,
      }) => {
        const baseURL =
          test.info().project.use.baseURL ?? "http://127.0.0.1:3000";
        const roomId = makeRoomId("owner-starts");
        const ownerPath = `/rooms/${roomId}`;
        const playerPath = `/rooms/${roomId}?intent=player`;
        const ownerStorageState = authStatePathForTestInfo(
          "owner",
          test.info(),
        );

        test.setTimeout(120_000);
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
        await setupClerkTestingToken({ page: ownerPage });
        await setupClerkTestingToken({ page: playerPage });

        await ownerPage.goto("/");
        await playerPage.goto("/");
        const ownerBotId = await upsertBot({
          page: ownerPage,
          code: "function onTurn(api){ api.walkRight(); }",
          name: "Owner Right",
        });
        const playerBotId = await upsertBot({
          page: playerPage,
          code: "let c=0; function onTurn(api){ c++; if(c%2===0){ api.walkUp(); return; } api.walkRight(); }",
          name: "Player Alt",
        });

        await initRoomForOwnerPage({
          roomPath: ownerPath,
          page: ownerPage,
        });
        await gotoWithRetry(ownerPage, ownerPath);
        await gotoWithRetry(playerPage, playerPath);
        await ensurePlayerControls(ownerPage);
        await ensurePlayerControls(playerPage);

        await expect(ownerPage.getByTestId("slot-join-panel")).toBeVisible();
        await expect(playerPage.getByTestId("slot-join-panel")).toBeVisible();

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

        await expect(ownerPage.getByTestId("stop-cool")).toHaveCount(0);
        await expect(playerPage.getByTestId("stop-hot")).toHaveCount(0);

        await startMatchByOwner(ownerPage);

        await ownerPage.waitForFunction(
          () =>
            document.querySelectorAll('[data-testid="action-log-row"]')
              .length >= 2,
          null,
          { timeout: 30_000 },
        );
        await expect(ownerPage.getByTestId("board")).toBeVisible();

        await ownerCtx.close();
        await playerCtx.close();
      });

      test("3) 非 owner player は開始できない（UI非表示 + WS偽装拒否）", async ({
        browser,
      }) => {
        const baseURL =
          test.info().project.use.baseURL ?? "http://127.0.0.1:3000";
        const roomId = makeRoomId("non-owner-cannot-start");
        const ownerPath = `/rooms/${roomId}`;
        const playerPath = `/rooms/${roomId}?intent=player`;
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
        await setupClerkTestingToken({ page: ownerPage });
        await setupClerkTestingToken({ page: playerPage });

        await ownerPage.goto("/");
        await playerPage.goto("/");
        const ownerBotId = await upsertBot({
          page: ownerPage,
          code: "function onTurn(api){ api.lookUp(); }",
          name: "Owner Safe",
        });
        const playerBotId = await upsertBot({
          page: playerPage,
          code: "function onTurn(api){ api.lookUp(); }",
          name: "Player Safe",
        });

        await initRoomForOwnerPage({
          roomPath: ownerPath,
          page: ownerPage,
        });
        await gotoWithRetry(ownerPage, ownerPath);
        await gotoWithRetry(playerPage, playerPath);
        await ensurePlayerControls(ownerPage);
        await ensurePlayerControls(playerPage);

        await ownerPage.getByTestId("cool-bot-id").fill(String(ownerBotId));
        await ownerPage.getByTestId("join-slot-cool").click();
        await playerPage.getByTestId("hot-bot-id").fill(String(playerBotId));
        await playerPage.getByTestId("join-slot-hot").click();

        await expect(playerPage.getByTestId("start-match")).toHaveCount(0);

        const msg = await forgeWsErrorMessage({
          page: playerPage,
          roomId,
          joinIntent: "player",
          afterJoinMessage: { type: "start", roomId },
        });
        expect(msg).toContain("Only room owner");

        await ownerCtx.close();
        await playerCtx.close();
      });

      test("4) spectator は slot に参加できない（UI非表示 + WS偽装拒否）", async ({
        browser,
      }) => {
        const baseURL =
          test.info().project.use.baseURL ?? "http://127.0.0.1:3000";
        const roomId = makeRoomId("spectator-cannot-join");
        const ownerPath = `/rooms/${roomId}`;
        const spectatorPath = `/rooms/${roomId}`;
        const ownerStorageState = authStatePathForTestInfo(
          "owner",
          test.info(),
        );

        const ownerCtx = await browser.newContext({
          baseURL,
          storageState: ownerStorageState,
        });
        const spectatorCtx = await browser.newContext({
          baseURL,
          storageState: authStatePathForTestInfo("spectator", test.info()),
        });

        const ownerPage = await ownerCtx.newPage();
        const spectatorPage = await spectatorCtx.newPage();
        await setupClerkTestingToken({ page: ownerPage });
        await setupClerkTestingToken({ page: spectatorPage });

        await initRoomForOwnerPage({
          roomPath: ownerPath,
          page: ownerPage,
        });
        await gotoWithRetry(ownerPage, ownerPath);
        await gotoWithRetry(spectatorPage, spectatorPath);

        await expect(
          spectatorPage.getByTestId("spectator-panel"),
        ).toBeVisible();
        await expect(spectatorPage.getByTestId("slot-join-panel")).toHaveCount(
          0,
        );

        const msg = await forgeWsErrorMessage({
          page: spectatorPage,
          roomId,
          joinIntent: "spectator",
          afterJoinMessage: { type: "setSlot", roomId, slot: "Cool", botId: 1 },
        });
        expect(msg).toContain("Spectators cannot join a slot");

        await ownerCtx.close();
        await spectatorCtx.close();
      });

      test("5) UI 分岐が role / slot に従う（owner/spectator）", async ({
        browser,
      }) => {
        const baseURL =
          test.info().project.use.baseURL ?? "http://127.0.0.1:3000";
        const roomId = makeRoomId("ui-branch");
        const ownerPath = `/rooms/${roomId}`;
        const spectatorPath = `/rooms/${roomId}`;
        const ownerStorageState = authStatePathForTestInfo(
          "owner",
          test.info(),
        );

        const ownerCtx = await browser.newContext({
          baseURL,
          storageState: ownerStorageState,
        });
        const spectatorCtx = await browser.newContext({
          baseURL,
          storageState: authStatePathForTestInfo("spectator", test.info()),
        });

        const ownerPage = await ownerCtx.newPage();
        const spectatorPage = await spectatorCtx.newPage();
        await setupClerkTestingToken({ page: ownerPage });
        await setupClerkTestingToken({ page: spectatorPage });

        await ownerPage.goto("/");
        const ownerBotId = await upsertBot({
          page: ownerPage,
          code: "function onTurn(api){ api.walkRight(); }",
          name: "Owner Bot",
        });

        await initRoomForOwnerPage({
          roomPath: ownerPath,
          page: ownerPage,
        });
        await ownerPage.goto(ownerPath);
        await ensurePlayerControls(ownerPage);
        await expect(ownerPage.getByTestId("slot-join-panel")).toBeVisible();

        await expect(ownerPage.getByTestId("cool-bot-id")).toBeEnabled();
        await ownerPage.getByTestId("cool-bot-id").fill(String(ownerBotId));
        await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
          String(ownerBotId),
        );
        await ownerPage.getByTestId("join-slot-cool").click();

        await expect(ownerPage.getByTestId("assigned-role")).toContainText(
          "Cool",
        );
        await expect(ownerPage.getByTestId("slot-join-panel")).toHaveCount(0);
        await expect(ownerPage.getByTestId("cool-bot-id")).toBeVisible();

        await spectatorPage.goto(spectatorPath);
        await expect(
          spectatorPage.getByTestId("spectator-panel"),
        ).toBeVisible();

        await ownerCtx.close();
        await spectatorCtx.close();
      });
    });
}
