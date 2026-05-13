import { expect, type Page } from "@playwright/test";

export type BoardSize = {
  width: number;
  height: number;
};

export function parseMapOptionSize(label: string): BoardSize {
  const match = label.match(/\((\d+)x(\d+),/u);
  if (!match) {
    throw new Error(`unexpected map option label: ${label}`);
  }
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

export async function selectedMapSize(page: Page): Promise<BoardSize> {
  const select = page.getByTestId("map-select");
  await expect(select).toBeVisible();
  const label = (await select.locator("option:checked").textContent()) ?? "";
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("selected map option label not found");
  }
  return parseMapOptionSize(trimmed);
}

export async function expectBoardSize(
  page: Page,
  size: BoardSize,
): Promise<void> {
  const board = page.getByTestId("board");
  await board.waitFor({ state: "visible", timeout: 60_000 });
  await expect(board).toHaveAttribute("data-width", String(size.width));
  await expect(board).toHaveAttribute("data-height", String(size.height));
}
