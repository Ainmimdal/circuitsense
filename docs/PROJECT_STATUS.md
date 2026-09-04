# Elera Project Status

Snapshot date: 2026-09-02
Phase: semantic physical editor / reusable package vertical slice implemented; automation integration in progress  
Base revision: `main` / `origin/main` at `05c4c0e`

This is the current status source of truth. Engine behavior is governed by [ENGINE_CONTRACT.md](ENGINE_CONTRACT.md), visualized in the automatically synchronized [SELF_HEALING_ENGINE.md](SELF_HEALING_ENGINE.md); the original rebuild boundaries are recorded in [REBUILD_SPEC.md](../REBUILD_SPEC.md).

## Current health

| Check | Status |
| --- | --- |
| Node test suite | 206 of 207 tests passing. The remaining failure predates this work: one waypoint insertion expectation drift in `test/physical-wire-edit.test.js`. |
| Production build | Passing with Vite |
| Diff whitespace check | Passing |
| Lint/type check | No lint or type-check scripts are currently configured |
| Browser acceptance | Corrected 300-mil DIP8 package, E/F trench alignment, LED, semantic wire, active validation and Auto Wire/Auto Layout controls render verified. The real AI panel, provider badge, prompt and settings entry point also render without browser console errors; add/move/delete outcomes are covered at command/controller level because the browser harness cannot reliably deliver pointer events into the nested Konva shadow canvas. |
| Bundle | Builds successfully; main JavaScript chunk is approximately 1,041 kB and triggers Vite's 500 kB warning |

The feature work is present in the working tree but has not been committed. The tree also contains pre-existing report/template deletions and report-directory reorganization that are outside the automation rebuild. Do not reset, restore or include those changes indiscriminately.

## Implemented

### Provider-neutral AI circuit agent

- The former scripted AI mock is replaced by a real multi-turn tool-calling loop over the active semantic physical store.
- DeepSeek, Google Gemini, OpenAI, OpenRouter and custom OpenAI-compatible endpoints share one provider boundary with editable model IDs and live connection testing.
- The agent can search the actual parts catalog, inspect the circuit and controller pin budget, batch compatible-pin queries, place/delete components, validate exact-pin connections, invoke separate Auto Wire/Arrange/Route operations, validate, undo, and clear with confirmation.
- Controller capabilities and constraints are derived from the existing `autoWirePins` inventory, so AI queries, exact-pin validation, footprints and deterministic Auto Wire share one pin source.
- Tool arguments are validated, mutations remain inside store transactions, provider/tool failures return structured results, repeated calls and runaway tool rounds are bounded, and requests can be cancelled. Component discovery is batched instead of embedding the full catalog in every system prompt; BYOK users can configure a 5-50 tool-round budget and receive a final tool-free progress summary when it is reached.
- Current-chat memory is canonical and provider-neutral. OpenAI Responses and Gemini Interactions use server-side continuation IDs; stateless providers receive an eight-turn transcript with deterministic older-turn summaries. Stable instructions precede changing project context for prompt-cache reuse, OpenRouter receives a sticky session ID, and the AI panel reports input/cached-input/output token totals.
- Ask-before-apply, explain-first, suggest-only and auto-apply-safe action modes are enforced by the runtime rather than prompt text alone.
- Provider preferences persist locally while API keys remain in tab-scoped session storage. Production deployment still requires a server-side secret relay and quota controls.
- Architecture, provider requirements and extension boundaries are recorded in `docs/AI_AGENT.md`; focused regression coverage is in `test/ai-agent.test.js`.

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

### Component architecture consolidation

- A normalized part boundary now presents stable pin identity, electrical roles, Auto Wire requirements, internal nets, visual adapters and package IDs without conflating those concerns.
- Every catalog part declared breadboard-mountable resolves to calibrated rigid package geometry in the active physical footprint registry.
- Half/full breadboard topology now has one millimetre source. The original pixel registry is a compatibility projection and shares the exact 2.54 mm pitch and 7.62 mm E-F centre spacing.
- The running application no longer imports the retired global editor store or placed-component renderer. Named project persistence now saves and restores the active schema-4 project.
- The Fritzing comparison and the boundaries intentionally retained are documented in `docs/COMPONENT_ARCHITECTURE_ASSESSMENT.md`.
- The served converted-part catalog contains 12 validated Fritzing families produced from the 13 supplied archives (the fixed and original Pololu DRV8833 archives share one stable part ID). Imported boards, sensors, drivers and the upright resistor are available through the `Imported` filter. Their free-space footprints use each SVG's declared physical `in`/`mm` dimensions instead of generic module-size clamping; multi-pin packages without trustworthy pitch metadata intentionally remain free-mounted.

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
- **Auto Layout** preserves its user-facing Auto Wire → arrange → route convenience pipeline in one history transaction. Its physical arrangement stage remains independently callable for AI-selected topology and never changes semantic wires, exact pin assignments, helpers, or route intent.
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
- The active physical Auto Wire now keeps logical component-pin intent separate from breadboard realization, collapses fixed strip/rail connectivity, allocates unique free jumper sockets, supports mixed mounted/off-board nets, and commits atomically when capacity is insufficient.
- Every physical breadboard socket exposes stable topology plus derived `FREE`, `COMPONENT_PIN`, or `WIRE_ENDPOINT` occupancy; validation reports socket collisions, invalid endpoints, incompatible intent nets on one group, incomplete nets, and redundant generated jumpers.
- The unchanged Wokwi resistor remains the free-space/direct visual. Breadboard mounting uses a compact SVG occupying exactly five hole positions (four pitch intervals) with a separately shortened body, optional three-to-eight-pitch leads without body scaling, or an upright SVG—all as physical variants of the same electrical component.
- Breadboard Auto Layout moves user-placed free components out of the board keepout instead of implicitly mounting them. A generated LED series resistor is the narrow exception: the combined command prefers the five-hole compact package, falls back through other horizontal spans, and uses upright only when no horizontal package fits legally. It then re-realizes the net so same-strip copper removes the redundant jumper.
- Automatic routes treat every unrelated breadboard body as a hard keepout. A route receives a board exception only when one of its physical endpoints belongs to that board.

## Smart-button contract

| Command | Owns | Must preserve |
| --- | --- | --- |
| Auto Wire | Logical pin/net assignment and required helper generation | All component/board positions and existing valid mounted footprints |
| Auto Layout | Auto Wire, complete unlocked component/board placement, and routing | Locked placements and unrelated manual intent |
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
