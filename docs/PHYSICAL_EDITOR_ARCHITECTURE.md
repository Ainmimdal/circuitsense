# Elera Physical Editor Architecture

Status: the editor the application runs; reconciled with the code 2026-10-05.

## Invariant

The circuit model is the truth. Placement is physical. Connections are semantic. Routing is visual. Konva renders the result.

## Existing architecture assessment

Before this slice, Elera's component definitions combined electrical metadata, Wokwi artwork, pixel dimensions, auto-wire policy and breadboard flags. The mutable editor store owned pixel-positioned instances and wires with `{instanceId, pinName}` endpoints. Newer schema-v2, board-registry, component-geometry and planner modules had already introduced useful logical/physical separation, explicit board topology and rigid footprints, but mounted components still duplicated authoritative `x/y`, pin geometry still depended partly on rendered Wokwi `pinInfo`, and interaction was distributed across Lit components.

The DOM canvas rendered every part as a Lit element and every wire in an SVG overlay. Pan/zoom used CSS transforms. Sidebar placement used HTML drag/drop while placed parts owned their pointer drag behavior. Breadboards were logical enough to expose 400/830 holes and internal groups, but were still rendered and moved as ordinary components.

The retained router had valuable human-readable behavior: orthogonal geometry, component escape segments, header fan-out, inflated obstacles, bend costs, deterministic net order, parallel-wire separation and short local breadboard jumpers. Its limitation was coupling to the global pixel store and renderer-derived bounds.

Undo/redo used complete snapshots with batching. Persistence already normalized legacy state into schema v2 logical components/nets and physical intent. The repository has no backend or Supabase client, although Supabase appears in report material.

## New subsystem boundaries

```text
Physical project (schema 4; schema 3 accepted on load)
  -> breadboard surfaces + footprint definitions
  -> deterministic snap solver + derived occupancy
  -> semantic connection resolver + net graph
  -> visual route generator/scorer
  -> Konva renderer and centralized interaction controller
```

The new modules live under `src/physical/` and `src/editor/`. None imports Lit, Konva, the DOM, Wokwi elements or the legacy global store, except the Lit/Konva host and the interaction controller at the outer edge.

The detailed Fritzing comparison, duplication audit and retained/deferred boundaries are recorded in [COMPONENT_ARCHITECTURE_ASSESSMENT.md](COMPONENT_ARCHITECTURE_ASSESSMENT.md).

## Shared definitions

`src/core/part-registry.js` normalizes catalog electrical metadata and calibrated component geometry into immutable part and package definitions. The physical footprint registry consumes that boundary, so every catalog item declared breadboard-mountable resolves to a rigid package rather than a guessed free-space footprint. Electrical roles and Auto Wire requirements stay separate because they answer different questions.

`src/core/breadboard-topology.js` is the one half/full breadboard authority. It owns stable hole IDs, millimetre positions, rail segmentation and electrical groups. The original pixel `board-registry` is now a derived compatibility projection; it no longer owns a second topology. Component row-grid calculations import the same topology, including the exact 7.62 mm E-F centre spacing.

## Coordinates

Geometry uses millimetres. Breadboard pitch is exactly 2.54 mm. Reusable transforms cover footprint-local to surface-local to world, inverse world-to-surface conversion, and world-to-screen camera conversion. Camera zoom/pan never changes project geometry.

## Breadboard surface

The half board owns 400 stable holes: 300 terminal holes and 100 rail holes. Each hole has an ID, grid and millimetre position, zone, bank, occupancy capability and electrical group. A-E and F-J strips are separate. The centre trench is explicit. Each of the four half-board rails is an independent unsplit group.

The renderer draws from this definition with one non-interactive hole shape and mathematical nearest-hole lookup. Konva hit objects are not the topology.

## Components and placement

Electrical definitions, footprint definitions, placed instances and Konva artwork are separate. The first two generic rigid footprints are:

- A generated standard 300-mil DIP8 package, eight pins, 2.54 mm lead pitch, 7.62 mm row spacing, centered origin, counter-clockwise numbering, rotations 0/180 and trench required. The same `createDipFootprint()` generator supports larger even-pin DIP packages.
- LED, two pins at 2.54 mm, rotations 0/90/180/270.

`BreadboardSnapSolver` converts the pointer to surface-local coordinates, enumerates nearby anchor holes and allowed rotations, projects every footprint pin, verifies physical holes, derived occupancy, board rules and internal-group safety, scores complete candidates deterministically, and returns a preview without mutating state. The interaction controller adds hysteresis and commits only on drop.

Mounted instances persist only surface ID, footprint, rotation and pin-to-hole bindings. Their world transform is derived. Moving the board therefore moves parts and semantic endpoints without rewriting bindings.

## Connectivity and routing

