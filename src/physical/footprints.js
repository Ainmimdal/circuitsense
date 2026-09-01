import { BREADBOARD_PITCH_MM } from './geometry.js';
import { componentLibrary } from '../component-library.js';

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

const IDENTITY_PROJECTION = Object.freeze({ xx: 1, xy: 0, yx: 0, yy: 1 });

/**
 * Projects canonical package coordinates into the component's display/mounting
 * plane. This is package metadata, not drag-UI behavior. DIP packages use a
 * transposed mounting plane so their two physical pin rows align with the E/F
 * breadboard banks while the canonical package coordinates remain conventional.
 */
export function projectFootprintPoint(footprint, point) {
    const matrix = footprint?.surfaceProjection || IDENTITY_PROJECTION;
    return {
        x: matrix.xx * Number(point?.x || 0) + matrix.xy * Number(point?.y || 0),
        y: matrix.yx * Number(point?.x || 0) + matrix.yy * Number(point?.y || 0),
    };
}

export function createDipFootprint({
    pinCount,
    pitch = BREADBOARD_PITCH_MM,
    rowSpacing = 7.62,
    id = null,
} = {}) {
    const count = Number(pinCount);
    const pinPitch = Number(pitch);
    const spacing = Number(rowSpacing);
    if (!Number.isInteger(count) || count < 4 || count % 2 !== 0) {
        throw new TypeError('A DIP footprint requires an even pinCount of at least 4.');
    }
    if (!(pinPitch > 0) || !(spacing > 0)) {
        throw new TypeError('DIP pitch and rowSpacing must be positive millimetre values.');
    }

    const pinsPerSide = count / 2;
    const rowLength = (pinsPerSide - 1) * pinPitch;
    const leftX = -spacing / 2;
    const rightX = spacing / 2;
    const firstY = -rowLength / 2;
    const pins = [];
    for (let index = 0; index < pinsPerSide; index++) {
        const y = firstY + index * pinPitch;
        pins.push({ pinId: String(index + 1), x: leftX, y, mount: 'breadboard-hole' });
        pins.push({ pinId: String(count - index), x: rightX, y, mount: 'breadboard-hole' });
    }

    const mil = Math.round(spacing / 25.4 * 1000);
    return deepFreeze({
        id: id || `dip${count}-${mil}mil`,
        packageType: 'dip',
        pinCount: count,
        pinsPerSide,
        pitch: pinPitch,
        rowSpacing: spacing,
        placementMode: 'breadboard-rigid',
        anchorPinId: '1',
        validRotations: [0, 180],
        requiresTrench: true,
        // Canonical physical DIP axes -> breadboard/canvas mounting axes.
        surfaceProjection: { xx: 0, xy: 1, yx: 1, yy: 0 },
        pins,
        routingBounds: {
            x: -rowLength / 2 - pinPitch / 2,
            y: -spacing / 2,
            width: rowLength + pinPitch,
            height: spacing,
        },
    });
}

const DIP8_300MIL = createDipFootprint({
    pinCount: 8,
    pitch: 2.54,
    rowSpacing: 7.62,
    id: 'dip8-300mil',
});

const COMPONENT_DEFINITIONS = deepFreeze({
    'test-ic': {
        id: 'test-ic',
        name: 'DIP-8 Test IC',
        electricalPins: [
            { id: '1', name: 'Pin 1' }, { id: '2', name: 'Pin 2' },
            { id: '3', name: 'Pin 3' }, { id: '4', name: 'Pin 4' },
            { id: '5', name: 'Pin 5' }, { id: '6', name: 'Pin 6' },
            { id: '7', name: 'Pin 7' }, { id: '8', name: 'Pin 8' },
        ],
        defaultFootprintId: 'dip8-300mil',
        visual: { kind: 'dip', label: 'TEST IC' },
    },
    // Persisted-project compatibility alias. It shares the same package and
    // contains no separate physical geometry.
    dip8: {
        id: 'dip8',
        name: 'DIP-8 Test IC',
        electricalPins: Array.from({ length: 8 }, (_, index) => ({
            id: String(index + 1), name: `Pin ${index + 1}`,
        })),
        defaultFootprintId: 'dip8-300mil',
        visual: { kind: 'dip', label: 'TEST IC' },
    },
    led: {
        id: 'led',
        name: 'LED',
        electricalPins: [
            { id: 'A', name: 'Anode', role: 'anode' },
            { id: 'C', name: 'Cathode', role: 'cathode' },
        ],
        defaultFootprintId: 'led-2.54',
        visual: { kind: 'led', color: '#ef4444' },
    },
});

