# Elera Project Status

Snapshot date: 2026-10-05
Phase: schema-4 physical editor is the running application; legacy schema-v2 engine removed
Base revision: `main` at `a59b779`

This is the current status source of truth. Engine behavior is governed by [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md), whose rules are mirrored into the generated block of [SELF_HEALING_ENGINE.md](SELF_HEALING_ENGINE.md). The original schema-v2 design is recorded in [REBUILD_SPEC.md](../REBUILD_SPEC.md).

## Current health

| Check | Status |
| --- | --- |
| Node test suite (`npm test`) | All 207 passing. |
| Production build (`npm run build`) | Passing. The main chunk is about 1,147 kB (293 kB gzip) and triggers Vite's 500 kB warning; the routing worker is a separate 89 kB chunk. |
| Lint / type check | Not configured |
| Browser acceptance | Manual only (`GAP-07`). Pointer events cannot be driven reliably into the nested Konva canvas by the current browser harness, so add/move/delete behavior is covered at command and controller level. |

## Two engines in one repository

The application loads only the **schema-4 physical engine** (`src/physical/`, `src/editor/`, the Konva canvas in `src/components/circuit-canvas.js`, and shared definitions in `src/core/`).

The **legacy schema-v2 engine** (`src/store.js`, `src/services/*`, `src/components/placed-component.js`, `src/core/circuit-model.js`, `src/core/project-schema.js`, `src/core/breadboard-planner.js`, `src/core/editor-project-adapter.js`) and its tests were removed on 2026-10-11 because the app no longer loaded it; the last commit containing it is `a59b779`. Its logical validation checks were ported to `src/physical/electrical-validation.js`. Rules that were proven only there, including capacity alternatives (add or replace a breadboard), are listed as `GAP-11` in the contract. New behavior belongs in `src/physical/`.

## Implemented in the running app

### Editor

