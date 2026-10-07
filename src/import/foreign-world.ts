import * as T from "three";
import { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
import type { ForeignLDrawPartData } from "../ldraw/foreign-types";

const LDRAW_LIBRARY =
  "https://cdn.jsdelivr.net/gh/kulits/ldraw-parts@master/ldraw/";

export type ForeignLDrawPart = ForeignLDrawPartData & {
  kind: "foreign";
  position: T.Vector3;
  rotation: T.Quaternion;
  object: T.Group;
  loaded: boolean;
};

function validData(data: ForeignLDrawPartData) {
  return (
    Number.isSafeInteger(data.id) &&
    data.id < 0 &&
    typeof data.file === "string" &&
    data.file.length > 0 &&
    data.file.length <= 180 &&
    !data.file.includes("..") &&
    !/^[a-z]+:/i.test(data.file) &&
    /^#[0-9a-f]{6}$/i.test(data.color) &&
    typeof data.colorToken === "string" &&
    data.colorToken.length <= 32 &&
    Array.isArray(data.p) &&
    data.p.length === 3 &&
    Array.isArray(data.q) &&
    data.q.length === 4 &&
    [...data.p, ...data.q].every(Number.isFinite) &&
    data.p.every((n) => Math.abs(n) <= 1000)
  );
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

function setMainColor(loader: LDrawLoader, color: string) {
  for (const material of [loader.getMainMaterial(), loader.getMainEdgeMaterial()]) {
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
  return group;
}

export class ForeignLDrawWorld {
  readonly parts: ForeignLDrawPart[] = [];
  private visualCache = new Map<string, Promise<T.Group>>();

  constructor(private scene: T.Scene) {}

  get(id: number) {
    return this.parts.find((part) => part.id === id);
  }

  pickObjects() {
    return this.parts.map((part) => part.object);
  }

  private async template(file: string, color: string) {
    const key = `${file.toLowerCase()}|${color.toUpperCase()}`;
    let cached = this.visualCache.get(key);
    if (!cached) {
      cached = (async () => {
        const loader = new LDrawLoader();
        loader.setPartsLibraryPath(LDRAW_LIBRARY);
        try {
          await loader.preloadMaterials(`${LDRAW_LIBRARY}LDConfig.ldr`);
        } catch {
          loader.addDefaultMaterials();
        }
        const path = libraryFile(file)
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");
        const group = await loader.loadAsync(`${LDRAW_LIBRARY}${path}`);
        setMainColor(loader, color);
        return prepareVisual(group);
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
      part.object.clear();
      part.object.add(template.clone(true));
      part.loaded = true;
    } catch {
      // The placeholder intentionally remains. The original .dat reference and
      // transform are still preserved for editing and re-export.
      part.loaded = false;
    }
  }

  add(data: ForeignLDrawPartData) {
    if (!validData(data) || this.get(data.id)) throw new Error("Invalid foreign LDraw part");
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
    };
    root.position.copy(part.position);
    root.quaternion.copy(part.rotation);
    root.userData.foreignPart = part;
    root.add(placeholder(part.color));
    this.scene.add(root);
    this.parts.push(part);
    void this.hydrate(part);
    return part;
  }

  transform(id: number, position: T.Vector3, rotation?: T.Quaternion) {
    const part = this.get(id);
    if (!part) return false;
    part.position.copy(position);
    if (rotation) part.rotation.copy(rotation).normalize();
    part.object.position.copy(part.position);
    part.object.quaternion.copy(part.rotation);
    return true;
  }

  remove(id: number) {
    const part = this.get(id);
    if (!part) return;
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
    if (!Array.isArray(data) || data.length > 250 || !data.every(validData))
      throw new Error("Invalid foreign LDraw scene");
    const ids = new Set<number>();
    for (const part of data as ForeignLDrawPartData[]) {
      if (ids.has(part.id)) throw new Error("Duplicate foreign part id");
      ids.add(part.id);
    }
    this.clear();
    for (const part of data as ForeignLDrawPartData[]) this.add(part);
  }
}
