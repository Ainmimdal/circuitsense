# Fritzing Part Import Boundary

The complete converter-facing component definition is documented in
[`ELERA_COMPONENT_DEFINITION.md`](ELERA_COMPONENT_DEFINITION.md). The example
record at [`examples/elera-fritzing-part-v1.example.json`](examples/elera-fritzing-part-v1.example.json)
is valid input for the current contract after its SVG asset is supplied.

Elera does not parse or trust Fritzing SVG geometry at runtime. The build-time
converter at `scripts/convert-fritzing-part.mjs` reads a Fritzing `.fzpz`
archive, sanitizes its breadboard SVG, then emits `elera-fritzing-part-v1` data
for `createFritzingPartDefinition()`.

The converter output deliberately separates three kinds of information:

- `pins`: stable semantic connector IDs, labels, electrical roles, and optional Auto Wire requirements.
- `artwork`: a sanitized static SVG URL, its source dimensions, declared physical width/height in millimetres, and each connector's coordinates in artwork units. Source coordinates align terminals with the picture; physical dimensions control free-space scale.
- `packages`: physical lead coordinates in millimetres, legal rotations, trench requirements, and internal nets. These records control breadboard mounting and routing.
- `library`: source, family, variant, technology, taxonomy, and tags used by the component menu for grouping, filtering, and search.

That separation is mandatory. A Fritzing connector's SVG position must never silently become a breadboard-hole coordinate.

## Intermediate record

```js
{
  format: 'elera-fritzing-part-v1',
  id: 'vendor-part-id',
  name: 'Part name',
  description: 'Optional description',
  category: 'sensor',
  sourcePart: 'original-file.fzp',
  library: {
    source: 'fritzing',
    family: 'temperature-sensor',
    variant: 'through-hole',
    technology: 'THT',
    taxonomy: 'sensors.temperature',
    tags: ['temperature', 'sensor']
  },
  artwork: {
    svgUrl: '/converted-parts/vendor-part-id/breadboard.svg',
    sourceSize: { width: 120, height: 80 }
  },
  pins: [{
    id: 'VCC',
    label: 'Power',
    fritzingConnectorId: 'connector0',
    artwork: { x: 12, y: 68 },
    electricalRole: 'VCC',
    autoWireRequirement: 'VCC'
  }],
  packages: [{
    id: 'vendor-part-id-2.54mm',
    placementMode: 'breadboard-rigid',
    anchorPinId: 'VCC',
    validRotations: [0, 180],
    pins: [{ pinId: 'VCC', x: 0, y: 0 }],
    routingBounds: { x: -2, y: -5, width: 20, height: 10 }
  }],
  propertyDefinitions: [{
    name: 'variant', type: 'string', control: 'select',
    options: ['default'], effect: 'physical-package', editable: true
  }]
}
```

Parts without a calibrated physical package remain free-mounted and connect by jumper wires. Importing artwork alone must not claim breadboard compatibility.

## Converter usage

```powershell
node scripts/convert-fritzing-part.mjs "C:\path\to\part.fzpz"
```

The default output is `public/converted-parts/<part-id>/`. The converter also
updates `public/converted-parts/catalog.json`; Elera loads this catalog on
startup and registers the converted parts in the sidebar.

The checked-in catalog currently contains 12 part families converted from the
13 supplied `.fzpz` archives. The two Pololu DRV8833 archives describe the same
stable module ID and therefore intentionally update one catalog entry instead
of creating a duplicate. Controller records use Fritzing's `board` category,
which the sidebar presents under **Controller boards**.

The sidebar keeps the existing task-oriented categories, groups repeated
families as variants, and offers `Imported` and `My parts` filters. Converter
metadata is also indexed by search, so a Fritzing taxonomy or tag can find a
part without exposing that taxonomy as another menu hierarchy.

Use `--force` to regenerate an existing part. Run `--help` for ID, category,
output-path, explicit pin-spacing, and package-inference options.

## Converter stages

1. Unzip or locate the `.fzp` and SVG files and resolve the breadboard view.
2. Parse connector IDs from `.fzp`; map each to its SVG terminal or connector element.
3. Sanitize SVG content, preserve declared `in`/`mm` dimensions as explicit millimetres, and rewrite IDs and references to prevent collisions.
4. Require or derive a physical package in millimetres. The first implementation only infers two-pin linear packages from explicit Fritzing pin-spacing metadata or `--pin-spacing-mm`. If confidence is insufficient, it omits the package and leaves the part free-mounted.
5. Map Fritzing connector types to Elera electrical roles with explicit overrides for ambiguous pins.
6. Validate the intermediate record, preview it, and only then register or persist it.

The current script covers archive parsing, SVG sanitization, intermediate-record validation, generated-asset persistence, and local catalog registration. A browser file-picker/import-review UI and richer multi-pin package inference remain future work.
