import { componentLibrary } from '../component-library.js';
import { getComponentGeometry } from './component-geometry.js';
import { getComponentPropertyDefinitions } from './component-metadata.js';
import { resolveVisualAdapter } from './visual-adapter.js';
import { BREADBOARD_PITCH_MM } from './units.js';

export const PACKAGE_PITCH_MM = BREADBOARD_PITCH_MM;

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

function unique(values) {
    return [...new Set(values.filter(value => value !== undefined && value !== null && value !== '').map(String))];
}

function controllerCapabilities(component) {
    const catalog = component.autoWirePins;
    if (!catalog) return new Map();
    const result = new Map();
    const add = (pinIds, capability) => {
        for (const pinId of pinIds || []) {
            const id = String(pinId);
            if (!result.has(id)) result.set(id, new Set());
            result.get(id).add(capability);
        }
    };
    add(catalog.digital, 'digital');
    add(catalog.pwm, 'pwm');
    add(catalog.analog, 'analog');
    add(catalog.power, 'power');
    add(catalog.ground, 'ground');
    add(catalog.uart?.rx, 'uart-rx');
    add(catalog.uart?.tx, 'uart-tx');
    add([catalog.i2c?.sda], 'i2c-sda');
    add([catalog.i2c?.scl], 'i2c-scl');
    return result;
}

function canonicalPinIds(component, geometry) {
    const controllerPins = controllerCapabilities(component);
    return unique([
        ...(component.customPins || []).map(pin => pin.name),
        ...(component.pins || []).map(pin => pin.id),
        ...Object.keys(component.pinMeta || {}),
        ...Object.keys(component.autoWire || {}),
        ...controllerPins.keys(),
        ...Object.keys(geometry?.native?.pins || {}),
    ]);
}

function normalizedInternalNets(component, geometry) {
    const groups = component.pinGroups || geometry?.footprints?.flatMap(footprint => footprint.internalPinGroups || []) || [];
    const seen = new Set();
    return groups.map((pins, index) => ({ id: `internal-${index + 1}`, pins: unique(pins) }))
        .filter(net => net.pins.length > 1 && !seen.has(net.pins.join('\u0000')) && seen.add(net.pins.join('\u0000')));
}

/**
 * Normalize the existing catalog into one shared part definition. Electrical
 * role and Auto Wire requirement intentionally remain distinct fields.
 */
export function getPartDefinition(id) {
    const component = componentLibrary[id];
    if (!component || component.isBreadboard) return null;
    const geometry = getComponentGeometry(id);
    const capabilities = controllerCapabilities(component);
    const authoredPins = new Map((component.pins || []).map(pin => [String(pin.id), pin]));
    const pins = canonicalPinIds(component, geometry).map(pinId => {
        const authored = authoredPins.get(pinId) || {};
        return {
            id: pinId,
            label: authored.label || pinId,
            connector: authored.connector || component.connectorType || (component.isBoard ? 'female' : 'male'),
            electricalRole: authored.electricalRole || component.pinMeta?.[pinId] || null,
            autoWireRequirement: authored.autoWireRequirement || component.autoWire?.[pinId] || null,
            capabilities: unique([...(authored.capabilities || []), ...(capabilities.get(pinId) || [])]),
            constraints: [...(authored.constraints || component.autoWirePins?.constraints?.[pinId] || [])],
        };
    });
    const packageIds = unique([
        ...(geometry?.footprints?.map(footprint => footprint.id) || []),
        ...(component.packageDefinitions || []).map(packageDefinition => packageDefinition.id),
    ]);
    const explicitNativePins = component.visualAdapter?.nativePins || {};
    return deepFreeze({
        id: component.id,
        name: component.name,
        category: component.category,
        description: component.description || '',
        keywords: unique(component.keywords || []),
        pins,
        internalNets: normalizedInternalNets(component, geometry),
        packageIds,
        defaultPackageId: component.breadboard?.footprintId || packageIds[0] || null,
        placementPolicy: {
            breadboardRequired: component.breadboard?.required === true,
            breadboardReason: component.breadboard?.reason || null,
        },
        properties: getComponentPropertyDefinitions(component),
        visualAdapter: resolveVisualAdapter(component, {
            sourceSize: geometry?.native?.size || component.visualAdapter?.sourceSize || component.size,
            nativePins: Object.keys(explicitNativePins).length ? explicitNativePins : geometry?.native?.pins,
        }),
        validation: {
            currentDraw_mA: Number(component.currentDraw_mA || 0),
            needsResistor: component.needsResistor === true,
            needsPullup: component.needsPullup === true,
        },
        controller: component.autoWirePins ? {
            maxCurrent_mA: component.autoWirePins.maxCurrent_mA,
            pinMaxCurrent_mA: component.autoWirePins.pinMaxCurrent_mA,
        } : null,
        simulation: null,
    });
}

