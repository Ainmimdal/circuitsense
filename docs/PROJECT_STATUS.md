# Elera Project Status

Snapshot date: 2026-08-30  
Phase: semantic physical editor / reusable package vertical slice implemented; automation integration in progress  
Base revision: `main` / `origin/main` at `05c4c0e`

This is the current status source of truth. Engine behavior is governed by [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md), visualized in the automatically synchronized [SELF_HEALING_ENGINE.md](SELF_HEALING_ENGINE.md); the original rebuild boundaries are recorded in [REBUILD_SPEC.md](../REBUILD_SPEC.md).

## Current health

| Check | Status |
| --- | --- |
| Node test suite | 117 tests passing |
| Production build | Passing with Vite |
| Diff whitespace check | Passing |
| Lint/type check | No lint or type-check scripts are currently configured |
| Browser acceptance | Corrected 300-mil DIP8 package, E/F trench alignment, LED, semantic wire, active validation and Auto Wire/Auto Layout controls render verified; add/move/delete outcomes are covered at command/controller level because the browser harness cannot reliably deliver pointer events into the nested Konva shadow canvas |
| Bundle | Builds successfully; main JavaScript chunk is approximately 939 kB and triggers Vite's 500 kB warning |

The feature work is present in the working tree but has not been committed. The tree also contains pre-existing report/template deletions and report-directory reorganization that are outside the automation rebuild. Do not reset, restore or include those changes indiscriminately.

## Implemented

### Semantic physical editor vertical slice

- Konva now owns the interactive workspace through background, board, wire, component and interaction layers; Lit continues to own the application shell and controls.
- A renderer-independent schema-4 project stores placement surfaces, components, semantic wire endpoints and route intent.
- Explicit screen/world/surface/footprint transforms use millimetres and an exact 2.54 mm pitch.
- A logical half-size breadboard exposes 400 stable sockets, terminal-bank/trench topology, rails, mathematical hit lookup and derived occupancy.
- `createDipFootprint()` produces reusable, centered millimetre DIP packages. The first test IC uses `dip8-300mil` with exact 2.54 mm lead pitch, 7.62 mm row spacing and counter-clockwise numbering; electrical definition, package and procedural Konva artwork remain separate.
- DIP8 and LED footprints use one deterministic multi-pin snap solver with allowed rotations, hole availability, trench rules, electrical-group safety, preview candidates and hysteresis. No DIP-specific drag-placement branch exists.
- Arduino Uno and the wider component library can be added as explicit free-space semantic components, moved by their visible bodies, wired through generated terminals, selected and deleted with connected-wire cleanup.
- Mounted component transforms and wire endpoints derive from semantic hole bindings, so moving the breadboard preserves bindings/nets and recomputes routes.
- Union-find connectivity combines component pins, mounted contacts, board topology and semantic wires without Konva.
- The new router separates endpoints from route geometry and scores orthogonal candidates for length, bends, obstacles, crossings, crowding and fan-out quality.
- Command-based mutations and independent schema-4 local persistence provide undo/redo without serializing Konva state.
- The visible Auto Wire, Auto Layout, Clean and Validation controls now operate on the active physical store rather than the hidden legacy editor state.
- Full design and migration notes are recorded in `docs/PHYSICAL_EDITOR_ARCHITECTURE.md`.

### Editor and circuit model

- Lit 3/Vite editor with all 50 public `@wokwi/elements` 1.9.2 visuals, drag/drop, manual wiring, pan/zoom, selection, undo/redo and project persistence. All six included MCUs have board-specific Auto Wire profiles; Nano and Nano RP2040 have legal rigid breadboard footprints, while socketed/wide boards remain external jumper-connected controllers.
- Schema v2 separates logical component-pin connectivity from derived breadboard contacts, conductors and route geometry.
- Logical net construction classifies signal, power, ground, I2C and conflict domains.
- Generated helper components, such as an LED resistor, have deterministic IDs and provenance.

### Breadboards and physical realization

- First-class half-size 400-point and full-size 830-point board definitions.
- Generated full-color SVG/Lit board visuals expose every hole as editor pin metadata.
- Half-board scale is calibrated to a 2.54 mm pitch and approximately 83.82 x 54.36 mm.
- Terminal strips, split/full rails, connector types and internal electrical groups are modeled explicitly.
- Rigid through-hole footprints, calibrated lead centres, uniform scaling, legal rotations, occupied-hole checks and centre-trench constraints are implemented for both Nano-class MCUs and the supported discrete/DIP packages.
- Manual mounted-component drag and rotation rebuild atomically and roll back on an invalid result.
- Capacity is proven by a complete placement search; verified add-board or replace-with-larger-board alternatives are returned when required.

