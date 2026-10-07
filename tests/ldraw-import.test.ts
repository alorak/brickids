import { test } from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Scene, Vector3 } from "three";
import { exportLDraw, ldrawParts } from "../src/export/ldraw.ts";
import { importLDraw } from "../src/import/ldraw.ts";
import { BrickWorld } from "../src/engine/world.ts";

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

test("imports newly native common brick and plate families", () => {
  const result = importLDraw([
    "1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3005.dat",
    "1 1 40 -8 0 1 0 0 0 1 0 0 0 1 3024.dat",
    "1 14 80 -24 0 1 0 0 0 1 0 0 0 1 3007.dat",
    "1 2 120 -8 0 1 0 0 0 1 0 0 0 1 3034.dat",
  ].join("\n"));

  assert.equal(result.imported, 4);
  assert.equal(result.skipped, 0);
  assert.deepEqual(
    result.scene.bricks.map((brick) => brick.spec),
    ["1x1", "plate-1x1", "2x8", "plate-2x8"],
  );
});

test("reconstructs a strict stud/socket connection after LDraw import", () => {
  const output = exportLDraw({
    version: 1,
    bricks: [
      { id: 1, spec: "2x2", color: "#C91A09", p: [0, 0.6, 0], q: [0, 0, 0, 1] },
      { id: 2, spec: "2x4", color: "#0055BF", p: [0, 1.8, 0], q: [0, 0, 0, 1] },
    ],
  });
  const result = importLDraw(output);

  assert.equal(result.reconstructedConnections, 1);
  assert.deepEqual(result.scene.links, [{ a: 2, b: 1, studs: 4 }]);
});

test("BrickWorld restore accepts reconstructed LDraw links and keeps the stack joined", async () => {
  const result = importLDraw(
    exportLDraw({
      version: 1,
      bricks: [
        { id: 1, spec: "2x2", color: "#C91A09", p: [0, 0.6, 0], q: [0, 0, 0, 1] },
        { id: 2, spec: "2x2", color: "#0055BF", p: [0, 1.8, 0], q: [0, 0, 0, 1] },
      ],
    }),
  );
  const world = new BrickWorld(new Scene(), () => {});
  await world.init();
  world.restore(result.scene);

  assert.equal(world.links.length, 1);
  assert.deepEqual(
    world.serialize().links.map(({ a, b, studs }) => ({ a, b, studs })),
    [{ a: 2, b: 1, studs: 4 }],
  );

  for (let i = 0; i < 120; i++) world.step();
  assert.equal(world.links.length, 1);
  assert.ok(Math.abs(world.bricks[1].position.y - world.bricks[0].position.y - 1.2) < 0.05);
  world.world.free();
});

test("reconstructs multiple supports for one wide imported brick", () => {
  const output = exportLDraw({
    version: 1,
    bricks: [
      { id: 1, spec: "2x2", color: "#C91A09", p: [-1, 0.6, 0], q: [0, 0, 0, 1] },
      { id: 2, spec: "2x2", color: "#F2CD37", p: [1, 0.6, 0], q: [0, 0, 0, 1] },
      { id: 3, spec: "2x4", color: "#0055BF", p: [0, 1.8, 0], q: [0, 0, 0, 1] },
    ],
  });
  const result = importLDraw(output);

  assert.equal(result.reconstructedConnections, 2);
  assert.deepEqual(result.scene.links, [
    { a: 3, b: 1, studs: 4 },
    { a: 3, b: 2, studs: 4 },
  ]);
});

test("does not reconstruct a connection for a near-miss placement", () => {
  const output = exportLDraw({
    version: 1,
    bricks: [
      { id: 1, spec: "2x2", color: "#C91A09", p: [0, 0.6, 0], q: [0, 0, 0, 1] },
      { id: 2, spec: "2x2", color: "#0055BF", p: [0.1, 1.8, 0], q: [0, 0, 0, 1] },
    ],
  });
  const result = importLDraw(output);

  assert.equal(result.reconstructedConnections, 0);
  assert.deepEqual(result.scene.links, []);
});

test("does not connect a brick on top of a smooth tile", () => {
  const output = exportLDraw({
    version: 1,
    bricks: [
      { id: 1, spec: "tile-2x2", color: "#C91A09", p: [0, 0.2, 0], q: [0, 0, 0, 1] },
      { id: 2, spec: "2x2", color: "#0055BF", p: [0, 1.0, 0], q: [0, 0, 0, 1] },
    ],
  });
  const result = importLDraw(output);

  assert.equal(result.reconstructedConnections, 0);
});

