import type { Monaco } from "@monaco-editor/react";

import { chaserBotTypes } from "./typeDefs";

let registered = false;

export function registerChaserTypes(monaco: Monaco): void {
  if (registered) return;

  const uri = "ts:chaser-bot-types.d.ts";
  const defaults = monaco.languages.typescript.javascriptDefaults;
  defaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  defaults.addExtraLib(chaserBotTypes, uri);
  registered = true;
}