### Automation commands

- **Auto Wire** assigns compatible Arduino pins, chooses the nearest compatible header, shares supply nets, inserts deterministic helpers and preserves existing breadboard mounts without moving components.
- **Auto Wire** supports simultaneous controllers with stable per-component ownership, independent pin/I2C budgets and isolated supply domains. A failed scoped assignment leaves the previous project unchanged.
- **Auto Layout** owns placement. Each controller receives an independent cluster; direct components use the restored header-aligned layout, while only actually occupied breadboards become rigid scene clusters. Generated helpers stay with their owner, clusters do not overlap, repeated calls are idempotent, and wiring plus placement commit as one undo step.
- **Clean** owns waypoint optimization only. It uses obstacle-aware orthogonal routing, header fanout and a special short body-clear router for same-board jumpers.
- Signal nets receive stable distinct colors; power is red and ground is black.
- Breadboard power/ground realization uses rail feeders and unique local branch holes instead of independent source wires for every component.

### Validation and documentation

- Logical validation covers board presence, LED resistance, current limits, signal-pin conflicts, serial-pin warnings, missing supply connections, I2C pins, unconnected components and floating pins.
- Breadboard validation covers requirement/usefulness, capacity, invalid or multiply occupied holes, footprint legality, disconnected strips and power-to-ground shorts.
- The automation engine contract has stable rule IDs, command mutation boundaries, recovery behavior, traceability links and a machine-checked drift ledger.
- The self-healing engine map is regenerated from the normative contract before dev, test and build; its pipeline, rule catalog, ownership diagram, fingerprint and traceability registry cannot silently drift.
- Focused tests cover logical nets, schema migration, board topology, scale, rigid geometry, placement, rail distribution, jumper inference, capacity alternatives, routing, manual wire editing, interaction stability and command integration.
- Dense direct wiring keeps every jumper separate, limits congestion detours to a local corridor, and uses stable orthogonal segment grips for manual adjustment.
- The active physical Auto Layout now follows controller header affinity, aligns the breadboard on connected signal conductors, keeps controller and board bodies separated, and routes adjacent header wires through distinct perpendicular escape lanes with hard component-body avoidance.

## Smart-button contract

| Command | Owns | Must preserve |
| --- | --- | --- |
| Auto Wire | Logical pin/net assignment and required helper generation | All component/board positions and existing valid mounted footprints |
| Auto Layout | Complete unlocked component and board placement, followed by routing | Locked placements and electrical intent |
| Clean | Route waypoints only | Components, nets, pin assignments, holes, colors and board topology |
| Validation | Read-only findings | Every circuit and editor state layer |

## Known gaps and next priorities

The numbered definitions and exit conditions live in [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md#known-contract-drift).

`GAP-01` is closed: Auto Layout now runs from calibrated metadata without a DOM-readiness polling loop.

`GAP-02` is closed: incomplete controller/pin allocation rejects the scoped plan without applying partial wiring. `GAP-08` is closed: simultaneous controllers now have stable ownership, independent budgets and separate layout clusters in the active physical editor.

1. **P0 - validation correctness:** close `GAP-04` and `GAP-05` by recognizing legal shared I2C buses and resolving full-board holes through the correct board definition.
2. **P1 - command completion:** decide and implement the explicit Auto Wire route-dirty/baseline-routing behavior in `GAP-03`.
3. **P1 - regression depth:** add one focused fixture per public validation finding (`GAP-06`) and automate the mixed browser interaction fixture (`GAP-07`).
4. **P2 - performance:** profile dense breadboard scenes and split the production bundle after correctness is stable.

For every engine change, name the affected contract rule, add the failing planner/integration test first, fingerprint forbidden state layers, and preserve the command mutation boundaries.

## Handoff

Handoff (2026-07-16): The breadboard-aware rebuild, six MCU Auto Wire profiles, calibrated Nano/Nano RP2040 mounting, complete component physical-interface audit, idempotent Auto Layout and one-bus half-board rail synthesis are implemented in the current uncommitted working tree on top of `main` commit `05c4c0e`; 78 tests and the production build pass. Begin with `docs/ENGINE_CONTRACT.md` and `docs/SELF_HEALING_ENGINE.md`, and preserve the unrelated report/template deletions and directory reorganization already present. The safest next work is to close contract gaps `GAP-02`, `GAP-04` and `GAP-05` in that order while keeping Auto Wire non-positional, Auto Layout the sole placement owner, Clean waypoint-only and Validation read-only.
