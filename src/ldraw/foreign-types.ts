export type ForeignLDrawPartData = {
  /** Negative IDs keep foreign parts disjoint from BrickWorld's positive IDs. */
  id: number;
  file: string;
  /** Effective display colour after MPD colour inheritance. */
  color: string;
  /** Original/effective LDraw colour token for lossless re-export. */
  colorToken: string;
  /** brickids-space position of the LDraw part origin. */
  p: number[];
  /** brickids-space rigid rotation of the LDraw part axes. */
  q: number[];
};
