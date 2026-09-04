import { BREADBOARD_PITCH_MM } from './geometry.js';
import { componentLibrary } from '../component-library.js';
import { getCalibratedPackageDefinitions, getPartDefinition, listCalibratedPackageDefinitions } from '../core/part-registry.js';

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
    resistor: {
        id: 'resistor',
        name: 'Resistor',
        electricalPins: [
            { id: '1', name: 'Pin 1', role: 'signal' },
            { id: '2', name: 'Pin 2', role: 'signal' },
        ],
        // Free placement preserves the unmodified Wokwi element. Snapping or
        // Auto Layout selects one of the separate rigid package variants.
        defaultFootprintId: 'resistor-wokwi-original',
        visual: { kind: 'wokwi', label: 'Resistor' },
    },
});

const CALIBRATED_FOOTPRINTS = Object.fromEntries(
    listCalibratedPackageDefinitions().map(footprint => [footprint.id, footprint])
);

const FOOTPRINTS = deepFreeze({
    ...CALIBRATED_FOOTPRINTS,
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
    'resistor-wokwi-original': {
        id: 'resistor-wokwi-original',
        componentDefinitionId: 'resistor',
        placementMode: 'free',
        anchorPinId: '1',
        validRotations: [0, 90, 180, 270],
        pins: [
            { pinId: '1', x: 0, y: 1.495, mount: 'terminal' },
            { pinId: '2', x: 15.5575, y: 1.495, mount: 'terminal' },
        ],
        routingBounds: { x: 0, y: 0, width: 15.645, height: 3 },
        artworkPlacement: { x: 0, y: 0, scale: 25.4 / 96, rotation: 0 },
        visualVariant: 'wokwi-original',
        leadSpan: 6,
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
    const physicalSize = component.physicalSizeMm;
    if (Number(physicalSize?.width) > 0 && Number(physicalSize?.height) > 0) {
        return { width: Number(physicalSize.width), height: Number(physicalSize.height) };
    }
    const content = component.contentBounds || {
        x: 0, y: 0,
        width: Number(component.size?.width || 120),
        height: Number(component.size?.height || 80),
    };
    const xs = [Number(content.x || 0), Number(content.x || 0) + Number(content.width || 1),
        ...(component.customPins || []).map(pin => Number(pin.x)).filter(Number.isFinite)];
    const ys = [Number(content.y || 0), Number(content.y || 0) + Number(content.height || 1),
        ...(component.customPins || []).map(pin => Number(pin.y)).filter(Number.isFinite)];
    const visualWidth = Math.max(...xs) - Math.min(...xs);
    const visualHeight = Math.max(...ys) - Math.min(...ys);
    const aspect = Math.max(.55, Math.min(2.8, visualWidth / visualHeight));
    const area = Math.max(180, Math.min(950, visualWidth * visualHeight * .035));
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
    const part = getPartDefinition(id);
    const pinIds = part?.pins?.map(pin => pin.id) || libraryPinIds(source);
    const calibratedPackages = getCalibratedPackageDefinitions(id);
    const calibratedFootprint = calibratedPackages.find(footprint => footprint.id === source.breadboard?.footprintId)
        || calibratedPackages.find(footprint => footprint.preferred)
        || calibratedPackages[0];
    const footprintId = calibratedFootprint?.id || `free:${id}`;
    const size = generatedSize(source, pinIds.length);
    const definition = deepFreeze({
        id,
        name: source.name || id,
        electricalPins: part?.pins?.map(pin => ({
            id: pin.id,
            name: pin.label,
            role: pin.electricalRole,
            capabilities: pin.capabilities,
        })) || pinIds.map(pinId => ({ id: pinId, name: pinId })),
        defaultFootprintId: footprintId,
        visual: { kind: source.isControllerBoard ? 'controller-board' : 'module', label: source.name || id },
    });
    if (calibratedFootprint) {
        for (const packageDefinition of calibratedPackages) {
            if (!FOOTPRINTS[packageDefinition.id]) generatedFootprints.set(packageDefinition.id, packageDefinition);
        }
        generatedComponents.set(id, definition);
        return definition;
    }
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
    if (String(id || '').startsWith('free:')) {
        const definition = generatedPhysicalDefinition(String(id).slice(5));
        const legacy = generatedFootprints.get(id);
        if (legacy) return legacy;
        // Projects saved before calibrated rigid packages were introduced use
        // free:<component-id>. Resolve that legacy ID to the component's current
        // default package so its pins and existing wire endpoints remain valid.
        const replacementId = definition?.defaultFootprintId;
        if (replacementId && replacementId !== id) {
            return FOOTPRINTS[replacementId] || generatedFootprints.get(replacementId) || null;
        }
    }
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

export function footprintsForComponent(componentDefinitionId) {
    const definition = getPhysicalComponentDefinition(componentDefinitionId);
    if (!definition) return [];
    // Building the definition registers every calibrated physical variant.
    const variants = getCalibratedPackageDefinitions(componentDefinitionId)
        .map(item => getFootprintDefinition(item.id))
        .filter(Boolean);
    return variants.length ? variants : [getFootprintDefinition(definition.defaultFootprintId)].filter(Boolean);
}

export function listPhysicalComponentDefinitions() {
    return [...Object.values(COMPONENT_DEFINITIONS),
        ...Object.keys(componentLibrary).filter(id => !COMPONENT_DEFINITIONS[id]).map(generatedPhysicalDefinition).filter(Boolean)];
}

export function calibrateFreeComponentFootprint(componentDefinitionId, calibration) {
    const definition = generatedPhysicalDefinition(componentDefinitionId);
    const footprint = definition ? getFootprintDefinition(definition.defaultFootprintId) : null;
    const record = Array.isArray(calibration) ? { pins: calibration } : calibration || {};
    if (!footprint || footprint.placementMode !== 'free' || !Array.isArray(record.pins)) return false;
    const normalizedPins = record.pins
        .map(pin => ({
            pinId: String(pin.pinId || pin.name || ''),
            x: Number(pin.x),
            y: Number(pin.y),
            mount: 'terminal',
        }))
        .filter(pin => pin.pinId && Number.isFinite(pin.x) && Number.isFinite(pin.y));
    const isValidPinlessCalibration = record.allowEmptyPins === true && footprint.pins.length === 0;
    if (!normalizedPins.length && !isValidPinlessCalibration) return false;
    const nextBounds = record.routingBounds && [record.routingBounds.x, record.routingBounds.y,
        record.routingBounds.width, record.routingBounds.height].every(Number.isFinite)
        ? {
            x: Number(record.routingBounds.x), y: Number(record.routingBounds.y),
            width: Number(record.routingBounds.width), height: Number(record.routingBounds.height),
        }
        : footprint.routingBounds;
    const nextArtworkPlacement = record.artworkPlacement &&
        [record.artworkPlacement.x, record.artworkPlacement.y, record.artworkPlacement.scale,
            record.artworkPlacement.rotation].every(Number.isFinite)
        ? {
            x: Number(record.artworkPlacement.x), y: Number(record.artworkPlacement.y),
            scale: Number(record.artworkPlacement.scale), rotation: Number(record.artworkPlacement.rotation),
        }
        : footprint.artworkPlacement;
    const signature = [
        ...normalizedPins.map(pin => `${pin.pinId}:${pin.x.toFixed(4)}:${pin.y.toFixed(4)}`),
        `bounds:${nextBounds.x.toFixed(4)}:${nextBounds.y.toFixed(4)}:${nextBounds.width.toFixed(4)}:${nextBounds.height.toFixed(4)}`,
        nextArtworkPlacement
            ? `art:${nextArtworkPlacement.x.toFixed(4)}:${nextArtworkPlacement.y.toFixed(4)}:${nextArtworkPlacement.scale.toFixed(6)}:${nextArtworkPlacement.rotation.toFixed(2)}`
            : 'art:fit',
    ].join('|');
    if (footprint.calibrationSignature === signature) return false;
    const nextFootprint = deepFreeze({
        ...footprint,
        anchorPinId: normalizedPins[0]?.pinId || null,
        pins: normalizedPins,
        routingBounds: nextBounds,
        artworkPlacement: nextArtworkPlacement,
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
