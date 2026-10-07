# brickids

[English](README.md) · [Türkçe](README.tr.md)

**brickids** is a browser-based 3D brick-building playground focused on simple, direct interaction and early-age play. It keeps the underlying construction and physics ideas of the original project, while simplifying the interface for younger builders on desktop, tablet, and mobile devices.

Live site: https://alorak.github.io/brickids/

> **Origin / upstream:** this repository is a fork and adaptation of **Berkopan/lego-bricks**. The upstream code was imported in [Berkopan/lego-bricks upstream](https://github.com/alorak/brickids/commit/3a6a0186eb71165b40ae2a1f2a8d4693e8a24b6b "chore: import Berkopan/lego-bricks upstream"). The fork has since been reshaped toward easier free-form building, touch use, simpler controls, and early-age play.

Built with **TypeScript**, **Three.js**, and **Rapier**. The application runs entirely in the browser and is deployed as static files through GitHub Pages. It does not require a backend, account, or API key.

## What changed in this fork

The current version is intentionally more toy-like and less tool-like than the upstream starting point.

- **Simplified interaction for younger builders.** Pick, drag, rotate, separate, and delete without opening dense editing panels.
- **Desktop, tablet, and mobile layouts.** Touch devices use direct gestures instead of a separate camera/build mode.
- **Compact mobile library.** Eight color slots stay fixed on the left as a 2-column × 4-row block, while parts remain in a two-row horizontally scrollable strip.
- **Minimal selected-part actions.** Touch layouts show only **Separate**, **Rotate**, and **Delete**. Desktop uses the same quick-action idea.
- **Double-tap / double-click separation.** A connected brick can be separated from the brick below without opening an advanced menu.
- **Keyboard rotate shortcut.** Rotate around Y with **R** or **.**; numpad decimal is supported too.
- **Optional physics.** Physics starts **off by default** so the scene stays calm and predictable. It can be enabled from the physics button.
- **Local save shortcut.** Clicking the **brickids** logo performs the same local save action as the Save button.
- **Clearer part boundaries.** Connected bricks get subtle part-aware seam lines so two touching pieces are easier to distinguish.
- **Large clear building area.** The fog/haze effect was removed, far zoom was extended, and the visible baseplate was enlarged to **240 × 240 studs**.
- **Mobile/tablet spacing refinements.** The library no longer reserves space for removed legacy controls.
- **Quieter feedback.** Connection success toasts were removed; the connection sound remains.

## Building features

### Parts

There are currently **16 simplified part types**:

| Family | Parts |
| --- | --- |
| Bricks | 1×2, 1×4, 2×2, 2×4 |
| Plates | 1×2, 1×4, 2×2, 2×4 |
| Tiles | 1×2, 2×2 |
| Round | 1×1 brick, 1×1 plate |
| Slopes | 2×2 slope, 1×1 cheese slope |
| Special | 2×2 corner plate, 1×4 arch |

The geometry is designed for an interactive building toy, not as manufacturing CAD.

### Colors

The quick palette contains seven frequently used colors:

- Red
- Blue
- Yellow
- Green
- Orange
- Dark Turquoise
- Black

The eighth slot is **Other**, which opens a searchable snapshot of **214 BrickLink colors**. The selected Other color is remembered locally.

### Placement and connections

- Parts can be clicked into the workspace or dragged out of the library.
- Dragging settles pieces onto the first physical surface below instead of leaving them floating.
- Floor-level parts align to the visible baseplate stud grid.
- Compatible brick-to-brick placement is assisted when a part is released near a valid stud/socket pose.
- Connected assemblies move together.
- A wide brick can connect across multiple supports.
- Connection seams are drawn along real contact regions rather than as generic bounding-box outlines.

## Controls

### Desktop

| Action | Control |
| --- | --- |
| Add part | Click a part card, or drag it from the Library |
| Select | Click a brick |
| Move | Drag the selected brick |
| Rotate Y | Quick Rotate button, **R**, or **.** |
| Tilt | **X / Z** |
| Raise / lower | **E / Q** |
| Upright | **U** |
| Separate | Quick Separate button, or double-click a connected brick / seam |
| Delete | Quick Delete button, **Delete**, or **Backspace** |
| Connect | Release near a compatible connection; **Space** also runs the press action when aligned |
| Orbit camera | Drag empty space |
| Pan camera | Right-drag |
| Zoom | Mouse wheel |

### Touch / mobile

- **Tap a brick** to select it.
- **Drag a brick** to move it.
- **Drag empty space** to orbit the camera.
- **Use two fingers** to pan and pinch-zoom.
- **Double-tap a connected brick** to separate it from the brick below.
- The compact selection box contains only **Separate**, **Rotate**, and **Delete**.
- The color block stays at the left of the mobile Library; parts scroll horizontally to its right.
- Parts can be tapped to add them or pulled from the Library into the workspace.

The old translucent joystick, up/down buttons, Connect button, camera/build switch, and zoom buttons are intentionally not part of the current mobile UI.

## Physics

Rapier powers rigid-body physics, collision detection, friction, and connected assemblies.

Physics is **disabled when the app starts**. This makes the default experience more stable for casual and early-age building. The physics button can enable simulation at any time.

When physics is enabled:

- loose parts can fall and collide,
- connected groups behave as assemblies,
- impact sounds can play,
- fallen loose bricks can recover to an upright baseplate position after settling.

Connections themselves are represented by fixed joints rather than a material-level simulation of real ABS clutch force.

## Saving and persistence

brickids has two kinds of persistence.

### Local scene save

The current scene is stored in the browser under the localStorage key:

`brickids-scene`

You can save it by either:

- clicking **Save** in the scene menu, or
- clicking the **brickids logo**.

The saved scene is restored on the next launch in the same browser/profile.

### File import / export

The scene menu supports JSON import/export for moving native brickids scenes between browsers or keeping external backups. It also supports **LDraw `.ldr` import and export**.

Current LDraw import is intentionally conservative: the 16 native brickids part mappings are imported with position, rotation, and color; unsupported `.dat` references are skipped and reported instead of aborting the whole file. Direct RGB colors are supported, and a set of common standard LDraw colors is mapped to brickids colors.

`.mpd` files and embedded `0 FILE` submodels are supported. Submodel references are recursively flattened, parent/child transforms are composed, and LDraw color `16` inheritance is resolved across nesting levels. Cyclic submodels and excessive nesting are rejected. The flattened import still has no reconstructed brick-to-brick joint graph, so physics is switched off after import to preserve the layout.

LDraw export converts brickids positions, rotations, supported part types, and colors to type-1 part references; the quick palette uses standard LDraw color codes and other colors fall back to direct RGB values.

Language and the selected Other color are also remembered locally.

## Baseplate and camera

The default world uses a white LEGO-like baseplate.

- Visible stud field: **240 × 240 studs**
- Large underlying floor: **600 × 600 world units**
- Extended zoom-out range
- No scene fog, so distant bricks remain clear instead of fading into a white haze

The studs are rendered efficiently with instancing rather than thousands of independent meshes.

## Run locally

Requires **Node.js 22 or later**.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite.

Useful commands:

```sh
npm test
npm run build
npm run preview
```

A current browser with WebGL2 and WebAssembly support is recommended.

## Project structure

| Module | Responsibility |
| --- | --- |
| `src/main.ts` | Scene setup, desktop input, selection UI, save/load integration |
| `src/mobile.ts` | Touch gesture integration and touch-layout behavior |
| `src/mobile.css` | Tablet/mobile Library and selection layout |
| `src/engine/catalog.ts` | Part definitions, quick colors, connector metadata |
| `src/bricklink-colors.ts` | 214-color BrickLink catalog snapshot |
| `src/engine/geometry.ts` | Procedural brick geometry |
| `src/engine/solids.ts` | Shared solid definitions for special parts |
| `src/engine/connections.ts` | Mating rules and connected-component traversal |
| `src/engine/seams.ts` | Contact/seam geometry |
| `src/engine/world.ts` | Rapier bodies, snapping, joints, separation, persistence |
| `src/engine/audio.ts` | Cached local sound playback |
| `src/scene/ground.ts` | Baseplate stud field and ground rendering |
| `src/i18n.ts` | English/Turkish interface strings |

## Design scope

brickids is an interactive construction toy, not a precision LEGO CAD system or an engineering simulation.

- Dimensions and collision shapes are simplified.
- Real clutch force, elastic deformation, material stress, and connection breakage are not modeled.
- The 250-brick creation/import cap remains in place.
- Performance depends on the device and the complexity of connected assemblies.
- Touch behavior is intentionally simplified instead of exposing every engine operation.

The project aims to keep building understandable and playful before adding more advanced controls.

## Sound credits

Real recordings are included under **CC0 1.0**:

- [Lego Click (short) — ImmergoMedia](https://freesound.org/people/ImmergoMedia/sounds/670000/) — used for impacts.
- [Connecting two LEGO Bricks — LauraWebdev](https://freesound.org/people/LauraWebdev/sounds/257245/) — excerpts are used for connection and separation sounds.

Additional audio provenance is documented in `public/audio/CREDITS.txt` and [docs/audio-analysis.md](docs/audio-analysis.md).

[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

## Trademark note

This is an independent fan-made experiment and is not affiliated with or endorsed by the LEGO Group. LEGO is a trademark of the LEGO Group. No official LEGO logos or product photographs are bundled.
