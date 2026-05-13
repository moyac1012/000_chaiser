import { expect, type Locator, test } from "@playwright/test";
import { upsertBot } from "./helpers/botApi";
import {
  authStatePathForTestInfo,
  ensurePlayerControls,
  setupAuthedPage,
} from "./helpers/e2eAuth";
import { initRoomForOwnerPage } from "./helpers/roomApi";
import {
  expectBoardSize,
  parseMapOptionSize,
  selectedMapSize,
} from "./helpers/roomUi";

const isBunUnitTest =
  typeof Bun !== "undefined" &&
  process.env.PLAYWRIGHT_TEST_BASE_DIR === undefined &&
  process.env.PW_TEST_WORKER_INDEX === undefined &&
  process.env.TEST_WORKER_INDEX === undefined;

const isPlaywrightRunner = !isBunUnitTest;

async function pickAlternateMapOption(select: Locator): Promise<{
  value: string;
  label: string;
  name: string;
  width: number;
  height: number;
}> {
  const currentValue = await select.inputValue();
  const options = select.locator("option");
  const count = await options.count();
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    const value = await option.getAttribute("value");
    if (!value || value === currentValue) continue;
    const label = (await option.textContent())?.trim() ?? "";
    if (!label) continue;
    const { width, height } = parseMapOptionSize(label);
    const name = label.split(" (")[0]?.trim() ?? label;
    return { value, label, name, width, height };
  }
  throw new Error("alternate map option not found");
}

async function expectPlayerPositionInBounds(
  page: import("@playwright/test").Page,
  testId: string,
  width: number,
  height: number,
) {
  const attr = await page.getByTestId(testId).getAttribute("data-position");
  expect(attr).toBeTruthy();
  const [xRaw, yRaw] = (attr ?? "").split(",");
  const x = Number(xRaw);
  const y = Number(yRaw);
  expect(Number.isFinite(x)).toBe(true);
  expect(Number.isFinite(y)).toBe(true);
  expect(x).toBeGreaterThanOrEqual(0);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThan(width);
  expect(y).toBeLessThan(height);
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
    "[rooms-map-select.spec.ts] Skipping e2e test because Playwright test runner is not active. Run with `bun run test:e2e`.",
  );
} else {
  test("owner は開始前のみマップを切り替えられ、非 owner には UI が出ない", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
    const ownerStorageState = authStatePathForTestInfo("owner", test.info());
    const ownerContext = await browser.newContext({
      baseURL,
      storageState: ownerStorageState,
    });
    const playerContext = await browser.newContext({
      baseURL,
      storageState: authStatePathForTestInfo("player", test.info()),
    });

    const ownerPage = await ownerContext.newPage();
    const playerPage = await playerContext.newPage();
    await setupAuthedPage(ownerPage);
    await setupAuthedPage(playerPage);

    const roomId = `map-select-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const roomPath = `/rooms/${roomId}`;

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
    await ensurePlayerControls(ownerPage);
    await ensurePlayerControls(playerPage);

    await expect(ownerPage.getByTestId("map-select")).toBeVisible();
    await expect(playerPage.locator('[data-testid="map-select"]')).toHaveCount(
      0,
    );
    await expect(
      ownerPage.getByText("対戦開始まで盤面は非表示です"),
    ).toBeVisible();
    await selectedMapSize(ownerPage);

    const mapSelect = ownerPage.getByTestId("map-select");
    const targetMap = await pickAlternateMapOption(mapSelect);
    await mapSelect.selectOption({ value: targetMap.value });
    await expect(ownerPage.getByTestId("map-current-name")).toHaveText(
      targetMap.name,
    );

    await ownerPage.getByTestId("cool-bot-id").fill(String(ownerBotId));
    await ownerPage.getByTestId("join-slot-cool").click();
    await playerPage.getByTestId("hot-bot-id").fill(String(playerBotId));
    await playerPage.getByTestId("join-slot-hot").click();

    await startMatchByOwner(ownerPage);

    await expect(ownerPage.locator('[data-testid="map-select"]')).toHaveCount(
      0,
    );
    await expectBoardSize(ownerPage, targetMap);
    await expectBoardSize(playerPage, targetMap);
    await expectPlayerPositionInBounds(
      ownerPage,
      "player-cool",
      targetMap.width,
      targetMap.height,
    );
    await expectPlayerPositionInBounds(
      ownerPage,
      "player-hot",
      targetMap.width,
      targetMap.height,
    );

    await ownerContext.close();
    await playerContext.close();
  });
}
