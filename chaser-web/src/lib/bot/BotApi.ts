import type { Action, Direction, EngineStepResult } from "@/core/engine";

export type BotApiOptions = {
  around: number[];
  performAction: (action: Action) => EngineStepResult;
};

/**
 * Bot API v1
 *
 * - `around` は「ターン開始時の情報」として固定
 * - 行動メソッドは呼ばれた瞬間にターンを消費（2回目は Error）
 */
export class BotApi {
  #around: number[];
  #performAction: (action: Action) => EngineStepResult;
  #used = false;

  constructor(options: BotApiOptions) {
    this.#around = options.around;
    this.#performAction = options.performAction;
  }

  get around(): number[] {
    return this.#around;
  }

  #act(kind: Action["kind"], dir: Direction): EngineStepResult {
    if (this.#used) {
      throw new Error("Action already used this turn");
    }
    this.#used = true;
    return this.#performAction({ kind, dir });
  }

  #observationOf(result: EngineStepResult): number[] {
    return result.observation ?? result.view.around;
  }

  walkUp(): number[] {
    return this.#observationOf(this.#act("walk", "Up"));
  }
  walkDown(): number[] {
    return this.#observationOf(this.#act("walk", "Down"));
  }
  walkLeft(): number[] {
    return this.#observationOf(this.#act("walk", "Left"));
  }
  walkRight(): number[] {
    return this.#observationOf(this.#act("walk", "Right"));
  }

  lookUp(): number[] {
    return this.#observationOf(this.#act("look", "Up"));
  }
  lookDown(): number[] {
    return this.#observationOf(this.#act("look", "Down"));
  }
  lookLeft(): number[] {
    return this.#observationOf(this.#act("look", "Left"));
  }
  lookRight(): number[] {
    return this.#observationOf(this.#act("look", "Right"));
  }

  searchUp(): number[] {
    return this.#observationOf(this.#act("search", "Up"));
  }
  searchDown(): number[] {
    return this.#observationOf(this.#act("search", "Down"));
  }
  searchLeft(): number[] {
    return this.#observationOf(this.#act("search", "Left"));
  }
  searchRight(): number[] {
    return this.#observationOf(this.#act("search", "Right"));
  }

  putUp(): number[] {
    return this.#observationOf(this.#act("put", "Up"));
  }
  putDown(): number[] {
    return this.#observationOf(this.#act("put", "Down"));
  }
  putLeft(): number[] {
    return this.#observationOf(this.#act("put", "Left"));
  }
  putRight(): number[] {
    return this.#observationOf(this.#act("put", "Right"));
  }
}
