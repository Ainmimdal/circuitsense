/**
 * Pure physical geometry for breadboard-mounted components.
 *
 * Wokwi's pinInfo values are renderer coordinates, not footprints.  This
 * registry records both the native visual coordinates and the integer 0.1in
 * footprint.  A component is calibrated once with one uniform scale; an
 * instance may only translate and rotate.
 */

export const DEFAULT_BREADBOARD_PITCH = 10;

export const TERMINAL_ROW_GRID = Object.freeze({
    A: 0, B: 1, C: 2, D: 3, E: 4,
    F: 6, G: 7, H: 8, I: 9, J: 10,
});

const GRID_TERMINAL_ROW = new Map(
    Object.entries(TERMINAL_ROW_GRID).map(([row, gridRow]) => [gridRow, row])
);

const cssMm = millimetres => millimetres * 96 / 25.4;

const nanoTopPins = ['12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'GND.2', 'RESET.2', '0', '1'];
const nanoBottomPins = ['13', '3.3V', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RESET', 'GND.1', 'VIN'];
const nanoNativePins = Object.fromEntries([
    ...nanoTopPins.map((name, index) => [name, { x: 19.7 + index * 9.6, y: 4.8 }]),
    ...nanoBottomPins.map((name, index) => [name, { x: 19.7 + index * 9.6, y: 62.4 }]),
]);
const nanoFootprintPins = Object.fromEntries([
    ...nanoTopPins.map((name, index) => [name, { col: index, row: 0 }]),
    ...nanoBottomPins.map((name, index) => [name, { col: index, row: 6 }]),
]);

const nanoRp2040TopPins = ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND.1', 'RESET', 'TX', 'RX'];
const nanoRp2040BottomPins = ['D13', '3.3V', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RESET.2', 'GND.2', 'VIN'];
const nanoRp2040NativePins = Object.fromEntries([
    ...nanoRp2040TopPins.map((name, index) => [name, { x: 20.1 + index * 9.6, y: 5 }]),
    ...nanoRp2040BottomPins.map((name, index) => [name, { x: 20.1 + index * 9.6, y: 62.6 }]),
]);
const nanoRp2040FootprintPins = Object.fromEntries([
    ...nanoRp2040TopPins.map((name, index) => [name, { col: index, row: 0 }]),
    ...nanoRp2040BottomPins.map((name, index) => [name, { col: index, row: 6 }]),
]);

const sevenSegmentTopPins = ['G', 'F', 'COM.2', 'A', 'B'];
const sevenSegmentBottomPins = ['E', 'D', 'COM.1', 'C', 'DP'];
const sevenSegmentNativePins = Object.fromEntries([
    ...sevenSegmentTopPins.map((name, index) => [name, { x: 4.8 + index * 9.6, y: 4.8 }]),
    ...sevenSegmentBottomPins.map((name, index) => [name, { x: 4.8 + index * 9.6, y: 72 }]),
]);
const sevenSegmentFootprintPins = Object.fromEntries([
    ...sevenSegmentTopPins.map((name, index) => [name, { col: index, row: 0 }]),
    ...sevenSegmentBottomPins.map((name, index) => [name, { col: index, row: 7 }]),
]);

const dipTopPins = Array.from({ length: 8 }, (_, index) => `${index + 1}b`);
const dipBottomPins = Array.from({ length: 8 }, (_, index) => `${index + 1}a`);
const dipNativePins = Object.fromEntries([
    ...dipTopPins.map((name, index) => [name, { x: 8.1 + index * 9.6, y: 3 }]),
    ...dipBottomPins.map((name, index) => [name, { x: 8.1 + index * 9.6, y: 51 }]),
]);
const dipFootprintPins = Object.fromEntries([
    ...dipTopPins.map((name, index) => [name, { col: index, row: 0 }]),
    ...dipBottomPins.map((name, index) => [name, { col: index, row: 5 }]),
]);

const genericDip8NativePins = Object.fromEntries([
    ...['1', '2', '3', '4'].map((name, index) => [name, { x: 8 + index * 10, y: 3 }]),
    ...['8', '7', '6', '5'].map((name, index) => [name, { x: 8 + index * 10, y: 63 }]),
]);
const genericDip8FootprintPins = Object.fromEntries([
    ...['1', '2', '3', '4'].map((name, index) => [name, { col: index, row: 0 }]),
    ...['8', '7', '6', '5'].map((name, index) => [name, { col: index, row: 6 }]),
]);

const ledBarNativePins = Object.fromEntries([
    ...Array.from({ length: 10 }, (_, index) => [`A${index + 1}`, { x: 4.8, y: 4.8 + index * 9.6 }]),
    ...Array.from({ length: 10 }, (_, index) => [`C${index + 1}`, { x: 33.6, y: 4.8 + index * 9.6 }]),
]);
const ledBarFootprintPins = Object.fromEntries([
    ...Array.from({ length: 10 }, (_, index) => [`A${10 - index}`, { col: 0, row: -index }]),
    ...Array.from({ length: 10 }, (_, index) => [`C${10 - index}`, { col: 3, row: -index }]),
]);

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

/**
 * `calibration` identifies two native pins and their intended grid delta.
 * It supplies a single component-type scale for any configured board pitch.
 */
export const componentGeometry = deepFreeze({
    dip8: {
        tag: 'div',
        native: { size: { width: 46, height: 66 }, pins: genericDip8NativePins },
        calibration: { from: '1', to: '2', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'dip8-300mil', anchorPin: '1', rotations: [0, 180], requiresTrench: true,
            pins: genericDip8FootprintPins,
            bodyBounds: { minCol: 0, maxCol: 3, minRow: 0, maxRow: 6 },
        }],
    },
    'arduino-nano': {
        tag: 'wokwi-arduino-nano',
        native: { size: { width: 170, height: 68 }, pins: nanoNativePins },
        calibration: { from: '12', to: '11', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'nano-30', anchorPin: '12', rotations: [0, 180], requiresTrench: true,
            pins: nanoFootprintPins,
            bodyBounds: { minCol: -2, maxCol: 16, minRow: 0, maxRow: 6 },
        }],
    },

    'nano-rp2040-connect': {
        tag: 'wokwi-nano-rp2040-connect',
        native: { size: { width: 168, height: 68 }, pins: nanoRp2040NativePins },
        calibration: { from: 'D12', to: 'D11', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'nano-rp2040-30', anchorPin: 'D12', rotations: [0, 180], requiresTrench: true,
            pins: nanoRp2040FootprintPins,
            bodyBounds: { minCol: -2, maxCol: 16, minRow: 0, maxRow: 6 },
        }],
    },

    'seven-segment': {
        tag: 'wokwi-7segment',
        native: { size: { width: 48, height: 84 }, pins: sevenSegmentNativePins },
        calibration: { from: 'G', to: 'F', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'seven-segment-dip-10', anchorPin: 'G', rotations: [0, 180], requiresTrench: true,
            pins: sevenSegmentFootprintPins,
            bodyBounds: { minCol: 0, maxCol: 4, minRow: 0, maxRow: 7 },
        }],
    },

    'dip-switch-8': {
        tag: 'wokwi-dip-switch-8',
        native: { size: { width: 83, height: 56 }, pins: dipNativePins },
        calibration: { from: '1b', to: '2b', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'dip-switch-16', anchorPin: '1b', rotations: [0, 180], requiresTrench: true,
            pins: dipFootprintPins,
            bodyBounds: { minCol: 0, maxCol: 7, minRow: 0, maxRow: 5 },
        }],
    },

    'ir-receiver': {
        tag: 'wokwi-ir-receiver',
        native: {
            size: { width: 60, height: 90 },
            pins: {
                GND: { x: 20.977, y: 87.75 }, VCC: { x: 30.577, y: 87.75 }, DAT: { x: 40.177, y: 87.75 },
            },
        },
        calibration: { from: 'GND', to: 'VCC', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'ir-linear-3', anchorPin: 'GND', rotations: [0, 180],
            pins: { GND: { col: 0, row: 0 }, VCC: { col: 1, row: 0 }, DAT: { col: 2, row: 0 } },
            bodyBounds: { minCol: -2, maxCol: 4, minRow: -9, maxRow: 1 },
        }],
    },

    'relay-dpdt': {
        tag: 'wokwi-ks2e-m-dc5',
        native: {
            size: { width: 80, height: 38 },
            pins: Object.fromEntries([
                ...['NO2', 'NC2', 'P2', 'COIL2'].map((name, index) => [name, { x: [5.5, 25, 44.5, 73.75][index], y: 5.1 }]),
                ...['NO1', 'NC1', 'P1', 'COIL1'].map((name, index) => [name, { x: [5.5, 25, 44.5, 73.75][index], y: 34.35 }]),
            ]),
        },
        calibration: { from: 'NO2', to: 'NC2', gridDelta: { col: 2, row: 0 } },
        footprints: [{
            id: 'relay-dpdt-8', anchorPin: 'NO2', rotations: [0, 180], requiresTrench: true,
            pins: {
                NO2: { col: 0, row: 0 }, NC2: { col: 2, row: 0 }, P2: { col: 4, row: 0 }, COIL2: { col: 7, row: 0 },
                NO1: { col: 0, row: 3 }, NC1: { col: 2, row: 3 }, P1: { col: 4, row: 3 }, COIL1: { col: 7, row: 3 },
            },
            bodyBounds: { minCol: 0, maxCol: 7, minRow: 0, maxRow: 3 },
        }],
    },

    'led-bar-graph': {
        tag: 'wokwi-led-bar-graph',
        native: { size: { width: 39, height: 97 }, pins: ledBarNativePins },
        calibration: { from: 'A10', to: 'A9', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'led-bar-dip-20', anchorPin: 'A10', rotations: [90], requiresTrench: true,
            pins: ledBarFootprintPins,
            bodyBounds: { minCol: 0, maxCol: 3, minRow: -9, maxRow: 0 },
        }],
    },

    'rgb-led': {
        tag: 'wokwi-rgb-led',
        native: {
            size: { width: 43, height: 73 },
            pins: {
                R: { x: 8.5, y: 44 }, COM: { x: 18.1, y: 53.6 },
                G: { x: 27.7, y: 44 }, B: { x: 37.3, y: 44 },
            },
        },
        calibration: { from: 'R', to: 'COM', gridDelta: { col: 1, row: 1 } },
        footprints: [{
            id: 'rgb-led-bent-4', anchorPin: 'R', rotations: [0, 180],
            pins: { R: { col: 0, row: 0 }, COM: { col: 1, row: 1 }, G: { col: 2, row: 0 }, B: { col: 3, row: 0 } },
            bodyBounds: { minCol: -1, maxCol: 4, minRow: -6, maxRow: 1 },
        }],
    },

    led: {
        tag: 'wokwi-led',
        native: {
            size: { width: 40, height: 50 },
            pins: { A: { x: 25, y: 42 }, C: { x: 15, y: 42 } },
        },
        calibration: { from: 'C', to: 'A', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'radial-2.54', anchorPin: 'C', rotations: [0, 180],
            pins: { C: { col: 0, row: 0 }, A: { col: 1, row: 0 } },
            bodyBounds: { minCol: -1, maxCol: 2, minRow: -4, maxRow: 0 },
        }],
    },

    resistor: {
        tag: 'wokwi-resistor',
        native: {
            size: { width: cssMm(15.645), height: cssMm(3) },
            pins: { '1': { x: 0, y: 5.65 }, '2': { x: 58.8, y: 5.65 } },
        },
        calibration: { from: '1', to: '2', gridDelta: { col: 6, row: 0 } },
        footprints: [{
            id: 'axial-6', anchorPin: '1', rotations: [0, 180], preferred: true,
            pins: { '1': { col: 0, row: 0 }, '2': { col: 6, row: 0 } },
            bodyBounds: { minCol: 0, maxCol: 6, minRow: -1, maxRow: 1 },
        }],
    },

    'pushbutton-6mm': {
        tag: 'wokwi-pushbutton-6mm',
        native: {
            size: { width: cssMm(7.4129977), height: cssMm(6) },
            pins: {
                '1.l': { x: 0, y: 2.2 }, '2.l': { x: 0, y: 21 },
                '1.r': { x: 28, y: 2.2 }, '2.r': { x: 28, y: 21 },
            },
        },
        calibration: { from: '1.l', to: '1.r', gridDelta: { col: 3, row: 0 } },
        footprints: [{
            id: 'tactile-3x2', anchorPin: '1.l', rotations: [90, 270], requiresTrench: true,
            pins: {
                '1.l': { col: 0, row: 0 }, '1.r': { col: 3, row: 0 },
                '2.l': { col: 0, row: 2 }, '2.r': { col: 3, row: 2 },
            },
            internalPinGroups: [['1.l', '1.r'], ['2.l', '2.r']],
            bodyBounds: { minCol: 0, maxCol: 3, minRow: 0, maxRow: 2 },
        }],
    },

    potentiometer: {
        tag: 'wokwi-potentiometer',
        native: {
            size: { width: cssMm(20), height: cssMm(20) },
            pins: {
                GND: { x: 29, y: 68.5 }, SIG: { x: 39, y: 68.5 }, VCC: { x: 49, y: 68.5 },
            },
        },
        calibration: { from: 'GND', to: 'VCC', gridDelta: { col: 2, row: 0 } },
        footprints: [{
            id: 'pot-linear-3', anchorPin: 'GND', rotations: [0, 180],
            pins: { GND: { col: 0, row: 0 }, SIG: { col: 1, row: 0 }, VCC: { col: 2, row: 0 } },
            bodyBounds: { minCol: -3, maxCol: 5, minRow: -7, maxRow: 1 },
        }],
    },

    'slide-switch': {
        tag: 'wokwi-slide-switch',
        native: {
            size: { width: cssMm(8.5), height: cssMm(9.23) },
            pins: { '1': { x: 6.5, y: 34 }, '2': { x: 16, y: 34 }, '3': { x: 25.5, y: 34 } },
        },
        calibration: { from: '1', to: '3', gridDelta: { col: 2, row: 0 } },
        footprints: [{
            id: 'spdt-linear-3', anchorPin: '1', rotations: [0, 180],
            pins: { '1': { col: 0, row: 0 }, '2': { col: 1, row: 0 }, '3': { col: 2, row: 0 } },
            bodyBounds: { minCol: -1, maxCol: 3, minRow: -4, maxRow: 1 },
        }],
    },

    dht22: {
        tag: 'wokwi-dht22',
        native: {
            size: { width: cssMm(15.1), height: cssMm(30.885) },
            pins: {
                VCC: { x: 15, y: 114.9 }, SDA: { x: 24.5, y: 114.9 },
                NC: { x: 34.1, y: 114.9 }, GND: { x: 43.8, y: 114.9 },
            },
        },
        calibration: { from: 'VCC', to: 'GND', gridDelta: { col: 3, row: 0 } },
        footprints: [{
            id: 'dht22-linear-4', anchorPin: 'VCC', rotations: [0, 180],
            pins: {
                VCC: { col: 0, row: 0 }, SDA: { col: 1, row: 0 },
                NC: { col: 2, row: 0 }, GND: { col: 3, row: 0 },
            },
            bodyBounds: { minCol: -2, maxCol: 5, minRow: -12, maxRow: 1 },
        }],
    },

    buzzer: {
        tag: 'wokwi-buzzer',
        native: {
            // The Wokwi host includes its label/lead area beyond the 17x20mm SVG.
            size: { width: 75, height: 90 },
            pins: { '1': { x: 27, y: 84 }, '2': { x: 37, y: 84 } },
        },
        calibration: { from: '1', to: '2', gridDelta: { col: 1, row: 0 } },
        footprints: [{
            id: 'buzzer-2.54', anchorPin: '1', rotations: [0, 180],
            pins: { '1': { col: 0, row: 0 }, '2': { col: 1, row: 0 } },
            bodyBounds: { minCol: -3, maxCol: 4, minRow: -9, maxRow: 1 },
        }],
    },
});

