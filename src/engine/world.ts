import R from "@dimforge/rapier3d-compat";
import * as T from "three";
import { OBB } from "three/addons/math/OBB.js";
import { catalog, connectors, type BrickSpec } from "./catalog";
import { component, mating, type Link, type Pose } from "./connections";
import { overlapDepth, bottomOf } from "./overlap";
import { brickMesh } from "./geometry";
import { nearestBaseplateStud } from "../baseplate";
import { solids, type Solid } from "./solids";
function solidCollider(s: Solid) {
  return s.kind === "box"
    ? R.ColliderDesc.cuboid(
        ...(s.half as [number, number, number]),
      ).setTranslation(...(s.center as [number, number, number]))
    : R.ColliderDesc.convexHull(new Float32Array(s.vertices))!;
}
export interface Brick extends Pose {
  body: R.RigidBody;
  mesh: T.Group;
  color: string;
}
export interface Connection extends Link {
  joint: R.ImpulseJoint;
  studs: number;
}
export class BrickWorld {
  world!: R.World;
  events!: R.EventQueue;
  bricks: Brick[] = [];
  links: Connection[] = [];
  held = new Set<number>();
  nextId = 1;
  private elapsed = 0;
  private impactTimes = new Map<string, number>();
  private quietUntil = new Map<number, number>();
  constructor(
    public scene: T.Scene,
    public onImpact: (v: number) => void,
  ) {}
  async init() {
    await R.init();
    this.world = new R.World({ x: 0, y: -24, z: 0 });
    this.world.timestep = 1 / 120;
    this.world.numSolverIterations = 12;
    this.events = new R.EventQueue(true);
    this.world.createCollider(
      R.ColliderDesc.cuboid(100, 0.2, 100)
        .setTranslation(0, -0.2, 0)
        .setFriction(0.65),
    );
  }
  /** Reserve a free position before releasing the previous held assembly.
   * Synchronous scene insertion makes repeated clicks safe even without a physics step.
   * Full envelopes include studs, orientation, and a small separation margin.
   */
  spawnHeld(spec: BrickSpec, color: string, center = new T.Vector3(0, 6, 0)) {
    if (this.bricks.length >= 250) return null;
    const envelope = (spec: BrickSpec, p: T.Vector3, q: T.Quaternion) =>
      new OBB(
        p.clone().add(new T.Vector3(0, 0.11, 0).applyQuaternion(q)),
        new T.Vector3(
          spec.cols / 2 + 0.1,
          spec.height / 2 + 0.21,
          spec.rows / 2 + 0.1,
        ),
        new T.Matrix3().setFromMatrix4(
          new T.Matrix4().makeRotationFromQuaternion(q),
        ),
      );
    const occupied = this.bricks.map((b) =>
      envelope(
        b.spec,
        new T.Vector3().copy(b.body.translation()),
        new T.Quaternion().copy(b.body.rotation()),
      ),
    );
    const origin = new T.Vector3(
      T.MathUtils.clamp(center.x, -60, 60),
      Math.max(6, center.y, spec.height / 2 + 0.3),
      T.MathUtils.clamp(center.z, -60, 60),
    );
    const stride = Math.max(spec.cols, spec.rows) + 0.3;
    const rotation = new T.Quaternion();
    for (let ring = 0; ring <= 16; ring++) {
      const candidates: T.Vector3[] = [];
      for (let x = -ring; x <= ring; x++)
        for (let z = -ring; z <= ring; z++) {
          if (Math.max(Math.abs(x), Math.abs(z)) !== ring) continue;
          candidates.push(
            origin.clone().add(new T.Vector3(x * stride, 0, z * stride)),
          );
        }
      candidates.sort(
        (a, b) => a.distanceToSquared(origin) - b.distanceToSquared(origin),
      );
      for (const p of candidates) {
        if (
          Math.abs(p.x) + spec.cols / 2 > 95 ||
          Math.abs(p.z) + spec.rows / 2 > 95
        )
          continue;
        const bounds = envelope(spec, p, rotation);
        if (occupied.some((other) => bounds.intersectsOBB(other))) continue;
        const brick = this.add(spec, color, p);
        this.grab(brick.id);
        return brick;
      }
    }
    return null;
  }
  /** Place a newly requested part directly into the scene.
   * The requested X/Z is aligned to the visible baseplate grid, then the part
   * is lowered onto the first physical surface and released. Nearby grid cells
   * are tried when the requested column cannot accept the part.
   */
  placeNew(spec: BrickSpec, color: string, target = new T.Vector3()) {
    if (this.bricks.length >= 250) return null;
    const socket = connectors(spec, "bottom")[0] ?? { x: 0, z: 0 };
    const aligned = new T.Vector3(
      nearestBaseplateStud(target.x + socket.x) - socket.x,
      0,
      nearestBaseplateStud(target.z + socket.z) - socket.z,
    );
    const brick = this.spawnHeld(
      spec,
      color,
      new T.Vector3(aligned.x, 6, aligned.z),
    );
    if (!brick) return null;

    for (let ring = 0; ring <= 10; ring++) {
      const candidates: T.Vector3[] = [];
      for (let x = -ring; x <= ring; x++)
        for (let z = -ring; z <= ring; z++) {
          if (Math.max(Math.abs(x), Math.abs(z)) !== ring) continue;
          candidates.push(
            new T.Vector3(aligned.x + x, 0, aligned.z + z),
          );
        }
      candidates.sort(
        (a, b) => a.distanceToSquared(aligned) - b.distanceToSquared(aligned),
      );
      for (const candidate of candidates) {
        if (!this.snapDown(brick.id, candidate)) continue;
        this.drop(brick.id, true);
        return brick;
      }
    }

    this.remove(brick.id);
    return null;
  }

