import { partPreviews } from "./scene/part-preview";
import { baseplateStudField, groundController } from "./scene/ground";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { seamSegments, visibleSeamHit } from "./engine/seams";
import { BrickWorld, type Brick, type Connection } from "./engine/world";
import { rotationAt, TURN_DURATION_MS } from "./engine/rotation";
import { dragTarget } from "./engine/drag";
import { BrickAudio } from "./engine/audio";
import { catalog, colorPalette, colors, partLabel } from "./engine/catalog";
import { bricklinkColors } from "./bricklink-colors";
import { component } from "./engine/connections";
import { messages, type Language } from "./i18n";
import { exportLDraw } from "./export/ldraw";
import { importLDraw, type LDrawImportReport } from "./import/ldraw";
import {
  ForeignLDrawWorld,
  isValidForeignPartList,
  type ForeignLDrawPart,
} from "./import/foreign-world";
import { setupMobile } from "./mobile";
import type { TouchPoint } from "./input/touch";
import "./style.css";
import "./mobile.css";
let mobile: ReturnType<typeof setupMobile> | undefined;
let language: Language =
  localStorage.getItem("bricks-language") === "tr" ? "tr" : "en";
const SAVED_SCENE_KEY = "brickids-scene";
const OTHER_COLOR_KEY = "brickids-other-color-id";
const savedOtherColorId = Number(localStorage.getItem(OTHER_COLOR_KEY) ?? 1);
let otherColor =
  bricklinkColors.find((color) => color.id === savedOtherColorId) ??
  bricklinkColors.find((color) => color.id === 1)!;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<canvas id="world" aria-label="3D brick workspace"></canvas><header><a class="brand" href="./" aria-label="brickids"><span class="brand-main">brick</span><span class="brand-accent">ids</span></a><div class="top-actions"><button id="sound" class="icon-button" aria-pressed="true"></button><button id="physics" class="icon-button" aria-pressed="false"></button><button id="scene-menu-toggle" class="header-tool" aria-haspopup="dialog"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 9h9l2 3h11v14H5z"></path><path d="M9 17h14M9 21h10"></path></svg></button></div></header><aside id="library"><div id="library-titlebar" class="library-titlebar" role="button" tabindex="0" aria-controls="library-body" aria-expanded="true"><svg class="library-title-icon" viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="7" width="10" height="8" rx="2"></rect><rect x="18" y="7" width="10" height="8" rx="2"></rect><rect x="4" y="18" width="10" height="8" rx="2"></rect><rect x="18" y="18" width="10" height="8" rx="2"></rect></svg><span class="library-title-line"></span><svg class="library-title-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></div><div id="library-body" class="library-body"><div id="swatches"></div><div class="library-parts-scroll"><div id="core-cards" class="cards-grid"></div><button id="more-parts" class="more-parts" aria-expanded="false" aria-controls="more-cards"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></button><div id="more-cards" class="cards-grid more-cards" hidden></div></div></div></aside><section id="selection" class="selection" hidden><div id="selection-content"></div></section><div class="bottom-center"><div id="alignment" role="status"></div></div><div id="toast" role="status"></div><dialog id="scene-dialog" class="scene-dialog"><button id="close-scene-menu" class="close">×</button><div class="scene-menu-grid"><button id="scene-save" class="scene-menu-action"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 5h16l4 4v18H7z"></path><path d="M11 5v8h11V5M11 21h12"></path></svg><span data-t="save"></span></button><button id="scene-import" class="scene-menu-action"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 9h9l2 3h9v14H6z"></path><path d="M16 22V14M12 18l4-4 4 4"></path></svg><span data-t="importScene"></span></button><button id="scene-export" class="scene-menu-action"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 9h9l2 3h9v14H6z"></path><path d="M16 14v8M12 18l4 4 4-4"></path></svg><span data-t="exportScene"></span></button><button id="scene-export-ldr" class="scene-menu-action"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 4h11l5 5v19H8z"></path><path d="M19 4v6h6"></path><path d="M11 22h10M11 18h10M11 14h6"></path></svg><span data-t="exportLdraw"></span></button><button id="scene-new" class="scene-menu-action danger"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 8h16v16H8z"></path><path d="M12 16h8M16 12v8"></path></svg><span data-t="newScene"></span></button></div><div class="scene-language"><button data-lang="en">EN</button><button data-lang="tr">TR</button></div></dialog><dialog id="color-dialog" class="color-dialog"><button id="close-color-dialog" class="close" aria-label="Close colors">×</button><div class="color-picker-top"><input id="color-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search colors" aria-label="Search BrickLink colors"></div><div id="color-grid" class="color-grid"></div></dialog><dialog id="delete-dialog" class="delete-dialog"><div class="delete-prompt">DELETE?</div><div class="delete-confirm-actions"><button id="delete-confirm" class="delete-confirm-yes" aria-label="Confirm delete"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m7 17 6 6L26 9"></path></svg></button><button id="delete-cancel" class="delete-confirm-no" aria-label="Cancel delete"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 9l14 14M23 9 9 23"></path></svg></button></div></dialog><dialog id="help-dialog"><button id="close-help" class="close">×</button><div class="eyebrow" data-t="shortcuts"></div><h2 data-t="help"></h2><button id="demo" class="text-button" data-t="demo"></button><p data-t="helpText"></p><div class="key-row"><kbd>Q</kbd><kbd>E</kbd><span data-t="lift"></span></div><div class="key-row"><kbd>R</kbd><kbd>.</kbd><span data-t="axisY"></span></div><div class="key-row"><kbd>X</kbd><kbd>Z</kbd><span data-t="tiltAxes"></span></div><div class="key-row"><kbd data-t="doubleClick"></kbd><span data-t="seamHelp"></span></div><div class="key-row"><kbd>Delete</kbd><kbd>Backspace</kbd><span data-t="delete"></span></div><div class="key-row"><kbd>Space</kbd><span data-t="press"></span></div></dialog><input type="file" id="file" accept=".json,.ldr,.mpd" hidden><div id="loading" data-t="loading"></div>`;
const $ = <E extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<E>(s)!;
const text = (key: keyof typeof messages.en) => messages[language][key];
const audio = new BrickAudio();
const canvas = $<HTMLCanvasElement>("#world");
canvas.tabIndex = 0;
const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
// Keep material hues close to the CSS/BrickLink swatches. ACES + warm,
// high-intensity lighting was visibly washing saturated LEGO colours toward
// pastel tones.
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.NeutralToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new T.Scene();
scene.background = new T.Color("#f3f0e9");
const camera = new T.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 700);
camera.position.set(14, 15, 19);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 5;
controls.maxDistance = 110;
controls.mouseButtons = {
  LEFT: T.MOUSE.ROTATE,
  MIDDLE: T.MOUSE.DOLLY,
  RIGHT: T.MOUSE.PAN,
};
const pmrem = new T.PMREMGenerator(renderer),
  room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