function packageBounds(footprint) {
    const body = footprint.bodyBounds;
    if (body) return {
        x: body.minCol * PACKAGE_PITCH_MM,
        y: body.minRow * PACKAGE_PITCH_MM,
        width: Math.max(PACKAGE_PITCH_MM, (body.maxCol - body.minCol) * PACKAGE_PITCH_MM),
        height: Math.max(PACKAGE_PITCH_MM, (body.maxRow - body.minRow) * PACKAGE_PITCH_MM),
    };
    const points = Object.values(footprint.pins || {});
    const columns = points.map(point => Number(point.col));
    const rows = points.map(point => Number(point.row));
    return {
        x: Math.min(...columns) * PACKAGE_PITCH_MM,
        y: Math.min(...rows) * PACKAGE_PITCH_MM,
        width: Math.max(PACKAGE_PITCH_MM, (Math.max(...columns) - Math.min(...columns)) * PACKAGE_PITCH_MM),
        height: Math.max(PACKAGE_PITCH_MM, (Math.max(...rows) - Math.min(...rows)) * PACKAGE_PITCH_MM),
    };
}

/** Convert the calibrated integer-grid footprints to immutable millimetres. */
export function getCalibratedPackageDefinitions(id) {
    const component = componentLibrary[id];
    const geometry = getComponentGeometry(id);
    const calibrated = (geometry?.footprints || []).map(footprint => deepFreeze({
        id: footprint.id,
        componentDefinitionId: id,
        placementMode: 'breadboard-rigid',
        anchorPinId: footprint.anchorPin,
        validRotations: [...footprint.rotations],
        requiresTrench: footprint.requiresTrench === true,
        preferred: footprint.preferred === true,
        visualVariant: footprint.visualVariant || null,
        leadSpan: Number(footprint.leadSpan || 0) || null,
        pins: Object.entries(footprint.pins).map(([pinId, point]) => ({
            pinId,
            x: Number(point.col) * PACKAGE_PITCH_MM,
            y: Number(point.row) * PACKAGE_PITCH_MM,
            mount: 'breadboard-hole',
        })),
        internalNets: (footprint.internalPinGroups || []).map((pins, index) => ({
            id: `internal-${index + 1}`,
            pins: [...pins],
        })),
        routingBounds: packageBounds(footprint),
    }));
    const authored = (component?.packageDefinitions || []).map(packageDefinition => deepFreeze({
        ...packageDefinition,
        componentDefinitionId: id,
        placementMode: packageDefinition.placementMode || 'breadboard-rigid',
        validRotations: [...(packageDefinition.validRotations || [0, 90, 180, 270])],
        pins: (packageDefinition.pins || []).map(pin => ({
            ...pin,
            pinId: String(pin.pinId),
            x: Number(pin.x),
            y: Number(pin.y),
            mount: pin.mount || 'breadboard-hole',
        })),
        internalNets: (packageDefinition.internalNets || []).map(net => ({ ...net, pins: [...net.pins] })),
        routingBounds: { ...(packageDefinition.routingBounds || {}) },
    }));
    return [...calibrated, ...authored];
}

export function listPartDefinitions() {
    return Object.keys(componentLibrary).map(getPartDefinition).filter(Boolean);
}

export function listCalibratedPackageDefinitions() {
    return Object.keys(componentLibrary).flatMap(getCalibratedPackageDefinitions);
}
