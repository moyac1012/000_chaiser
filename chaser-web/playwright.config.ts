import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const e2eDbPath =
  process.env.PLAYWRIGHT_DATABASE_PATH ??
  path.join(
    process.cwd(),
    ".tmp",
    `chaser-e2e-${Date.now().toString(36)}.sqlite`,
  );

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global.setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // DB/PORT を分けずに並列実行する前提なので、worker 数は Playwright に任せる（必要なら `PW_WORKERS` で上書き）。
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : undefined,
  timeout: 60_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // E2E は並列実行でブラウザ/Worker 初期化が遅れることがあるため、WS のターンタイムアウトを伸ばして
    // 「初手だけ落ちる」系のフレークを避ける（Bot 側の `fallbackReason=timeout` は別経路で即負けになるので影響しない）。
    command: `mkdir -p .tmp && PORT=${PORT} DATABASE_PATH=${JSON.stringify(
      e2eDbPath,
    )} TURN_TIMEOUT_MS=${process.env.TURN_TIMEOUT_MS ?? "10000"} TURN_TIMEOUT_FIRST_MS=${process.env.TURN_TIMEOUT_FIRST_MS ?? "10000"} bun run dev`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
});
