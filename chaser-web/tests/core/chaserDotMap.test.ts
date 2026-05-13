import { describe, expect, test } from "bun:test";

import { parseChaserDotMap } from "@/core/chaserDotMap";

const BASE_HEADER = `N:test-map
T:10
S:3,3
`;

describe("parseChaserDotMap", () => {
  test("rejects Cool spawn on an item tile", () => {
    const content = `${BASE_HEADER}D:3,0,0
D:0,0,0
D:0,0,0
C:0,0
H:2,2
`;

    expect(() => parseChaserDotMap(content)).toThrow(
      "C spawn cannot be on an item",
    );
  });

  test("rejects Hot spawn on an item tile", () => {
    const content = `${BASE_HEADER}D:0,0,0
D:0,0,0
D:0,0,3
C:0,0
H:2,2
`;

    expect(() => parseChaserDotMap(content)).toThrow(
      "H spawn cannot be on an item",
    );
  });
});
