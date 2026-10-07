import { test } from "node:test";
import assert from "node:assert/strict";
import R from "@dimforge/rapier3d-compat";
import { Quaternion, Scene, Vector3 } from "three";
import {
  ForeignLDrawWorld,
  isValidForeignPartData,
  isValidForeignPartList,
} from "../src/import/foreign-world.ts";
import { BrickWorld } from "../src/engine/world.ts";
import { catalog } from "../src/engine/catalog.ts";

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

test("native snapDown treats a foreign standalone collider as a physical surface", async () => {
  const scene = new Scene();
  const native = new BrickWorld(scene, () => {});
  await native.init();

  const foreign = new ForeignLDrawWorld(scene, false);
  foreign.attachPhysics(native.world);
  const obstacle = foreign.add({ ...sample, p: [0, 0.5, 0] });
  assert.ok(obstacle.collider);

  const held = native.add(
    catalog.find((part) => part.id === "1x1")!,
    "#C91A09",
    new Vector3(0, 5, 0),
  );
  native.grab(held.id);

  assert.ok(native.snapDown(held.id, new Vector3(0, 100, 0)));
  const foreignSupportedY = held.position.y;
  assert.ok(
    foreignSupportedY > 1.2,
    "foreign collider should hold the native brick above the baseplate",
  );

  foreign.transform(obstacle.id, new Vector3(3, 0.5, 0));
  assert.ok(native.snapDown(held.id, new Vector3(0, 100, 0)));
  assert.ok(
    Math.abs(held.position.y - 0.6) < 0.08,
    "moving the foreign obstacle away should expose the baseplate again",
  );

  native.world.free();
});

test("foreign snapDown settles on the baseplate instead of preserving pointer height", async () => {
  const scene = new Scene();
  const native = new BrickWorld(scene, () => {});
  await native.init();

  const foreign = new ForeignLDrawWorld(scene, false);
  foreign.attachPhysics(native.world);
  const part = foreign.add({ ...sample, p: [0, 8, 0] });

  assert.ok(foreign.snapDown(part.id, new Vector3(3, 100, -2)));
  assert.ok(Math.abs(part.position.x - 3) < 1e-6);
  assert.ok(Math.abs(part.position.z + 2) < 1e-6);
  assert.ok(
    part.position.y > 0.25 && part.position.y < 0.4,
    "fallback foreign collider should settle immediately above the baseplate",
  );

  native.world.free();
});

test("foreign snapDown settles on top of a native brick collider", async () => {
  const scene = new Scene();
  const native = new BrickWorld(scene, () => {});
  await native.init();
  native.add(
    catalog.find((part) => part.id === "2x2")!,
    "#237841",
    new Vector3(0, 0.6, 0),
  );

  const foreign = new ForeignLDrawWorld(scene, false);
  foreign.attachPhysics(native.world);
  const part = foreign.add({ ...sample, p: [0, 6, 0] });

  assert.ok(foreign.snapDown(part.id, new Vector3(0, 100, 0)));
  assert.ok(
    part.position.y > 1.55 && part.position.y < 1.9,
    "foreign part should settle above the native brick body/studs",
  );

  native.world.free();
});

test("foreign drop settles on the first foreign physical surface below", async () => {
  await R.init();
  const physics = new R.World({ x: 0, y: -24, z: 0 });
  physics.createCollider(
    R.ColliderDesc.cuboid(100, 0.2, 100)
      .setTranslation(0, -0.2, 0)
      .setFriction(0.65),
  );

  const foreign = new ForeignLDrawWorld(new Scene(), false);
  foreign.attachPhysics(physics);
  foreign.add({ ...sample, id: -1, p: [0, 0.5, 0] });
  const upper = foreign.add({ ...sample, id: -2, p: [0, 6, 0] });

  assert.ok(foreign.drop(upper.id));
  assert.ok(
    upper.position.y > 1.0 && upper.position.y < 1.25,
    "upper foreign part should rest on the lower foreign collider",
  );

  physics.free();
});

test("collision-aware foreign transforms cannot tunnel through an obstacle", async () => {
  await R.init();
  const physics = new R.World({ x: 0, y: 0, z: 0 });
  physics.createCollider(
    R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(2, 1, 0),
  );

  const foreign = new ForeignLDrawWorld(new Scene(), false);
  foreign.attachPhysics(physics);
  const part = foreign.add({ ...sample, p: [0, 1, 0] });

  assert.equal(
    foreign.transformCollisionAware(
      part.id,
      new Vector3(4, 1, 0),
      part.rotation,
    ),
    false,
  );
  assert.ok(Math.abs(part.position.x) < 1e-9);

  assert.equal(
    foreign.transformCollisionAware(
      part.id,
      new Vector3(0, 1, 2),
      part.rotation,
    ),
    true,
  );
  assert.ok(Math.abs(part.position.z - 2) < 1e-9);

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
