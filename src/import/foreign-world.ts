import R from "@dimforge/rapier3d-compat";
import * as T from "three";
import type { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
import type { ForeignLDrawPartData } from "../ldraw/foreign-types";

// Pin the CDN mirror so imported foreign geometry cannot change underneath a
// saved brickids scene when the upstream LDraw library updates.
const LDRAW_LIBRARY =
  "https://cdn.jsdelivr.net/gh/kulits/ldraw-parts@0eda020f43fe3af7d45444580dd56a9ce0c716ab/ldraw/";

export type ForeignLDrawPart = ForeignLDrawPartData & {
  kind: "foreign";
  position: T.Vector3;
  rotation: T.Quaternion;
  object: T.Group;
  loaded: boolean;
  /** Coarse standalone Rapier collider; no foreign gravity/body yet. */
  collider?: R.Collider;
  colliderCenter: T.Vector3;
  colliderHalf: T.Vector3;
  colliderFromGeometry: boolean;
};

export function isValidForeignPartData(data: ForeignLDrawPartData) {
  return (
    Number.isSafeInteger(data.id) &&
    data.id < 0 &&
    typeof data.file === "string" &&
    data.file.length > 0 &&
    data.file.length <= 180 &&
    !data.file.includes("..") &&
    !data.file.startsWith("/") &&
    !data.file.startsWith("\\") &&
    !/[\r\n\0]/.test(data.file) &&
    !/^[a-z]+:/i.test(data.file) &&
    /^#[0-9a-f]{6}$/i.test(data.color) &&
    typeof data.colorToken === "string" &&
    data.colorToken.length <= 32 &&
    Array.isArray(data.p) &&
    data.p.length === 3 &&
    Array.isArray(data.q) &&
    data.q.length === 4 &&
    [...data.p, ...data.q].every(Number.isFinite) &&
    data.p.every((n) => Math.abs(n) <= 1000) &&
    data.q.reduce((sum, n) => sum + n * n, 0) > 1e-12
  );
}

export function isValidForeignPartList(
  value: unknown,
): value is ForeignLDrawPartData[] {
  if (!Array.isArray(value) || value.length > 250) return false;
  const ids = new Set<number>();
  for (const part of value) {
    if (!isValidForeignPartData(part) || ids.has(part.id)) return false;
    ids.add(part.id);
  }
  return true;
}

function libraryFile(file: string) {
  const clean = file.replace(/\\/g, "/").replace(/^\.\//, "");
  if (clean.startsWith("parts/") || clean.startsWith("p/") || clean.startsWith("models/"))
    return clean;
  if (clean.startsWith("s/")) return `parts/${clean}`;
  if (clean.startsWith("48/")) return `p/${clean}`;
  return `parts/${clean}`;
}

function placeholder(color: string) {
  const group = new T.Group();
  const material = new T.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0,
    transparent: true,
    opacity: 0.62,
  });
  const mesh = new T.Mesh(new T.BoxGeometry(0.9, 0.6, 0.9), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new T.LineSegments(
    new T.EdgesGeometry(mesh.geometry),
    new T.LineBasicMaterial({ color: 0x36536f, transparent: true, opacity: 0.9 }),
  );
  group.add(edges);
  group.userData.placeholder = true;
  return group;
}

function disposePlaceholder(root: T.Group) {
  for (const child of [...root.children]) {
    if (!child.userData.placeholder) continue;
    child.traverse((object) => {
      if (object instanceof T.Mesh || object instanceof T.LineSegments) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    root.remove(child);
  }
}

function setMainColor(loader: LDrawLoader, color: string) {
  for (const material of [loader.getMaterial("16"), loader.getMaterial("24")]) {
    const candidate = material as (T.Material & { color?: T.Color }) | null;
    if (candidate?.color instanceof T.Color) candidate.color.set(color);
  }
}

function prepareVisual(group: T.Group) {
  // LDrawLoader examples rotate 180° around X to become Y-up. brickids keeps
  // LDraw Z positive, so the additional negative local Z scale changes the
  // conversion from diag(1,-1,-1) to brickids' diag(1,-1,1).
  group.rotation.x = Math.PI;
  group.scale.set(1 / 20, 1 / 20, -1 / 20);
  group.traverse((object) => {
    if (object instanceof T.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  group.updateMatrixWorld(true);
  return group;
}

const FALLBACK_BOUNDS = new T.Box3(
  new T.Vector3(-0.45, -0.3, -0.45),
  new T.Vector3(0.45, 0.3, 0.45),
);
const MIN_COLLIDER_HALF = 0.035;
const MAX_COLLIDER_HALF = 32;
const COLLIDER_INSET = 0.01;

function visualBounds(group: T.Group) {
  const box = new T.Box3().setFromObject(group, true);
  if (box.isEmpty()) return FALLBACK_BOUNDS.clone();
  const values = [...box.min.toArray(), ...box.max.toArray()];
  if (!values.every(Number.isFinite)) return FALLBACK_BOUNDS.clone();
  return box;
}

function colliderShape(box: T.Box3) {
  const center = box.getCenter(new T.Vector3());
  const half = box
    .getSize(new T.Vector3())
    .multiplyScalar(0.5)
    .subScalar(COLLIDER_INSET);
  for (const axis of ["x", "y", "z"] as const)
    half[axis] = T.MathUtils.clamp(
      half[axis],
      MIN_COLLIDER_HALF,
      MAX_COLLIDER_HALF,
    );
  return { center, half };
}

export class ForeignLDrawWorld {
  readonly parts: ForeignLDrawPart[] = [];
  private visualCache = new Map<
    string,
    Promise<{ group: T.Group; bounds: T.Box3 }>
  >();
  private physicsWorld?: R.World;

  constructor(
    private scene: T.Scene,
    private loadVisuals = true,
  ) {}

  get(id: number) {
    return this.parts.find((part) => part.id === id);
  }

  pickObjects() {
    return this.parts.map((part) => part.object);
  }

  attachPhysics(world: R.World) {
    if (this.physicsWorld === world) return;
    if (this.physicsWorld) {
      for (const part of this.parts)
        if (part.collider) {
          this.physicsWorld.removeCollider(part.collider, true);
          part.collider = undefined;
        }
    }
    this.physicsWorld = world;
    for (const part of this.parts) this.rebuildCollider(part);
  }

  private colliderPose(part: ForeignLDrawPart) {
    return part.colliderCenter
      .clone()
      .applyQuaternion(part.rotation)
      .add(part.position);
  }

  private syncCollider(part: ForeignLDrawPart) {
    if (!part.collider) return;
    const center = this.colliderPose(part);
    part.collider.setTranslation(center);
    part.collider.setRotation(part.rotation);
  }

  private rebuildCollider(
    part: ForeignLDrawPart,
    box?: T.Box3,
    fromGeometry = false,
  ) {
    if (box) {
      const shape = colliderShape(box);
      part.colliderCenter.copy(shape.center);
      part.colliderHalf.copy(shape.half);
      part.colliderFromGeometry = fromGeometry;
    }
    if (!this.physicsWorld) return;
    if (part.collider) this.physicsWorld.removeCollider(part.collider, true);
    const center = this.colliderPose(part);
    part.collider = this.physicsWorld.createCollider(
      R.ColliderDesc.cuboid(
        part.colliderHalf.x,
        part.colliderHalf.y,
        part.colliderHalf.z,
      )
        .setTranslation(center.x, center.y, center.z)
        .setRotation(part.rotation)
        .setFriction(0.58)
        .setRestitution(0.04),
    );
  }

  private async template(file: string, color: string) {
    const key = `${file.toLowerCase()}|${color.toUpperCase()}`;
    let cached = this.visualCache.get(key);
    if (!cached) {
      cached = (async () => {
        const [{ LDrawLoader }, { LDrawConditionalLineMaterial }] =
          await Promise.all([
            import("three/addons/loaders/LDrawLoader.js"),
            import("three/addons/materials/LDrawConditionalLineMaterial.js"),
          ]);
        const loader = new LDrawLoader();
        loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
        loader.setPartsLibraryPath(LDRAW_LIBRARY);
        loader.addDefaultMaterials();
        try {
          await loader.preloadMaterials(`${LDRAW_LIBRARY}LDConfig.ldr`);
        } catch {
          // The default main/edge materials are still enough for a visible
          // part; fixed library colors may fall back until connectivity returns.
        }
        const path = libraryFile(file)
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");
        const group = prepareVisual(
          await loader.loadAsync(`${LDRAW_LIBRARY}${path}`),
        );
        setMainColor(loader, color);
        return { group, bounds: visualBounds(group) };
      })();
      this.visualCache.set(key, cached);
      cached.catch(() => this.visualCache.delete(key));
    }
    return cached;
  }

  private async hydrate(part: ForeignLDrawPart) {
    try {
      const template = await this.template(part.file, part.color);
      if (!this.parts.includes(part)) return;
      disposePlaceholder(part.object);
      part.object.clear();
      part.object.add(template.group.clone(true));
      part.loaded = true;
      this.rebuildCollider(part, template.bounds, true);
    } catch {
      // The placeholder intentionally remains. The original .dat reference and
      // transform are still preserved for editing and re-export.
      part.loaded = false;
    }
  }

  add(data: ForeignLDrawPartData) {
    if (!isValidForeignPartData(data) || this.get(data.id)) throw new Error("Invalid foreign LDraw part");
    const rotation = new T.Quaternion().fromArray(data.q);
    if (rotation.lengthSq() < 1e-12) throw new Error("Invalid foreign rotation");
    rotation.normalize();

    const root = new T.Group();
    const part: ForeignLDrawPart = {
      ...data,
      kind: "foreign",
      p: [...data.p],
      q: [...data.q],
      position: new T.Vector3().fromArray(data.p),
      rotation,
      object: root,
      loaded: false,
      colliderCenter: new T.Vector3(),
      colliderHalf: new T.Vector3(0.45, 0.3, 0.45),
      colliderFromGeometry: false,
    };
    root.position.copy(part.position);
    root.quaternion.copy(part.rotation);
    root.userData.foreignPart = part;
    root.add(placeholder(part.color));
    this.scene.add(root);
    this.parts.push(part);
    this.rebuildCollider(part, FALLBACK_BOUNDS, false);
    if (this.loadVisuals) void this.hydrate(part);
    return part;
  }

  transform(id: number, position: T.Vector3, rotation?: T.Quaternion) {
    const part = this.get(id);
    if (!part) return false;
    part.position.copy(position);
    if (rotation) part.rotation.copy(rotation).normalize();
    part.object.position.copy(part.position);
    part.object.quaternion.copy(part.rotation);
    this.syncCollider(part);
    return true;
  }

  remove(id: number) {
    const part = this.get(id);
    if (!part) return;
    disposePlaceholder(part.object);
    if (part.collider && this.physicsWorld) {
      this.physicsWorld.removeCollider(part.collider, true);
      part.collider = undefined;
    }
    this.scene.remove(part.object);
    this.parts.splice(this.parts.indexOf(part), 1);
  }

  clear() {
    for (const part of [...this.parts]) this.remove(part.id);
  }

  serialize(): ForeignLDrawPartData[] {
    return this.parts.map((part) => ({
      id: part.id,
      file: part.file,
      color: part.color,
      colorToken: part.colorToken,
      p: part.position.toArray(),
      q: part.rotation.toArray(),
    }));
  }

  restore(value: unknown) {
    const data = value === undefined ? [] : value;
    if (!isValidForeignPartList(data))
      throw new Error("Invalid foreign LDraw scene");
    this.clear();
    for (const part of data) this.add(part);
  }
}
