# Elera Project Status

Snapshot date: 2026-10-05
Phase: schema-4 physical editor is the running application; legacy schema-v2 engine retained for tests and porting
Base revision: `main` at `a59b779`

This is the current status source of truth. Engine behavior is governed by [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md), whose rules are mirrored into the generated block of [SELF_HEALING_ENGINE.md](SELF_HEALING_ENGINE.md). The original schema-v2 design is recorded in [REBUILD_SPEC.md](../REBUILD_SPEC.md).

## Current health

| Check | Status |
| --- | --- |
| Node test suite (`npm test`) | 208 of 209 passing. `test/physical-wire-edit.test.js` "a point can be added to the closest segment and removed again" fails on `main`. |
| Production build (`npm run build`) | Passing. The main chunk is about 1,087 kB (275 kB gzip) and triggers Vite's 500 kB warning; the routing worker is a separate 77 kB chunk. |
| Lint / type check | Not configured |
| Browser acceptance | Manual only (`GAP-07`). Pointer events cannot be driven reliably into the nested Konva canvas by the current browser harness, so add/move/delete behavior is covered at command and controller level. |

## Two engines in one repository

The application loads only the **schema-4 physical engine** (`src/physical/`, `src/editor/`, the Konva canvas in `src/components/circuit-canvas.js`, and shared definitions in `src/core/`).

The **legacy schema-v2 engine** (`src/store.js`, `src/services/*`, `src/components/placed-component.js`, `src/core/circuit-model.js`, `src/core/project-schema.js`, `src/core/breadboard-planner.js`, `src/core/editor-project-adapter.js`) is not imported by the running app. Its tests still pass and many rows of the engine contract's traceability registry still cite it. Several features described in older documentation, including full logical validation, capacity alternatives (add or replace a breadboard) and locked placements, exist only there. Treat it as a porting reference: new behavior belongs in `src/physical/`.

## Implemented in the running app

### Editor

- Lit 3 application shell with a Konva workspace (background, board, wire, component and interaction layers). Wokwi or converted-part artwork is drawn in a pointer-transparent DOM layer; Konva owns hit testing.
- Component sidebar over the `@wokwi/elements` catalog, the converted Fritzing parts (`Imported` filter) and user-defined parts from the component builder (`My parts`).
- Free-space placement, breadboard mounting through the generic snap solver, rotation, selection, multi-select, delete with connected-wire cleanup, pan and zoom.
- Manual wiring in orthogonal or freestyle mode with optional pitch snap, editable waypoints and segment grips, and per-net inspection.
- Half-size (400-point) and full-size (830-point) breadboard surfaces from one millimetre topology in `src/core/breadboard-topology.js`.
- Undo/redo through command transactions. The current project autosaves to `localStorage`; named projects, JSON export and import are available from the toolbar and the Projects dialog.
- The account panel is a local mock. There is no backend or real authentication.

### Physical model

- Schema-4 projects (`src/physical/model.js`; schema 3 is also accepted on load) store surfaces, components, semantic wire endpoints and route intent. Mounted parts persist only surface, footprint, rotation and pin-to-hole bindings, so moving a board carries its parts and wire endpoints.
- Geometry is in millimetres with an exact 2.54 mm pitch and 7.62 mm E-F spacing.
- Every catalog part marked breadboard-mountable resolves to a calibrated rigid package via `src/core/part-registry.js`. DIP packages come from `createDipFootprint()`.
- Resistors have three presentations of one electrical part: the Wokwi axial visual in free space, a compact horizontal breadboard package (five holes by default, three to eight pitches allowed) and an upright package.
- `ConnectivityResolver` unions breadboard groups, mounted contacts, internal component nets and wires without reading the renderer. Every breadboard socket has a derived `FREE`, `COMPONENT_PIN` or `WIRE_ENDPOINT` state.
- Schema-v2 projects are not migrated into schema 4.

### Automation