export function getComponentGeometry(componentId) {
    const resolvedId = componentId === 'pushbutton' ? 'pushbutton-6mm' : componentId;
    return componentGeometry[resolvedId] || null;
}

/** Replace renderer wire-edge coordinates with calibrated physical lead centres. */
export function calibratePhysicalPinInfo(componentId, pinInfo = []) {
    const pins = getComponentGeometry(componentId)?.native?.pins;
    if (!pins) return pinInfo;
    return pinInfo.map(pin => pins[pin.name] ? { ...pin, ...pins[pin.name] } : pin);
}

export function getFootprint(componentId, footprintId) {
    const geometry = getComponentGeometry(componentId);
    if (!geometry) return null;
    return geometry.footprints.find(footprint => !footprintId || footprint.id === footprintId) || null;
}

/** True when distinct internal terminals would be joined by one breadboard strip. */
export function footprintCreatesShort(componentId, holes, groupForHole, footprintId) {
    const groups = getFootprint(componentId, footprintId)?.internalPinGroups || [];
    const claimed = new Map();
    for (const [internalGroupIndex, pins] of groups.entries()) {
        for (const pin of pins) {
            const boardGroup = groupForHole(holes?.[pin]);
            if (!boardGroup) continue;
            const previous = claimed.get(boardGroup);
            if (previous !== undefined && previous !== internalGroupIndex) return true;
            claimed.set(boardGroup, internalGroupIndex);
        }
    }
    return false;
}

