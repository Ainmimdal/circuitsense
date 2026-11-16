# Elera Project Status

Snapshot date: 2026-10-05
Phase: schema-4 physical editor is the running application; legacy schema-v2 engine removed
Base revision: `main` at `a59b779`

This is the current status source of truth. Engine behavior is governed by [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md), whose rules are mirrored into the generated block of [SELF_HEALING_ENGINE.md](SELF_HEALING_ENGINE.md). The original schema-v2 design is recorded in [REBUILD_SPEC.md](../REBUILD_SPEC.md).

## Current health

| Check | Status |
| --- | --- |
| Node test suite (`npm test`) | All 285 passing. |
| Production build (`npm run build`) | Passing. The main chunk is about 650 kB (179 kB gzip) and still triggers Vite's 500 kB warning. Konva, the Wokwi elements, avr8js and Supabase are separate vendor chunks (`vite.config.js`); the code panel with the simulator loads when Code is first opened; the routing worker is its own chunk. |
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
- Share copies a link that carries the whole circuit, compressed, in the address (`src/persistence/share-link.js`, `test/share-link.test.js`); opening it gives the visitor their own copy, so no backend is involved. Parts shows the bill of materials and downloads it as a CSV.
- Signed-in users get a short share link instead (`#s=<id>`): Share publishes a copy to the `shared_projects` table (`supabase/migrations/20261116000000_shared_projects.sql`), and anyone with the link opens their own copy through the `get_shared_project` function, so the original cannot be changed and published circuits cannot be listed. Needs that migration applied to the Supabase project.
- As of 2026-11-16 the Supabase project in `.env.production` does not resolve (most likely paused), so sign-in, sync and short links are down until it is restored and the keep-awake secrets are set.

### Lessons and guided builds

- The Learn button opens nine preset lessons (`src/lessons/catalog.js`): Blink, Push to light, Traffic light, Knob dimmer, Doorbell, Night light, Parking sensor, Colour mixer and Servo steering. Each has a goal, an explanation, a parts list, per-step notes, an Arduino sketch and a follow-up challenge.
- `src/physical/lessons.js` turns any finished project into ordered steps (breadboards, boards, parts, then power, ground and signal wires) and checks each step against the student's build. Parts are matched by definition rather than id, and any hole in the right strip counts.
- The guide panel (`src/components/lesson-guide.js`) shows step N of M, a one-line reason for each step, gentle hints after a wrong placement, and Show me, Back and Skip. The canvas draws the next part or wire as a glowing ghost. The finish screen shows the sketch with a copy button and upload steps.
- "Guide me" turns the circuit on the canvas, or any saved project from My projects, into the same step-by-step rebuild; leaving it early offers the original circuit back.
- "Build my own idea" in the Learn dialog (`src/lessons/goal-build.js`) takes a "when this, then that" goal (seven triggers, six outputs), places the parts, wires them with Auto Layout and writes the code; the student can be guided through it step by step or get the finished circuit. `test/goal-build.test.js` builds all 42 combinations and checks they validate cleanly.
- A resistor, photoresistor or ceramic capacitor counts either way round in a lesson, and wires to its legs follow.
- `test/lessons.test.js` checks that every lesson is a valid circuit whose footprints match their holes, that Show me completes every step, and that hints name the right leg and column.

### Parts library

- Every built-in part has a one-line description and a beginner note (`src/part-guide.js`); cards say how the part connects ("Plugs into breadboard", "Connect with wires", "Runs your code") and frame the artwork by its drawn size.
- Elera draws the basic parts Wokwi does not ship (`src/components/basic-part-elements.js`): photoresistor, ceramic and electrolytic capacitor, diode, NPN transistor and DC motor. They snap to the breadboard through `src/core/component-geometry.js` like any other part.
- A pin listed in `pinMeta` is reported as floating until it is wired, so optional terminals (spare relay contacts, unused display pins) are deliberately left out of it.

### Arduino code and simulation

