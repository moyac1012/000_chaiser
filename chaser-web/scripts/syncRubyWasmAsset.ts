import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RUBY_WASM_PACKAGE = "@ruby/3.4-wasm-wasi";
const RUBY_WASM_FILENAME = "ruby+stdlib.wasm";

type RubyWasmPackageJson = {
  version: string;
};

async function readRubyWasmVersion(): Promise<string> {
  const packageJsonPath = path.join(
    process.cwd(),
    "node_modules",
    "@ruby",
    "3.4-wasm-wasi",
    "package.json",
  );
  const raw = await readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as RubyWasmPackageJson;
  if (!parsed.version) {
    throw new Error(`${RUBY_WASM_PACKAGE} version is missing`);
  }
  return parsed.version;
}

async function syncRubyWasmAsset(): Promise<void> {
  const version = await readRubyWasmVersion();
  const sourcePath = path.join(
    process.cwd(),
    "node_modules",
    "@ruby",
    "3.4-wasm-wasi",
    "dist",
    RUBY_WASM_FILENAME,
  );
  const assetDir = path.join(
    process.cwd(),
    "public",
    "vendor",
    "ruby-wasm",
    version,
  );
  const assetPath = path.join(assetDir, RUBY_WASM_FILENAME);
  const generatedModulePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "bot",
    "runtime",
    "generatedRubyWasmAsset.ts",
  );
  const publicPath = `/vendor/ruby-wasm/${version}/${RUBY_WASM_FILENAME}`;

  await mkdir(assetDir, { recursive: true });
  await copyFile(sourcePath, assetPath);
  await writeFile(
    generatedModulePath,
    [
      "export const DEFAULT_RUBY_WASM_PATH =",
      `  ${JSON.stringify(publicPath)};`,
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`Synced ${RUBY_WASM_PACKAGE} to ${publicPath}`);
}

await syncRubyWasmAsset();
