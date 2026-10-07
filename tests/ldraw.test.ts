import { test } from "node:test";
import assert from "node:assert/strict";
import { Quaternion } from "three";
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

test("standard brick export uses LDU coordinates and direct RGB colour", () => {
  const line = brickToLDrawLine(brick("2x4", [0, 0.6, 0]));
  assert.equal(
    line,
    "1 0x2C91A09 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat",
  );
});

test("corner plate compensates for the official LDraw corner origin", () => {
  const line = brickToLDrawLine(brick("corner-plate-2x2", [0, 0.2, 0]));
  assert.equal(
    line,
    "1 0x2C91A09 -10 -8 -10 1 0 0 0 1 0 0 0 1 2420.dat",
  );
});

test("2x2 slope compensates for LDraw slope origin and direction", () => {
  const line = brickToLDrawLine(brick("slope-2x2", [0, 0.6, 0]));
  assert.equal(
    line,
    "1 0x2C91A09 0 -24 -10 -1 0 0 0 1 0 0 0 -1 3039.dat",
  );
});

test("cheese slope uses the LDraw bottom-plane origin", () => {
  const line = brickToLDrawLine(brick("cheese-1x1", [0, 0.4, 0]));
  assert.equal(
    line,
    "1 0x2C91A09 0 0 0 -1 0 0 0 1 0 0 0 -1 54200.dat",
  );
});

test("world rotations are preserved through the Y-axis convention change", () => {
  const q = new Quaternion()
    .setFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2)
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
  assert.match(output, /0x20055BF/);
});
