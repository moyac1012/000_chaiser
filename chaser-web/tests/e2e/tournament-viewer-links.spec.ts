import { expect, test } from "@playwright/test";
import { upsertBot } from "./helpers/botApi";
import {
  authStatePathForTestInfo,
  ensurePlayerControls,
  setupAuthedPage,
} from "./helpers/e2eAuth";
import { makeReplayVisible } from "./helpers/replayApi";
import { currentUserIdFromPage } from "./helpers/roomApi";

const isBunUnitTest =
  typeof Bun !== "undefined" &&
  process.env.PLAYWRIGHT_TEST_BASE_DIR === undefined &&
  process.env.PW_TEST_WORKER_INDEX === undefined &&
  process.env.TEST_WORKER_INDEX === undefined;

const isPlaywrightRunner = !isBunUnitTest;

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

async function postWithAuthRetry(params: {
  page: import("@playwright/test").Page;
  url: string;
  data: Record<string, unknown>;
}): Promise<import("@playwright/test").APIResponse> {
  const { page, url, data } = params;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await page.request.post(url, { data });
    if (res.ok()) return res;
    if (res.status() === 401) {
      await setupAuthedPage(page);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      if (attempt < 3) {
        await page.waitForTimeout(200 * (attempt + 1));
        continue;
      }
    }
    return res;
  }
  // unreachable
  return page.request.post(url, { data });
}

async function expectBoardReady(page: import("@playwright/test").Page) {
  await page
    .getByTestId("board")
    .waitFor({ state: "visible", timeout: 60_000 });
}