test("reconstructs connections through flattened MPD submodels", () => {
  const result = importLDraw([
    "0 FILE main.ldr",
    "1 4 0 0 0 1 0 0 0 1 0 0 0 1 lower.ldr",
    "1 1 0 -24 0 1 0 0 0 1 0 0 0 1 upper.ldr",
    "0 FILE lower.ldr",
    "1 16 0 -24 0 1 0 0 0 1 0 0 0 1 3003.dat",
    "0 FILE upper.ldr",
    "1 16 0 -24 0 1 0 0 0 1 0 0 0 1 3003.dat",
  ].join("\n"));

  assert.equal(result.imported, 2);
  assert.equal(result.reconstructedConnections, 1);
  assert.deepEqual(result.scene.links, [{ a: 2, b: 1, studs: 4 }]);
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
    "1 1 20 -24 0 1 0 0 0 1 0 0 0 1 3006.dat",
    "1 14 40 -24 0 1 0 0 0 1 0 0 0 1 3006.dat",
  ].join("\n"));
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.unsupportedParts, ["3006.dat"]);
});

test("imports an MPD submodel and inherits its parent color", () => {
  const result = importLDraw([
    "0 FILE main.ldr",
    "1 4 40 0 20 1 0 0 0 1 0 0 0 1 child.ldr",
    "0 FILE child.ldr",
    "1 16 0 -24 0 1 0 0 0 1 0 0 0 1 3004.dat",
  ].join("\n"));

  assert.equal(result.imported, 1);
  assert.equal(result.submodels, 1);
  assert.equal(result.maxDepth, 1);
  assert.equal(result.scene.bricks[0].color, "#C91A09");
  assert.deepEqual(result.scene.bricks[0].p, [2, 0.6, 1]);
});

test("instantiates one submodel more than once with independent inherited colors", () => {
  const result = importLDraw([
    "0 FILE main.ldr",
    "1 4 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr",
    "1 1 40 0 0 1 0 0 0 1 0 0 0 1 child.ldr",
    "0 FILE child.ldr",
    "1 16 0 -24 0 1 0 0 0 1 0 0 0 1 3004.dat",
  ].join("\n"));

  assert.equal(result.imported, 2);
  assert.deepEqual(
    result.scene.bricks.map((brick) => brick.color),
    ["#C91A09", "#0055BF"],
  );
  assert.deepEqual(result.scene.bricks[0].p, [0, 0.6, 0]);
  assert.deepEqual(result.scene.bricks[1].p, [2, 0.6, 0]);
});

test("composes nested MPD translation and rotation transforms", () => {
  const result = importLDraw([
    "0 FILE main.ldr",
    "1 4 0 0 0 0 0 1 0 1 0 -1 0 0 child.ldr",
    "0 FILE child.ldr",
    "1 16 20 -24 0 1 0 0 0 1 0 0 0 1 3004.dat",
  ].join("\n"));

  assert.equal(result.imported, 1);
  assert.deepEqual(result.scene.bricks[0].p.map((n) => Math.round(n * 1e6) / 1e6), [0, 0.6, -1]);
  const expected = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    Math.PI / 2,
  );
  assert.ok(sameQuaternion(result.scene.bricks[0].q, expected.toArray()));
});

test("nested submodels propagate inherited colors through multiple levels", () => {
  const result = importLDraw([
    "0 FILE main.ldr",
    "1 1 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr",
    "0 FILE child.ldr",
    "1 16 0 0 0 1 0 0 0 1 0 0 0 1 grandchild.ldr",
    "0 FILE grandchild.ldr",
    "1 16 0 -24 0 1 0 0 0 1 0 0 0 1 3004.dat",
  ].join("\n"));

  assert.equal(result.submodels, 2);
  assert.equal(result.maxDepth, 2);
  assert.equal(result.scene.bricks[0].color, "#0055BF");
});

test("explicit part colors override inherited MPD colors", () => {
  const result = importLDraw([
    "0 FILE main.ldr",
    "1 4 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr",
    "0 FILE child.ldr",
    "1 14 0 -24 0 1 0 0 0 1 0 0 0 1 3004.dat",
  ].join("\n"));

  assert.equal(result.scene.bricks[0].color, "#F2CD37");
});

test("rejects cyclic MPD submodel references", () => {
  assert.throws(
    () =>
      importLDraw([
        "0 FILE main.ldr",
        "1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr",
        "0 FILE child.ldr",
        "1 16 0 0 0 1 0 0 0 1 0 0 0 1 main.ldr",
      ].join("\n")),
    /Cyclic MPD submodel reference/,
  );
});

test("rejects excessively deep MPD nesting", () => {
  const lines: string[] = [];
  for (let i = 0; i < 34; i++) {
    lines.push(`0 FILE level-${i}.ldr`);
    if (i < 33)
      lines.push(
        `1 16 0 0 0 1 0 0 0 1 0 0 0 1 level-${i + 1}.ldr`,
      );
    else
      lines.push("1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3004.dat");
  }
  assert.throws(
    () => importLDraw(lines.join("\n")),
    /submodel nesting is too deep/,
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