  add(
    spec: BrickSpec,
    color: string,
    p = new T.Vector3(0, 4, 0),
    q = new T.Quaternion(),
  ) {
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation(q)
        .setCcdEnabled(true)
        .setLinearDamping(0.18)
        .setAngularDamping(0.35),
    );
    const h = spec.height;
    for (const solid of solids(spec))
      this.world.createCollider(
        solidCollider(solid)
          .setFriction(0.55)
          .setRestitution(0.08)
          .setDensity(0.65)
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
        body,
      );
    for (const p of connectors(spec))
      this.world.createCollider(
        R.ColliderDesc.cylinder(0.11, 0.3)
          .setTranslation(p.x, h / 2 + 0.11, p.z)
          .setFriction(0.5)
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
        body,
      );
    const mesh = brickMesh(spec, color);
    this.scene.add(mesh);
    const b = {
      id: this.nextId++,
      spec,
      color,
      body,
      mesh,
      position: p.clone(),
      rotation: q.clone(),
    };
    mesh.userData.brick = b;
    this.bricks.push(b);
    this.sync();
    return b;
  }
  sync() {
    for (const b of this.bricks) {
      b.position.copy(b.body.translation());
      b.rotation.copy(b.body.rotation());
      b.mesh.position.copy(b.position);
      b.mesh.quaternion.copy(b.rotation);
    }
  }
  step() {
    // Capture incoming motion before the solver removes impact velocity.
    const incoming = new Map(
      this.bricks.map((b) => [
        b.body.handle,
        {
          brick: b,
          velocity: new T.Vector3().copy(b.body.linvel()),
          spin:
            (new T.Vector3().copy(b.body.angvel()).length() *
              Math.max(b.spec.cols, b.spec.rows)) /
            2,
          group: Math.min(...component(b.id, this.links)),
        },
      ]),
    );
    this.elapsed += this.world.timestep;
    this.world.step(this.events);
    const impacts = new Map<string, number>();
    this.events.drainCollisionEvents((handleA, handleB, started) => {
      if (!started) return;
      const bodyA = this.world.getCollider(handleA)?.parent();
      const bodyB = this.world.getCollider(handleB)?.parent();
      const a = bodyA ? incoming.get(bodyA.handle) : undefined;
      const b = bodyB ? incoming.get(bodyB.handle) : undefined;
      if (!a && !b) return;
      if (
        [a, b].some(
          (v) =>
            v &&
            (this.held.has(v.brick.id) ||
              (this.quietUntil.get(v.brick.id) ?? 0) > this.elapsed),
        )
      )
        return;
      if (a && b && a.group === b.group) return;
      const speed =
        (a?.velocity.clone() ?? new T.Vector3())
          .sub(b?.velocity ?? new T.Vector3())
          .length() +
        (a?.spin ?? 0) +
        (b?.spin ?? 0);
      // Resting support forces and tiny solver bounces are not fresh impacts.
      if (speed < 1.2) return;
      const key = [a?.group ?? 0, b?.group ?? 0]
        .sort((a, b) => a - b)
        .join(":");
      impacts.set(key, Math.max(impacts.get(key) ?? 0, speed));
    });
    for (const [key, speed] of impacts) {
      if (this.elapsed - (this.impactTimes.get(key) ?? -Infinity) < 0.25)
        continue;
      this.impactTimes.set(key, this.elapsed);
      this.onImpact(Math.min(0.65, speed / 18));
    }
    for (const [key, time] of this.impactTimes)
      if (this.elapsed - time > 1) this.impactTimes.delete(key);
    for (const [id, time] of this.quietUntil)
      if (this.elapsed > time) this.quietUntil.delete(id);
    this.sync();
    for (const b of [...this.bricks]) if (b.position.y < -30) this.remove(b.id);

    // A loose brick should never remain parked on its side or upside down.
    // Wait until Rapier has put it to sleep so active motion is not interrupted,
    // then recover exactly one brick per step to the nearest clear grid cell.
    if (!this.held.size) {
      const fallen = this.bricks.find((brick) => {
        if (this.links.some((link) => link.a === brick.id || link.b === brick.id))
          return false;
        if (!brick.body.isSleeping()) return false;
        const up = new T.Vector3(0, 1, 0).applyQuaternion(brick.rotation);
        return up.y < Math.cos(Math.PI / 12);
      });
      if (fallen) {
        this.grab(fallen.id);
        this.recoverUprightBaseplate(fallen.id);
        this.release();
      }
    }
  }
  get(id: number) {
    return this.bricks.find((b) => b.id === id)!;
  }
  grab(id: number) {
    this.release();
    this.held = component(id, this.links);
    for (const i of this.held) {
      const b = this.get(i);
      b.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
  release() {
    for (const i of this.held) {
      const b = this.get(i);
      b.body.setBodyType(R.RigidBodyType.Dynamic, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.held.clear();
  }
  obb(b: Brick, p = b.position, q = b.rotation) {
    return new OBB(
      p.clone(),
      new T.Vector3(
        b.spec.cols / 2 - 0.035,
        b.spec.height / 2 - 0.015,
        b.spec.rows / 2 - 0.035,
      ),
      new T.Matrix3().setFromMatrix4(
        new T.Matrix4().makeRotationFromQuaternion(q),
      ),
    );
  }
  private clearanceShapes = new Map<
    BrickSpec,
    { shape: R.Shape; offset: T.Vector3 }[]
  >();
  private shapes(spec: BrickSpec) {
    let cached = this.clearanceShapes.get(spec);
    if (!cached) {
      cached = spec.shape
        ? solids(spec).map((s) => ({
            shape: solidCollider(s).shape,
            offset: new T.Vector3(
              ...((s.kind === "box" ? s.center : [0, 0, 0]) as [
                number,
                number,
                number,
              ]),
            ),
          }))
        : [
            {
              shape: new R.Cuboid(
                spec.cols / 2 - 0.035,
                spec.height / 2 - 0.015,
                spec.rows / 2 - 0.035,
              ),
              offset: new T.Vector3(),
            },
          ];
      this.clearanceShapes.set(spec, cached);
    }
    return cached;
  }
  private detailedOverlap(a: Brick, box: OBB, b: Brick) {
    const q = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().setFromMatrix3(box.rotation),
    );
    return this.shapes(a.spec).some((sa) =>
      this.shapes(b.spec).some((sb) =>
        sa.shape.intersectsShape(
          sa.offset.clone().applyQuaternion(q).add(box.center),
          q,
          sb.shape,
          sb.offset.clone().applyQuaternion(b.rotation).add(b.position),
          b.rotation,
        ),
      ),
    );
  }
  clearAt(
    poses: Map<number, { p: T.Vector3; q: T.Quaternion }>,
    previous?: Map<number, OBB>,
  ) {
    for (const [id, { p, q }] of poses) {
      const b = this.get(id),
        obb = this.obb(b, p, q);
      const before = previous?.get(id);
      const bottom = bottomOf(obb);
      if (bottom < -0.01 && (!before || bottom < bottomOf(before) - 1e-6))
        return false;
      for (const other of this.bricks) {
        if (poses.has(other.id)) continue;
        const obstacle = this.obb(other);
        if (!obb.intersectsOBB(obstacle, 1e-5)) continue;
        const detailed = !!(b.spec.shape || other.spec.shape);
        if (detailed && !this.detailedOverlap(b, obb, other)) continue;
        // Existing overlaps may only stay level or shrink at every swept step.
        // New intersections, deepening overlaps, and passing through walls remain blocked.
        if (
          !before ||
          !before.intersectsOBB(obstacle, 1e-5) ||
          (detailed && !this.detailedOverlap(b, before, other)) ||
          obb.center.distanceToSquared(obstacle.center) <
            before.center.distanceToSquared(obstacle.center) - 1e-6 ||
          overlapDepth(obb, obstacle) > overlapDepth(before, obstacle) + 1e-6
        )
          return false;
      }
    }
    return true;
  }
  private sweptPoses(id: number, target: T.Vector3, rotation?: T.Quaternion) {
    if (!this.held.has(id)) return null;
    const root = this.get(id);
    const desired = rotation ?? root.rotation;
    const distance = root.position.distanceTo(target);
    const angle = root.rotation.angleTo(desired);
    const radius = Math.max(
      ...[...this.held].map(
        (i) =>
          this.get(i).position.distanceTo(root.position) +
          this.get(i).spec.cols,
      ),
    );
    const steps = Math.max(1, Math.ceil((distance + angle * radius) / 0.15));
    let poses = new Map<number, { p: T.Vector3; q: T.Quaternion }>();
    let previous = new Map(
      [...this.held].map((i) => [i, this.obb(this.get(i))]),
    );
    // Sweep both translation and rotation so a large input cannot tunnel
    // through an obstacle even when the destination itself is clear.
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const position = root.position.clone().lerp(target, t);
      const delta = root.rotation
        .clone()
        .slerp(desired, t)
        .multiply(root.rotation.clone().invert());
      poses = new Map();
      for (const i of this.held) {
        const b = this.get(i);
        poses.set(i, {
          p: b.position
            .clone()
            .sub(root.position)
            .applyQuaternion(delta)
            .add(position),
          q: delta.clone().multiply(b.rotation),
        });
      }
      if (!this.clearAt(poses, previous)) return null;
      previous = new Map(
        [...poses].map(([id, { p, q }]) => [id, this.obb(this.get(id), p, q)]),
      );
    }
    return poses;
  }
  transform(id: number, target: T.Vector3, rotation?: T.Quaternion) {
    const poses = this.sweptPoses(id, target, rotation);
    if (!poses) return false;
    for (const [i, { p, q }] of poses) {
      const b = this.get(i);
      b.body.setTranslation(p, true);
      b.body.setRotation(q, true);
      b.body.setNextKinematicTranslation(p);
      b.body.setNextKinematicRotation(q);
    }
    this.sync();
    return true;
  }
  /** Move the held assembly to the pointer's X/Z column and settle it on the
   * first physical surface below. The input Y is deliberately ignored: drag
   * height must never allow a brick to remain suspended in mid-air.
   */
  snapDown(id: number, target: T.Vector3) {
    if (!this.held.has(id)) return false;
    const root = this.get(id);
    const heldBodies = new Set(
      [...this.held].map((i) => this.get(i).body.handle),
    );
    const topOf = (brick: Brick) => {
      const box = this.obb(brick),
        r = box.rotation.elements,
        h = box.halfSize;
      return (
        box.center.y +
        Math.abs(r[1]) * h.x +
        Math.abs(r[4]) * h.y +
        Math.abs(r[7]) * h.z
      );
    };
    const stationaryTop = Math.max(
      0,
      ...this.bricks
        .filter((b) => !this.held.has(b.id))
        .map((b) => topOf(b)),
    );
    const bottomOffset =
      Math.min(...[...this.held].map((i) => bottomOf(this.obb(this.get(i))))) -
      root.position.y;
    // Start completely above every stationary brick, then sweep vertically.
    const start = new T.Vector3(
      target.x,
      stationaryTop - bottomOffset + 0.5,
      target.z,
    );
    const startDelta = start.clone().sub(root.position);
    const maxToi = Math.max(1, start.y + bottomOffset + 1);
    const down = { x: 0, y: -1, z: 0 },
      still = { x: 0, y: 0, z: 0 };
    const isHeldCollider = (collider: R.Collider) => {
      const parent = collider.parent();
      return !!parent && heldBodies.has(parent.handle);
    };

    // World scene queries use Rapier's broad phase, which is refreshed by a
    // physics step. Dragging can happen between steps, so use direct pairwise
    // shape casts instead. First propagate body poses to their colliders.
    this.world.propagateModifiedBodyPositionsToColliders();

    // Cheap X/Z pruning keeps the pairwise casts local even in a large model.
    const projectedHalf = (box: OBB) => {
      const r = box.rotation.elements,
        h = box.halfSize;
      return {
        x: Math.abs(r[0]) * h.x + Math.abs(r[3]) * h.y + Math.abs(r[6]) * h.z,
        z: Math.abs(r[2]) * h.x + Math.abs(r[5]) * h.y + Math.abs(r[8]) * h.z,
      };
    };
    const horizontalShift = new T.Vector3(
      target.x - root.position.x,
      0,
      target.z - root.position.z,
    );
    const movingFootprints = [...this.held].map((i) => {
      const brick = this.get(i),
        box = this.obb(brick, brick.position.clone().add(horizontalShift));
      return { box, half: projectedHalf(box) };
    });
    const candidateBodies = new Set<number>();
    for (const brick of this.bricks) {
      if (this.held.has(brick.id)) continue;
      const obstacle = this.obb(brick),
        oh = projectedHalf(obstacle);
      if (
        movingFootprints.some(
          ({ box, half }) =>
            Math.abs(box.center.x - obstacle.center.x) <= half.x + oh.x + 0.35 &&
            Math.abs(box.center.z - obstacle.center.z) <= half.z + oh.z + 0.35,
        )
      )
        candidateBodies.add(brick.body.handle);
    }

    const movingColliders: R.Collider[] = [],
      obstacles: R.Collider[] = [];
    this.world.forEachCollider((collider) => {
      const parent = collider.parent();
      if (isHeldCollider(collider)) movingColliders.push(collider);
      else if (!parent || candidateBodies.has(parent.handle)) obstacles.push(collider);
    });

    let firstContact = Infinity;
    for (const moving of movingColliders) {
      const origin = new T.Vector3()
        .copy(moving.translation())
        .add(startDelta);
      for (const obstacle of obstacles) {
        const hit = moving.shape.castShape(
          origin,
          moving.rotation(),
          down,
          obstacle.shape,
          obstacle.translation(),
          obstacle.rotation(),
          still,
          0.004,
          maxToi,
          true,
        );
        if (hit) firstContact = Math.min(firstContact, hit.time_of_impact);
      }
    }
    if (!Number.isFinite(firstContact)) return false;
    const settled = start.clone();
    settled.y -= firstContact;
    const delta = settled.sub(root.position);
    const poses = new Map<number, { p: T.Vector3; q: T.Quaternion }>();
    for (const i of this.held) {
      const brick = this.get(i);
      poses.set(i, {
        p: brick.position.clone().add(delta),
        q: brick.rotation.clone(),
      });
    }
    if (!this.clearAt(poses)) return false;
    for (const [i, { p, q }] of poses) {
      const brick = this.get(i);
      brick.body.setTranslation(p, true);
      brick.body.setRotation(q, true);
      brick.body.setNextKinematicTranslation(p);
      brick.body.setNextKinematicRotation(q);
    }
    this.sync();
    return true;
  }

  candidate(id: number, assistTilt = Math.PI / 36) {
    if (!this.held.has(id)) return null;
    const root = this.get(id);
    type Fit = NonNullable<ReturnType<typeof mating>>;
    let best: {
      upper: Brick;
      lower: Brick;
      stationary: Brick;
      surfaceFit: Fit;
      fit: Fit;
    } | null = null;
    let bestDistance = Infinity;
    // Any held member can supply either sockets (above) or studs (below).
    for (const member of this.held)
      for (const stationary of this.bricks) {
        if (this.held.has(stationary.id)) continue;
        const moving = this.get(member);
        for (const fromBelow of [false, true]) {
          const upper = fromBelow ? stationary : moving;
          const lower = fromBelow ? moving : stationary;
          const contact = mating(upper, lower, 0.65, true, assistTilt);
          if (!contact) continue;
          // mating gives the upper target with the lower fixed. Invert that
          // rigid transform when holding the lower, keeping the upper in place.
          const delta = fromBelow
            ? upper.rotation.clone().multiply(contact.rotation.clone().invert())
            : contact.rotation
                .clone()
                .multiply(upper.rotation.clone().invert());
          const position = fromBelow
            ? lower.position
                .clone()
                .sub(contact.position)
                .applyQuaternion(delta)
                .add(upper.position)
            : contact.position;
          const distance = position.distanceToSquared(moving.position);
          if (distance >= bestDistance) continue;
          const fit = {
            ...contact,
            position: root.position
              .clone()
              .sub(moving.position)
              .applyQuaternion(delta)
              .add(position),
            rotation: delta.clone().multiply(root.rotation),
          };
          if (!this.sweptPoses(id, fit.position, fit.rotation)) continue;
          const surfaceFit = fromBelow
            ? {
                ...contact,
                position: upper.position.clone(),
                rotation: upper.rotation.clone(),
              }
            : contact;
          best = { upper, lower, stationary, surfaceFit, fit };
          bestDistance = distance;
        }
      }
    return best;
  }
  connect(a: Brick, b: Brick, studs: number) {
    for (const id of [
      ...component(a.id, this.links),
      ...component(b.id, this.links),
    ])
      this.quietUntil.set(id, this.elapsed + 0.3);
    const anchor = b.position
      .clone()
      .sub(a.position)
      .applyQuaternion(a.rotation.clone().invert());
    const frame = a.rotation.clone().invert().multiply(b.rotation);
    const joint = this.world.createImpulseJoint(
      R.JointData.fixed(
        anchor,
        frame,
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0, w: 1 },
      ),
      a.body,
      b.body,
      true,
    );
    joint.setContactsEnabled(false);
    this.links.push({ a: a.id, b: b.id, joint, studs });
  }
  press(id: number, assistTilt = Math.PI / 36) {
    const c = this.candidate(id, assistTilt);
    if (!c) return false;
    if (!this.transform(id, c.fit.position, c.fit.rotation)) return false;
    // A wide brick may engage several independent supports with the same press.
    const contacts: { a: Brick; b: Brick; studs: number }[] = [];
    for (const i of this.held)
      for (const other of this.bricks) {
        if (this.held.has(other.id)) continue;
        const moving = this.get(i);
        // Links always store upper -> lower, regardless of which side is held.
        for (const [upper, lower] of [
          [moving, other],
          [other, moving],
        ]) {
          const fit = mating(upper, lower, 0.06);
          if (fit && fit.position.distanceTo(upper.position) < 0.04)
            contacts.push({ a: upper, b: lower, studs: fit.count });
        }
      }
    if (!contacts.length) return false;
    for (const c of contacts) this.connect(c.a, c.b, c.studs);
    this.release();
    return true;
  }
  /** Align a held assembly with the visual baseplate stud grid. This only
   * participates at floor level; brick-to-brick mating always has priority.
   */
  snapBaseplate(id: number, maxTilt = Math.PI / 12) {
    if (!this.held.has(id)) return false;
    const root = this.get(id);
    let contact: Brick | null = null;
    let lowest = Infinity;
    for (const member of this.held) {
      const brick = this.get(member);
      if (!connectors(brick.spec, "bottom").length) continue;
      const bottom = bottomOf(this.obb(brick));
      if (bottom < lowest) {
        lowest = bottom;
        contact = brick;
      }
    }
    // snapDown has already settled the held assembly. Do not let a baseplate
    // snap steal a placement from another brick higher in the scene.
    if (!contact || lowest > 0.12) return false;

    const up = new T.Vector3(0, 1, 0).applyQuaternion(contact.rotation);
    if (up.y < Math.cos(maxTilt)) return false;

    const axis = new T.Vector3(1, 0, 0).applyQuaternion(contact.rotation);
    const yaw = Math.atan2(-axis.z, axis.x);
    const quarter = Math.round(yaw / (Math.PI / 2));
    const snappedYaw = (quarter * Math.PI) / 2;
    const freeYaw =
      contact.spec.shape === "round" &&
      contact.spec.cols === 1 &&
      contact.spec.rows === 1;
    if (!freeYaw && Math.abs(yaw - snappedYaw) > Math.PI / 12) return false;

    const desiredContactRotation = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      freeYaw ? yaw : snappedYaw,
    );
    const delta = desiredContactRotation
      .clone()
      .multiply(contact.rotation.clone().invert());

    const socket = connectors(contact.spec, "bottom")[0];
    const projectedSocket = new T.Vector3(socket.x, 0, socket.z)
      .applyQuaternion(desiredContactRotation)
      .add(contact.position);
    const desiredContactPosition = contact.position.clone();
    desiredContactPosition.x +=
      nearestBaseplateStud(projectedSocket.x) - projectedSocket.x;
    desiredContactPosition.z +=
      nearestBaseplateStud(projectedSocket.z) - projectedSocket.z;
    desiredContactPosition.y = contact.spec.height / 2;

    const target = root.position
      .clone()
      .sub(contact.position)
      .applyQuaternion(delta)
      .add(desiredContactPosition);
    const rotation = delta.clone().multiply(root.rotation);
    return this.transform(id, target, rotation);
  }

  /** Recovery for a part/assembly that ended up on its side or upside down.
   * Find the nearest collision-free baseplate grid position, rotate the lowest
   * socket-bearing brick upright to the nearest quarter turn, and teleport the
   * held assembly there before release. This is deliberately a recovery path,
   * not normal drag motion.
   */
  recoverUprightBaseplate(id: number, searchRings = 12) {
    if (!this.held.has(id)) return false;

    let contact: Brick | null = null;
    let lowest = Infinity;
    for (const member of this.held) {
      const brick = this.get(member);
      if (!connectors(brick.spec, "bottom").length) continue;
      const bottom = bottomOf(this.obb(brick));
      if (bottom < lowest) {
        lowest = bottom;
        contact = brick;
      }
    }
    if (!contact) return false;

    const up = new T.Vector3(0, 1, 0).applyQuaternion(contact.rotation);
    if (up.y >= Math.cos(Math.PI / 12)) return false;

    const quarterTurns = [0, 1, 2, 3].map((quarter) =>
      new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 1, 0),
        quarter * (Math.PI / 2),
      ),
    );
    const desiredContactRotation = quarterTurns.reduce((best, candidate) =>
      candidate.angleTo(contact!.rotation) < best.angleTo(contact!.rotation)
        ? candidate
        : best,
    );
    const delta = desiredContactRotation
      .clone()
      .multiply(contact.rotation.clone().invert());

    const socket = connectors(contact.spec, "bottom")[0];
    const projectedSocket = new T.Vector3(socket.x, 0, socket.z)
      .applyQuaternion(desiredContactRotation)
      .add(contact.position);
    const baseContactPosition = new T.Vector3(
      contact.position.x +
        nearestBaseplateStud(projectedSocket.x) -
        projectedSocket.x,
      contact.spec.height / 2,
      contact.position.z +
        nearestBaseplateStud(projectedSocket.z) -
        projectedSocket.z,
    );

    for (let ring = 0; ring <= searchRings; ring++) {
      const offsets: T.Vector3[] = [];
      for (let x = -ring; x <= ring; x++)
        for (let z = -ring; z <= ring; z++) {
          if (Math.max(Math.abs(x), Math.abs(z)) !== ring) continue;
          offsets.push(new T.Vector3(x, 0, z));
        }
      offsets.sort((a, b) => a.lengthSq() - b.lengthSq());

      for (const offset of offsets) {
        const desiredContactPosition = baseContactPosition.clone().add(offset);
        const poses = new Map<number, { p: T.Vector3; q: T.Quaternion }>();
        for (const member of this.held) {
          const brick = this.get(member);
          poses.set(member, {
            p: brick.position
              .clone()
              .sub(contact.position)
              .applyQuaternion(delta)
              .add(desiredContactPosition),
            q: delta.clone().multiply(brick.rotation),
          });
        }
        if (!this.clearAt(poses)) continue;

        for (const [member, { p, q }] of poses) {
          const brick = this.get(member);
          brick.body.setTranslation(p, true);
          brick.body.setRotation(q, true);
          brick.body.setNextKinematicTranslation(p);
          brick.body.setNextKinematicRotation(q);
        }
        this.sync();
        return true;
      }
    }
    return false;
  }

  /** Release a held assembly. Prefer a real brick mating pose; when baseplate
   * mode is active, otherwise align a floor-level piece to the baseplate studs.
   */
  drop(id: number, baseplate = false) {
    if (!this.held.has(id)) return false;
    // Drop is intentionally a little more forgiving than the live preview:
    // a piece that is already resting near compatible studs may straighten
    // from up to 15° of pitch/roll, but distance and yaw limits stay unchanged.
    if (this.press(id, Math.PI / 12)) return true;
    let snapped = baseplate && this.snapBaseplate(id, Math.PI / 12);
    if (!snapped && baseplate) snapped = this.recoverUprightBaseplate(id);
    this.release();
    return snapped;
  }

  lowerConnection(id: number) {
    return this.links.find((link) => link.a === id) ?? null;
  }

  detach(link: Connection, _from: number) {
    // Pull one side of a physical interface. Parallel connections across that
    // interface must release together; connections inside either side survive.
    const lower = this.get(link.b),
      normal = new T.Vector3(0, 1, 0).applyQuaternion(lower.rotation);
    const planePoint = lower.position
      .clone()
      .addScaledVector(normal, lower.spec.height / 2);
    const assembly = component(link.a, this.links);
    const signed = (id: number) =>
      this.get(id).position.clone().sub(planePoint).dot(normal);
    const cuts = this.links.filter(
      (l) => assembly.has(l.a) && signed(l.a) * signed(l.b) < 0,
    );
    const remaining = this.links.filter((l) => !cuts.includes(l));
    const side = component(link.a, remaining);
    if (side.has(link.b)) return false;
    let poses = new Map<number, { p: T.Vector3; q: T.Quaternion }>();
    // Validate the entire extraction path, including clearance above the studs.
    for (let step = 1; step <= 8; step++) {
      poses = new Map();
      for (const id of side) {
        const brick = this.get(id);
        poses.set(id, {
          p: brick.position.clone().addScaledVector(normal, step * 0.05),
          q: brick.rotation.clone(),
        });
      }
      if (!this.clearAt(poses)) return false;
    }
    this.release();
    for (const cut of cuts) this.world.removeImpulseJoint(cut.joint, true);
    this.links = remaining;
    this.grab(link.a);
    for (const [i, { p, q }] of poses) {
      const brick = this.get(i);
      brick.body.setTranslation(p, true);
      brick.body.setNextKinematicTranslation(p);
      brick.body.setRotation(q, true);
    }
    this.sync();
    return true;
  }

  remove(id: number) {
    const b = this.get(id);
    if (!b) return;
    this.release();
    for (const l of this.links.filter((l) => l.a === id || l.b === id))
      this.world.removeImpulseJoint(l.joint, true);
    this.links = this.links.filter((l) => l.a !== id && l.b !== id);
    this.world.removeRigidBody(b.body);
    this.scene.remove(b.mesh);
    b.mesh.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        (o.material as T.Material).dispose();
      }
    });
    this.bricks = this.bricks.filter((x) => x !== b);
  }
  clear() {
    for (const b of [...this.bricks]) this.remove(b.id);
  }
  serialize() {
    return {
      version: 1,
      bricks: this.bricks.map((b) => ({
        id: b.id,
        spec: b.spec.id,
        color: b.color,
        p: b.position.toArray(),
        q: b.rotation.toArray(),
      })),
      links: this.links.map((l) => ({ a: l.a, b: l.b, studs: l.studs })),
    };
  }
  restore(data: ReturnType<BrickWorld["serialize"]>) {
    if (
      data.version !== 1 ||
      !Array.isArray(data.bricks) ||
      data.bricks.length > 250
    )
      throw Error("Invalid scene");
    const poses = new Map<number, Pose>();
    for (const b of data.bricks) {
      const spec = catalog.find((s) => s.id === b.spec);
      if (
        !spec ||
        !/^#[0-9a-f]{6}$/i.test(b.color) ||
        !Number.isSafeInteger(b.id) ||
        b.p.length !== 3 ||
        b.q.length !== 4 ||
        ![...b.p, ...b.q].every(Number.isFinite) ||
        b.p.some((n) => Math.abs(n) > 1000) ||
        poses.has(b.id)
      )
        throw Error("Invalid brick");
      const rotation = new T.Quaternion().fromArray(b.q);
      if (rotation.length() < 0.001) throw Error("Invalid rotation");
      poses.set(b.id, {
        id: b.id,
        spec,
        position: new T.Vector3().fromArray(b.p),
        rotation: rotation.normalize(),
      });
    }
    const pairs = new Set<string>();
    if (!Array.isArray(data.links)) throw Error("Invalid links");
    for (const l of data.links) {
      const a = poses.get(l.a),
        b = poses.get(l.b),
        key = [l.a, l.b].sort((a, b) => a - b).join(":");
      if (!a || !b || a === b || pairs.has(key)) throw Error("Invalid link");
      const fit = mating(a, b, 0.08);
      if (!fit || fit.position.distanceTo(a.position) > 0.08)
        throw Error("Invalid connection geometry");
      pairs.add(key);
    }
    this.clear();
    const map = new Map<number, Brick>();
    for (const b of data.bricks) {
      const pose = poses.get(b.id)!;
      map.set(b.id, this.add(pose.spec, b.color, pose.position, pose.rotation));
    }
    for (const l of data.links) {
      const a = map.get(l.a)!,
        b = map.get(l.b)!;
      this.connect(a, b, mating(a, b, 0.08)!.count);
    }
  }
}
