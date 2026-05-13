import type { Page } from "@playwright/test";

import { setupAuthedPage } from "./e2eAuth";

type BotLanguage = "js" | "blockly" | "ruby";

type CreateBotResponse = {
  id?: number;
};

async function refreshAuth(page: Page): Promise<void> {
  await setupAuthedPage(page);
  // storageState が古くなって 401 になる場合があるため、最低限の navigation で Clerk cookie を再同期する
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

async function createBot(params: {
  page: Page;
  name: string;
  lang: BotLanguage;
}): Promise<number> {
  const { page, name, lang } = params;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await page.request.post("/api/bots", {
      data: { name, lang },
    });
    if (res.ok()) {
      const json = (await res.json()) as CreateBotResponse;
      if (typeof json.id === "number" && json.id > 0) {
        return json.id;
      }
      throw new Error(`createBot returned invalid id: ${JSON.stringify(json)}`);
    }

    const status = res.status();
    const body = await res.text().catch(() => "");
    if (status === 401) {
      await refreshAuth(page);
    }
    if (attempt < 3) {
      await page.waitForTimeout(200 * (attempt + 1));
      continue;
    }
    throw new Error(
      `createBot failed: status=${status} lang=${lang} name=${name} body=${body}`,
    );
  }

  throw new Error(`createBot exhausted retries: lang=${lang} name=${name}`);
}

export async function upsertBot(params: {
  page: Page;
  code: string;
  name: string;
  id?: number;
  lang?: BotLanguage;
}): Promise<number> {
  const { page, code, name, lang = "js" } = params;
  let targetId = params.id ?? (await createBot({ page, name, lang }));
  let createdFromFallback = params.id === undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await page.request.post(`/api/bots/${targetId}`, {
      data: { code, name },
    });
    if (res.ok()) return targetId;

    const status = res.status();
    const body = await res.text().catch(() => "");
    if (status === 401) {
      await refreshAuth(page);
    } else if (status === 404 && !createdFromFallback) {
      targetId = await createBot({ page, name, lang });
      createdFromFallback = true;
      continue;
    }
    if (attempt < 3) {
      await page.waitForTimeout(200 * (attempt + 1));
      continue;
    }
    throw new Error(
      `upsertBot failed: id=${targetId} status=${status} body=${body}`,
    );
  }

  throw new Error(`upsertBot exhausted retries: id=${targetId}`);
}
