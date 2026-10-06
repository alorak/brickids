/** Shared geometry for the visual/logical baseplate grid. */
export const BASEPLATE_STUD_SPACING = 1;
export const BASEPLATE_STUD_PHASE = 0.5;
export const BASEPLATE_VISUAL_SPAN = 240;

export function nearestBaseplateStud(value: number) {
  return (
    Math.round(
      (value - BASEPLATE_STUD_PHASE) / BASEPLATE_STUD_SPACING,
    ) *
      BASEPLATE_STUD_SPACING +
    BASEPLATE_STUD_PHASE
  );
}
