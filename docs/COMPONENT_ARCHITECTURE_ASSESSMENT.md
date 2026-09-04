# Elera Component Architecture Assessment

Status: implemented consolidation pass, 2026-09-02.

## Conclusion

Elera does not need a Fritzing-style rewrite. Its separation of semantic connectivity, physical placement, route geometry and rendering is valuable for validation, Auto Wire and future simulation. The material complexity came from overlapping registries and from leaving both the original pixel editor and the schema-4 physical editor connected to the application shell.

This pass consolidates those overlaps while retaining the useful boundaries.

## Fritzing comparison

Fritzing describes a reusable part with shared metadata and connector/bus identities, then binds those connectors into separate artwork for breadboard, schematic, PCB and icon views. A placed part references that shared definition. Optional simulation data is another capability of the part; it is not the source of connector placement.

Elera now follows the same useful shape without copying Fritzing's file format:

| Concern | Fritzing part model | Elera after this pass |
| --- | --- | --- |
| Shared identity | Part metadata plus stable connector IDs | Normalized part definition with stable pin IDs |
| Electrical meaning | Connector types and internal buses | Electrical roles, capabilities, constraints and internal nets |
| Physical package | Connector geometry in each view | Rigid package pins in millimetres |
| Artwork | Separate SVG per view | Wokwi/image/native visual adapter |
| Placed instance | Model part refers to shared part | Schema-4 component refers to definition and footprint IDs |
| Routing | Derived from placed connectors | Derived from semantic endpoints and current transforms |
| Simulation | Optional SPICE/model properties | Reserved optional simulation adapter |

The main intentional difference is physical authority. Fritzing connector positions are commonly bound through view artwork. Elera keeps rigid lead centres in package geometry and treats artwork as an adapter. That is necessary for exact breadboard snapping, automated capacity checks and deterministic routing.

## Sources of truth

The retained authoring inputs have distinct jobs:

- `component-library.js` supplies catalog/UI metadata and electrical/Auto Wire policy.
- `core/component-geometry.js` supplies calibrated native artwork points and rigid grid packages.
- `core/part-registry.js` is the normalized read boundary consumed by the physical editor. It keeps electrical role and Auto Wire requirement separate and produces immutable millimetre package definitions.
- `core/breadboard-topology.js` is the only breadboard hole, pitch, trench and electrical-group definition.
- Schema-4 project data is the only mutable circuit state used by the running application.

The catalog and geometry files remain separate because electrical variants can share packages and one electrical part may eventually offer multiple packages. Merging them into one large object would reduce file count without reducing conceptual complexity.

## Duplications removed

1. The active footprint registry previously defined DIP8 and LED explicitly but generated free-space footprints for the other catalog parts even when calibrated rigid packages existed. It now imports every calibrated package through the normalized registry. All declared breadboard-mountable parts resolve to rigid packages.
2. Half/full breadboard holes were generated twice: once in pixels and once in millimetres, with different centre-trench spacing. `breadboard-topology.js` now owns both boards in millimetres. `board-registry.js` is a compatibility projection for the older planners and visuals.
3. Terminal-row grid indices were also duplicated in component geometry. They now come from the canonical topology, preserving a three-pitch/7.62 mm E-F centre spacing.
4. The application shell and named-project modal still imported the retired global editor store. The shell now uses only the physical store, named projects persist the active schema, and the retired placed-component renderer is no longer loaded in production.
5. Four toolbar settings changed only the hidden legacy store and had no effect on the physical canvas. They were removed. The functional Ortho/Free and Snap controls remain.

## Boundaries deliberately retained

- Package geometry is not merged with artwork. A visual bounding box must never define lead centres or placement legality.
- Routing is not merged with connectivity. Clean may change paths without changing semantic endpoints.
- Validation is not merged with Auto Wire. Validation remains read-only; Auto Wire remains transactional.
- Component definitions are not copied into placed instances. Instances retain IDs, properties and placement only.
- Simulation is not embedded in rendering or validation. A future simulator can consume normalized pins, internal nets and optional model metadata through a separate adapter.
- Legacy planner modules remain in the repository while their regression coverage and migration adapters are still useful, but they are no longer part of the production application graph.

## Geometry invariants

These are non-negotiable during later catalog migration:

- One physical scalar: millimetres.
- Breadboard/package pitch: exactly 2.54 mm.
- Breadboard E-F centre spacing: exactly 7.62 mm.
- Calibrated package pin vectors are integer multiples of 2.54 mm.
- A mounted part uses one rigid transform and legal rotation; pins are never snapped independently.
- Artwork bounds are for presentation/hit testing only and cannot replace routing bounds or package pins.
- Persisted mounts reference stable surface, footprint, pin and hole IDs.

## Deferred changes

No broad catalog rewrite is justified yet. The next low-risk consolidation is to migrate catalog entries incrementally into declarative part records and keep `componentLibrary` as a derived UI projection. Each migrated part should first pass pin-identity, package-spacing, placement, validation and Auto Wire fixtures. The old store and planner services can be deleted only after their remaining tests and any required schema-v2 import path have been ported to the physical model.
