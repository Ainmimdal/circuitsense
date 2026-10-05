# Elera Circuit Core Rebuild Specification

Status: historical design baseline. It was implemented as the schema-v2 engine (`src/store.js`, `src/services/`, `src/core/breadboard-planner.js`), which the app no longer loads; the running editor uses the schema-4 physical model described in `docs/PHYSICAL_EDITOR_ARCHITECTURE.md`. Ongoing engine behavior is governed by `docs/ENGINE_CONTRACT.md`; current health and remaining work are tracked in `docs/PROJECT_STATUS.md`.

## Scope

Keep the Lit editor shell, component sidebar, Wokwi visuals, breadboard SVG renderer and validation UI. Replace the circuit document, breadboard realization, automatic placement and automatic routing core.

## Non-negotiable invariants

1. Logical circuit connectivity never contains breadboard hole endpoints.
2. Physical realization is derived from the logical circuit and can be discarded and regenerated.
3. A component footprint is rigid. Placement may translate or rotate it, never stretch it.
4. One physical breadboard hole accepts at most one lead or jumper endpoint.
5. One internally connected terminal group belongs to at most one logical net.
6. A power rail is a bus: one source feeder per supply net and unique branch holes.
7. Direct wiring remains available when using the breadboard adds no value.
8. A planning command either commits one complete valid result or changes nothing.
9. Unknown or unready components produce diagnostics; they never leave Layout waiting forever.
10. Persisted projects store source state and locked user constraints, not transient routing output.

## Source document

```js
{
  schemaVersion: 2,
  components: [
    { id, componentId, x, y, rotation, locked }
  ],
  nets: [
    { id, kind, endpoints: [{ instanceId, pinName }] }
  ],
  placementConstraints: [
    { instanceId, boardId, anchorHole, rotation, locked }
  ]
}
```

`kind` is one of `signal`, `power`, `ground`, `i2c`, or `other`. Helper parts such as automatically inserted resistors are ordinary logical components marked with `generatedBy` metadata; they are not inferred later from visual wiring.

## Derived physical plan

```js
{
  status: 'ready' | 'insufficient-capacity' | 'invalid',
  boardPlacements: [],
  componentPlacements: [],
  contacts: [],
  conductors: [],
  diagnostics: [],
  alternatives: []
}
```

Each contact maps one logical pin to one physical connector or breadboard hole. Each conductor has a `netId`, connector types, jumper type and routed geometry. Internal terminal-strip and rail connectivity is represented by the board model, not fake visible wires.

## Component geometry

Each component type has one calibrated geometry record:

```js
{
  size,
  renderScale,
  visualOffset,
  pins: { pinName: { x, y, connectorType } },
  footprints: [{ rotations, holes: { pinName: { dx, dy } }, body }]
}
```

The shared breadboard pitch is 10 px = 2.54 mm. `renderScale` is uniform and belongs to the component type. Runtime instances never have independent X/Y scales.

Manual mounting enumerates rigid transforms for allowed rotations, aligns a footprint pin to a nearby hole, validates every other hole and chooses the valid transform requiring the least movement. Failure leaves the component unmounted and returns an actionable reason.

## Planner pipeline

1. Normalize and migrate the source document.
2. Assign Arduino pins and logical nets. Insert required helper components logically.
3. Decide whether breadboards are required, useful or unnecessary.
4. Generate legal rigid footprint candidates.
5. Place locked and most-constrained components first.
6. Assign terminal groups and rails to logical nets.
7. Choose direct conductors versus breadboard realization per net.
8. Route remaining conductors with an orthogonal length/bend/crossing cost.
9. Validate the complete logical circuit and physical plan.
10. Commit atomically only when the plan is ready.

Placement scoring prioritizes, in order: validity, fewer jumpers, shorter total length, fewer crossings and bends, less movement from the current layout.

## Breadboard capacity

Capacity is proven only by finding a complete legal placement. Free-hole counts are diagnostic information, not proof of fit.

If the current configuration cannot fit, the planner tries:

1. Repacking unlocked components on current boards.
2. Adding one board of the current type.
3. Replacing with the smallest supported larger board.
4. Adding further boards up to the configured planning limit.

Failure returns unplaced components, the limiting constraint and viable alternatives. The UI offers `Add breadboard`, `Replace with larger breadboard`, `Review locked placements`, and `Cancel`. Selecting an alternative reruns the planner; cancelling changes nothing.

## Command semantics

### Wire

May assign pins, create logical nets, insert required helper components and route conductors using current placements. It must not move components or boards. Missing required hardware returns a suggestion rather than a half-built realization.

### Layout

Runs the complete planner and may add/move boards and unlocked components. It preserves locked manual placements. It commits only a complete valid plan.

### Clean

Changes conductor waypoints only. It must not change components, nets, pin assignments, hole assignments or board topology.

### Manual drag

Changes one component placement constraint. Dropping on a board attempts rigid footprint snapping; dragging away unmounts it. It never rescales the component or rewires unrelated nets.

Component-level commands use the same operations as toolbar commands with a restricted component scope.

## Persistence and migration

Version 1 imports recover logical endpoints from `physical.autoBreadboard.originalFrom/originalTo` where present, remove generated component-lead wires and discard `physicalScale`, automatic `mountedOn`, automatic hole assignments and waypoints. Valid user-locked placements are retained only when their component footprint and holes remain valid.

Unknown component IDs are preserved as disabled placeholders with diagnostics. They do not participate in planning readiness and cannot block the command loop.

## Acceptance fixtures

The primary mixed fixture contains Arduino Uno, DHT22, pushbutton, LED plus generated resistor and NeoPixel. Acceptance requires:

- no component or board overlap;
- exact rigid pin-to-hole alignment for mounted parts;
- one feeder for each used power/ground rail;
- unique rail branch holes;
- no accidental shorts or disconnected logical nets;
- no duplicate helper resistors after repeated commands;
- Wire does not move components;
- Clean changes only waypoints;
- Layout is deterministic and completes without DOM-readiness loops;
- insufficient capacity produces alternatives and no partial mutation;
- version 1 projects load without stale breadboard realization.

Pure planner and store-level integration tests are the primary automated correctness boundary. Browser inspection currently verifies pointer snapping and final rendered geometry manually; automated browser acceptance remains tracked as `GAP-07` in the engine contract.
