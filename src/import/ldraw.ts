import { Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import { ldrawParts, type LDrawScene } from "../export/ldraw";

const LDU_PER_STUD = 20;

const reverseParts = new Map<string, string>(
  Object.entries(ldrawParts).map(([spec, part]) => [part.file.toLowerCase(), spec]),
);

// Common legacy aliases for the same LDraw families used by brickids.
for (const [file, spec] of [
  ["3069.dat", "tile-1x2"],
  ["3068.dat", "tile-2x2"],
  ["3062.dat", "round-1x1"],
] as const)
  reverseParts.set(file, spec);

const standardColors = new Map<number, string>([
  [0, "#05131D"], // Black
  [1, "#0055BF"], // Blue
  [2, "#237841"], // Green
  [3, "#008F9B"], // Dark Turquoise
  [4, "#C91A09"], // Red
  [6, "#583927"], // Brown
  [7, "#A0A5A9"], // Light Gray
  [8, "#6C6E68"], // Dark Gray
  [9, "#6E99C9"], // Light Blue
  [10, "#4B9F4A"], // Bright Green
  [11, "#55A5AF"], // Light Turquoise
  [13, "#FC97AC"], // Pink
  [14, "#F2CD37"], // Yellow
  [15, "#F9F7F1"], // White
  [25, "#FE8A18"], // Orange
]);

export type LDrawImportReport = {
  scene: LDrawScene;
  imported: number;
  skipped: number;
  unsupportedParts: string[];
  unsupportedColors: string[];
  ignoredGeometryLines: number;
};

function normalizePartFile(value: string) {
  return value.trim().replace(/\\/g, "/").split("/").pop()!.toLowerCase();
}

function parseColor(value: string) {
  if (/^0x2[0-9a-f]{6}$/i.test(value))
    return { color: `#${value.slice(3).toUpperCase()}`, unsupported: null };

  const code = Number(value);
  if (Number.isSafeInteger(code) && standardColors.has(code))
    return { color: standardColors.get(code)!, unsupported: null };

  // LDraw colour 16 is inherited from a parent/submodel. Top-level flat LDR
  // has no parent colour in brickids, so keep it visible with a neutral fallback
  // and report it instead of silently dropping the part.
  return {
    color: "#A0A5A9",
    unsupported: Number.isFinite(code) ? String(code) : value,
  };
}

function matrixIsRigid(m: Matrix3) {
  const e = m.elements;
  const x = new Vector3(e[0], e[1], e[2]);
  const y = new Vector3(e[3], e[4], e[5]);
  const z = new Vector3(e[6], e[7], e[8]);
  const tolerance = 0.025;
  return (
    Math.abs(x.length() - 1) < tolerance &&
    Math.abs(y.length() - 1) < tolerance &&
    Math.abs(z.length() - 1) < tolerance &&
    Math.abs(x.dot(y)) < tolerance &&
    Math.abs(x.dot(z)) < tolerance &&
    Math.abs(y.dot(z)) < tolerance &&
    Math.abs(m.determinant() - 1) < 0.04
  );
}

function brickidsRotation(values: number[], yaw = 0) {
  const [a, b, c, d, e, f, g, h, i] = values;
  const ldraw = new Matrix3().set(a, b, c, d, e, f, g, h, i);
  if (!matrixIsRigid(ldraw)) return null;

  // Export uses M_ldraw = S * R_total * S, S = diag(1,-1,1).
  const world = new Matrix4().set(
    a, -b, c, 0,
    -d, e, -f, 0,
    g, -h, i, 0,
    0, 0, 0, 1,
  );
  const total = new Quaternion().setFromRotationMatrix(world).normalize();
  const partYaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  return total.multiply(partYaw.invert()).normalize();
}

function parseType1(line: string, id: number) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 15 || tokens[0] !== "1") throw new Error("Malformed LDraw type-1 line");

  const colorToken = tokens[1];
  const numbers = tokens.slice(2, 14).map(Number);
  if (numbers.some((value) => !Number.isFinite(value)))
    throw new Error("Invalid LDraw transform");

  const file = normalizePartFile(tokens.slice(14).join(" "));
  const spec = reverseParts.get(file);
  if (!spec) return { unsupportedPart: file };

  const part = ldrawParts[spec];
  const rotation = brickidsRotation(numbers.slice(3), part.yaw);
  if (!rotation) return { unsupportedPart: `${file} (non-rigid transform)` };

  const [x, y, z] = numbers;
  const originWorld = new Vector3(
    x / LDU_PER_STUD,
    -y / LDU_PER_STUD,
    z / LDU_PER_STUD,
  );
  const [ox, oy, oz] = part.origin ?? [0, part.height / 2, 0];
  const position = originWorld.sub(
    new Vector3(ox, oy, oz).applyQuaternion(rotation),
  );

  const parsedColor = parseColor(colorToken);
  return {
    brick: {
      id,
      spec,
      color: parsedColor.color,
      p: position.toArray(),
      q: rotation.toArray(),
    },
    unsupportedColor: parsedColor.unsupported,
  };
}

export function importLDraw(source: string): LDrawImportReport {
  if (/^\s*0\s+FILE\s+/im.test(source))
    throw new Error("MPD is not supported yet");

  const bricks: LDrawScene["bricks"] = [];
  const unsupportedParts = new Set<string>();
  const unsupportedColors = new Set<string>();
  let ignoredGeometryLines = 0;

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const type = line.split(/\s+/, 1)[0];

    if (type === "0") continue;
    if (type !== "1") {
      if (["2", "3", "4", "5"].includes(type)) ignoredGeometryLines++;
      continue;
    }

    const parsed = parseType1(line, bricks.length + 1);
    if ("unsupportedPart" in parsed) {
      unsupportedParts.add(parsed.unsupportedPart);
      continue;
    }
    if (parsed.unsupportedColor) unsupportedColors.add(parsed.unsupportedColor);
    bricks.push(parsed.brick);
    if (bricks.length > 250) throw new Error("Too many supported parts");
  }

  if (!bricks.length && unsupportedParts.size === 0)
    throw new Error("No LDraw parts found");

  return {
    scene: { version: 1, bricks, links: [] } as LDrawScene,
    imported: bricks.length,
    skipped: unsupportedParts.size,
    unsupportedParts: [...unsupportedParts].sort(),
    unsupportedColors: [...unsupportedColors].sort(),
    ignoredGeometryLines,
  };
}
