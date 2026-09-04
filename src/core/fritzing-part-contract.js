import { PIN, registerComponentDefinition } from '../component-library.js';
import { BREADBOARD_PITCH_MM } from './units.js';

export const FRITZING_INTERMEDIATE_FORMAT = 'elera-fritzing-part-v1';

function assert(condition, message) {
    if (!condition) throw new TypeError(`Invalid Fritzing part: ${message}`);
}

function finitePoint(point, label) {
    assert(point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)), `${label} needs finite x/y coordinates`);
    return { x: Number(point.x), y: Number(point.y) };
}

function normalizePin(pin) {
    assert(pin?.id, 'every connector needs a stable pin id');
    const artwork = finitePoint(pin.artwork, `pin ${pin.id} artwork`);
    return {
        id: String(pin.id),
        label: pin.label || String(pin.id),
        connector: pin.connector || 'male',
        electricalRole: pin.electricalRole || PIN.SIGNAL,
        autoWireRequirement: pin.autoWireRequirement || null,
        capabilities: [...(pin.capabilities || [])],
        artwork,
        fritzingConnectorId: pin.fritzingConnectorId || null,
    };
}

function normalizePackage(packageDefinition, pinIds) {
    assert(packageDefinition?.id, 'every physical package needs an id');
    assert(Array.isArray(packageDefinition.pins), `package ${packageDefinition.id} needs pins`);
    const placementMode = packageDefinition.placementMode || 'breadboard-rigid';
    const pins = packageDefinition.pins.map(pin => {
        assert(pinIds.has(String(pin.pinId)), `package ${packageDefinition.id} references unknown pin ${pin.pinId}`);
        const point = finitePoint(pin, `package ${packageDefinition.id} pin ${pin.pinId}`);
        if (placementMode === 'breadboard-rigid') {
            assert(Math.abs(point.x / BREADBOARD_PITCH_MM - Math.round(point.x / BREADBOARD_PITCH_MM)) < 1e-6 &&
                Math.abs(point.y / BREADBOARD_PITCH_MM - Math.round(point.y / BREADBOARD_PITCH_MM)) < 1e-6,
            `package ${packageDefinition.id} pin ${pin.pinId} is not on the 2.54 mm grid`);
        }
        return {
            pinId: String(pin.pinId),
            ...point,
            mount: pin.mount || 'breadboard-hole',
        };
    });
    const anchorPinId = String(packageDefinition.anchorPinId || pins[0]?.pinId || '');
    assert(!anchorPinId || pinIds.has(anchorPinId), `package ${packageDefinition.id} has an unknown anchor pin`);
    const rotations = [...(packageDefinition.validRotations || [0, 90, 180, 270])].map(Number);
    assert(rotations.length > 0 && rotations.every(rotation => [0, 90, 180, 270].includes(rotation)),
        `package ${packageDefinition.id} has an invalid rotation`);
    const internalNets = (packageDefinition.internalNets || []).map((net, index) => {
        const netPins = net.pins.map(String);
        assert(netPins.every(pinId => pinIds.has(pinId)), `package ${packageDefinition.id} internal net references an unknown pin`);
        return { id: net.id || `internal-${index + 1}`, pins: netPins };
    });
    const bounds = packageDefinition.routingBounds;
    assert(bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(value => Number.isFinite(Number(value))) &&
        Number(bounds.width) > 0 && Number(bounds.height) > 0, `package ${packageDefinition.id} needs finite routing bounds`);
    return {
        id: String(packageDefinition.id),
        placementMode,
        anchorPinId,
        validRotations: rotations,
        requiresTrench: packageDefinition.requiresTrench === true,
        pins,
        internalNets,
        routingBounds: {
            x: Number(bounds.x), y: Number(bounds.y),
            width: Number(bounds.width), height: Number(bounds.height),
        },
    };
}

