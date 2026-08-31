# Elera Physical Editor Architecture

Status: working Konva vertical slice, 2026-08-30.

## Invariant

The circuit model is the truth. Placement is physical. Connections are semantic. Routing is visual. Konva renders the result.

## Existing architecture assessment

Before this slice, Elera's component definitions combined electrical metadata, Wokwi artwork, pixel dimensions, auto-wire policy and breadboard flags. The mutable editor store owned pixel-positioned instances and wires with `{instanceId, pinName}` endpoints. Newer schema-v2, board-registry, component-geometry and planner modules had already introduced useful logical/physical separation, explicit board topology and rigid footprints, but mounted components still duplicated authoritative `x/y`, pin geometry still depended partly on rendered Wokwi `pinInfo`, and interaction was distributed across Lit components.

The DOM canvas rendered every part as a Lit element and every wire in an SVG overlay. Pan/zoom used CSS transforms. Sidebar placement used HTML drag/drop while placed parts owned their pointer drag behavior. Breadboards were logical enough to expose 400/830 holes and internal groups, but were still rendered and moved as ordinary components.

The retained router had valuable human-readable behavior: orthogonal geometry, component escape segments, header fan-out, inflated obstacles, bend costs, deterministic net order, parallel-wire separation and short local breadboard jumpers. Its limitation was coupling to the global pixel store and renderer-derived bounds.

Undo/redo used complete snapshots with batching. Persistence already normalized legacy state into schema v2 logical components/nets and physical intent. The repository does not currently contain a live Supabase client; account projects are a localStorage mock despite Supabase being described in report material.

## New subsystem boundaries

```text
Physical project (schema 4)
  -> breadboard surfaces + footprint definitions
  -> deterministic snap solver + derived occupancy
  -> semantic connection resolver + net graph
  -> visual route generator/scorer
  -> Konva renderer and centralized interaction controller
```

The new modules live under `src/physical/` and `src/editor/`. None imports Lit, Konva, the DOM, Wokwi elements or the legacy global store, except the Lit/Konva host and the interaction controller at the outer edge.

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

Connections use component-pin or surface-hole references. `ConnectivityResolver` unions breadboard internal groups, mounted pin-to-hole contacts and wires. It can resolve a component pin to its physical hole/electrical group, list its complete net and answer connectivity independently of rendering.

Wires store semantic endpoints separately from route mode/waypoints. Automatic routes resolve current endpoint world positions and score orthogonal candidates using length, bends, crossings, obstacles, crowding and awkward fan-out. Manual waypoints are supported by the model. Moving a surface recomputes route geometry while keeping the wire's endpoints unchanged.

## Mutation, persistence and rendering

Commands cover add/move/mount components, move surfaces, and add/delete wires. The new store executes commands against cloned project state and provides undo/redo. It persists schema-4 semantic project data under a separate localStorage key, leaving schema-v2/legacy projects untouched for a later explicit migration adapter.

The Konva host has five layers: background, board, wire, component and interaction. It recreates the scene from project state. A pointer-transparent DOM artwork layer reuses Wokwi or custom visuals for ordinary library parts. Standard DIP artwork is procedural Konva presentation driven by the package geometry (body, legs, notch, pin-1 marker and label); it does not define pin positions. Konva remains the interaction and hit-testing owner. A default test IC/LED/wire sample demonstrates the slice. Rigid breadboard parts use the generic snap solver; the wider metadata library receives explicit generated free-space footprints and terminals so boards and modules can be added, moved, wired and deleted. Hole hover highlights the topology-defined strip. Clicking two terminals creates a semantic wire.

## Validation bridge

The validation bar now reads the active physical store. Footprint legality, complete pin-to-hole geometry, occupancy, wire endpoints and controller presence are checked without reading Konva. Findings can select the corresponding visible component.

## Known limitations

- DIP8 and LED currently have calibrated breadboard-mounting artwork. Arduino Uno has a dedicated free-space board visual, while the rest of the metadata library uses functional labeled module artwork until calibrated visuals are migrated.
- Flexible resistor/diode lead endpoints are designed for but not implemented.
- Auto Wire and Auto Layout now mutate the active schema-4 project. Auto Wire reuses metadata-driven pin planning and generated helpers without moving parts; Auto Layout owns positioning and legal generic breadboard mounting. More advanced breadboard bus synthesis remains to be migrated into this active model.
- Route generation is intentionally compact; advanced A*, crossing minimization, editable handles and reserved channels remain future work.
- Schema-v2 projects are preserved in their old key but are not yet imported into schema 3.
- The account/projects dialog remains backed by the legacy local mock rather than Supabase.
- Full-board surfaces, body collision/keepouts, rotate UI, delete UI and full-net component highlighting are not migrated yet.

## Recommended next phase

Build a schema-v2-to-schema-3 adapter, then migrate one complete Arduino Uno + LED/resistor circuit through connection planning, terminal selection, validation and route editing. After that, move additional rigid footprint records into the new registry, add flexible two-lead placement, and reconnect project/account persistence.
