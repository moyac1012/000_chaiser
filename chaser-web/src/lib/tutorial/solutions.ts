import type { Direction } from "@/core/engine";

// Tutorial-only sample solutions (JS code strings) for validation/testing.
export type TutorialSolution = {
  code: string;
};

type ActionMethod = string;

const method = (kind: "walk" | "look" | "search" | "put", dir: Direction) =>
  `${kind}${dir}`;
const walk = (dir: Direction) => method("walk", dir);
const put = (dir: Direction) => method("put", dir);
const repeat = (action: ActionMethod, times: number) =>
  Array.from({ length: times }, () => action);

const formatMethods = (actions: ActionMethod[]) =>
  JSON.stringify(actions, null, 2);

const sequenceSolution = (
  actions: ActionMethod[],
): string => `const actions = ${formatMethods(actions)};
let index = 0;
function onTurn(api) {
  const method = actions[Math.min(index, actions.length - 1)] ?? "walkRight";
  index += 1;
  return api[method]();
}
`;

const branchOnStartSolution = (
  condition: string,
  actionsTrue: ActionMethod[],
  actionsFalse: ActionMethod[],
): string => `const actionsA = ${formatMethods(actionsTrue)};
const actionsB = ${formatMethods(actionsFalse)};
let actions = null;
let index = 0;
function onTurn(api) {
  if (!actions) {
    const around = api.around;
    actions = (${condition}) ? actionsA : actionsB;
  }
  const method = actions[Math.min(index, actions.length - 1)] ?? "walkRight";
  index += 1;
  return api[method]();
}
`;

const branchAfterPrefixSolution = (
  prefix: ActionMethod[],
  condition: string,
  actionsTrue: ActionMethod[],
  actionsFalse: ActionMethod[],
): string => `const prefix = ${formatMethods(prefix)};
const actionsA = ${formatMethods(actionsTrue)};
const actionsB = ${formatMethods(actionsFalse)};
let prefixIndex = 0;
let actions = null;
let index = 0;
function onTurn(api) {
  if (prefixIndex < prefix.length) {
    const method = prefix[prefixIndex] ?? "walkRight";
    prefixIndex += 1;
    return api[method]();
  }
  if (!actions) {
    const around = api.around;
    actions = (${condition}) ? actionsA : actionsB;
  }
  const method = actions[Math.min(index, actions.length - 1)] ?? "walkRight";
  index += 1;
  return api[method]();
}
`;

const branchAfterPrefixProbeSolution = (
  prefix: ActionMethod[],
  probeMethod: ActionMethod,
  condition: string,
  actionsTrue: ActionMethod[],
  actionsFalse: ActionMethod[],
): string => `const prefix = ${formatMethods(prefix)};
const actionsA = ${formatMethods(actionsTrue)};
const actionsB = ${formatMethods(actionsFalse)};
let prefixIndex = 0;
let actions = null;
let index = 0;
let probed = false;
function onTurn(api) {
  if (prefixIndex < prefix.length) {
    const method = prefix[prefixIndex] ?? "walkRight";
    prefixIndex += 1;
    return api[method]();
  }
  if (!probed) {
    const observation = api.${probeMethod}();
    actions = (${condition}) ? actionsA : actionsB;
    probed = true;
    return observation;
  }
  const method = actions[Math.min(index, actions.length - 1)] ?? "walkRight";
  index += 1;
  return api[method]();
}
`;

const walkUp = walk("Up");
const walkDown = walk("Down");
const walkLeft = walk("Left");
const walkRight = walk("Right");
const putUp = put("Up");
const putDown = put("Down");
const putLeft = put("Left");
const putRight = put("Right");