async function gotoWithRetry(
  page: import("@playwright/test").Page,
  url: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (page.isClosed()) {
      throw new Error(`gotoWithRetry aborted: page is closed (url=${url})`);
    }
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      return;
    } catch (error) {
      if (page.isClosed()) throw error;
      if (attempt < 3) {
        await page.waitForTimeout(300 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
}

if (!isPlaywrightRunner) {
  console.warn(
    "[tournament-viewer-links.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test("大会閲覧UIから room / replay へ自然に遷移できる", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
    const ownerStorageState = authStatePathForTestInfo("owner", test.info());
    const playerStorageState = authStatePathForTestInfo("player", test.info());
    const spectatorStorageState = authStatePathForTestInfo(
      "spectator",
      test.info(),
    );

    const ownerContext = await browser.newContext({
      baseURL,
      storageState: ownerStorageState,
    });
    const playerContext = await browser.newContext({
      baseURL,
      storageState: playerStorageState,
    });
    const spectatorContext = await browser.newContext({
      baseURL,
      storageState: spectatorStorageState,
    });

    const ownerPage = await ownerContext.newPage();
    const playerPage = await playerContext.newPage();
    const spectatorPage = await spectatorContext.newPage();
    await setupAuthedPage(ownerPage);
    await setupAuthedPage(playerPage);
    await setupAuthedPage(spectatorPage);

    const ownerUserId = await currentUserIdFromPage(ownerPage);
    const playerUserId = await currentUserIdFromPage(playerPage);

    const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const coolBotId = await upsertBot({
      page: ownerPage,
      name: `Cool Effects Bot (${runId})`,
      code: [
        "let t = 0;",
        "function onTurn(api) {",
        "  t++;",
        "  if (t === 1) { api.lookRight(); return; }",
        "  if (t === 2) { api.putRight(); return; }",
        "  if (t === 3) { api.searchRight(); return; }",
        "  api.walkRight();",
        "}",
      ].join("\n"),
    });

    const hotBotId = await upsertBot({
      page: playerPage,
      name: `Hot Effects Bot (${runId})`,
      code: [
        "let t = 0;",
        "function onTurn(api) {",
        "  t++;",
        "  if (t === 1) { api.searchLeft(); return; }",
        "  if (t === 2) { api.walkLeft(); return; }",
        "  api.lookUp();",
        "}",
      ].join("\n"),
    });

    const tournamentRes = await postWithAuthRetry({
      page: ownerPage,
      url: "/api/tournaments",
      data: { name: `E2E Viewer (${runId})` },
    });
    expect(tournamentRes.ok()).toBeTruthy();
    const tournamentJson = (await tournamentRes.json()) as {
      tournament?: { id?: string };
    };
    const tournamentId = tournamentJson.tournament?.id ?? "";
    expect(tournamentId).toBeTruthy();

    const addOwner = await postWithAuthRetry({
      page: ownerPage,
      url: `/api/tournaments/${encodeURIComponent(tournamentId)}/participants`,
      data: { userId: ownerUserId },
    });
    expect([201, 409]).toContain(addOwner.status());

    const addPlayer = await postWithAuthRetry({
      page: ownerPage,
      url: `/api/tournaments/${encodeURIComponent(tournamentId)}/participants`,
      data: { userId: playerUserId },
    });
    expect([201, 409]).toContain(addPlayer.status());

    const matchupRes = await postWithAuthRetry({
      page: ownerPage,
      url: `/api/tournaments/${encodeURIComponent(tournamentId)}/matchups`,
      data: { playerAId: ownerUserId, playerBId: playerUserId },
    });
    expect(matchupRes.ok()).toBeTruthy();
    const matchupJson = (await matchupRes.json()) as {
      matchup?: { id?: string };
    };
    const matchupId = matchupJson.matchup?.id ?? "";
    expect(matchupId).toBeTruthy();

    const gameRes = await postWithAuthRetry({
      page: ownerPage,
      url: "/api/games",
      data: {
        matchupId,
        coolUserId: ownerUserId,
        hotUserId: playerUserId,
        coolBotId,
        hotBotId,
      },
    });
    const gameStatus = gameRes.status();
    if (gameStatus !== 201) {
      throw new Error(
        `create game failed: status=${gameStatus} body=${await gameRes
          .text()
          .catch(() => "failed to read response body")}`,
      );
    }
    const gameJson = (await gameRes.json()) as {
      game?: { id?: string; roomId?: string };
    };
    const gameId = gameJson.game?.id ?? "";
    const roomId = gameJson.game?.roomId ?? "";
    expect(gameId).toBeTruthy();
    expect(roomId).toBeTruthy();

    await gotoWithRetry(
      spectatorPage,
      `/tournaments/${encodeURIComponent(tournamentId)}`,
    );
    await expect(
      spectatorPage.getByTestId("tournament-viewer-page"),
    ).toBeVisible();
    await expect(spectatorPage.getByTestId("matchups-section")).toBeVisible();

    const roomLink = spectatorPage.getByTestId(`game-room-link-${gameId}`);
    await expect(roomLink).toBeVisible();
    const roomHref = (await roomLink.getAttribute("href")) ?? "";
    expect(roomHref).toContain(`/rooms/${encodeURIComponent(roomId)}`);
    expect(roomHref).toContain(`from=tournament`);
    expect(roomHref).toContain(
      `tournamentId=${encodeURIComponent(tournamentId)}`,
    );
    await gotoWithRetry(spectatorPage, roomHref);

    await expect(spectatorPage.getByTestId("room-status")).toBeVisible();
    await expect(
      spectatorPage.getByText("対戦開始まで盤面は非表示です"),
    ).toBeVisible();
    await expect(spectatorPage.getByTestId("room-back-link")).toBeVisible();

    await Promise.all([
      gotoWithRetry(
        ownerPage,
        `/rooms/${encodeURIComponent(roomId)}?intent=player`,
      ),
      gotoWithRetry(
        playerPage,
        `/rooms/${encodeURIComponent(roomId)}?intent=player`,
      ),
    ]);
    await ensurePlayerControls(ownerPage);
    await ensurePlayerControls(playerPage);
    await ownerPage.getByTestId("cool-bot-id").fill(String(coolBotId));
    await expect(ownerPage.getByTestId("cool-bot-id")).toHaveValue(
      String(coolBotId),
    );
    await ownerPage.getByTestId("join-slot-cool").click();
    await playerPage.getByTestId("hot-bot-id").fill(String(hotBotId));
    await expect(playerPage.getByTestId("hot-bot-id")).toHaveValue(
      String(hotBotId),
    );
    await playerPage.getByTestId("join-slot-hot").click();

    // v0.1 演出は短時間で消えるため、BoardView 側の E2E メタ（window.__e2eBoardEffects）で観測する。
    await spectatorPage.evaluate(() => {
      (
        window as unknown as {
          __e2eBoardEffects?: Record<string, boolean>;
        }
      ).__e2eBoardEffects = {};
    });

    await startMatchByOwner(ownerPage);
    await expectBoardReady(spectatorPage);

    await spectatorPage.waitForFunction(
      () => {
        const effects = (
          window as unknown as {
            __e2eBoardEffects?: Record<string, boolean>;
          }
        ).__e2eBoardEffects;
        if (!effects) return false;
        return Boolean(effects.look || effects.search || effects.put);
      },
      null,
      { timeout: 45_000 },
    );

    // 勝敗は Bot の挙動/タイミングで揺れる可能性があるため、ここでは「終了した」ことのみ確認する。
    await expect(spectatorPage.getByTestId("board-result-text")).toHaveText(
      /^(Cool|Hot) の勝ち!$/u,
      { timeout: 30_000 },
    );

    await spectatorPage.getByTestId("room-back-link").click();
    await expect(
      spectatorPage.getByTestId("tournament-viewer-page"),
    ).toBeVisible();
    await makeReplayVisible({ page: spectatorPage, roomId });
    await spectatorPage.reload({ waitUntil: "domcontentloaded" });
    await expect(
      spectatorPage.getByTestId("tournament-viewer-page"),
    ).toBeVisible();

    const replayLink = spectatorPage.getByTestId(`game-replay-link-${gameId}`);
    await replayLink.waitFor({ timeout: 30_000 });
    await replayLink.click();
    await expect(spectatorPage.getByTestId("replay-winner")).toBeVisible();
    await expect(spectatorPage.getByTestId("replay-back-link")).toBeVisible();

    await ownerContext.close();
    await playerContext.close();
    await spectatorContext.close();
  });
}