scene.environmentIntensity = 0.22;
room.dispose();
pmrem.dispose();
scene.add(new T.HemisphereLight(0xffffff, 0xdfe3e0, 0.48));
const sun = new T.DirectionalLight(0xffffff, 1.35);
sun.position.set(-7, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -20,
  right: 20,
  top: 20,
  bottom: -20,
  near: 1,
  far: 55,
});
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 3;
scene.add(sun);
const floor = new T.Mesh(
  new T.PlaneGeometry(600, 600),
  new T.MeshStandardMaterial({ color: "#f0ede5", roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// A wider instanced stud field keeps the baseplate continuous across the extended zoom range.
const baseplate = baseplateStudField();
scene.add(baseplate);
const grid = new T.GridHelper(70, 70, 0xd4d0c6, 0xe0dcd3);
grid.position.y = 0.003;
(grid.material as T.Material).transparent = true;
(grid.material as T.Material).opacity = 0.42;
scene.add(grid);
const applyGround = groundController(
  floor.material,
  grid,
  baseplate,
  renderer.capabilities.getMaxAnisotropy(),
);
// The simplified library is intentionally dedicated to the LEGO-style baseplate.
applyGround("baseplate");

const world = new BrickWorld(scene, (v) => audio.play(v));
const foreignWorld = new ForeignLDrawWorld(scene);
const scenePartCount = () => world.bricks.length + foreignWorld.parts.length;
type SelectablePart = Brick | ForeignLDrawPart;
const isForeignPart = (part: SelectablePart | null): part is ForeignLDrawPart =>
  part?.kind === "foreign";
let selected: SelectablePart | null = null,
  currentColor = colors[0],
  panelOpen = true,
  toastTimer = 0,
  dirty = true;
let pressing: null | {
  start: number;
  id: number;
  anchor: number;
  origin: T.Vector3;
  target: T.Vector3;
  fromRotation: T.Quaternion;
  rotation: T.Quaternion;
} = null;
let turning: null | {
  id: number;
  start: number;
  position: T.Vector3;
  from: T.Quaternion;
  to: T.Quaternion;
  label: string;
} = null;
const rotationAxis = new T.ArrowHelper(
  new T.Vector3(0, 1, 0),
  new T.Vector3(),
  4,
  0x628b65,
  0.3,
  0.16,
);
rotationAxis.visible = false;
scene.add(rotationAxis);
function cancelTurn() {
  turning = null;
  rotationAxis.visible = false;
}
function beginTurn(to: T.Quaternion, label: string) {
  if (!selected || isForeignPart(selected) || turning || pressing) return;
  if (!world.held.has(selected.id)) world.grab(selected.id);
  const from = selected.rotation.clone();
  if (from.angleTo(to) < 1e-6) return;
  const delta = to.clone().multiply(from.clone().invert()).normalize();
  if (delta.w < 0) {
    delta.x *= -1;
    delta.y *= -1;
    delta.z *= -1;
    delta.w *= -1;
  }
  const axis = new T.Vector3(delta.x, delta.y, delta.z).normalize();
  rotationAxis.setDirection(axis);
  rotationAxis.position.copy(selected.position).addScaledVector(axis, -2);
  rotationAxis.setColor(
    Math.abs(axis.y) > 0.9
      ? 0x628b65
      : Math.abs(axis.x) > 0.9
        ? 0xc55a49
        : 0x4c80ae,
  );
  rotationAxis.visible = true;
  turning = {
    id: selected.id,
    start: performance.now(),
    position: selected.position.clone(),
    from,
    to,
    label,
  };
  dirty = true;
}
const seamLines = new Map<Connection, T.LineSegments>();
const seamDark = new T.Color(0x17324a);
const seamLight = new T.Color(0xf7fbff);
function seamColor(link: Connection) {
  const color = new T.Color(world.get(link.a).color);
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  return color.lerp(luminance > 0.52 ? seamDark : seamLight, 0.48);
}
function updateSeams() {
  const members =
    selected && !isForeignPart(selected) && !turning && !pressing
      ? component(selected.id, world.links)
      : new Set<number>();
  // Keep every real LEGO-to-LEGO contact slightly legible. The selected
  // assembly gets a stronger version of the same part-aware seam.
  const active = new Set(world.links);
  for (const [link, line] of seamLines)
    if (!active.has(link)) {
      scene.remove(line);
      line.geometry.dispose();
      (line.material as T.Material).dispose();
      seamLines.delete(link);
    }
  for (const link of active) {
    let line = seamLines.get(link);
    if (!line) {
      line = new T.LineSegments(
        new T.BufferGeometry().setAttribute(
          "position",
          new T.Float32BufferAttribute(new Float32Array(12), 3),
        ),
        new T.LineBasicMaterial({
          color: seamColor(link),
          transparent: true,
          opacity: 0.28,
          depthTest: true,
          depthWrite: false,
        }),
      );
      line.userData.link = link;
      seamLines.set(link, line);
      scene.add(line);
    }
    const focused = members.has(link.a);
    const material = line.material as T.LineBasicMaterial;
    material.color.copy(seamColor(link));
    material.opacity = focused ? 0.82 : 0.28;
    line.userData.interactive = focused;
    line.renderOrder = focused ? 3 : 2;
    const points = seamSegments(world.get(link.a), world.get(link.b));
    line.visible = points.length > 0;
    if (points.length) {
      if (line.geometry.getAttribute("position").count !== points.length)
        line.geometry.setAttribute(
          "position",
          new T.Float32BufferAttribute(new Float32Array(points.length * 3), 3),
        );
      const position = line.geometry.getAttribute(
        "position",
      ) as T.BufferAttribute;
      points.forEach((p, i) => position.setXYZ(i, p.x, p.y, p.z));
      position.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.updateMatrixWorld();
    }
  }
}
const outline = new T.BoxHelper(new T.Object3D(), 0x5c8070);
outline.visible = false;
scene.add(outline);
const ghost = new T.Mesh(
  new T.PlaneGeometry(1, 1),
  new T.MeshBasicMaterial({
    color: 0x54a981,
    transparent: true,
    opacity: 0.22,
    side: T.DoubleSide,
    depthWrite: false,
  }),
);
ghost.visible = false;
scene.add(ghost);
function toast(s: string) {
  $("#toast").textContent = s;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("#toast").classList.remove("visible"),
    3000,
  );
}
function translate() {
  document.documentElement.lang = language;
  document
    .querySelectorAll<HTMLElement>("[data-t]")
    .forEach(
      (el) => (el.textContent = text(el.dataset.t as keyof typeof messages.en)),
    );
  document
    .querySelectorAll<HTMLElement>("[data-lang]")
    .forEach((el) =>
      el.classList.toggle("active", el.dataset.lang === language),
    );
  $("#close-help").setAttribute("aria-label", language === "tr" ? "Yardımı kapat" : "Close help");
  $("#close-scene-menu").setAttribute("aria-label", language === "tr" ? "Menüyü kapat" : "Close menu");
  renderSoundButton();
  renderPhysicsButton();
  $("#library-titlebar").setAttribute("aria-label", text("library"));
  $("#scene-menu-toggle").setAttribute("aria-label", text("sceneMenu"));
  $(".brand").setAttribute("aria-label", `brickids · ${text("save")}`);
  $(".brand").title = text("save");
  $("#more-parts").setAttribute("aria-label", text("moreParts"));
  setLibraryOpen(panelOpen);
  renderCards();
  mobile?.translate();
  dirty = true;
}
const previewPart = partPreviews();
const corePartIds = [
  "1x2",
  "1x4",
  "2x2",
  "2x4",
  "plate-1x2",
  "plate-1x4",
  "plate-2x2",
  "plate-2x4",
  "round-1x1",
  "slope-2x2",
] as const;
let morePartsOpen = false;
let libraryDragging = false;
function partCard(s: (typeof catalog)[number]) {
  const compact =
    s.id === "round-1x1"
      ? "1 × 1 Round"
      : s.id === "slope-2x2"
        ? "2 × 2 Slope"
        : partLabel(s, language);
  return `<button class="brick-card" draggable="false" data-spec="${s.id}" aria-label="${text("add")} ${partLabel(s, language)}"><img class="part-preview" src="${previewPart(s, currentColor)}" alt="" draggable="false"><span class="part-card-label">${compact}</span><span class="add-circle" aria-hidden="true">+</span></button>`;
}
function renderCards() {
  const core = corePartIds
    .map((id) => catalog.find((s) => s.id === id)!)
    .filter(Boolean);
  const extra = catalog.filter((s) => !corePartIds.includes(s.id as (typeof corePartIds)[number]));
  $("#core-cards").innerHTML = core.map(partCard).join("");
  $("#more-cards").innerHTML = extra.map(partCard).join("");
  $("#more-cards").hidden = !morePartsOpen;
  $("#more-parts").classList.toggle("open", morePartsOpen);
  $("#more-parts").setAttribute("aria-expanded", String(morePartsOpen));
  document.querySelectorAll<HTMLElement>("[data-spec]").forEach((el) => {
    el.onclick = () => {
      if (libraryDragging) return;
      placeLibraryPart(
        el.dataset.spec!,
        currentColor,
        new T.Vector3(controls.target.x, 0, controls.target.z),
      );
    };
    el.onpointerdown = (event) => {
      if (event.button !== 0) return;
      beginLibraryPointerDrag(el, event);
    };
  });
}
$("#more-parts").onclick = () => {
  morePartsOpen = !morePartsOpen;
  renderCards();
};
function select(b: SelectablePart | null) {
  cancelTurn();
  cancelPress();
  if (selected?.id !== b?.id) mobile?.selected();
  selected = b;
  dirty = true;
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}
function renderSelection() {
  const b = selected;
  $("#selection").hidden = !b;
  if (!b) {
    $("#selection-content").innerHTML = "";
    return;
  }

  if (isForeignPart(b)) {
    $("#selection-content").innerHTML = `
      <div class="selection-minimal foreign-selection">
        <div class="selected-part-thumb selected-part-thumb-large foreign-part-thumb" title="${escapeHtml(b.file)}">
          <span>LDRAW</span>
          <strong>${escapeHtml(b.file.split("/").pop() ?? b.file)}</strong>
        </div>
        <button class="selection-icon-button separate-icon" disabled
          aria-label="${text("detach")}" title="${text("detach")}">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <rect x="7" y="14" width="12" height="12" rx="2"></rect>
            <rect x="29" y="22" width="12" height="12" rx="2"></rect>
            <path d="M20 18h8M24 14l4 4-4 4M28 30h-8M24 26l-4 4 4 4"></path>
          </svg>
        </button>
        <button id="quick-rotate" class="selection-icon-button rotate-icon"
          aria-label="${text("rotate")}" title="${text("rotate")}">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M35 16a14 14 0 1 0 2.5 15"></path>
            <path d="M35 8v9h-9"></path>
          </svg>
        </button>
        <button id="quick-delete" class="selection-icon-button delete-icon"
          aria-label="${text("delete")}" title="${text("delete")}">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M15 17h18l-1.5 22h-15z"></path>
            <path d="M12 17h24M20 12h8l2 5H18zM21 22v11M27 22v11"></path>
          </svg>
        </button>
      </div>`;
    $("#quick-rotate").onclick = () => rotate("y");
    $("#quick-delete").onclick = deleteSelected;
    mobile?.refreshSelection();
    return;
  }

  const held = world.held.has(b.id),
    lowerLink = world.lowerConnection(b.id),
    links = world.links.filter((l) => component(b.id, world.links).has(l.a));

  // Keep the visible surface intentionally icon-first. The hidden bridge
  // preserves the existing mobile HUD actions without reintroducing text here.
  $("#selection-content").innerHTML = `
    <div class="selection-minimal">
      <div class="selected-part-thumb selected-part-thumb-large">
        <img src="${previewPart(b.spec, b.color)}" alt="" draggable="false">
      </div>
      <button id="quick-detach" class="selection-icon-button separate-icon" ${lowerLink ? "" : "disabled"}
        aria-label="${text("detach")}" title="${text("detach")}">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="7" y="14" width="12" height="12" rx="2"></rect>
          <rect x="29" y="22" width="12" height="12" rx="2"></rect>
          <path d="M20 18h8M24 14l4 4-4 4M28 30h-8M24 26l-4 4 4 4"></path>
        </svg>
      </button>
      <button id="quick-rotate" class="selection-icon-button rotate-icon"
        aria-label="${text("rotate")}" title="${text("rotate")}">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M35 16a14 14 0 1 0 2.5 15"></path>
          <path d="M35 8v9h-9"></path>
        </svg>
      </button>
      <button id="quick-delete" class="selection-icon-button delete-icon"
        aria-label="${text("delete")}" title="${text("delete")}">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M15 17h18l-1.5 22h-15z"></path>
          <path d="M12 17h24M20 12h8l2 5H18zM21 22v11M27 22v11"></path>
        </svg>
      </button>
    </div>
    <div class="selection-bridge" hidden>
      <div class="selected-title">
        <span class="color-chip" style="background:${b.color}"></span>
        <h3>${partLabel(b.spec, language)}</h3>
      </div>
      <button id="grab">${held ? text("drop") : text("grab")}</button>
      <button id="rotate">${text("rotate")}</button>
      <button id="upright">${text("upright")}</button>
      <button id="remove">${text("delete")}</button>
      <button id="down">−</button><button id="up">+</button>
      <button id="press" ${held ? "" : "disabled"}>${text("press")}</button>
      ${links.length ? `<select id="seams">${links.map((l) => `<option value="${world.links.indexOf(l)}">#${l.a} ↔ #${l.b}</option>`).join("")}</select><button id="detach">${text("detach")}</button>` : ""}
    </div>`;

  if (lowerLink) $("#quick-detach").onclick = () => separate(lowerLink);
  $("#quick-rotate").onclick = () => rotate("y");
  $("#quick-delete").onclick = deleteSelected;

  $("#grab").onclick = () => {
    cancelTurn();
    cancelPress();
    held ? world.release() : world.grab(b.id);
    dirty = true;
  };
  $("#rotate").onclick = () => rotate("y");
  $("#upright").onclick = upright;
  $("#remove").onclick = deleteSelected;
  $("#up").onclick = () => height(0.24);
  $("#down").onclick = () => height(-0.24);
  $("#press").onclick = () => startPress();
  if (links.length)
    $("#detach").onclick = () =>
      separate(world.links[Number($<HTMLSelectElement>("#seams").value)]);
  mobile?.refreshSelection();
}
function separate(link: Connection) {
  if (
    !selected ||
    isForeignPart(selected) ||
    !world.links.includes(link) ||
    turning ||
    pressing
  )
    return;
  endDrag();
  if (!world.detach(link, selected.id)) toast(text("cycle"));
  else {
    select(world.get(link.a));
    audio.play(0.55, true);
    toast(text("separated"));
  }
  dirty = true;
  updateSeams();
}
let pendingDeleteId: number | null = null;
function deleteSelected() {
  if (!selected) return;
  pendingDeleteId = selected.id;
  $<HTMLDialogElement>("#delete-dialog").showModal();
}
function confirmDeleteSelected() {
  const id = pendingDeleteId;
  pendingDeleteId = null;
  $<HTMLDialogElement>("#delete-dialog").close();
  if (id === null) return;
  const foreign = foreignWorld.get(id);
  const native = world.bricks.find((brick) => brick.id === id);
  if (!foreign && !native) return;
  cancelPress();
  endDrag();
  if (selected?.id === id) select(null);
  if (foreign) foreignWorld.remove(id);
  else world.remove(id);
  toast(text("deleted"));
}
function cancelDeleteSelected() {
  pendingDeleteId = null;
  $<HTMLDialogElement>("#delete-dialog").close();
}
function height(amount: number) {
  translateSelected(new T.Vector3(0, amount, 0));
}
function translateSelected(delta: T.Vector3) {
  if (!selected || pressing || turning) return;
  if (isForeignPart(selected)) {
    if (
      !foreignWorld.transformCollisionAware(
        selected.id,
        selected.position.clone().add(delta),
        selected.rotation,
      )
    )
      toast(text("blocked"));
    dirty = true;
    return;
  }
  const wasHeld = world.held.has(selected.id);
  if (!wasHeld) world.grab(selected.id);
  if (!world.transform(selected.id, selected.position.clone().add(delta)))
    toast(text("blocked"));
  // Position/candidate rendering happens every frame; don't replace focused controls.
  if (!wasHeld) dirty = true;
}
function rotate(axis: "x" | "y" | "z") {
  if (!selected || pressing || turning) return;
  const q = new T.Quaternion()
    .setFromAxisAngle(
      new T.Vector3(
        axis === "x" ? 1 : 0,
        axis === "y" ? 1 : 0,
        axis === "z" ? 1 : 0,
      ),
      Math.PI / 2,
    )
    .multiply(selected.rotation);

  if (isForeignPart(selected)) {
    if (!foreignWorld.transformCollisionAware(selected.id, selected.position, q))
      toast(text("blocked"));
    dirty = true;
    return;
  }

  if (!world.held.has(selected.id)) world.grab(selected.id);
  beginTurn(
    q,
    text(axis === "y" ? "axisY" : axis === "x" ? "axisX" : "axisZ") + " · +90°",
  );
}
function upright() {
  if (!selected || pressing || turning) return;
  const e = new T.Euler().setFromQuaternion(selected.rotation, "YXZ");
  const q = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 1, 0),
    (Math.round(e.y / (Math.PI / 2)) * Math.PI) / 2,
  );
  if (isForeignPart(selected)) {
    if (!foreignWorld.transformCollisionAware(selected.id, selected.position, q))
      toast(text("blocked"));
    dirty = true;
    return;
  }
  if (!world.held.has(selected.id)) world.grab(selected.id);
  beginTurn(q, text("upright"));
}
function startPress() {
  if (!selected || isForeignPart(selected) || pressing || turning) return;
  const c = world.candidate(selected.id);
  if (!c) {
    toast(text("notReady"));
    return;
  }
  audio.unlock();
  pressing = {
    start: performance.now(),
    id: selected.id,
    anchor: c.stationary.id,
    origin: selected.position.clone(),
    target: c.fit.position.clone(),
    fromRotation: selected.rotation.clone(),
    rotation: c.fit.rotation.clone(),
  };
}
function cancelPress() {
  if (pressing) {
    const p = pressing;
    pressing = null;
    world.transform(p.id, p.origin, p.fromRotation);
    $("#press")?.style.setProperty("--progress", "0%");
  }
}
function renderSwatches() {
  const quick = colorPalette
    .map(
      (color) =>
        `<button class="swatch ${currentColor === color.hex ? "active" : ""}" style="--swatch:${color.hex}" data-quick-color="${color.hex}" aria-label="${color.name}" title="${color.name}" aria-pressed="${currentColor === color.hex}"></button>`,
    )
    .join("");
  const otherActive =
    currentColor === otherColor.hex &&
    !colorPalette.some((color) => color.hex === currentColor);
  $("#swatches").innerHTML =
    quick +
    `<button id="other-color" class="swatch other-swatch ${otherActive ? "active" : ""}" style="--swatch:${otherColor.hex}" aria-label="Other colors: ${otherColor.name}" title="${otherColor.name}" aria-pressed="${otherActive}"><span class="other-corner" aria-hidden="true"></span></button>`;

  document.querySelectorAll<HTMLElement>("[data-quick-color]").forEach(
    (el) =>
      (el.onclick = () => {
        currentColor = el.dataset.quickColor!;
        renderSwatches();
        renderCards();
      }),
  );
  $("#other-color").onclick = () => {
    const search = $<HTMLInputElement>("#color-search");
    search.value = "";
    renderColorGrid("");
    $<HTMLDialogElement>("#color-dialog").showModal();
    window.setTimeout(() => search.focus(), 0);
  };
}