- Lit 3 application shell with a Konva workspace (background, board, wire, component and interaction layers). Wokwi or converted-part artwork is drawn in a pointer-transparent DOM layer; Konva owns hit testing.
- Component sidebar over the `@wokwi/elements` catalog, the converted Fritzing parts (`Imported` filter) and user-defined parts from the component builder (`My parts`).
- Free-space placement, breadboard mounting through the generic snap solver, rotation, selection, multi-select, delete with connected-wire cleanup, pan and zoom.
- Manual wiring in orthogonal or freestyle mode with optional pitch snap, editable waypoints and segment grips, and per-net inspection.
- Half-size (400-point) and full-size (830-point) breadboard surfaces from one millimetre topology in `src/core/breadboard-topology.js`.
- Undo/redo through command transactions. The current project autosaves locally; JSON export and import are available from the toolbar and the Projects dialog.
- Local-first project library: named projects live in IndexedDB on the device, and the old `localStorage` library migrates on first load. Elera works fully without an account.
- Optional Google sign-in through Supabase Auth replaces the old mock login. Signed-in projects sync to a row-level-secured `projects` table, with the newest save winning per project and tombstones carrying deletes. Signing out removes that account's synced copies from the device.
- The toolbar Save button updates the open project; an unnamed circuit opens My projects to name it.
- Accounts stay switched off until `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set. The schema, Google setup, free-tier notes and the keep-awake workflow are covered in [CLOUD_SYNC_SETUP.md](CLOUD_SYNC_SETUP.md); library and sync coverage is in `test/project-library.test.js`.
- Not yet built: share links and read-only public projects.

### Physical model

- Schema-4 projects (`src/physical/model.js`; schema 3 is also accepted on load) store surfaces, components, semantic wire endpoints and route intent. Mounted parts persist only surface, footprint, rotation and pin-to-hole bindings, so moving a board carries its parts and wire endpoints.
- Geometry is in millimetres with an exact 2.54 mm pitch and 7.62 mm E-F spacing.
- Every catalog part marked breadboard-mountable resolves to a calibrated rigid package via `src/core/part-registry.js`. DIP packages come from `createDipFootprint()`.
- Breakout modules with one straight 2.54 mm header row (HC-SR04, PIR, MPU6050, SSD1306, DS1307, microSD, the sound, flame, gas, NTC, photoresistor and tilt modules) start free beside the board and snap onto it with a rigid header package, like the resistor. Parts that stay off the board (servos, steppers, large displays, NeoPixels, keypad, joystick, KY-040, pulse sensor, HX711, slide pot, 12 mm button, socketed boards) each carry a specific student-facing reason in `src/component-library.js`.
- Resistors have three presentations of one electrical part: the Wokwi axial visual in free space, a compact horizontal breadboard package (five holes by default, three to eight pitches allowed) and an upright package.
- `ConnectivityResolver` unions breadboard groups, mounted contacts, internal component nets and wires without reading the renderer. Every breadboard socket has a derived `FREE`, `COMPONENT_PIN` or `WIRE_ENDPOINT` state.
- Schema-v2 projects are not migrated into schema 4.

### Automation

- **Auto Wire** (`autoWirePhysicalStore`) reuses the metadata-driven `planAutoWire` planner: compatible and nearest-header pin assignment (pins with serial, boot-strap or input-only constraints only when nothing else is free), a supply rail inside the part's voltage range when that is safe for the board's logic level, shared supply nets, deterministic LED resistors, multiple controllers with stable ownership and independent pin budgets. On breadboards it collapses fixed copper and adds only the missing jumpers on unique free sockets. It never moves parts, and a failed scope leaves the project unchanged.
- **Auto Layout** (`autoLayoutPhysicalStore`) runs Auto Wire, arranges components (direct scenes via `direct-layout-v2.js`, breadboard scenes as rigid board clusters with header affinity, one cluster per controller), then routes, all as one undo step. Free components stay outside board bodies; only a generated series resistor may be mounted beside its mounted owner.
- **Clean** and **Reset wires** both return every wire to automatic routing; Clean waits for the routing worker to settle. Routes are orthogonal, scored for length, bends, crossings, obstacles and fan-out, and treat unrelated breadboard bodies as keepouts.
- All six built-in MCUs (Uno, Mega, Nano, ESP32 DevKit v1, Franzininho, Nano RP2040 Connect) have Auto Wire pin profiles.

### Validation

The validation bar runs `validatePhysicalProject` (`src/physical/validation.js`) on every change. Findings come in two groups.

- **Physical checks:** missing footprint, illegal placement, hole collisions, broken or self-looping wires, invalid wire holes, incomplete intended nets, two nets sharing breadboard copper, redundant generated jumpers, no controller, and an empty project.
- **Electrical checks** (`src/physical/electrical-validation.js`, ported from the legacy engine and extended):
  - shorts: power to ground, tied supply pins of different voltages, an I/O pin wired straight to a supply or to another pin of the same board, and a switch that bridges power and ground when pressed;
  - power: the controller's total current budget, 5 V parts on a 3.3 V supply, a 5 V part's output driving a 3.3 V input, and relay or stepper coils driven straight from a pin;
  - pins: signal pins that lack a needed capability (PWM, analog, output, the board's I2C SDA/SCL), serial and boot-strap pin conflicts, two devices on one I/O pin, two I2C devices with the same address, and a part whose own legs share a net;
  - LEDs: no series resistor, reversed polarity, and current too high or too low for the resistor value;
  - wiring completeness: missing or reversed VCC/GND, supply pins that never reach a controller supply, floating signal pins, unconnected parts, and a hint when parts need a breadboard but the scene has none.

The electrical checks read the resolved connectivity graph, so a connection through breadboard strips, rails (including the split rails of the 830-point board) or a part's internal net counts the same as a jumper. Several devices on the board's I2C pins are a legal shared bus, and a resistor sharing a signal pin is not a second device. Controller capabilities, constraints and current limits come from the board pin tables in `src/boards/`; part limits come from catalog metadata (`supplyVoltage`, `i2cAddress`, `switchContacts`, `needsDriver`). Incomplete wiring is reported as warnings or info, never errors, so the AI assistant's one-connection-at-a-time edits are not rejected for being unfinished.

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

Gap definitions and exit conditions live in [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md#known-contract-drift). `GAP-01`, `GAP-02`, `GAP-04`, `GAP-05`, `GAP-08` and `GAP-09` are closed: the live validator now runs the logical checks with shared-bus awareness and per-board hole lookup.

1. **P1, board data:** the ESP32 DevKit table has no `VIN`/5 V pin, so 5 V parts on it can only be powered from 3V3 and always show `under-voltage`.
2. **P1, capacity alternatives:** when a scene does not fit, live Auto Layout fails without offering a proven larger or additional board (`GAP-10`).
3. **P1, command completion:** decide the Auto Wire route-dirty versus baseline-routing behavior (`GAP-03`).
4. **P1, regression depth:** one focused fixture per remaining physical validation finding (`GAP-06`; the electrical findings have them in `test/physical-electrical-validation.test.js`) and an automated browser fixture for the mixed circuit (`GAP-07`).
5. **P1, legacy rule parity:** the unused schema-v2 engine and its tests were removed; port the rules listed in `GAP-11` to the physical engine, each with a regression test.
6. **P2, performance:** profile dense breadboard scenes and split the production bundle.

For every engine change, name the affected contract rule, add the failing test first, and keep the command mutation boundaries.

## Handoff

As of 2026-10-05 everything is committed on `main`; there is no uncommitted feature work. Start with this file, then [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md) and [PHYSICAL_EDITOR_ARCHITECTURE.md](PHYSICAL_EDITOR_ARCHITECTURE.md). Make changes in `src/physical/` (or shared `src/core/` definitions), keep Auto Wire non-positional, Auto Layout the sole placement owner, Clean route-only and Validation read-only, and run `npm test` and `npm run build` before handing back.
