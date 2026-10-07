import { test } from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Scene, Vector3 } from "three";
import {
  ForeignLDrawWorld,
  isValidForeignPartData,
  isValidForeignPartList,
} from "../src/import/foreign-world.ts";

const sample = {
  id: -1,
  file: "3006.dat",
  color: "#0055BF",
  colorToken: "1",
  p: [1, 1.2, -2],
  q: [0, 0, 0, 1],
};

test("foreign LDraw data validation rejects unsafe paths and duplicate IDs", () => {
  assert.equal(isValidForeignPartData(sample), true);
  assert.equal(
    isValidForeignPartData({ ...sample, file: "../3006.dat" }),
    false,
  );
  assert.equal(
    isValidForeignPartData({ ...sample, file: "https://example.com/3006.dat" }),
    false,
  );
  assert.equal(
    isValidForeignPartData({ ...sample, file: "3006.dat\n1 4 0 0 0" }),
    false,
  );
  assert.equal(isValidForeignPartList([sample, sample]), false);
});

test("foreign world moves, rotates, serializes, restores and deletes without physics", () => {
  const scene = new Scene();
  const foreign = new ForeignLDrawWorld(scene, false);
  const part = foreign.add(sample);

  assert.equal(foreign.parts.length, 1);
  assert.equal(scene.children.includes(part.object), true);

  const rotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    Math.PI / 2,
  );
  assert.equal(
    foreign.transform(-1, new Vector3(3, 2, 4), rotation),
    true,
  );

  const serialized = foreign.serialize();
  assert.deepEqual(serialized[0].p, [3, 2, 4]);
  assert.ok(
    new Quaternion()
      .fromArray(serialized[0].q)
      .angleTo(rotation) < 1e-8,
  );

  foreign.clear();
  assert.equal(foreign.parts.length, 0);

  foreign.restore(serialized);
  assert.equal(foreign.parts.length, 1);
  assert.deepEqual(foreign.serialize(), serialized);

  foreign.remove(-1);
  assert.equal(foreign.parts.length, 0);
});

test("foreign restore validates the entire payload before clearing current data", () => {
  const foreign = new ForeignLDrawWorld(new Scene(), false);
  foreign.add(sample);

  assert.throws(() =>
    foreign.restore([
      { ...sample, id: -2 },
      { ...sample, id: -2 },
    ]),
  );
  assert.equal(foreign.parts.length, 1);
  assert.equal(foreign.parts[0].id, -1);
});
