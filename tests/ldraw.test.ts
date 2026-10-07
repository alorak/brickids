import { test } from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import { brickToLDrawLine, exportLDraw, ldrawParts } from "../src/export/ldraw.ts";
import { catalog } from "../src/engine/catalog.ts";

const brick = (
  spec: string,
  p: [number, number, number],
  q: [number, number, number, number] = [0, 0, 0, 1],
  color = "#C91A09",
) => ({ id: 1, spec, color, p, q });

test("every brickids catalog part has an LDraw mapping", () => {
  assert.deepEqual(
    catalog.map((part) => part.id).filter((id) => !ldrawParts[id]),
    [],
  );
});

test("common rectangular families use their standard LDraw part files", () => {
  const expected = {
    "1x1": "3005.dat",
    "1x3": "3622.dat",
    "1x6": "3009.dat",
    "1x8": "3008.dat",
    "2x3": "3002.dat",
    "2x6": "2456.dat",
    "2x8": "3007.dat",
    "plate-1x1": "3024.dat",
    "plate-1x3": "3623.dat",
    "plate-1x6": "3666.dat",
    "plate-1x8": "3460.dat",
    "plate-2x3": "3021.dat",
    "plate-2x6": "3795.dat",
    "plate-2x8": "3034.dat",
  } as const;
  for (const [spec, file] of Object.entries(expected))
    assert.equal(ldrawParts[spec].file, file);
});

test("standard brick export uses LDU coordinates and standard LDraw colour", () => {
  const line = brickToLDrawLine(brick("2x4", [0, 0.6, 0]));
  assert.equal(
    line,
    "1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat",
  );
});

test("corner plate compensates for the official LDraw corner origin", () => {
  const line = brickToLDrawLine(brick("corner-plate-2x2", [0, 0.2, 0]));
  assert.equal(
    line,
    "1 4 -10 -8 -10 1 0 0 0 1 0 0 0 1 2420.dat",
  );
});

test("2x2 slope compensates for LDraw slope origin and direction", () => {
  const line = brickToLDrawLine(brick("slope-2x2", [0, 0.6, 0]));
  assert.equal(
    line,
    "1 4 0 -24 -10 -1 0 0 0 1 0 0 0 -1 3039.dat",
  );
});

test("cheese slope uses the LDraw bottom-plane origin", () => {
  const line = brickToLDrawLine(brick("cheese-1x1", [0, 0.4, 0]));
  assert.equal(
    line,
    "1 4 0 0 0 -1 0 0 0 1 0 0 0 -1 54200.dat",
  );
});

test("world rotations are preserved through the Y-axis convention change", () => {
  const q = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    .toArray() as [number, number, number, number];
  const tokens = brickToLDrawLine(brick("1x2", [1, 0.6, -2], q)).split(" ");
  assert.deepEqual(tokens.slice(2, 5), ["20", "-24", "-40"]);
  assert.deepEqual(tokens.slice(5, 14), ["0", "0", "1", "0", "1", "0", "-1", "0", "0"]);
});

test("LDraw export uses CRLF and emits one type-1 line per brick", () => {
  const output = exportLDraw({
    version: 1,
    bricks: [
      brick("1x2", [0, 0.6, 0]),
      { ...brick("plate-1x2", [2, 0.2, 0], [0, 0, 0, 1], "#0055BF"), id: 2 },
    ],
  });
  assert.ok(output.includes("\r\n"));
  assert.equal(output.split("\r\n").filter((line) => line.startsWith("1 ")).length, 2);
  assert.match(output, /3004\.dat/);
  assert.match(output, /3023\.dat/);
  assert.match(output, /1 1 40 -8 0/);
});

test("non-quick colors fall back to LDraw direct RGB", () => {
  const line = brickToLDrawLine(brick("1x2", [0, 0.6, 0], [0, 0, 0, 1], "#123ABC"));
  assert.match(line, /^1 0x2123ABC /);
});