const FOOTPRINTS = deepFreeze({
    'dip8-300mil': DIP8_300MIL,
    'led-2.54': {
        id: 'led-2.54',
        componentDefinitionId: 'led',
        placementMode: 'breadboard-rigid',
        anchorPinId: 'C',
        validRotations: [0, 90, 180, 270],
        pins: [
            { pinId: 'C', x: 0, y: 0, mount: 'breadboard-hole' },
            { pinId: 'A', x: BREADBOARD_PITCH_MM, y: 0, mount: 'breadboard-hole' },
        ],
        routingBounds: { x: -1.8, y: -4.8, width: BREADBOARD_PITCH_MM + 3.6, height: 6.6 },
    },
});

const generatedComponents = new Map();
const generatedFootprints = new Map();

function unique(values) {
    return [...new Set(values.filter(Boolean).map(String))];
}

function libraryPinIds(component) {
    if (component.customPins?.length) return unique(component.customPins.map(pin => pin.name));
    const pins = [...Object.keys(component.pinMeta || {}), ...Object.keys(component.autoWire || {})];
    const catalog = component.autoWirePins;
    if (catalog) {
        pins.push(...(catalog.digital || []), ...(catalog.analog || []), ...(catalog.power || []),
            ...(catalog.ground || []), ...(catalog.uart?.rx || []), ...(catalog.uart?.tx || []),
            catalog.i2c?.sda, catalog.i2c?.scl);
    }
    return unique(pins);
}

function generatedSize(component, pinCount) {
    if (component.id === 'arduino-uno') return { width: 54, height: 39 };
    const aspect = Math.max(.55, Math.min(2.8, Number(component.size?.width || 120) / Number(component.size?.height || 80)));
    const area = Math.max(180, Math.min(950, Number(component.size?.width || 120) * Number(component.size?.height || 80) * .035));
    const width = Math.max(16, Math.min(66, Math.sqrt(area * aspect), Math.max(16, Math.ceil(pinCount / 2) * 2.25 + 4)));
    return { width, height: Math.max(11, Math.min(44, area / width)) };
}

function distributePins(pinIds, width, height) {
    if (!pinIds.length) return [];
    const topCount = Math.ceil(pinIds.length / 2);
    const bottomCount = pinIds.length - topCount;
    const row = (ids, y) => ids.map((pinId, index) => ({
        pinId,
        x: width * (index + 1) / (ids.length + 1),
        y,
        mount: 'terminal',
    }));
    return [
        ...row(pinIds.slice(0, topCount), 0),
        ...row(pinIds.slice(topCount), height),
    ];
}

function generatedPhysicalDefinition(id) {
    if (generatedComponents.has(id)) return generatedComponents.get(id);
    const source = componentLibrary[id];
    if (!source || source.isBreadboard) return null;
    const pinIds = libraryPinIds(source);
    const footprintId = `free:${id}`;
    const size = generatedSize(source, pinIds.length);
    const definition = deepFreeze({
        id,
        name: source.name || id,
        electricalPins: pinIds.map(pinId => ({ id: pinId, name: pinId })),
        defaultFootprintId: footprintId,
        visual: { kind: source.isControllerBoard ? 'controller-board' : 'module', label: source.name || id },
    });
    const footprint = deepFreeze({
        id: footprintId,
        componentDefinitionId: id,
        placementMode: 'free',
        anchorPinId: pinIds[0] || null,
        validRotations: [0, 90, 180, 270],
        pins: distributePins(pinIds, size.width, size.height),
        routingBounds: { x: 0, y: 0, width: size.width, height: size.height },
    });
    generatedComponents.set(id, definition);
    generatedFootprints.set(footprintId, footprint);
    return definition;
}

