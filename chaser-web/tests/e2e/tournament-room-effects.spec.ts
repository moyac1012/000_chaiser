import { expect, test } from "@playwright/test";
import { upsertBot } from "./helpers/botApi";
import {
  authStatePathForTestInfo,
  ensurePlayerControls,
  setupAuthedPage,
} from "./helpers/e2eAuth";
import { currentUserIdFromPage } from "./helpers/roomApi";

const isBunUnitTest =
  typeof Bun !== "undefined" &&
  process.env.PLAYWRIGHT_TEST_BASE_DIR === undefined &&
  process.env.PW_TEST_WORKER_INDEX === undefined &&
  process.env.TEST_WORKER_INDEX === undefined;

const isPlaywrightRunner = !isBunUnitTest;

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

function withQuery(path: string, query: string): string {
  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
}

type E2EBoardEffects = {
  look?: boolean;
  search?: boolean;
  put?: boolean;
};

if (!isPlaywrightRunner) {
  console.warn(
    "[tournament-room-effects.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test("大会管理UIでGame作成→room遷移し、BoardView v0.1演出が観測できる", async ({
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
        // Hot(初期位置想定: 3,3) へ近づいて putRight で勝つ（最後の手が put になり、演出が観測しやすい）
        "  if (t === 1) { api.walkRight(); return; }",
        "  if (t === 2) { api.walkDown(); return; }",
        "  if (t === 3) { api.walkDown(); return; }",
        "  api.putRight();",
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
        // 動かずに待つ（Cool が putRight を成功させる前提）
        "  api.lookUp();",
        "}",
      ].join("\n"),
    });

    const tournamentRes = await postWithAuthRetry({
      page: ownerPage,
      url: "/api/tournaments",
      data: { name: `E2E Tournament (${runId})` },
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

    await gotoWithRetry(
      ownerPage,
      `/tournaments/${encodeURIComponent(tournamentId)}/admin`,
    );
    await expect(
      ownerPage.getByRole("heading", { name: "大会管理" }),
    ).toBeVisible({ timeout: 30_000 });
    await ownerPage
      .getByTestId(`matchup-games-${matchupId}`)
      .waitFor({ state: "visible", timeout: 30_000 });

    const coolSelect = ownerPage.getByTestId(
      `create-game-cool-bot-${matchupId}`,
    );
    const hotSelect = ownerPage.getByTestId(`create-game-hot-bot-${matchupId}`);
    await ownerPage
      .locator(
        `[data-testid="create-game-cool-bot-${matchupId}"] option[value="${coolBotId}"]`,
      )
      .waitFor({ state: "attached", timeout: 30_000 });
    await ownerPage
      .locator(
        `[data-testid="create-game-hot-bot-${matchupId}"] option[value="${hotBotId}"]`,
      )
      .waitFor({ state: "attached", timeout: 30_000 });

    await coolSelect.selectOption(String(coolBotId));
    await hotSelect.selectOption(String(hotBotId));
    await ownerPage.getByTestId(`create-game-submit-${matchupId}`).click();

    const roomLink = ownerPage
      .locator(`[data-testid="games-table-${matchupId}"]`)
      .locator(`[data-testid^="game-room-link-"]`)
      .first();
    await expect(roomLink).toBeVisible({ timeout: 30_000 });
    const roomHref = (await roomLink.getAttribute("href")) ?? "";
    expect(roomHref.startsWith("/rooms/")).toBeTruthy();

    await ownerPage.click(`[data-testid^="game-room-link-"]`);
    await expect(ownerPage.getByTestId("room-status")).toBeVisible();

    await Promise.all([
      gotoWithRetry(playerPage, withQuery(roomHref, "intent=player")),
      gotoWithRetry(spectatorPage, roomHref),
    ]);
    await ensurePlayerControls(ownerPage);
    await ensurePlayerControls(playerPage);
    await expect(
      ownerPage.getByText("対戦開始まで盤面は非表示です"),
    ).toBeVisible();
    await expect(
      spectatorPage.getByText("対戦開始まで盤面は非表示です"),
    ).toBeVisible();

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
    await ownerPage.evaluate(() => {
      (
        window as unknown as {
          __e2eBoardEffects?: E2EBoardEffects;
        }
      ).__e2eBoardEffects = {};
    });

    await startMatchByOwner(ownerPage);
    await expect(ownerPage.getByTestId("board")).toBeVisible({
      timeout: 30_000,
    });
    await expect(playerPage.getByTestId("board")).toBeVisible({
      timeout: 30_000,
    });
    await expect(spectatorPage.getByTestId("board")).toBeVisible({
      timeout: 30_000,
    });

    await ownerPage.waitForFunction(
      () => {
        const effects = (
          window as unknown as {
            __e2eBoardEffects?: E2EBoardEffects;
          }
        ).__e2eBoardEffects;
        if (!effects) return false;
        // v0.1 演出は短時間で消えるため、少なくとも1回「何かしらのハイライト」が発火したことを確認する。
        return Boolean(effects.look || effects.search || effects.put);
      },
      null,
      { timeout: 45_000 },
    );
    await expect(ownerPage.getByTestId("player-cool")).toHaveAttribute(
      "data-position",
      "2,3",
      { timeout: 20_000 },
    );
    await expect(ownerPage.getByTestId("board-result-text")).toHaveText(
      /Cool の勝ち!/,
      { timeout: 30_000 },
    );

    await ownerContext.close();
    await playerContext.close();
    await spectatorContext.close();
  });
}