function renderColorGrid(query: string) {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle
    ? bricklinkColors.filter(
        (color) =>
          color.name.toLocaleLowerCase().includes(needle) ||
          color.type.toLocaleLowerCase().includes(needle) ||
          String(color.id).includes(needle),
      )
    : bricklinkColors;
  const grid = $("#color-grid");
  grid.replaceChildren(
    ...filtered.map((color) => {
      const button = document.createElement("button");
      button.className = "color-option";
      button.type = "button";
      button.title = `${color.name} · ${color.type} · #${color.hex.replace("#", "")}`;
      button.setAttribute("aria-label", `${color.name}, ${color.type}`);
      const swatch = document.createElement("span");
      swatch.className = "color-option-swatch";
      swatch.style.background = color.hex;
      const name = document.createElement("span");
      name.className = "color-option-name";
      name.textContent = color.name;
      button.append(swatch, name);
      button.onclick = () => {
        otherColor = color;
        localStorage.setItem(OTHER_COLOR_KEY, String(color.id));
        currentColor = color.hex;
        renderSwatches();
        renderCards();
        $<HTMLDialogElement>("#color-dialog").close();
      };
      return button;
    }),
  );
}
renderSwatches();
$<HTMLInputElement>("#color-search").oninput = (event) =>
  renderColorGrid((event.target as HTMLInputElement).value);