- **Auto Wire** (`autoWirePhysicalStore`) reuses the metadata-driven `planAutoWire` planner: compatible and nearest-header pin assignment, shared supply nets, deterministic LED resistors, multiple controllers with stable ownership and independent pin budgets. On breadboards it collapses fixed copper and adds only the missing jumpers on unique free sockets. It never moves parts, and a failed scope leaves the project unchanged.
- **Auto Layout** (`autoLayoutPhysicalStore`) runs Auto Wire, arranges components (direct scenes via `direct-layout-v2.js`, breadboard scenes as rigid board clusters with header affinity, one cluster per controller), then routes, all as one undo step. Free components stay outside board bodies; only a generated series resistor may be mounted beside its mounted owner.
- **Clean** and **Reset wires** both return every wire to automatic routing; Clean waits for the routing worker to settle. Routes are orthogonal, scored for length, bends, crossings, obstacles and fan-out, and treat unrelated breadboard bodies as keepouts.
- All six built-in MCUs (Uno, Mega, Nano, ESP32 DevKit v1, Franzininho, Nano RP2040 Connect) have Auto Wire pin profiles.

### Validation

The validation bar runs `validatePhysicalProject` (`src/physical/validation.js`) on every change. It reports: missing footprint, illegal placement, hole collisions, broken or self-looping wires, invalid wire holes, incomplete intended nets, two nets sharing breadboard copper, redundant generated jumpers, LEDs without a resistor, no controller, and an empty project.

The broader logical checks (current limits, duplicate signal pins, serial-pin conflicts, missing VCC/GND, I2C pin placement, floating pins, breadboard capacity) exist only in the legacy `src/services/validation-engine.js` and are not shown to users (`GAP-09`).

### AI assistant

- Provider-neutral tool-calling agent for DeepSeek, Gemini, OpenAI, OpenRouter and custom OpenAI-compatible endpoints, operating on the physical store. See [AI_AGENT.md](AI_AGENT.md).
- Tools cover catalog search, circuit inspection, placement, deletion, pin capability queries, exact-pin connection, Auto Wire, arrangement, routing, validation, undo and clear.
- Action modes (ask, explain, suggest-only, auto-apply) are enforced in code. Keys stay in `sessionStorage`; requests go directly from the browser to the provider.

### Component import

`scripts/convert-fritzing-part.mjs` converts `.fzpz` archives into `public/converted-parts/`. The checked-in catalog has 12 part families from 13 archives (two Pololu DRV8833 archives share one ID). See [FRITZING_PART_IMPORT.md](FRITZING_PART_IMPORT.md).

## Smart-button contract

| Command | Owns | Must preserve |
| --- | --- | --- |
| Auto Wire | Logical pin/net assignment and required helper generation | All component/board positions and existing valid mounted footprints |
| Auto Layout | Auto Wire, unlocked component/board placement, and routing | Unrelated manual intent |
| Clean | Route geometry only | Components, nets, pin assignments, holes, colors and board topology |
| Validation | Read-only findings | Every circuit and editor state layer |

## Known gaps and next priorities

Gap definitions and exit conditions live in [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md#known-contract-drift). `GAP-01`, `GAP-02` and `GAP-08` are closed.

1. **P0, user-facing validation:** port the logical checks into `src/physical/validation.js` (`GAP-09`). Build in bus awareness for shared I2C (`GAP-04`) and per-board hole lookup for full-size boards (`GAP-05`) while porting, rather than fixing them only in the legacy engine.
2. **P0, test suite:** fix the failing waypoint insertion test in `test/physical-wire-edit.test.js`.
3. **P1, command completion:** decide the Auto Wire route-dirty versus baseline-routing behavior (`GAP-03`).
4. **P1, regression depth:** one focused fixture per public validation finding (`GAP-06`) and an automated browser fixture for the mixed circuit (`GAP-07`).
5. **P2, cleanup and performance:** retire the legacy engine once its tests are ported to `src/physical/`, re-point the contract registry, profile dense breadboard scenes and split the production bundle.

For every engine change, name the affected contract rule, add the failing test first, and keep the command mutation boundaries.

## Handoff

As of 2026-10-05 everything is committed on `main`; there is no uncommitted feature work. Start with this file, then [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md) and [PHYSICAL_EDITOR_ARCHITECTURE.md](PHYSICAL_EDITOR_ARCHITECTURE.md). Make changes in `src/physical/` (or shared `src/core/` definitions), keep Auto Wire non-positional, Auto Layout the sole placement owner, Clean route-only and Validation read-only, and run `npm test` and `npm run build` before handing back.