export const TUTORIAL_SOLUTIONS: Record<string, TutorialSolution> = {
  "step-01-walk-up": {
    code: sequenceSolution([walkUp]),
  },
  "step-02-walk-repeat": {
    code: sequenceSolution(repeat(walkUp, 4)),
  },
  "step-03-walk-right": {
    code: sequenceSolution(repeat(walkRight, 4)),
  },
  "step-04-l-maze": {
    code: sequenceSolution([...repeat(walkUp, 4), ...repeat(walkRight, 4)]),
  },
  "step-05-two-turns": {
    code: sequenceSolution([
      ...repeat(walkUp, 2),
      ...repeat(walkRight, 2),
      ...repeat(walkUp, 2),
      ...repeat(walkRight, 2),
    ]),
  },
  "step-06-repeat-pattern": {
    code: sequenceSolution([
      walkRight,
      walkUp,
      walkRight,
      walkUp,
      walkRight,
      walkUp,
      walkRight,
      walkUp,
    ]),
  },
  "step-07-turn-limit-basic": {
    code: sequenceSolution([...repeat(walkUp, 4), ...repeat(walkRight, 2)]),
  },
  "step-08-up-down-branch": {
    code: branchOnStartSolution("around[1] === 2", [walkDown], [walkUp]),
  },
  "step-09-branch-left-right": {
    code: branchAfterPrefixSolution(
      repeat(walkUp, 2),
      "around[3] !== 2",
      [walkLeft, walkUp, walkUp],
      [walkRight, walkUp, walkUp],
    ),
  },
  "step-10-remember-direction": {
    code: branchOnStartSolution(
      "around[0] === 1",
      repeat(walkLeft, 5),
      repeat(walkRight, 5),
    ),
  },
  "step-11-zigzag-loop": {
    code: branchOnStartSolution(
      "around[3] === 0",
      [walkLeft, walkLeft, walkUp, walkUp, walkLeft, walkLeft, walkUp, walkUp],
      [
        walkRight,
        walkRight,
        walkUp,
        walkUp,
        walkRight,
        walkRight,
        walkUp,
        walkUp,
      ],
    ),
  },
  "step-12-look-branch": {
    code: branchAfterPrefixProbeSolution(
      repeat(walkUp, 2),
      "lookLeft",
      "observation[4] === 0",
      [...repeat(walkLeft, 2), ...repeat(walkUp, 2)],
      [...repeat(walkRight, 2), ...repeat(walkUp, 2)],
    ),
  },
  "step-13-look-dead-end": {
    code: sequenceSolution([
      walkUp,
      walkUp,
      walkRight,
      walkUp,
      walkUp,
      walkRight,
    ]),
  },
  "step-14-search-branch": {
    code: branchAfterPrefixProbeSolution(
      repeat(walkUp, 2),
      "searchLeft",
      "observation[1] === 2",
      [...repeat(walkRight, 4), ...repeat(walkUp, 2)],
      [...repeat(walkLeft, 4), ...repeat(walkUp, 2)],
    ),
  },
  "step-15-search-dead-end": {
    code: sequenceSolution([walkUp, walkUp, walkRight, walkRight, walkRight]),
  },
  "step-16-look-search-combo": {
    code: branchAfterPrefixProbeSolution(
      repeat(walkUp, 3),
      "searchLeft",
      "observation[2] === 2",
      repeat(walkRight, 6),
      repeat(walkLeft, 6),
    ),
  },
  "step-17-item-intro": {
    code: sequenceSolution(repeat(walkRight, 4)),
  },
  "step-18-collect-items": {
    code: branchOnStartSolution(
      "around[8] === 3",
      [walkRight, walkDown, walkRight, walkUp, walkRight, walkRight],
      [walkDown, walkLeft, walkUp, walkLeft, walkLeft, walkLeft],
    ),
  },
  "step-19-avoid-trap-item": {
    code: branchOnStartSolution(
      "around[3] === 0",
      [
        walkLeft,
        walkLeft,
        walkLeft,
        walkUp,
        walkLeft,
        walkUp,
        walkUp,
        walkRight,
      ],
      [
        walkRight,
        walkRight,
        walkRight,
        walkUp,
        walkRight,
        walkUp,
        walkUp,
        walkLeft,
      ],
    ),
  },
  "step-20-search-items": {
    code: sequenceSolution([
      walkUp,
      walkUp,
      walkRight,
      walkRight,
      walkRight,
      walkRight,
      walkUp,
      walkUp,
      walkLeft,
      walkLeft,
    ]),
  },
  "step-21-put-intro": {
    code: branchOnStartSolution("around[1] === 1", [putUp], [putRight]),
  },
  "step-22-approach-put": {
    code: sequenceSolution([walkUp, walkUp, walkUp, putUp]),
  },
  "step-23-put-caution": {
    code: branchOnStartSolution(
      "around[5] === 0",
      [walkRight, putRight],
      [walkDown, putDown],
    ),
  },
  "step-24-final-hunt-put": {
    code: branchAfterPrefixProbeSolution(
      repeat(walkUp, 4),
      "searchLeft",
      "observation[3] === 1",
      [walkLeft, walkLeft, walkLeft, putLeft],
      [walkRight, walkRight, walkRight, putRight],
    ),
  },
};

export function getTutorialSolution(stepId: string): string | null {
  return TUTORIAL_SOLUTIONS[stepId]?.code ?? null;
}
