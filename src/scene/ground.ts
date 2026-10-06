import * as T from "three";

export const groundOptions = ["baseplate", "ivory", "sand", "slate", "grass"] as const;
export type GroundStyle = (typeof groundOptions)[number];
export function groundStyle(value: string | null): GroundStyle {
  return groundOptions.includes(value as GroundStyle)
    ? (value as GroundStyle)
    : "baseplate";
}

/** Generated locally once: no external assets, requests, or texture licensing. */
/** A large instanced stud field makes the ground read like one continuous
 * LEGO-style baseplate without creating thousands of meshes or colliders.
 * Physics intentionally remains the existing flat floor; the studs are visual
 * sockets/studs entering the underside of pieces placed at ground level.
 */
export function baseplateStudField(span = 120) {
  const count = Math.max(2, Math.floor(span));
  const geometry = new T.CylinderGeometry(0.3, 0.3, 0.18, 20);
  const material = new T.MeshPhysicalMaterial({
    color: "#f7f7f4",
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.42,
  });
  const studs = new T.InstancedMesh(geometry, material, count * count);
  studs.name = "baseplate-studs";
  studs.castShadow = false;
  studs.receiveShadow = true;

  const dummy = new T.Object3D();
  const offset = (count - 1) / 2;
  let instance = 0;
  for (let x = 0; x < count; x++)
    for (let z = 0; z < count; z++) {
      dummy.position.set(x - offset, 0.09, z - offset);
      dummy.updateMatrix();
      studs.setMatrixAt(instance++, dummy.matrix);
    }
  studs.instanceMatrix.needsUpdate = true;
  studs.computeBoundingSphere();
  return studs;
}

function grassTexture(anisotropy: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  let seed = 731;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  ctx.fillStyle = "#526a32";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18000; i++) {
    const x = random() * 512,
      y = random() * 512;
    const dx = (random() - 0.5) * 10,
      dy = 3 + random() * 12;
    ctx.strokeStyle = `hsl(${75 + random() * 35}  ${25 + random() * 22}% ${20 + random() * 23}%)`;
    ctx.lineWidth = 0.6 + random() * 1.2;
    // Wrap strokes over every edge so repeating tiles have no cut seams.
    for (const ox of [-512, 0, 512])
      for (const oy of [-512, 0, 512]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + dx + ox, y - dy + oy);
        ctx.stroke();
      }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(40, 40);
  texture.anisotropy = anisotropy;
  return texture;
}

export function groundController(
  material: T.MeshStandardMaterial,
  grid: T.GridHelper,
  baseplate: T.InstancedMesh,
  anisotropy: number,
) {
  let grass: T.CanvasTexture | undefined;
  const colors = {
    baseplate: "#f7f7f4",
    ivory: "#f0ede5",
    sand: "#c9a875",
    slate: "#697984",
    grass: "#ffffff",
  };
  return (style: GroundStyle) => {
    if (style === "grass") grass ??= grassTexture(anisotropy);
    material.color.set(colors[style]);
    material.map = style === "grass" ? grass! : null;
    material.bumpMap = material.map;
    material.bumpScale = style === "grass" ? 0.035 : 0;
    material.roughness =
      style === "grass" ? 1 : style === "baseplate" ? 0.55 : 0.9;
    material.needsUpdate = true;
    baseplate.visible = style === "baseplate";
    grid.visible = style !== "grass" && style !== "baseplate";
  };
}
