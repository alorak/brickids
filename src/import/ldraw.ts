import { Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import { ldrawParts } from "../export/ldraw";

const LDU_PER_STUD = 20;
const MAX_SUBMODEL_DEPTH = 32;

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

export type ImportedLDrawScene = {
  version: 1;
  bricks: Array<{
    id: number;
    spec: string;
    color: string;
    p: number[];
    q: number[];
  }>;
  links: [];
};

export type LDrawImportReport = {
  scene: ImportedLDrawScene;
  imported: number;
  skipped: number;
  unsupportedParts: string[];
  unsupportedColors: string[];
  ignoredGeometryLines: number;
  submodels: number;
  maxDepth: number;
};

type Type1Reference = {
  colorToken: string;
  position: Vector3;
  matrix: Matrix3;
  file: string;
};

type FlattenedReference = Type1Reference & {
  depth: number;
};

type ParsedType1 =
  | { unsupportedPart: string }
  | {
      brick: ImportedLDrawScene["bricks"][number];
      unsupportedColor: string | null;
    };

type MpdDocument = {
  root: string;
  files: Map<string, string[]>;
  aliases: Map<string, string | null>;
};

function normalizePartFile(value: string) {
  return value.trim().replace(/\\/g, "/").split("/").pop()!.toLowerCase();
}

function normalizeModelFile(value: string) {
  const trimmed = value.trim();
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function parseColor(value: string) {
  if (/^0x2[0-9a-f]{6}$/i.test(value))
    return { color: `#${value.slice(3).toUpperCase()}`, unsupported: null };

  const code = Number(value);
  if (Number.isSafeInteger(code) && standardColors.has(code))
    return { color: standardColors.get(code)!, unsupported: null };

  // LDraw colour 16 inherits from a containing submodel. If it reaches this
  // point there is no parent colour, so keep the part visible and report it.
  return {
    color: "#A0A5A9",
    unsupported: Number.isFinite(code) ? String(code) : value,
  };
}

function parseType1Reference(line: string): Type1Reference {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 15 || tokens[0] !== "1")
    throw new Error("Malformed LDraw type-1 line");

  const values = tokens.slice(2, 14).map(Number);
  if (values.some((value) => !Number.isFinite(value)))
    throw new Error("Invalid LDraw transform");

  const [x, y, z, a, b, c, d, e, f, g, h, i] = values;
  return {
    colorToken: tokens[1],
    position: new Vector3(x, y, z),
    matrix: new Matrix3().set(a, b, c, d, e, f, g, h, i),
    file: tokens.slice(14).join(" "),
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

function rowMajor(m: Matrix3) {
  const e = m.elements;
  return [
    e[0], e[3], e[6],
    e[1], e[4], e[7],
    e[2], e[5], e[8],
  ];
}

function brickidsRotation(matrix: Matrix3, yaw = 0) {
  if (!matrixIsRigid(matrix)) return null;
  const [a, b, c, d, e, f, g, h, i] = rowMajor(matrix);

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

function parseKnownPart(reference: FlattenedReference, id: number): ParsedType1 {
  const file = normalizePartFile(reference.file);
  const spec = reverseParts.get(file);
  if (!spec) return { unsupportedPart: file };

  const part = ldrawParts[spec];
  const rotation = brickidsRotation(reference.matrix, part.yaw);
  if (!rotation) return { unsupportedPart: `${file} (non-rigid transform)` };

  const originWorld = new Vector3(
    reference.position.x / LDU_PER_STUD,
    -reference.position.y / LDU_PER_STUD,
    reference.position.z / LDU_PER_STUD,
  );
  const [ox, oy, oz] = part.origin ?? [0, part.height / 2, 0];
  const position = originWorld.sub(
    new Vector3(ox, oy, oz).applyQuaternion(rotation),
  );

  const parsedColor = parseColor(reference.colorToken);
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

function parseMpd(source: string): MpdDocument | null {
  const files = new Map<string, string[]>();
  const order: string[] = [];
  let current: string | null = null;
  let sawFile = false;

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const fileMatch = line.match(/^0\s+FILE\s+(.+)$/i);
    if (fileMatch) {
      sawFile = true;
      const name = normalizeModelFile(fileMatch[1]);
      if (!name || files.has(name)) throw new Error("Duplicate MPD FILE name");
      files.set(name, []);
      order.push(name);
      current = name;
      continue;
    }
    if (/^0\s+NOFILE(?:\s|$)/i.test(line)) {
      current = null;
      continue;
    }
    if (current) files.get(current)!.push(raw);
  }

  if (!sawFile) return null;
  if (!order.length) throw new Error("MPD has no FILE sections");

  // MPD references normally use exact names. A unique basename alias also
  // makes common folder-prefixed references tolerant without creating
  // ambiguous resolution.
  const aliases = new Map<string, string | null>();
  for (const name of order) {
    const base = normalizePartFile(name);
    if (!aliases.has(base)) aliases.set(base, name);
    else if (aliases.get(base) !== name) aliases.set(base, null);
  }

  return { root: order[0], files, aliases };
}

function resolveSubmodel(document: MpdDocument, value: string) {
  const exact = normalizeModelFile(value);
  if (document.files.has(exact)) return exact;
  return document.aliases.get(normalizePartFile(value)) ?? null;
}

function compose(
  parentPosition: Vector3,
  parentMatrix: Matrix3,
  child: Type1Reference,
) {
  return {
    position: child.position.clone().applyMatrix3(parentMatrix).add(parentPosition),
    matrix: parentMatrix.clone().multiply(child.matrix),
  };
}

function flattenMpd(document: MpdDocument) {
  const references: FlattenedReference[] = [];
  let ignoredGeometryLines = 0;
  let maxDepth = 0;
  const expandedSubmodels = new Set<string>();

  const visit = (
    name: string,
    parentPosition: Vector3,
    parentMatrix: Matrix3,
    inheritedColor: string | null,
    stack: string[],
    depth: number,
  ) => {
    if (depth > MAX_SUBMODEL_DEPTH)
      throw new Error("MPD submodel nesting is too deep");
    if (stack.includes(name))
      throw new Error(`Cyclic MPD submodel reference: ${[...stack, name].join(" -> ")}`);

    maxDepth = Math.max(maxDepth, depth);
    if (depth > 0) expandedSubmodels.add(name);
    const lines = document.files.get(name);
    if (!lines) throw new Error(`Missing MPD submodel: ${name}`);
    const nextStack = [...stack, name];

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("0")) continue;
      const type = line.split(/\s+/, 1)[0];
      if (type !== "1") {
        if (["2", "3", "4", "5"].includes(type)) ignoredGeometryLines++;
        continue;
      }

      const child = parseType1Reference(line);
      const colorToken =
        child.colorToken === "16"
          ? inheritedColor ?? "16"
          : child.colorToken;
      const combined = compose(parentPosition, parentMatrix, child);
      const submodel = resolveSubmodel(document, child.file);

      if (submodel) {
        visit(
          submodel,
          combined.position,
          combined.matrix,
          colorToken,
          nextStack,
          depth + 1,
        );
      } else {
        references.push({
          ...child,
          ...combined,
          colorToken,
          depth,
        });
      }
    }
  };

  visit(
    document.root,
    new Vector3(),
    new Matrix3(),
    null,
    [],
    0,
  );

  return {
    references,
    ignoredGeometryLines,
    submodels: expandedSubmodels.size,
    maxDepth,
  };
}

function flatReferences(source: string) {
  const references: FlattenedReference[] = [];
  let ignoredGeometryLines = 0;

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("0")) continue;
    const type = line.split(/\s+/, 1)[0];
    if (type !== "1") {
      if (["2", "3", "4", "5"].includes(type)) ignoredGeometryLines++;
      continue;
    }
    references.push({
      ...parseType1Reference(line),
      depth: 0,
    });
  }

  return {
    references,
    ignoredGeometryLines,
    submodels: 0,
    maxDepth: 0,
  };
}