export function getPhysicalComponentDefinition(id) {
    return COMPONENT_DEFINITIONS[id] || generatedPhysicalDefinition(id);
}

export function getFootprintDefinition(id) {
    if (FOOTPRINTS[id]) return FOOTPRINTS[id];
    if (generatedFootprints.has(id)) return generatedFootprints.get(id);
    if (String(id || '').startsWith('free:')) generatedPhysicalDefinition(String(id).slice(5));
    return generatedFootprints.get(id) || null;
}

/**
 * Return the concrete footprint records needed to route a project in an
 * isolated worker. This includes calibrated/custom free footprints whose
 * runtime registry is not shared with the worker global scope.
 */
export function routingFootprintsForProject(project) {
    const footprints = new Map();
    for (const component of project?.components || []) {
        const definition = getPhysicalComponentDefinition(component.definitionId);
        const footprintId = component.footprintId || definition?.defaultFootprintId;
        const footprint = getFootprintDefinition(footprintId);
        if (footprint) footprints.set(footprint.id, footprint);
    }
    return [...footprints.values()];
}

/** Install worker-provided runtime footprints before resolving route points. */
export function registerRuntimeRoutingFootprints(footprints = []) {
    for (const footprint of footprints) {
        if (!footprint?.id || FOOTPRINTS[footprint.id]) continue;
        generatedFootprints.set(footprint.id, deepFreeze(footprint));
    }
}

export function defaultFootprintForComponent(componentDefinitionId) {
    const component = getPhysicalComponentDefinition(componentDefinitionId);
    return component ? getFootprintDefinition(component.defaultFootprintId) : null;
}

export function listPhysicalComponentDefinitions() {
    return [...Object.values(COMPONENT_DEFINITIONS),
        ...Object.keys(componentLibrary).filter(id => !COMPONENT_DEFINITIONS[id]).map(generatedPhysicalDefinition).filter(Boolean)];
}

export function calibrateFreeComponentFootprint(componentDefinitionId, pins) {
    const definition = generatedPhysicalDefinition(componentDefinitionId);
    const footprint = definition ? getFootprintDefinition(definition.defaultFootprintId) : null;
    if (!footprint || footprint.placementMode !== 'free' || !Array.isArray(pins) || !pins.length) return false;
    const normalizedPins = pins
        .map(pin => ({
            pinId: String(pin.pinId || pin.name || ''),
            x: Number(pin.x),
            y: Number(pin.y),
            mount: 'terminal',
        }))
        .filter(pin => pin.pinId && Number.isFinite(pin.x) && Number.isFinite(pin.y));
    if (!normalizedPins.length) return false;
    const signature = normalizedPins.map(pin => `${pin.pinId}:${pin.x.toFixed(4)}:${pin.y.toFixed(4)}`).join('|');
    if (footprint.calibrationSignature === signature) return false;
    const nextFootprint = deepFreeze({
        ...footprint,
        anchorPinId: normalizedPins[0].pinId,
        pins: normalizedPins,
        calibrationSignature: signature,
    });
    const nextDefinition = deepFreeze({
        ...definition,
        electricalPins: normalizedPins.map(pin => ({ id: pin.pinId, name: pin.pinId })),
    });
    generatedFootprints.set(footprint.id, nextFootprint);
    generatedComponents.set(componentDefinitionId, nextDefinition);
    return true;
}