- The Code button opens an editor under the canvas (`src/components/code-panel.js`). Run executes the sketch on a simulated ATmega328P (avr8js, `src/simulation/avr-runner.js`) wired to the circuit on the canvas: LEDs, RGB LEDs, buzzers (with sound), servos and DC motors react; buttons can be held on the canvas; knobs, the joystick and sensor modules (light, sound, flame, gas, temperature, motion, tilt) get sliders or hold buttons; the HC-SR04 answers `pulseIn` with a real echo pulse for the distance on its slider; there is a Serial Monitor. Uno and Nano only.
- Each lesson opens with its starter sketch, which is compiled ahead of time (`src/simulation/prebuilt-sketches.json`), so it runs with no server. Edited code goes to the compile server (`server/compile-server/`, `VITE_COMPILE_URL`); compiler errors are rewritten in beginner language with a jump to the line.
- The compile server is not deployed yet. Until `VITE_COMPILE_URL` is set, edited code shows a message and starter code still runs. Hosting and limits are in [COMPILE_SERVER.md](COMPILE_SERVER.md).
- Voltages and LED currents come from a DC solver (`src/simulation/dc-solver.js`, `test/dc-solver.test.js`): resistor values change brightness and too many LEDs in series stay dark. Diodes conduct one way, a photoresistor's resistance follows its Light slider and an NPN transistor acts as a switch that closes when base current flows (`test/simulation-basic-parts.test.js`). Capacitors charge and discharge over time, one solver step per frame. The simulated Arduino has an I2C bus (`src/simulation/i2c-devices.js`, `test/simulation-i2c.test.js`): the 16x2 and 20x4 LCD show text, the SSD1306 OLED shows graphics, the DS1307 answers with the time and the MPU6050 with its tilt slider. A PWM pin that reaches a capacitor settles at its average voltage. The SPI bus drives the ILI9341 colour screen and a MicroSD card the SD library can really write to (`src/simulation/spi-devices.js`, `test/simulation-spi.test.js`); NeoPixels, rings and matrices decode the real WS2812 signal (`test/simulation-pixels.test.js`); the 7-segment display, LED bar graph and keypad work. The test programs are compiled by `scripts/compile-test-programs.mjs` into `test/fixtures/programs.json`. The DHT22, IR remote, HX711 load cell and stepper motors work by pin timing (`src/simulation/pin-devices.js`), the relay and rotary encoder in the DC solver (`test/simulation-timed-parts.test.js`), an A4988 driver (`elera-a4988`, our own artwork) moves the stepper on its outputs one full step per STEP pulse, and the SD card keeps its files in the browser's storage. The DHT, IRremote and HX711 libraries are installed on the compile server but have only been tested against hand-written readers of the same signals.
- "Write code for my circuit" in the code panel writes a sketch from the wiring (`src/simulation/sketch-writer.js`): the first sensor gives a level from 0 to 1 that every output follows, or each output is tried in turn when there is no sensor. Recipes cover LEDs, the RGB LED, buzzer, servo, buttons and switches, the sensor modules, the distance sensor, the I2C LCD, NeoPixels and the DHT22; other parts are named in a comment. `test/sketch-writer.test.js` runs the written code for four lesson circuits on the simulator.
- `test/simulation.test.js` runs every lesson's program on its finished circuit and checks the parts behave as the lesson says.

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

Gap definitions and exit conditions live in [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md#known-contract-drift). `GAP-01` to `GAP-06`, `GAP-08` and `GAP-09` are closed. `GAP-03` was settled as a deliberate choice: Auto Wire leaves each wire in automatic routing with no waypoints, and the store routes those on every change, so Clean is not needed (`test/auto-wire-routing.test.js`). The rest are closed (every physical finding has a fixture in `test/physical-validation-findings.test.js` or `test/physical-core.test.js`, every electrical one in `test/physical-electrical-validation.test.js`): the live validator now runs the logical checks with shared-bus awareness and per-board hole lookup.

1. **P1, capacity alternatives:** live Auto Layout offers no proven larger or additional board (`GAP-10`). In practice the board runs out of pins before the breadboard runs out of room, and a failed Auto Wire or Auto Layout now explains that in plain words (`describeAutomationFailure`).
2. **P1, regression depth:** an automated browser fixture for the mixed circuit (`GAP-07`).
3. **P1, legacy rule parity:** the unused schema-v2 engine and its tests were removed; port the rules listed in `GAP-11` to the physical engine, each with a regression test.
4. **P2, performance:** the bundle is split by vendor and the simulator is lazy; the AI assistant and the dialogs could load on first use too.

For every engine change, name the affected contract rule, add the failing test first, and keep the command mutation boundaries.

## Handoff

As of 2026-10-05 everything is committed on `main`; there is no uncommitted feature work. Start with this file, then [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md) and [PHYSICAL_EDITOR_ARCHITECTURE.md](PHYSICAL_EDITOR_ARCHITECTURE.md). Make changes in `src/physical/` (or shared `src/core/` definitions), keep Auto Wire non-positional, Auto Layout the sole placement owner, Clean route-only and Validation read-only, and run `npm test` and `npm run build` before handing back.
