import * as T from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Language } from "./i18n";
import { bindTouchGestures, type TouchActions } from "./input/touch";
import { setupMobileHud } from "./mobile-hud";

const labels = {
  en: {
    ready: "Aligned · tap Connect",
    demoHint: "The red brick is ready. Tap Connect.",
    help: "Tap a brick to select it. Drag a brick directly to move it, drag empty space to orbit, use two fingers to pan and pinch to zoom. The small controls around the workspace move, rotate and connect the selected brick. Double-tap a brick to separate it from the brick directly below. The compact library stays available at the bottom: swipe it sideways to browse, tap a part to add it, or pull a part upward into the workspace.",
  },
  tr: {
    ready: "Hizalandı · Birleştir'e dokun",
    demoHint: "Kırmızı parça hazır. Birleştir'e dokun.",
    help: "Seçmek için parçaya dokun. Parçayı doğrudan sürükleyerek taşı, boş alanda sürükleyerek kamerayı döndür; iki parmakla kaydır ve yakınlaştır. Çalışma alanındaki küçük kontroller seçili parçayı taşır, döndürür ve birleştirir. Bir parçaya çift dokununca altındaki parçadan ayrılır. Alttaki kompakt Library açık kalır: yana kaydırarak parçalara göz at, dokunarak ekle veya parçayı yukarı doğru çalışma alanına sürükle.",
  },
};
type Label = keyof typeof labels.en;
interface MobileOptions {
  canvas: HTMLCanvasElement;
  camera: T.PerspectiveCamera;
  controls: OrbitControls;
  language(): Language;
  drag: Pick<TouchActions, "start" | "move" | "end" | "doubleTap">;
  cancel(): void;
  rotate(axis: "x" | "y" | "z"): void;
  translateBrick(delta: T.Vector3): void;
  setLibraryOpen(open: boolean): void;
}
export function setupMobile(options: MobileOptions) {
  const { canvas, camera, controls } = options;
  const root = document.documentElement;
  // Coarse-primary-pointer devices opt in to touch gestures; desktop stays unchanged.
  const compact = matchMedia("(pointer: coarse)");
  const text = (key: Label) => labels[options.language()][key];
  const help = document.createElement("p");
  help.className = "touch-help touch-only";
  help.dataset.touchT = "help";
  document.querySelector("#help-dialog > p")!.before(help);

  function zoom(factor: number) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = T.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
  }
  const touch = bindTouchGestures(canvas, {
    ...options.drag,
    orbit(dx, dy) {
      const spherical = new T.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      const scale = (2 * Math.PI) / Math.max(1, canvas.clientHeight);
      spherical.theta -= dx * scale;
      spherical.phi = T.MathUtils.clamp(spherical.phi - dy * scale, Math.max(0.01, controls.minPolarAngle), controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(spherical));
      controls.update();
    },
    panZoom(before, after) {
      camera.updateMatrix();
      const scale = 2 * camera.position.distanceTo(controls.target) * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, canvas.clientHeight);
      const pan = new T.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar((before.x - after.x) * scale)
        .addScaledVector(new T.Vector3().setFromMatrixColumn(camera.matrix, 1), (after.y - before.y) * scale);
      camera.position.add(pan);
      controls.target.add(pan);
      zoom(before.distance / after.distance);
    },
  }, () => false);

  const hud = setupMobileHud({
    language: options.language,
    rotate: options.rotate,
    cancelScene: options.cancel,
    move(x, y) {
      const forward = controls.target.clone().sub(camera.position).setY(0).normalize();
      const right = new T.Vector3().crossVectors(forward, new T.Vector3(0, 1, 0));
      options.translateBrick(right.multiplyScalar(x).addScaledVector(forward, -y));
    },
  });
  function translate() {
    document.querySelectorAll<HTMLElement>("[data-touch-t]").forEach(el => {
      el.textContent = text(el.dataset.touchT as Label);
    });
    root.dataset.controlMode = "touch";
    hud.translate();
  }
  function layout() {
    touch.cancel();
    hud.cancel();
    hud.collapse();
    root.classList.toggle("touch-layout", compact.matches);
    translate();
  }
  compact.addEventListener("change", layout);
  layout();
  return {
    get enabled() { return compact.matches; },
    get cameraMode() { return false; },
    text,
    translate,
    refreshSelection: hud.refresh,
    selected: hud.selected,
    collapse: hud.collapse,
    cancel() { touch.cancel(); hud.cancel(); },
  };
}
