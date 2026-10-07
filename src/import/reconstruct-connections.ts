import { Quaternion, Vector3 } from "three";
import { catalog } from "../engine/catalog";
import { mating, type Pose } from "../engine/connections";

export type ImportedBrickPose = {
  id: number;
  spec: string;
  color: string;
  p: number[];
  q: number[];
};

export type ReconstructedLink = {
  a: number;
  b: number;
  studs: number;
};

export type ConnectionReconstruction = {
  links: ReconstructedLink[];
  candidatePairs: number;
};

const MAX_POSITION_CORRECTION = 0.06;
const MAX_ROTATION_CORRECTION = 0.025;

function poseOf(brick: ImportedBrickPose): Pose | null {
  const spec = catalog.find((candidate) => candidate.id === brick.spec);
  if (!spec || brick.p.length !== 3 || brick.q.length !== 4) return null;
  const rotation = new Quaternion().fromArray(brick.q);
  if (rotation.lengthSq() < 1e-12) return null;
  return {
    id: brick.id,
    spec,
    position: new Vector3().fromArray(brick.p),
    rotation: rotation.normalize(),
  };
}

function strictContact(upper: Pose, lower: Pose) {
  const fit = mating(upper, lower, 0.08);
  if (!fit) return null;
  if (fit.position.distanceTo(upper.position) > MAX_POSITION_CORRECTION)
    return null;
  if (fit.rotation.angleTo(upper.rotation) > MAX_ROTATION_CORRECTION)
    return null;
  return fit;
}

/**
 * Rebuild native brickids stud/socket links from imported LDraw transforms.
 *
 * LDraw stores part transforms, not application-level joints. For each native
 * part pair we therefore reuse brickids' strict mating rules and only create a
 * link when the imported pose already lies on the valid connector pose. This
 * deliberately avoids the more permissive interactive placement assistance.
 */
export function reconstructConnections(
  bricks: ImportedBrickPose[],
): ConnectionReconstruction {
  const poses = bricks
    .map((brick) => poseOf(brick))
    .filter((pose): pose is Pose => !!pose);
  const links: ReconstructedLink[] = [];
  let candidatePairs = 0;

  for (let i = 0; i < poses.length; i++) {
    for (let j = i + 1; j < poses.length; j++) {
      const first = poses[i],
        second = poses[j];

      // Fast vertical/centre rejection. mating() remains the authority; this
      // only avoids expensive connector comparisons for obviously distant parts.
      const reach =
        (first.spec.height + second.spec.height) / 2 + 0.08;
      const centreDistance = first.position.distanceTo(second.position);
      const horizontalReach =
        Math.hypot(
          (first.spec.cols + second.spec.cols) / 2,
          (first.spec.rows + second.spec.rows) / 2,
        ) + 0.25;
      if (centreDistance > Math.hypot(horizontalReach, reach) + 0.1) continue;

      candidatePairs++;
      const firstOnSecond = strictContact(first, second);
      const secondOnFirst = strictContact(second, first);

      // A valid stud/socket interface has one unambiguous upper->lower
      // direction. If malformed geometry somehow satisfies both directions,
      // skip it rather than inventing a cyclic two-way relation.
      if (!!firstOnSecond === !!secondOnFirst) continue;

      if (firstOnSecond) {
        links.push({
          a: first.id,
          b: second.id,
          studs: firstOnSecond.count,
        });
      } else if (secondOnFirst) {
        links.push({
          a: second.id,
          b: first.id,
          studs: secondOnFirst.count,
        });
      }
    }
  }

  return { links, candidatePairs };
}
