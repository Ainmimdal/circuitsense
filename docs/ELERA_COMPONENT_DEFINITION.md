# Elera Component Definition for Fritzing Imports

This is the converter-facing definition for an imported Fritzing part.
The converter should emit a sanitized `elera-fritzing-part-v1` record and let
Elera validate and register it with `createFritzingPartDefinition()` from
`src/core/fritzing-part-contract.js`.

For converter-side structural validation, use the machine-readable schema at
[`examples/elera-fritzing-part-v1.schema.json`](examples/elera-fritzing-part-v1.schema.json).
The runtime JavaScript contract remains the final authority because it also
checks cross-field rules such as duplicate pin IDs and package pin references.

## Design rule

An imported component has three separate sources of truth:

| Concern | Definition field | Units | Purpose |
| --- | --- | --- | --- |
| Artwork | `artwork.svgUrl`, `artwork.sourceSize`, `pins[].artwork` | SVG user units | Render the extracted Fritzing breadboard SVG and place visible pin markers |
| Electrical meaning | `pins[].electricalRole`, `pins[].autoWireRequirement`, `internalNets` | Elera identifiers | Validation, Auto Wire, and bus/short detection |
| Physical mounting | `packages[].pins`, `packages[].routingBounds` | millimetres | Rigid breadboard placement, rotation, collision, and routing |

Never convert an SVG coordinate directly into a breadboard coordinate. The
SVG pin position belongs in `pins[].artwork`; a physical lead position belongs
in `packages[].pins` and must be measured or calibrated independently.

## Complete intermediate record

```js
{
  // Required format marker.
  format: 'elera-fritzing-part-v1',

  // Stable catalog identity. Use a namespaced, kebab-case ID where possible.
  id: 'adafruit-dht22',
  name: 'DHT22 Temperature and Humidity Sensor',
  description: 'Four-pin digital temperature and humidity sensor',
  category: 'sensor',

  // Provenance is retained for debugging and future re-imports.
  sourcePart: 'DHT22.fzp',

  // Catalog metadata powers family grouping, source filters, and search.
  library: {
    source: 'fritzing',
    family: 'dht-sensor',
    variant: 'dht22',
    technology: 'THT',
    taxonomy: 'sensors.temperature-humidity',
    tags: ['temperature', 'humidity', 'digital sensor']
  },

  // This must point to a sanitized SVG that is available to the Elera app.
  artwork: {
    svgUrl: '/parts/adafruit-dht22/breadboard.svg',
    sourceSize: { width: 54, height: 130 }
  },

  // One record per electrical connector.
  pins: [
    {
      id: 'VCC',
      label: 'VCC',
      connector: 'male',
      electricalRole: 'VCC',
      autoWireRequirement: 'VCC',
      capabilities: ['power'],
      artwork: { x: 15, y: 114.9 },
      fritzingConnectorId: 'connector0'
    },
    {
      id: 'DATA',
      label: 'Data',
      connector: 'male',
      electricalRole: 'DATA',
      autoWireRequirement: 'DIGITAL',
      capabilities: ['digital'],
      artwork: { x: 24.5, y: 114.9 },
      fritzingConnectorId: 'connector1'
    },
    {
      id: 'NC',
      label: 'NC',
      connector: 'male',
      electricalRole: 'SIGNAL',
      artwork: { x: 34.1, y: 114.9 },
      fritzingConnectorId: 'connector2'
    },
    {
      id: 'GND',
      label: 'GND',
      connector: 'male',
      electricalRole: 'GND',
      autoWireRequirement: 'GND',
      capabilities: ['ground'],
      artwork: { x: 43.8, y: 114.9 },
      fritzingConnectorId: 'connector3'
    }
  ],

  // Optional. If omitted, the part is imported as a free-mounted visual.
  // Coordinates are measured from the package anchor in millimetres.
  packages: [
    {
      id: 'adafruit-dht22-linear-4',
      placementMode: 'breadboard-rigid',
      anchorPinId: 'VCC',
      validRotations: [0, 180],
      requiresTrench: false,
      pins: [
        { pinId: 'VCC', x: 0, y: 0, mount: 'breadboard-hole' },
        { pinId: 'DATA', x: 2.54, y: 0, mount: 'breadboard-hole' },
        { pinId: 'NC', x: 5.08, y: 0, mount: 'breadboard-hole' },
        { pinId: 'GND', x: 7.62, y: 0, mount: 'breadboard-hole' }
      ],
      internalNets: [],
      routingBounds: { x: -5.08, y: -30.48, width: 17.78, height: 33.02 }
    }
  ],

  // Optional metadata shown or used by future editors/simulation features.
  propertyDefinitions: [
    {
      name: 'variant',
      label: 'Variant',
      type: 'string',
      control: 'select',
      options: ['default'],
      defaultValue: 'default',
      effect: 'physical-package',
      editable: true
    }
  ],

  connectorType: 'male',
  currentDraw_mA: 2,
  breadboardRequired: true,
  pinless: false
}
```

