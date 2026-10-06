import { test } from "node:test";
import assert from "node:assert/strict";
import { Matrix4, Vector3, Quaternion } from "three";
import { baseplateStudField, groundStyle } from "../src/scene/ground";

test("white baseplate is the default ground style", () => {
  assert.equal(groundStyle(null), "baseplate");
  assert.equal(groundStyle("unknown"), "baseplate");
  assert.equal(groundStyle("ivory"), "ivory");
});

test("baseplate stud field uses one instanced mesh on unit stud pitch", () => {
  const studs = baseplateStudField(8);
  assert.equal(studs.name, "baseplate-studs");
  assert.equal(studs.count, 64);

  const first = new Matrix4();
  const last = new Matrix4();
  studs.getMatrixAt(0, first);
  studs.getMatrixAt(63, last);

  const p0 = new Vector3(), p1 = new Vector3();
  first.decompose(p0, new Quaternion(), new Vector3());
  last.decompose(p1, new Quaternion(), new Vector3());
  assert.deepEqual(p0.toArray(), [-3.5, 0.09, -3.5]);
  assert.deepEqual(p1.toArray(), [3.5, 0.09, 3.5]);

  studs.geometry.dispose();
  if (Array.isArray(studs.material)) studs.material.forEach((m) => m.dispose());
  else studs.material.dispose();
});