Connections use component-pin or surface-hole references. Auto Wire persists component-pin `netlistIntent` separately from the physical jumper records. `ConnectivityResolver` unions breadboard internal groups, mounted pin-to-hole contacts, component internal contacts and wires. It can resolve a component pin to its physical hole/electrical group, list its complete net and answer connectivity independently of rendering.

Every stable breadboard socket has a derived occupancy record: `FREE`, `COMPONENT_PIN`, or `WIRE_ENDPOINT`. Auto Wire first collapses mounted pins that already share fixed copper, then chooses a minimum connecting set across the remaining physical islands and reserves unique free sockets. Mixed nets terminate at a free socket in the mounted pin's group and continue normally to an off-board pin. Component routing bounds are independent keepouts rather than occupied holes.

Wires store semantic endpoints separately from route mode/waypoints. Automatic routes resolve current endpoint world positions and score orthogonal candidates using length, bends, crossings, obstacles, crowding and awkward fan-out. Manual waypoints are supported by the model. Moving a surface recomputes route geometry while keeping the wire's endpoints unchanged.

## Mutation, persistence and rendering

Commands cover add/move/mount components, move surfaces, and add/delete wires. The new store executes commands against cloned project state and provides undo/redo. It persists schema-4 semantic project data under a separate localStorage key, leaving schema-v2/legacy projects untouched for a later explicit migration adapter. Named local projects also store and restore schema-4 data through `physical/project-repository.js`.

The Konva host has five layers: background, board, wire, component and interaction. It recreates the scene from project state. Automatic routes are computed in a Web Worker (`routing-worker.js`) so dense scenes do not block input. A pointer-transparent DOM artwork layer reuses Wokwi or custom visuals for ordinary library parts. The resistor keeps its original Wokwi element in free space; compact-horizontal and upright breadboard packages use dedicated Wokwi-inspired SVG elements whose rendered pin centres are fitted to the authoritative package pins. Standard DIP artwork is procedural Konva presentation driven by the package geometry (body, legs, notch, pin-1 marker and label); it does not define pin positions. Konva remains the interaction and hit-testing owner. A new browser session starts with a demo half breadboard holding a DIP8 test IC, an LED and a wire (`defaultProject()` in `circuit-store.js`). Rigid breadboard parts use the generic snap solver; the wider metadata library receives explicit generated free-space footprints and terminals so boards and modules can be added, moved, wired and deleted. Hole hover highlights the topology-defined strip. Clicking two terminals creates a semantic wire.

## Validation bridge

The validation bar now reads the active physical store. Footprint legality, complete pin-to-hole geometry, exclusive occupancy, wire endpoints, incompatible intent nets sharing fixed copper, incomplete intended nets, redundant generated jumpers and controller presence are checked without reading Konva. Findings can select the corresponding visible component.

## Known limitations

- All parts declared breadboard-mountable have calibrated rigid package geometry. DIP8 and LED have dedicated procedural artwork in the active renderer; Arduino Uno has a dedicated free-space board visual, while several other parts still use their Wokwi adapter or functional labeled module artwork.
- Resistors use one electrical type with the unchanged Wokwi free-space visual, compact fixed-body horizontal breadboard packages spanning three through eight pitches, and an upright breadboard package. The preferred compact appearance occupies five hole positions (four pitch intervals) with a separately shortened body. The generic snap solver selects only complete legal variants; the renderer keeps recognizable leads, body and color bands.
- Auto Wire and Auto Layout mutate the active schema-4 project. Auto Wire reuses metadata-driven pin planning and generated helpers without moving or mounting parts, and realizes only missing physical jumpers. Auto Layout owns positioning, keeps user-placed free components clear of board bodies, and may mount only its own generated series helper beside an already-mounted owner when a legal footprint is available. It prefers compact horizontal placement and uses upright only as a capacity fallback.
- Route generation is intentionally compact. Manual waypoints and segment grips are editable (`wire-edit.js`); advanced A*, global crossing minimization and reserved channels remain future work.
- Schema-v2 projects are preserved in their old key but are not imported into schema 4.
- Named projects are stored in `localStorage` through `project-repository.js`; the account panel is a local mock with no backend.
- Validation covers physical legality and net completeness (`validation.js`) plus electrical checks over the resolved connectivity graph (`electrical-validation.js`): shorts, current budget, pin capabilities and constraints, duplicate pins with shared-bus awareness, supply pins, floating pins and LED resistors.
- Full-net component highlighting and richer physical-package selection controls remain future work.

## Recommended next phase

Build a schema-v2-to-schema-4 adapter, then migrate one complete Arduino Uno + LED/resistor circuit through connection planning, terminal selection, validation and route editing. After that, move additional rigid footprint records into the new registry, add flexible two-lead placement, and reconnect project/account persistence.
