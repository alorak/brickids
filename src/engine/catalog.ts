/** Geometry and connector spacing share one definition; one unit is one stud pitch. */
export interface BrickSpec {
  id: string;
  cols: number;
  rows: number;
  height: number;
  label: string;
  labelTr?: string;
  shape?: "round" | "slope" | "corner" | "arch";
  family?: "plate" | "tile" | "special";
  top?: "none" | "back";
}
export const catalog: BrickSpec[] = [
  { id: "1x2", cols: 2, rows: 1, height: 1.2, label: "1 × 2" },
  { id: "2x2", cols: 2, rows: 2, height: 1.2, label: "2 × 2" },
  { id: "2x4", cols: 4, rows: 2, height: 1.2, label: "2 × 4" },
  {
    id: "plate-1x2",
    cols: 2,
    rows: 1,
    height: 0.4,
    label: "Plate 1 × 2",
    labelTr: "Plaka 1 × 2",
    family: "plate",
  },
  {
    id: "plate-2x4",
    cols: 4,
    rows: 2,
    height: 0.4,
    label: "Plate 2 × 4",
    labelTr: "Plaka 2 × 4",
    family: "plate",
  },
  {
    id: "tile-1x2",
    cols: 2,
    rows: 1,
    height: 0.4,
    label: "Tile 1 × 2",
    labelTr: "Karo 1 × 2",
    family: "tile",
    top: "none",
  },
  {
    id: "tile-2x2",
    cols: 2,
    rows: 2,
    height: 0.4,
    label: "Tile 2 × 2",
    labelTr: "Karo 2 × 2",
    family: "tile",
    top: "none",
  },
  {
    id: "round-1x1",
    cols: 1,
    rows: 1,
    height: 1.2,
    label: "Round brick 1 × 1",
    labelTr: "Yuvarlak 1 × 1",
    shape: "round",
    family: "special",
  },
  {
    id: "round-plate-1x1",
    cols: 1,
    rows: 1,
    height: 0.4,
    label: "Round plate 1 × 1",
    labelTr: "Yuvarlak plaka 1 × 1",
    shape: "round",
    family: "plate",
  },
  {
    id: "slope-2x2",
    cols: 2,
    rows: 2,
    height: 1.2,
    label: "Slope 2 × 2",
    labelTr: "Eğimli 2 × 2",
    shape: "slope",
    family: "special",
    top: "back",
  },
  {
    id: "cheese-1x1",
    cols: 1,
    rows: 1,
    height: 0.8,
    label: "Cheese slope 1 × 1",
    labelTr: "Mini eğim 1 × 1",
    shape: "slope",
    family: "special",
    top: "none",
  },
  {
    id: "corner-plate-2x2",
    cols: 2,
    rows: 2,
    height: 0.4,
    label: "Corner plate 2 × 2",
    labelTr: "Köşe plaka 2 × 2",
    shape: "corner",
    family: "plate",
  },
  {
    id: "arch-1x4",
    cols: 4,
    rows: 1,
    height: 1.2,
    label: "Arch 1 × 4",
    labelTr: "Kemer 1 × 4",
    shape: "arch",
    family: "special",
  },
  { id: "1x4", cols: 4, rows: 1, height: 1.2, label: "1 × 4" },
];
/** BrickLink-oriented display palette used by the UI and brick materials.
 * IDs are kept beside the colour so the mapping is explicit and testable.
 */
export const colorPalette = [
  { name: "Red", legoName: "Bright Red", legoId: 21, bricklinkId: 5, hex: "#C91A09" },
  { name: "Blue", legoName: "Bright Blue", legoId: 23, bricklinkId: 7, hex: "#0055BF" },
  { name: "Yellow", legoName: "Bright Yellow", legoId: 24, bricklinkId: 3, hex: "#F2CD37" },
  { name: "Green", legoName: "Dark Green", legoId: 28, bricklinkId: 6, hex: "#237841" },
  { name: "Orange", legoName: "Bright Orange", legoId: 106, bricklinkId: 4, hex: "#FE8A18" },
  { name: "Dark Turquoise", legoName: "Bright Bluish Green", legoId: 107, bricklinkId: 39, hex: "#008F9B" },
  { name: "Black", legoName: "Black", legoId: 26, bricklinkId: 11, hex: "#05131D" },
  { name: "White", legoName: "White", legoId: 1, bricklinkId: 1, hex: "#FFFFFF" },
] as const;
export const colors: string[] = colorPalette.map((c) => c.hex);
export function partLabel(s: BrickSpec, language: string) {
  return language === "tr" ? (s.labelTr ?? s.label) : s.label;
}
/** Studs and sockets are independent: smooth and sloped surfaces are not studs. */
export function connectors(s: BrickSpec, side: "top" | "bottom" = "top") {
  if (side === "top" && s.top === "none") return [];
  return Array.from({ length: s.cols * s.rows }, (_, i) => ({
    x: (i % s.cols) - (s.cols - 1) / 2,
    z: Math.floor(i / s.cols) - (s.rows - 1) / 2,
  })).filter((p) => {
    if (s.shape === "corner" && p.x > 0 && p.z > 0) return false;
    if (
      side === "bottom" &&
      s.shape === "arch" &&
      Math.abs(p.x) < s.cols / 2 - 1
    )
      return false;
    if (side === "top" && s.top === "back" && p.z > 0) return false;
    return true;
  });
}
