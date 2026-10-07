import * as T from "three";
import { brickMesh } from "../engine/geometry";
import type { BrickSpec } from "../engine/catalog";
/** One reused context, cached images, the same geometry as the actual workspace. */
export function partPreviews() {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(260, 170, false);
  renderer.setClearColor(0, 0);
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0x777766, 2));
  const light = new T.DirectionalLight(0xffffff, 3);
  light.position.set(-3, 8, 5);
  scene.add(light);
  const camera = new T.OrthographicCamera(-3, 3, 1.95, -1.95, 0.1, 50);
  camera.position.set(5, 5, 7);
  camera.lookAt(0, 0, 0);
  const cache = new Map<string, string>();

  const cropTransparent = () => {
    const source = renderer.domElement;
    const scan = document.createElement("canvas");
    scan.width = source.width;
    scan.height = source.height;
    const context = scan.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, scan.width, scan.height).data;
    let minX = scan.width,
      minY = scan.height,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < scan.height; y++)
      for (let x = 0; x < scan.width; x++) {
        if (pixels[(y * scan.width + x) * 4 + 3] < 8) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    if (maxX < minX || maxY < minY) return source.toDataURL();
    const margin = 7;
    minX = Math.max(0, minX - margin);
    minY = Math.max(0, minY - margin);
    maxX = Math.min(scan.width - 1, maxX + margin);
    maxY = Math.min(scan.height - 1, maxY + margin);
    const output = document.createElement("canvas");
    output.width = maxX - minX + 1;
    output.height = maxY - minY + 1;
    output
      .getContext("2d")!
      .drawImage(
        source,
        minX,
        minY,
        output.width,
        output.height,
        0,
        0,
        output.width,
        output.height,
      );
    return output.toDataURL();
  };

  return (spec: BrickSpec, color: string) => {
    const key = spec.id + color;
    if (cache.has(key)) return cache.get(key)!;
    const mesh = brickMesh(spec, color);
    scene.add(mesh);
    // Keep long imported/native families (1×8, 2×8, etc.) inside the
    // thumbnail instead of clipping them against the fixed orthographic frame.
    camera.zoom = Math.min(1, 4.8 / Math.max(spec.cols, spec.rows));
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const image = cropTransparent();
    cache.set(key, image);
    scene.remove(mesh);
    const materials = new Set<T.Material>();
    mesh.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        materials.add(o.material);
      }
    });
    materials.forEach((m) => m.dispose());
    return image;
  };
}