## Field definitions

### Root fields

- `format` — required exact value `elera-fritzing-part-v1`.
- `id` — required stable identifier. Do not use a random ID on every import;
  saved projects refer to this value.
- `name` — required human-readable catalog name.
- `description` — optional description.
- `category` — normally `board`, `sensor`, `input`, `output`, `actuator`,
  `passive`, or `custom`.
- `sourcePart` — optional original `.fzp` filename or source identifier.
- `library` — optional catalog metadata. `source` is `fritzing`; `family`
  groups interchangeable or closely related variants; `variant` and
  `technology` provide compact card details; `taxonomy` and `tags` improve
  search without adding more visible navigation levels.
- `connectorType` — default connector style for pins, normally `male` for a
  module with breadboard leads.
- `currentDraw_mA` — estimated typical current draw, not a pin coordinate.
- `breadboardRequired` — set this only when the part is intended to be mounted
  on a breadboard and has a valid rigid package.
- `pinless` — only `true` for a genuinely visual, connector-free part.

### Pin fields

`pins` is the electrical interface. Every pin needs a stable Elera `id`; the
Fritzing connector ID is only retained as provenance.

- `id` — canonical Elera pin ID, such as `VCC`, `GND`, `SDA`, `A`, or `1`.
- `label` — display label; defaults to `id`.
- `connector` — `male` or `female` endpoint style.
- `electricalRole` — the pin's actual electrical meaning. Recommended values
  are `VCC`, `GND`, `DIGITAL`, `ANALOG`, `PWM`, `I2C_SDA`, `I2C_SCL`, `SIGNAL`,
  `TRIGGER`, `ECHO`, and `DATA`.
- `autoWireRequirement` — optional controller capability needed by Auto Wire.
  This is intentionally separate from `electricalRole`; for example, an LED
  anode can have role `SIGNAL` but require a `DIGITAL` Arduino pin.
- `capabilities` — optional additional capabilities such as `digital`,
  `analog`, `pwm`, `i2c-sda`, `i2c-scl`, `power`, or `ground`.
- `artwork` — required `{ x, y }` position in the extracted SVG's coordinate
  system. This is used for visual alignment only.
- `fritzingConnectorId` — optional original connector ID, for traceability.

If a Fritzing connector is ambiguous, the converter should require an explicit
mapping override instead of guessing from its SVG label or colour.

### Package fields

`packages` describes one or more physical variants. A part with no trustworthy
package must have `packages: []` or omit `packages`; it remains free-mounted
and is not advertised as breadboard-mountable.

- `id` — stable package ID, usually `${partId}-${variant}`.
- `placementMode` — use `breadboard-rigid` for a measured 2.54 mm-grid
  footprint. A rigid package is translated and rotated; it must not be
  stretched independently on X and Y.
- `anchorPinId` — pin used as the package origin.
- `validRotations` — subset of `0`, `90`, `180`, and `270`.
- `requiresTrench` — `true` for DIP-like packages that must cross the
  breadboard centre trench.
- `pins` — every mounted pin's millimetre offset from the anchor. For a rigid
  breadboard package, each coordinate must be an integer multiple of `2.54`.
- `internalNets` — pins permanently connected inside the physical part. Use
  this for buses such as the two terminals on one side of a tactile button;
  do not use it for pins that merely happen to share a breadboard strip.
- `routingBounds` — positive `{ x, y, width, height }` rectangle in millimetres
  around the physical body and clearance needed by routing/placement.

For a rigid package, the package pin list should contain every connector that
is physically mounted. A package that omits a connector is incomplete and
should not be marked as the default breadboard package.

## SVG extraction requirements

Before writing `artwork.svgUrl`, the converter should:

1. Select the Fritzing `breadboard` view.
2. Sanitize the SVG and remove scripts, event attributes, external references,
   and unsafe URL references.
3. Rewrite internal IDs and references so multiple imported parts cannot clash.
4. Preserve the SVG `viewBox` and source coordinate system.
5. Resolve each Fritzing connector to an SVG position and store that position
   in `pins[].artwork`.
6. Copy the sanitized SVG to a served asset path, for example
   `/parts/<part-id>/breadboard.svg`.

SVG extraction alone is enough for a free-mounted visual. It is not enough to
claim rigid breadboard placement; that requires a separately calibrated
`packages` record.

## Registration

The converter should validate the intermediate record first, then register it:

```js
import {
  createFritzingPartDefinition,
  registerFritzingPart
} from '../src/core/fritzing-part-contract.js';

const definition = createFritzingPartDefinition(record);
registerFritzingPart(record);
```

For persistence, store the intermediate record and the sanitized SVG asset
using the same stable part ID. The live catalog registration is not a
replacement for project persistence.

The included command-line converter performs this step and updates Elera's
served catalog automatically:

```powershell
node scripts/convert-fritzing-part.mjs "C:\path\to\part.fzpz"
```