/**
 * Convert a sanitized, parser-independent Fritzing intermediate record into a
 * normal Elera catalog definition. SVG connector coordinates are artwork data;
 * millimetre package pins remain the authority for mounting and routing.
 */
export function createFritzingPartDefinition(record) {
    assert(record?.format === FRITZING_INTERMEDIATE_FORMAT, `format must be ${FRITZING_INTERMEDIATE_FORMAT}`);
    assert(record.id && record.name, 'id and name are required');
    assert(record.artwork?.svgUrl, 'breadboard SVG URL is required');
    const sourceSize = finitePoint({
        x: record.artwork.sourceSize?.width,
        y: record.artwork.sourceSize?.height,
    }, 'artwork sourceSize');
    const physicalSize = record.artwork.physicalSizeMm ? finitePoint({
        x: record.artwork.physicalSizeMm.width,
        y: record.artwork.physicalSizeMm.height,
    }, 'artwork physicalSizeMm') : null;
    if (physicalSize) assert(physicalSize.x > 0 && physicalSize.y > 0,
        'artwork physicalSizeMm needs positive dimensions');
    const pins = (record.pins || []).map(normalizePin);
    assert(pins.length > 0 || record.pinless === true, 'at least one connector is required');
    const pinIds = new Set(pins.map(pin => pin.id));
    assert(pinIds.size === pins.length, 'connector pin ids must be unique');
    const packageDefinitions = (record.packages || []).map(item => normalizePackage(item, pinIds));
    const pinMeta = Object.fromEntries(pins.map(pin => [pin.id, pin.electricalRole]));
    const autoWire = Object.fromEntries(pins.filter(pin => pin.autoWireRequirement)
        .map(pin => [pin.id, pin.autoWireRequirement]));
    const library = record.library || {};
    const libraryTags = [...new Set((library.tags || []).filter(Boolean).map(String))];

    return {
        id: String(record.id),
        name: String(record.name),
        description: record.description || `Imported from Fritzing: ${record.name}`,
        category: record.category || 'custom',
        source: { provider: 'fritzing', format: record.format, sourcePart: record.sourcePart || null },
        library: {
            source: 'fritzing',
            family: String(library.family || record.category || 'custom'),
            ...(library.variant ? { variant: String(library.variant) } : {}),
            ...(library.technology ? { technology: String(library.technology) } : {}),
            ...(library.taxonomy ? { taxonomy: String(library.taxonomy) } : {}),
            tags: libraryTags,
        },
        keywords: libraryTags,
        tag: null,
        attrs: {},
        size: { width: sourceSize.x, height: sourceSize.y },
        ...(physicalSize ? { physicalSizeMm: { width: physicalSize.x, height: physicalSize.y } } : {}),
        visualAdapter: {
            provider: 'fritzing-svg',
            assetUrl: record.artwork.svgUrl,
            sourceSize: { width: sourceSize.x, height: sourceSize.y },
            nativePins: Object.fromEntries(pins.map(pin => [pin.id, pin.artwork])),
        },
        pins: pins.map(({ artwork, fritzingConnectorId, ...pin }) => pin),
        pinMeta,
        autoWire: Object.keys(autoWire).length ? autoWire : undefined,
        connectorType: record.connectorType || 'male',
        currentDraw_mA: Number(record.currentDraw_mA || 0),
        isPassive: record.category === 'passive',
        propertyDefinitions: record.propertyDefinitions || [],
        packageDefinitions,
        pinless: record.pinless === true,
        breadboard: packageDefinitions.length
            ? { mountable: true, required: record.breadboardRequired === true, footprintId: packageDefinitions[0].id }
            : { mountable: false, reason: 'No calibrated millimetre breadboard package was supplied by the converter.' },
    };
}

/** Install a converted part into the live catalog; persistence is owned by the future importer UI. */
export function registerFritzingPart(record, options) {
    return registerComponentDefinition(createFritzingPartDefinition(record), options);
}
