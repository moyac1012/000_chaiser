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
    .slice(2, 6)}?mode=practice`;
}

async function _waitForActionLogs(
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

if (!isPlaywrightRunner) {
  console.warn(
    "[practice-room.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test("practice room: 1人で両Botを配置して対戦し、replay が出ない", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
    const ownerStorageState = authStatePathForTestInfo("owner", test.info());
    const ownerCtx = await browser.newContext({
      baseURL,
      storageState: ownerStorageState,
    });

    const page = await ownerCtx.newPage();
    await setupAuthedPage(page);

    const roomPath = makeRoomPath("practice-e2e");
    await initRoomForOwnerPage({
      roomPath,
      page,
    });

    const coolBotId = await upsertBot({
      page,
      code: `let t=0;
function onTurn(api){
  t++;
  if(t===1){ api.lookUp(); return; }
  if(t===2){ api.putRight(); return; }
  api.walkRight();
}`,
      name: "Practice Cool",
    });
    const hotBotId = await upsertBot({
      page,
      code: `let t=0;
function onTurn(api){
  t++;
  if(t===1){ api.searchLeft(); return; }
  while(true){}
}`,
      name: "Practice Hot (timeout)",
    });

    await page.goto(roomPath, { waitUntil: "domcontentloaded" });

    await expect(page.getByText("練習モード")).toBeVisible();
    await expect(page.getByText("この対戦は記録に残りません")).toBeVisible();
    await ensurePlayerControls(page);

    await page.getByTestId("cool-bot-id").fill(String(coolBotId));
    await expect(page.getByTestId("cool-bot-id")).toHaveValue(
      String(coolBotId),
    );
    await page.getByTestId("join-slot-cool").click();
    await page.getByTestId("hot-bot-id").fill(String(hotBotId));
    await expect(page.getByTestId("hot-bot-id")).toHaveValue(String(hotBotId));
    await page.getByTestId("join-slot-hot").click();

    await startMatchByOwner(page);

    await page.getByTestId("winner-badge").waitFor({ timeout: 30_000 });
    await expect(page.getByTestId("replay-link")).toHaveCount(0);

    await ownerCtx.close();
  });
}
