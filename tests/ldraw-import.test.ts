import { test } from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import { exportLDraw, ldrawParts } from "../src/export/ldraw.ts";
import { importLDraw } from "../src/import/ldraw.ts";

function sameQuaternion(a: number[], b: number[], tolerance = 1e-5) {
  const qa = new Quaternion().fromArray(a).normalize();
  const qb = new Quaternion().fromArray(b).normalize();
  return Math.abs(qa.dot(qb)) > 1 - tolerance;
}

test("imports a flat LDR type-1 line into a brickids scene", () => {
  const result = importLDraw(
    "0 test\r\n1 4 20 -24 -40 1 0 0 0 1 0 0 0 1 3001.dat\r\n",
  );
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.scene.bricks[0].spec, "2x4");
  assert.deepEqual(result.scene.bricks[0].color, "#C91A09");
  assert.deepEqual(result.scene.bricks[0].p, [1, 0.6, -2]);
  assert.ok(sameQuaternion(result.scene.bricks[0].q, [0, 0, 0, 1]));
  assert.deepEqual(result.scene.links, []);
});

test("round-trips every current brickids LDraw mapping", () => {
  const q = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 12))
    .normalize();
  const bricks = Object.keys(ldrawParts).map((spec, index) => ({
    id: index + 1,
    spec,
    color: index % 2 ? "#0055BF" : "#C91A09",
    p: [index * 0.35 - 2, ldrawParts[spec].height / 2 + 1.2, index * -0.2 + 1],
    q: q.toArray(),
  }));
  const result = importLDraw(exportLDraw({ version: 1, bricks }));

  assert.equal(result.imported, bricks.length);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.unsupportedParts, []);

  for (let i = 0; i < bricks.length; i++) {
    const source = bricks[i];
    const imported = result.scene.bricks[i];
    assert.equal(imported.spec, source.spec);
    assert.equal(imported.color, source.color);
    imported.p.forEach((value, axis) =>
      assert.ok(Math.abs(value - source.p[axis]) < 1e-5),
    );
    assert.ok(sameQuaternion(imported.q, source.q));
  }
});

test("supports LDraw direct RGB colors", () => {
  const result = importLDraw(
    "1 0x2123ABC 0 -24 0 1 0 0 0 1 0 0 0 1 3004.dat",
  );
  assert.equal(result.scene.bricks[0].color, "#123ABC");
  assert.deepEqual(result.unsupportedColors, []);
});

test("keeps unknown colors visible and reports them", () => {
  const result = importLDraw(
    "1 16 0 -24 0 1 0 0 0 1 0 0 0 1 3004.dat",
  );
  assert.equal(result.scene.bricks[0].color, "#A0A5A9");
  assert.deepEqual(result.unsupportedColors, ["16"]);
});

test("skips unsupported parts but reports occurrence count and names", () => {
  const result = importLDraw([
    "1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3004.dat",
    "1 1 20 -24 0 1 0 0 0 1 0 0 0 1 3005.dat",
    "1 14 40 -24 0 1 0 0 0 1 0 0 0 1 3005.dat",
  ].join("\n"));
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.unsupportedParts, ["3005.dat"]);
});

test("rejects MPD for now instead of partially importing submodels", () => {
  assert.throws(
    () => importLDraw("0 FILE main.ldr\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr"),
    /MPD is not supported yet/,
  );
});

test("rejects scaled or mirrored part transforms for now", () => {
  const result = importLDraw(
    "1 4 0 -24 0 -1 0 0 0 1 0 0 0 1 3004.dat",
  );
  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 1);
  assert.match(result.unsupportedParts[0], /non-rigid transform/);
});