export function importLDraw(source: string): LDrawImportReport {
  const mpd = parseMpd(source);
  const flattened = mpd ? flattenMpd(mpd) : flatReferences(source);

  const bricks: ImportedLDrawScene["bricks"] = [];
  const unsupportedParts = new Set<string>();
  const unsupportedColors = new Set<string>();
  let skipped = 0;

  for (const reference of flattened.references) {
    const parsed = parseKnownPart(reference, bricks.length + 1);
    if ("unsupportedPart" in parsed) {
      unsupportedParts.add(parsed.unsupportedPart);
      skipped++;
      continue;
    }
    if (parsed.unsupportedColor) unsupportedColors.add(parsed.unsupportedColor);
    bricks.push(parsed.brick);
    if (bricks.length > 250) throw new Error("Too many supported parts");
  }

  if (!bricks.length && unsupportedParts.size === 0)
    throw new Error("No LDraw parts found");

  return {
    scene: { version: 1, bricks, links: [] },
    imported: bricks.length,
    skipped,
    unsupportedParts: [...unsupportedParts].sort(),
    unsupportedColors: [...unsupportedColors].sort(),
    ignoredGeometryLines: flattened.ignoredGeometryLines,
    submodels: flattened.submodels,
    maxDepth: flattened.maxDepth,
  };
}
