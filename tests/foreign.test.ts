import { test } from "node:test";
import assert from "node:assert/strict";
import R from "@dimforge/rapier3d-compat";
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
  assert.equal(
    isValidForeignPartData({ ...sample, q: [0, 0, 0, 0] }),
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

test("foreign parts create standalone coarse colliders when physics is attached", async () => {
  await R.init();
  const physics = new R.World({ x: 0, y: -24, z: 0 });
  physics.timestep = 1 / 120;

  const foreign = new ForeignLDrawWorld(new Scene(), false);
  const part = foreign.add({ ...sample, p: [0, 1, 0] });
  assert.equal(part.collider, undefined);

  foreign.attachPhysics(physics);
  assert.ok(part.collider);
  assert.equal(part.collider.parent(), null);
  assert.deepEqual(
    part.colliderHalf.toArray().map((n) => Number(n.toFixed(3))),
    [0.44, 0.29, 0.44],
  );

  const dynamic = physics.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(0, 3, 0)
      .setLinearDamping(0.05)
      .setAngularDamping(0.05),
  );
  physics.createCollider(
    R.ColliderDesc.cuboid(0.2, 0.2, 0.2)
      .setFriction(0.6)
      .setRestitution(0),
    dynamic,
  );

  for (let i = 0; i < 600; i++) physics.step();
  assert.ok(dynamic.translation().y > 1.42);
  assert.ok(dynamic.translation().y < 1.65);

  foreign.transform(-1, new Vector3(2, 1, 0));
  const colliderPosition = part.collider!.translation();
  assert.ok(Math.abs(colliderPosition.x - 2) < 1e-6);
  assert.ok(Math.abs(colliderPosition.y - 1) < 1e-6);

  foreign.remove(-1);
  assert.equal(part.collider, undefined);
  physics.free();
});

test("attaching physics after restore creates colliders for existing foreign parts", async () => {
  await R.init();
  const foreign = new ForeignLDrawWorld(new Scene(), false);
  foreign.restore([
    sample,
    { ...sample, id: -2, p: [3, 1.2, 0] },
  ]);
  assert.equal(foreign.parts.every((part) => !part.collider), true);

  const physics = new R.World({ x: 0, y: -24, z: 0 });
  foreign.attachPhysics(physics);
  assert.equal(foreign.parts.every((part) => !!part.collider), true);

  foreign.clear();
  assert.equal(foreign.parts.length, 0);
  physics.free();
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
