import { describe, test } from "bun:test";

import { TUTORIAL_STEPS } from "@/lib/tutorial/definitions";
import { runTutorialStep } from "@/lib/tutorial/runner";
import { TUTORIAL_SOLUTIONS } from "@/lib/tutorial/solutions";

describe("tutorial solutions", () => {
  test("every step has a solution", () => {
    for (const step of TUTORIAL_STEPS) {
      const solution = TUTORIAL_SOLUTIONS[step.id];
      if (!solution?.code) {
        throw new Error(`missing solution for ${step.id}`);
      }
    }
  });

  test("solutions clear tutorial steps", async () => {
    for (const step of TUTORIAL_STEPS) {
      const solution = TUTORIAL_SOLUTIONS[step.id];
      if (!solution?.code) {
        throw new Error(`missing solution for ${step.id}`);
      }
      const result = await runTutorialStep({
        step,
        code: solution.code,
        language: "js",
        speedMs: 0,
        startDelayMs: 0,
        timeoutMs: 1000,
        useWorker: false,
      });
      if (result.status !== "success") {
        throw new Error(
          `${step.id} failed: ${result.failure?.message ?? result.status}`,
        );
      }
    }
  });
});