export function footprintIsBreadboardLegal(componentId, holes, holeForId, footprintId) {
    const footprint = getFootprint(componentId, footprintId);
    if (!footprint || !holes) return false;
    if (footprintCreatesShort(componentId, holes, holeId => holeForId(holeId)?.groupId, footprintId)) return false;
    if (footprint.requiresTrench) {
        const banks = new Set(Object.values(holes).map(holeId => holeForId(holeId)?.bank).filter(Boolean));
        if (!banks.has('upper') || !banks.has('lower')) return false;
    }
    return true;
}

export function getUniformRenderScale(componentId, pitch = DEFAULT_BREADBOARD_PITCH) {
    const geometry = getComponentGeometry(componentId);
    if (!geometry || !Number.isFinite(pitch) || pitch <= 0) return null;
    const { from, to, gridDelta } = geometry.calibration;
    const a = geometry.native.pins[from];
    const b = geometry.native.pins[to];
    const nativeDistance = Math.hypot(b.x - a.x, b.y - a.y);
    const gridDistance = Math.hypot(gridDelta.col, gridDelta.row) * pitch;
    return nativeDistance > 0 ? gridDistance / nativeDistance : null;
}

export function normalizeRotation(rotation) {
    const normalized = ((Number(rotation) % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(normalized)) {
        throw new RangeError('Breadboard footprint rotation must be 0, 90, 180, or 270 degrees');
    }
    return normalized;
}

export function rotateGridOffset(offset, rotation = 0) {
    const angle = normalizeRotation(rotation);
    const { col, row } = offset;
    if (angle === 90) return { col: -row, row: col };
    if (angle === 180) return { col: -col, row: -row };
    if (angle === 270) return { col: row, row: -col };
    return { col, row };
}

export function parseTerminalHole(holeName) {
    const match = /^([A-J])(\d{1,2})$/.exec(String(holeName));
    if (!match) return null;
    const column = Number(match[2]);
    if (column < 1 || column > 99) return null;
    return { row: match[1], gridRow: TERMINAL_ROW_GRID[match[1]], column };
}

/** Derive every occupied breadboard hole from one anchor hole and a rigid footprint. */
export function deriveFootprintHoles(componentId, {
    anchorHole,
    footprintId,
    rotation = 0,
    columns = 30,
} = {}) {
    const footprint = getFootprint(componentId, footprintId);
    const anchor = parseTerminalHole(anchorHole);
    const angle = normalizeRotation(rotation);
    if (!footprint || !anchor || !footprint.rotations.includes(angle)) return null;

    const holes = {};
    for (const [pinName, offset] of Object.entries(footprint.pins)) {
        const rotated = rotateGridOffset(offset, angle);
        const column = anchor.column + rotated.col;
        const row = GRID_TERMINAL_ROW.get(anchor.gridRow + rotated.row);
        if (!row || column < 1 || column > columns) return null;
        holes[pinName] = `${row}${column}`;
    }
    return holes;
}

/**
 * Create the only transform a mounted visual is allowed to use.  The returned
 * scale is scalar, fixed by component type and board pitch.
 */
export function createRigidPlacementTransform(componentId, {
    anchorWorld,
    footprintId,
    rotation = 0,
    pitch = DEFAULT_BREADBOARD_PITCH,
} = {}) {
    const geometry = getComponentGeometry(componentId);
    const footprint = getFootprint(componentId, footprintId);
    const angle = normalizeRotation(rotation);
    if (!geometry || !footprint || !footprint.rotations.includes(angle) ||
        !Number.isFinite(anchorWorld?.x) || !Number.isFinite(anchorWorld?.y)) return null;
    return Object.freeze({
        anchorWorld: Object.freeze({ x: anchorWorld.x, y: anchorWorld.y }),
        anchorNative: geometry.native.pins[footprint.anchorPin],
        rotation: angle,
        scale: getUniformRenderScale(componentId, pitch),
    });
}

export function transformNativePoint(point, transform) {
    const radians = transform.rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = (point.x - transform.anchorNative.x) * transform.scale;
    const dy = (point.y - transform.anchorNative.y) * transform.scale;
    return {
        x: transform.anchorWorld.x + dx * cos - dy * sin,
        y: transform.anchorWorld.y + dx * sin + dy * cos,
    };
}
