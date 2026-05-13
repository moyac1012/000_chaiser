export const chaserBotTypes = `// CHaser browser bot API types
// These types are injected into Monaco for JavaScript bots.
// They are intentionally lightweight and mirror src/core/engine.ts.

interface BotApi {
  // ターン開始時点の「まわり」(長さ 9)
  around: number[]

  walkRight(): number[]
  walkLeft(): number[]
  walkUp(): number[]
  walkDown(): number[]

  lookRight(): number[]
  lookLeft(): number[]
  lookUp(): number[]
  lookDown(): number[]

  searchRight(): number[]
  searchLeft(): number[]
  searchUp(): number[]
  searchDown(): number[]

  putRight(): number[]
  putLeft(): number[]
  putUp(): number[]
  putDown(): number[]
}

declare function onTurn(api: BotApi): void | Promise<void>
`;
