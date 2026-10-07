import { Quaternion, Vector3 } from "three";
import type { ForeignLDrawPartData } from "../ldraw/foreign-types";

const LDU_PER_STUD = 20;

type SerializedBrick = {
  id: number;
  spec: string;
  color: string;
  p: number[];
  q: number[];
};

export type LDrawScene = {
  version: number;
  bricks: SerializedBrick[];
  foreign?: ForeignLDrawPartData[];
};

type LDrawPart = {
  file: string;
  height: number;
  /** brickids-local position of the LDraw part origin. */
  origin?: [number, number, number];
  /** Extra local yaw needed to align the official LDraw part orientation. */
  yaw?: number;
};

export const ldrawParts: Record<string, LDrawPart> = {
  "1x2": { file: "3004.dat", height: 1.2 },
  "1x4": { file: "3010.dat", height: 1.2 },
  "2x2": { file: "3003.dat", height: 1.2 },
  "2x4": { file: "3001.dat", height: 1.2 },
  "plate-1x2": { file: "3023.dat", height: 0.4 },
  "plate-1x4": { file: "3710.dat", height: 0.4 },
  "plate-2x2": { file: "3022.dat", height: 0.4 },
  "plate-2x4": { file: "3020.dat", height: 0.4 },
  "tile-1x2": { file: "3069b.dat", height: 0.4 },
  "tile-2x2": { file: "3068b.dat", height: 0.4 },
  "round-1x1": { file: "3062b.dat", height: 1.2 },
  "round-plate-1x1": { file: "6141.dat", height: 0.4 },
  // 3039's official origin is one half-stud forward of its footprint centre
  // and its slope direction is opposite brickids' local +Z convention.
  "slope-2x2": {
    file: "3039.dat",
    height: 1.2,
    origin: [0, 0.6, -0.5],
    yaw: Math.PI,
  },
  // 54200 is authored around its bottom plane rather than its top plane.
  "cheese-1x1": {
    file: "54200.dat",
    height: 0.8,
    origin: [0, -0.4, 0],
    yaw: Math.PI,
  },
  // 2420 is authored around the inner corner stud; brickids is centre-based.
  "corner-plate-2x2": {
    file: "2420.dat",
    height: 0.4,
    origin: [-0.5, 0.2, -0.5],
  },
  "arch-1x4": { file: "3659.dat", height: 1.2 },

  // Common rectangular brick and plate families.
  "1x1": { file: "3005.dat", height: 1.2 },
  "1x3": { file: "3622.dat", height: 1.2 },
  "1x6": { file: "3009.dat", height: 1.2 },
  "1x8": { file: "3008.dat", height: 1.2 },
  "2x3": { file: "3002.dat", height: 1.2 },
  "2x6": { file: "2456.dat", height: 1.2 },
  "2x8": { file: "3007.dat", height: 1.2 },
  "plate-1x1": { file: "3024.dat", height: 0.4 },
  "plate-1x3": { file: "3623.dat", height: 0.4 },
  "plate-1x6": { file: "3666.dat", height: 0.4 },
  "plate-1x8": { file: "3460.dat", height: 0.4 },
  "plate-2x3": { file: "3021.dat", height: 0.4 },
  "plate-2x6": { file: "3795.dat", height: 0.4 },
  "plate-2x8": { file: "3034.dat", height: 0.4 },
};

function clean(n: number) {
  const value = Math.abs(n) < 1e-9 ? 0 : n;
  return Number(value.toFixed(6)).toString();
}

const standardColors: Record<string, number> = {
  "#05131D": 0, // Black
  "#0055BF": 1, // Blue
  "#237841": 2, // Green / Dark Green
  "#008F9B": 3, // Dark Turquoise
  "#C91A09": 4, // Red
  "#F2CD37": 14, // Yellow
  "#FE8A18": 25, // Orange
};

function ldrawColor(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid colour: ${hex}`);
  const normalized = hex.toUpperCase();
  return String(standardColors[normalized] ?? `0x2${normalized.slice(1)}`);
}

function ldrawVector(v: Vector3) {
  return new Vector3(v.x * LDU_PER_STUD, -v.y * LDU_PER_STUD, v.z * LDU_PER_STUD);
}

function matrixFor(rotation: Quaternion, yaw = 0) {
  const base = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  const total = rotation.clone().normalize().multiply(base);

  // Local LDraw uses +Y down, while brickids/Three.js uses +Y up.
  const x = new Vector3(1, 0, 0).applyQuaternion(total);
  const y = new Vector3(0, -1, 0).applyQuaternion(total);
  const z = new Vector3(0, 0, 1).applyQuaternion(total);
  x.y *= -1;
  y.y *= -1;
  z.y *= -1;

  return [
    x.x, y.x, z.x,
    x.y, y.y, z.y,
    x.z, y.z, z.z,
  ];
}

export function brickToLDrawLine(brick: SerializedBrick) {
  const part = ldrawParts[brick.spec];
  if (!part) throw new Error(`No LDraw mapping for brickids part: ${brick.spec}`);
  if (brick.p.length !== 3 || brick.q.length !== 4)
    throw new Error("Invalid brick transform");

  const position = new Vector3().fromArray(brick.p);
  const rotation = new Quaternion().fromArray(brick.q);
  if (rotation.lengthSq() < 1e-12) throw new Error("Invalid brick rotation");
  rotation.normalize();

  const [ox, oy, oz] = part.origin ?? [0, part.height / 2, 0];
  const origin = new Vector3(ox, oy, oz);
  const ldrawPosition = ldrawVector(
    origin.applyQuaternion(rotation).add(position),
  );
  const matrix = matrixFor(rotation, part.yaw);

  return [
    "1",
    ldrawColor(brick.color),
    clean(ldrawPosition.x),
    clean(ldrawPosition.y),
    clean(ldrawPosition.z),
    ...matrix.map(clean),
    part.file,
  ].join(" ");
}

export function foreignToLDrawLine(part: ForeignLDrawPartData) {
  if (
    part.p.length !== 3 ||
    part.q.length !== 4 ||
    !part.file ||
    part.file.includes("..") ||
    /^[a-z]+:/i.test(part.file)
  )
    throw new Error("Invalid foreign LDraw part");

  const position = ldrawVector(new Vector3().fromArray(part.p));
  const rotation = new Quaternion().fromArray(part.q);
  if (rotation.lengthSq() < 1e-12) throw new Error("Invalid foreign rotation");
  rotation.normalize();

  const color =
    /^(?:\d+|0x2[0-9a-f]{6})$/i.test(part.colorToken)
      ? part.colorToken
      : ldrawColor(part.color);

  return [
    "1",
    color,
    clean(position.x),
    clean(position.y),
    clean(position.z),
    ...matrixFor(rotation).map(clean),
    part.file,
  ].join(" ");
}

export function exportLDraw(scene: LDrawScene) {
  if (scene.version !== 1 || !Array.isArray(scene.bricks))
    throw new Error("Unsupported brickids scene");

  const lines = [
    "0 brickids scene",
    "0 Name: brickids-scene.ldr",
    "0 Author: brickids",
    "0 // Generated by brickids",
    "0 // 1 stud = 20 LDU; brickids +Y is converted to LDraw -Y",
    "0",
    ...scene.bricks.map(brickToLDrawLine),
    ...(scene.foreign ?? []).map(foreignToLDrawLine),
    "0",
  ];
  return lines.join("\r\n");
}