document.querySelectorAll<HTMLElement>("[data-lang]").forEach(
  (el) =>
    (el.onclick = () => {
      language = el.dataset.lang as Language;
      localStorage.setItem("bricks-language", language);
      translate();
    }),
);
function setLibraryOpen(open: boolean) {
  panelOpen = open;
  const library = $("#library"),
    body = $("#library-body"),
    titlebar = $("#library-titlebar");
  if (!open && body.contains(document.activeElement))
    titlebar.focus({ preventScroll: true });
  body.inert = !open;
  body.hidden = !open;
  library.classList.toggle("collapsed", !open);
  document.documentElement.classList.toggle("library-open", open);
  titlebar.setAttribute("aria-expanded", String(open));
}
const libraryTitlebar = $("#library-titlebar");
libraryTitlebar.onclick = () => setLibraryOpen(!panelOpen);
libraryTitlebar.onkeydown = (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  setLibraryOpen(!panelOpen);
};
function closeDialogFromBackdrop(dialog: HTMLDialogElement, event: MouseEvent) {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  const inside =
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom;
  if (!inside) dialog.close();
}
$("#scene-menu-toggle").onclick = () => {
  cancelInteraction();
  $<HTMLDialogElement>("#scene-dialog").showModal();
};
const sceneDialog = $<HTMLDialogElement>("#scene-dialog");
sceneDialog.addEventListener("click", (event) =>
  closeDialogFromBackdrop(sceneDialog, event),
);
$("#close-scene-menu").onclick = () => sceneDialog.close();
const colorDialog = $<HTMLDialogElement>("#color-dialog");
colorDialog.addEventListener("click", (event) =>
  closeDialogFromBackdrop(colorDialog, event),
);
$("#close-color-dialog").onclick = () => colorDialog.close();
const deleteDialogEl = $<HTMLDialogElement>("#delete-dialog");
deleteDialogEl.addEventListener("click", (event) =>
  closeDialogFromBackdrop(deleteDialogEl, event),
);
deleteDialogEl.addEventListener("close", () => {
  pendingDeleteId = null;
});
$("#delete-confirm").onclick = confirmDeleteSelected;
$("#delete-cancel").onclick = cancelDeleteSelected;
const helpDialog = $<HTMLDialogElement>("#help-dialog");
helpDialog.addEventListener("click", (event) =>
  closeDialogFromBackdrop(helpDialog, event),
);
$("#close-help").onclick = () => helpDialog.close();
function renderSoundButton() {
  const button = $("#sound");
  const label = text(audio.enabled ? "soundOn" : "soundOff");
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(audio.enabled));
  button.classList.toggle("sound-off", !audio.enabled);
  button.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4V5Z"/>${audio.enabled ? '<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>' : '<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
}
function renderPhysicsButton() {
  const button = $("#physics");
  const enabled = world.physicsEnabled;
  const label = text(enabled ? "physicsOn" : "physicsOff");
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(enabled));
  button.classList.toggle("physics-off", !enabled);
  button.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="2.2"/><path d="M12 8v7m-3-3 3 3 3-3"/><path d="M6 19h12"/>${enabled ? "" : '<path d="M4 4l16 16"/>'}</svg>`;
}
$("#sound").onclick = () => {
  audio.enabled = !audio.enabled;
  renderSoundButton();
  audio.unlock();
};
$("#physics").onclick = () => {
  world.setPhysicsEnabled(!world.physicsEnabled);
  renderPhysicsButton();
  dirty = true;
};
function serializeScene() {
  return {
    ...world.serialize(),
    foreign: foreignWorld.serialize(),
  };
}
function restoreScene(data: any) {
  const foreign = data?.foreign ?? [];
  const nativeCount = Array.isArray(data?.bricks) ? data.bricks.length : 0;
  if (!isValidForeignPartList(foreign) || nativeCount + foreign.length > 250)
    throw new Error("Invalid scene");
  world.restore(data);
  foreignWorld.restore(foreign);
}
function saveSceneLocal() {
  localStorage.setItem(SAVED_SCENE_KEY, JSON.stringify(serializeScene()));
  toast(text("savedLocal"));
  $<HTMLDialogElement>("#scene-dialog").close();
}
$("#scene-save").onclick = saveSceneLocal;
$(".brand").onclick = (event) => {
  event.preventDefault();
  saveSceneLocal();
};
$("#scene-import").onclick = () => $<HTMLInputElement>("#file").click();
function downloadSceneFile(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("#scene-export").onclick = () => {
  downloadSceneFile(
    JSON.stringify(serializeScene(), null, 2),
    "application/json",
    "brickids-scene.json",
  );
  toast(text("exported"));
};
$("#scene-export-ldr").onclick = () => {
  try {
    downloadSceneFile(
      exportLDraw(serializeScene()),
      "text/plain;charset=utf-8",
      "brickids-scene.ldr",
    );
    toast(text("ldrawExported"));
  } catch {
    toast(text("error"));
  }
};
function ldrawImportMessage(report: LDrawImportReport) {
  const names = report.unsupportedParts.slice(0, 4).join(", ");
  const more = Math.max(0, report.unsupportedParts.length - 4);
  if (language === "tr") {
    let message = `${report.imported} parça içe aktarıldı.`;
    if (report.skipped)
      message += ` ${report.skipped} desteklenmeyen parça atlandı${names ? `: ${names}${more ? ` +${more}` : ""}` : "."}`;
    if (report.submodels)
      message += ` ${report.submodels} submodel çözüldü.`;
    if (report.preservedForeign)
      message += ` ${report.preservedForeign} foreign LDraw parçası korundu.`;
    if (report.reconstructedConnections)
      message += ` ${report.reconstructedConnections} bağlantı yeniden kuruldu.`;
    if (report.unsupportedColors.length)
      message += ` ${report.unsupportedColors.length} renk nötr renkle gösterildi.`;
    return message;
  }
  let message = `${report.imported} parts imported.`;
  if (report.skipped)
    message += ` ${report.skipped} unsupported parts skipped${names ? `: ${names}${more ? ` +${more}` : ""}` : "."}`;
  if (report.submodels)
    message += ` ${report.submodels} submodels resolved.`;
  if (report.preservedForeign)
    message += ` ${report.preservedForeign} foreign LDraw parts preserved.`;
  if (report.reconstructedConnections)
    message += ` ${report.reconstructedConnections} connections reconstructed.`;
  if (report.unsupportedColors.length)
    message += ` ${report.unsupportedColors.length} colors shown with a neutral fallback.`;
  return message;
}

$("#file").onchange = async () => {
  try {
    const file = $<HTMLInputElement>("#file").files?.[0];
    if (!file) return;
    if (file.size > 1000000) throw Error("Too large");
    const source = await file.text();
    const lowerName = file.name.toLowerCase();
    const isLDraw = lowerName.endsWith(".ldr") || lowerName.endsWith(".mpd");

    cancelInteraction();
    cancelPress();

    if (isLDraw) {
      const report = importLDraw(source);
      if (!report.imported && !report.preservedForeign)
        throw Error("No importable LDraw parts");
      // LDraw/MPD stores transforms rather than application joints. The
      // importer reconstructs strict native stud/socket links before restore,
      // so the user's current physics setting can be preserved.
      restoreScene(report.scene);
      select(null);
      localStorage.setItem(SAVED_SCENE_KEY, JSON.stringify(serializeScene()));
      toast(ldrawImportMessage(report));
    } else {
      restoreScene(JSON.parse(source));
      select(null);
      localStorage.setItem(SAVED_SCENE_KEY, JSON.stringify(serializeScene()));
      toast(text("loaded"));
    }
    $<HTMLDialogElement>("#scene-dialog").close();
  } catch {
    toast(text("error"));
  }
  $<HTMLInputElement>("#file").value = "";
};
$("#scene-new").onclick = () => {
  if (!confirm(text("resetAsk"))) return;
  cancelInteraction();
  cancelPress();
  world.clear();
  foreignWorld.clear();
  select(null);
  localStorage.removeItem(SAVED_SCENE_KEY);
  $<HTMLDialogElement>("#scene-dialog").close();
};
$("#demo").onclick = () => {
  $<HTMLDialogElement>("#help-dialog").close();
  if (world.links.length && !confirm(text("resetAsk"))) return;
  cancelInteraction();
  cancelPress();
  world.clear();
  foreignWorld.clear();
  const lower = world.add(catalog[2], colors[2], new T.Vector3(0, 0.6, 0));
  const upper = world.add(catalog[1], colors[0], new T.Vector3(0, 2.2, 0));
  world.grab(upper.id);
  select(upper);
  camera.position.set(11, 12, 15);
  controls.target.copy(lower.position);
  toast(mobile?.enabled ? mobile.text("demoHint") : text("demoHint"));
};
const ray = new T.Raycaster(),
  mouse = new T.Vector2();
let drag: null | {
  id: number;
  foreign: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  moving: boolean;
  offset: T.Vector3;
  plane: T.Plane;
} = null;
function cast(e: { clientX: number; clientY: number }) {
  const r = canvas.getBoundingClientRect();
  mouse.set(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    (-(e.clientY - r.top) / r.height) * 2 + 1,
  );
  ray.setFromCamera(mouse, camera);
}
function pickableObjects() {
  return [
    ...world.bricks.map((brick) => brick.mesh),
    ...foreignWorld.pickObjects(),
  ];
}
function selectableFromObject(object: T.Object3D): SelectablePart | null {
  let current: T.Object3D | null = object;
  while (current) {
    if (current.userData.brick) return current.userData.brick as Brick;
    if (current.userData.foreignPart)
      return current.userData.foreignPart as ForeignLDrawPart;
    current = current.parent;
  }
  return null;
}
function workspacePoint(e: { clientX: number; clientY: number }) {
  cast(e);
  return (
    ray.ray.intersectPlane(
      new T.Plane(new T.Vector3(0, 1, 0), 0),
      new T.Vector3(),
    ) ?? new T.Vector3(controls.target.x, 0, controls.target.z)
  );
}
function placeLibraryPart(specId: string, color: string, target: T.Vector3) {
  if (scenePartCount() >= 250) {
    toast(text("limit"));
    return null;
  }
  cancelPress();
  const spec = catalog.find((candidate) => candidate.id === specId);
  if (!spec) return null;
  const brick = world.placeNew(spec, color, target);
  if (!brick) {
    toast(text("spawnBlocked"));
    return null;
  }
  select(brick);
  dirty = true;
  audio.unlock();
  return brick;
}
type LibraryPointerDrag = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  specId: string;
  color: string;
  source: HTMLElement;
  brickId: number | null;
  started: boolean;
  browsing: boolean;
};
let libraryPointerDrag: LibraryPointerDrag | null = null;

function beginLibraryPointerDrag(
  source: HTMLElement,
  event: PointerEvent,
) {
  libraryPointerDrag = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    startX: event.clientX,
    startY: event.clientY,
    specId: source.dataset.spec!,
    color: currentColor,
    source,
    brickId: null,
    started: false,
    browsing: false,
  };
}
function pointerInsideLibrary(event: { clientX: number; clientY: number }) {
  const rect = $("#library").getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}
function cancelLibraryPointerDrag(removeBrick = true) {
  const state = libraryPointerDrag;
  if (!state) return;
  if (removeBrick && state.brickId !== null) world.remove(state.brickId);
  state.source.classList.remove("dragging-live");
  document.documentElement.classList.remove(
    "library-live-drag",
    "library-live-object",
  );
  controls.enabled = true;
  libraryPointerDrag = null;
  window.setTimeout(() => (libraryDragging = false), 0);
  dirty = true;
}
window.addEventListener(
  "pointermove",
  (event) => {
    const state = libraryPointerDrag;
    if (!state || event.pointerId !== state.pointerId) return;
    if (!state.started) {
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      // On phones, horizontal movement belongs to the compact library strip.
      // An upward/vertical pull leaves the strip and becomes a workspace drag.
      if (
        state.pointerType === "touch" &&
        Math.abs(dx) > Math.abs(dy) &&
        pointerInsideLibrary(event)
      ) {
        if (Math.hypot(dx, dy) >= 10) {
          state.browsing = true;
          libraryDragging = true;
        }
        return;
      }
      if (Math.hypot(dx, dy) < (state.pointerType === "touch" ? 10 : 6))
        return;
      state.started = true;
      libraryDragging = true;
      state.source.classList.add("dragging-live");
      document.documentElement.classList.add("library-live-drag");
    }
    event.preventDefault();

    // Do not create a browser drag ghost. The moment the pointer leaves the
    // sidebar, create the real Three.js brick and move that actual object.
    if (state.brickId === null) {
      if (pointerInsideLibrary(event)) return;
      if (scenePartCount() >= 250) {
        toast(text("limit"));
        cancelLibraryPointerDrag();
        return;
      }
      const spec = catalog.find((candidate) => candidate.id === state.specId);
      if (!spec) {
        cancelLibraryPointerDrag();
        return;
      }
      const target = workspacePoint(event);
      const brick = world.spawnHeld(
        spec,
        state.color,
        new T.Vector3(target.x, 6, target.z),
      );
      if (!brick) {
        toast(text("spawnBlocked"));
        cancelLibraryPointerDrag();
        return;
      }
      state.brickId = brick.id;
      document.documentElement.classList.add("library-live-object");
      controls.enabled = false;
      audio.unlock();
    }
    if (state.brickId !== null) {
      world.snapDown(state.brickId, workspacePoint(event));
      dirty = true;
    }
  },
  { capture: true },
);
window.addEventListener(
  "pointerup",
  (event) => {
    const state = libraryPointerDrag;
    if (!state || event.pointerId !== state.pointerId) return;
    if (!state.started) {
      const browsing = state.browsing;
      libraryPointerDrag = null;
      if (browsing) window.setTimeout(() => (libraryDragging = false), 0);
      return;
    }
    event.preventDefault();
    const brickId = state.brickId;
    if (brickId !== null) {
      if (pointerInsideLibrary(event)) {
        world.remove(brickId);
      } else {
        world.snapDown(brickId, workspacePoint(event));
        world.drop(brickId, true);
        const brick = world.bricks.find((candidate) => candidate.id === brickId);
        if (brick) select(brick);
      }
    }
    cancelLibraryPointerDrag(false);
  },
  { capture: true },
);
window.addEventListener(
  "pointercancel",
  (event) => {
    if (libraryPointerDrag?.pointerId !== event.pointerId) return;
    cancelLibraryPointerDrag();
  },
  { capture: true },
);
let seamPointer: { pointerId: number; x: number; y: number; link: Connection } | null = null;
let seamClick: Connection | null = null;
function pickSeam() {
  updateSeams();
  ray.params.Line.threshold = Math.min(
    0.16,
    Math.max(0.04, camera.position.distanceTo(controls.target) * 0.004),
  );
  const hits = ray.intersectObjects(
    [...seamLines.values()].filter((l) => l.visible && l.userData.interactive),
    false,
  );
  const front = ray.intersectObjects(pickableObjects(), true)[0]?.distance;
  const hit = hits.find((h) => visibleSeamHit(h.distance, front));
  return hit?.object.userData.link as Connection | undefined;
}
function separateBrickAtPoint(e: { clientX: number; clientY: number }) {
  cast(e);
  const hit = ray.intersectObjects(pickableObjects(), true)[0];
  if (!hit) return false;
  const part = selectableFromObject(hit.object);
  if (!part) return false;
  select(part);
  if (isForeignPart(part)) return false;
  const below = world.lowerConnection(part.id);
  if (!below) return false;
  audio.unlock();
  separate(below);
  return true;
}
canvas.addEventListener("dblclick", (e) => {
  if (e.button !== 0 || turning || pressing) return;
  cast(e);

  // Preserve the precise seam double-click behavior when a seam was targeted.
  const seam = pickSeam();
  if (seam && seamClick && seam === seamClick) {
    e.preventDefault();
    audio.unlock();
    separate(seam);
    seamClick = null;
    return;
  }

  // Otherwise a double-click on a brick separates it from the brick directly
  // below it. The same action is used by touch double-tap.
  if (separateBrickAtPoint(e)) e.preventDefault();
  seamClick = null;
});
function beginDrag(e: TouchPoint): boolean {
  if (pressing || turning) return false;
  cast(e);
  seamClick = null;
  const hit = ray.intersectObjects(pickableObjects(), true)[0];
  if (!hit) {
    if (selected && !isForeignPart(selected) && world.held.has(selected.id))
      world.drop(selected.id, true);
    select(null);
    return false;
  }
  const part = selectableFromObject(hit.object);
  if (!part) return false;
  const plane = new T.Plane(new T.Vector3(0, 1, 0), -part.position.y);
  const p = ray.ray.intersectPlane(plane, new T.Vector3());
  if (!p) return false;
  select(part);
  controls.enabled = false;
  // Keep the horizontal plane fixed: height controls change only Y.
  drag = {
    id: part.id,
    foreign: isForeignPart(part),
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    moving: false,
    offset: part.position.clone().sub(p),
    plane,
  };
  return true;
}
function moveDrag(e: TouchPoint) {
  if (!drag || drag.pointerId !== e.pointerId || turning || pressing) return;
  cast(e);
  if (!drag.moving && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
    if (!drag.foreign) world.grab(drag.id);
    drag.moving = true;
    dirty = true;
  }
  if (drag.moving) {
    if (drag.foreign) {
      const part = foreignWorld.get(drag.id);
      if (!part) return;
      const target = dragTarget(
        ray.ray,
        drag.plane,
        drag.offset,
        part.position.y,
      );
      // Match native drag semantics: pointer controls X/Z while Rapier chooses
      // the first valid physical surface below the foreign part.
      if (target) foreignWorld.snapDown(part.id, target);
    } else {
      const b = world.get(drag.id);
      // The gesture plane supplies only X/Z. The engine resolves Y by casting the
      // held assembly straight down onto the first surface below the pointer.
      const target = dragTarget(ray.ray, drag.plane, drag.offset, 0);
      if (target) world.snapDown(b.id, target);
    }
  }
}
// Install capture handlers BEFORE the mouse handlers and keep touches out of OrbitControls.
mobile = setupMobile({
  canvas, camera, controls, language: () => language,
  drag: {
    start: (point) => { audio.unlock(); return beginDrag(point); },
    move: (point) => { moveDrag(point); if (drag?.moving) mobile?.collapse(); },
    end: endDrag,
    doubleTap: (point) => { separateBrickAtPoint(point); },
  },
  cancel: cancelInteraction,
  rotate,
  translateBrick: translateSelected,
  setLibraryOpen,
});
canvas.addEventListener("pointerdown", (e) => {
  audio.unlock();
  if (e.pointerType === "touch" || e.button !== 0 || pressing || turning || mobile?.cameraMode) return;
  cast(e);
  const seam = pickSeam();
  if (seam) {
    seamPointer = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, link: seam };
    controls.enabled = false;
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (beginDrag(e)) {
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
  }
}, true);
canvas.addEventListener("pointermove", (e) => {
  if (seamPointer?.pointerId === e.pointerId && Math.hypot(e.clientX - seamPointer.x, e.clientY - seamPointer.y) > 4) {
    seamPointer = null;
    seamClick = null;
    endDrag();
  }
  moveDrag(e);
});
function endDrag() {
  const state = drag;
  const movedId =
    state?.moving && !state.foreign && world.held.has(state.id)
      ? state.id
      : null;
  const movedForeign = !!state?.moving && state.foreign;
  drag = null;
  controls.enabled = true;
  if (movedId !== null) {
    // Drag motion already resolves Y onto the first surface below. On release,
    // finish a nearby valid stud/socket alignment; otherwise just return the
    // piece to normal gravity and contacts.
    const connected = world.drop(movedId, true);
    if (connected) audio.play(0.8, false, true);
    dirty = true;
  } else if (movedForeign && state) {
    // Re-settle on release in case the last pointer event happened between
    // physics/broad-phase updates.
    if (!foreignWorld.drop(state.id)) toast(text("blocked"));
    dirty = true;
  }
}
canvas.addEventListener("pointerup", (e) => {
  if (seamPointer?.pointerId === e.pointerId) {
    seamClick = seamPointer.link;
    seamPointer = null;
    endDrag();
  } else if (drag?.pointerId === e.pointerId) endDrag();
});
canvas.addEventListener("pointercancel", (e) => {
  if (drag?.pointerId === e.pointerId || seamPointer?.pointerId === e.pointerId) {
    seamPointer = null;
    seamClick = null;
    endDrag();
  }
});
canvas.addEventListener("lostpointercapture", (e) => {
  if (drag?.pointerId === e.pointerId || seamPointer?.pointerId === e.pointerId) {
    seamPointer = null;
    seamClick = null;
    endDrag();
  }
});
function cancelInteraction() {
  mobile?.cancel();
  seamPointer = null;
  seamClick = null;
  endDrag();
}
window.addEventListener("blur", () => {
  cancelInteraction();
  cancelTurn();
  cancelPress();
});
window.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(
      (e.target as HTMLElement).tagName,
    ) ||
    $<HTMLDialogElement>("#help-dialog").open ||
    $<HTMLDialogElement>("#scene-dialog").open ||
    $<HTMLDialogElement>("#color-dialog").open ||
    $<HTMLDialogElement>("#delete-dialog").open
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) startPress();
  }
  if (e.code === "Escape") {
    cancelTurn();
    cancelPress();
    world.release();
    dirty = true;
  }
  if (e.code === "Delete" || e.code === "Backspace") {
    e.preventDefault();
    if (!e.repeat) deleteSelected();
    return;
  }
  if (e.key.toLowerCase() === "u") upright();
  if (e.key.toLowerCase() === "r" || e.code === "Period" || e.code === "NumpadDecimal") {
    e.preventDefault();
    if (!e.repeat) rotate("y");
  }
  if (e.key.toLowerCase() === "x") rotate("x");
  if (e.key.toLowerCase() === "z") rotate("z");
  if (e.key.toLowerCase() === "q") height(-0.12);
  if (e.key.toLowerCase() === "e") height(0.12);
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") cancelPress();
});
function resize() {
  cancelInteraction();
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
translate();
function starter() {
  // Starter parts use the same placement engine as the library so every
  // initial brick is aligned to the visible stud grid and released normally.
  const color = (name: (typeof colorPalette)[number]["name"]) =>
    colorPalette.find((entry) => entry.name === name)!.hex;
  world.placeNew(catalog[2], color("Green"), new T.Vector3(-3, 0, 0));
  world.placeNew(catalog[1], color("Blue"), new T.Vector3(2, 0, 2));
  world.placeNew(catalog[0], color("Dark Turquoise"), new T.Vector3(1, 0, -2));
  world.placeNew(catalog[0], color("Yellow"), new T.Vector3(-4, 0, 3));
}

let previous = performance.now(),
  accumulator = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - previous) / 1000, 0.05);
  previous = now;
  while (accumulator >= 1 / 120) {
    world.step();
    accumulator -= 1 / 120;
  }
  if (turning) {
    const motion = turning,
      b = world.get(motion.id),
      progress = Math.min(1, (now - motion.start) / TURN_DURATION_MS);
    if (!b || !world.held.has(motion.id)) {
      cancelTurn();
    } else if (
      !world.transform(
        motion.id,
        motion.position,
        rotationAt(motion.from, motion.to, progress),
      )
    ) {
      cancelTurn();
      toast(text("blocked"));
    } else if (progress === 1) cancelTurn();
  }
  if (pressing) {
    const p = pressing,
      t = Math.min(1, (now - p.start) / 450),
      b = world.get(p.id),
      anchor = world.get(p.anchor);
    if (!b || !anchor || !world.held.has(b.id)) {
      cancelPress();
    } else {
      const progress = t * t * (3 - 2 * t);
      const target = p.origin.clone().lerp(p.target, progress);
      const rotation = p.fromRotation.clone().slerp(p.rotation, progress);
      if (!world.transform(p.id, target, rotation)) {
        cancelPress();
        toast(text("blocked"));
      } else {
        $("#press")?.style.setProperty("--progress", `${t * 100}%`);
        if (t === 1) {
          pressing = null;
          if (world.press(p.id)) {
            audio.play(0.8, false, true);
                  dirty = true;
          } else toast(text("notReady"));
        }
      }
    }
  }
  if (
    selected &&
    (isForeignPart(selected)
      ? !foreignWorld.parts.includes(selected)
      : !world.bricks.includes(selected))
  )
    select(null);
  if (dirty) {
    renderSelection();
    dirty = false;
  }
  updateSeams();
  outline.visible = !!selected;
  if (selected) {
    outline.setFromObject(isForeignPart(selected) ? selected.object : selected.mesh);
    const candidate =
      isForeignPart(selected) || turning ? null : world.candidate(selected.id);
    (outline.material as T.LineBasicMaterial).color.set(
      candidate ? 0x46866b : isForeignPart(selected) ? 0x4778a8 : 0x8c9591,
    );
    $("#alignment").textContent =
      !isForeignPart(selected) && world.held.has(selected.id)
        ? turning
          ? turning.label
          : pressing
            ? text("pressing")
            : candidate
              ? mobile?.enabled ? mobile.text("ready") : text("ready")
              : ""
        : "";
    $("#alignment").classList.toggle("ready", !!candidate);
    $("#press")?.toggleAttribute("disabled", !candidate);
    ghost.visible = !!candidate;
    if (candidate) {
      ghost.scale.set(candidate.upper.spec.cols, candidate.upper.spec.rows, 1);
      ghost.quaternion
        .copy(candidate.surfaceFit.rotation)
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(1, 0, 0),
            -Math.PI / 2,
          ),
        );
      ghost.position
        .copy(candidate.surfaceFit.position)
        .add(
          new T.Vector3(
            0,
            -candidate.upper.spec.height / 2 + 0.02,
            0,
          ).applyQuaternion(candidate.surfaceFit.rotation),
        );
    }
  } else {
    $("#alignment").textContent = "";
    ghost.visible = false;
  }
  controls.update();
  renderer.render(scene, camera);
}
world
  .init()
  .then(() => {
    // Foreign parts share Rapier's world as standalone coarse colliders. They
    // block native physics without becoming dynamic bodies themselves.
    foreignWorld.attachPhysics(world.world);
    // Physics is opt-in: scenes always open in the stable editing mode.
    world.setPhysicsEnabled(false);
    renderPhysicsButton();
    const saved = localStorage.getItem(SAVED_SCENE_KEY);
    if (saved) {
      try {
        restoreScene(JSON.parse(saved));
      } catch {
        localStorage.removeItem(SAVED_SCENE_KEY);
        starter();
      }
    } else starter();
    $("#loading").remove();
    requestAnimationFrame(frame);
  })
  .catch((e) => {
    $("#loading").textContent = `Unable to start WebGL / physics: ${e.message}`;
  });
// Read-only inspection plus engine access during local development for integration tests.
if (import.meta.env.DEV)
  Object.assign(window, {
    __bricks: { world, select, audio, scene, camera, renderer },
  });
