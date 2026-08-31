import { applyTransform, composeTransforms, normalizeDegrees, rotatePoint } from './geometry.js';
import { getSurfaceDefinition, holeWorldPosition } from './breadboard.js';
import { getFootprintDefinition, projectFootprintPoint } from './footprints.js';

export const PHYSICAL_PROJECT_SCHEMA_VERSION = 4;

export function componentPinRef(componentId, pinId) {
    return { type: 'component-pin', componentId: String(componentId), pinId: String(pinId) };
}

export function surfaceHoleRef(surfaceId, holeId) {
    return { type: 'surface-hole', surfaceId: String(surfaceId), holeId: String(holeId) };
}

export function connectionRefKey(ref) {
    if (ref?.type === 'component-pin') return `component:${ref.componentId}:${ref.pinId}`;
    if (ref?.type === 'surface-hole') return `surface:${ref.surfaceId}:${ref.holeId}`;
    throw new TypeError('Invalid semantic connection reference.');
}

export function createPhysicalProject({ surfaces = [], components = [], wires = [], properties = {} } = {}) {
    return {
        schemaVersion: PHYSICAL_PROJECT_SCHEMA_VERSION,
        surfaces: structuredClone(surfaces),
        components: structuredClone(components),
        wires: structuredClone(wires),
        properties: structuredClone(properties),
    };
}

export function createComponentInstance({ id, definitionId, footprintId, x = 0, y = 0, rotation = 0, properties = {} }) {
    return {
        id,
        definitionId,
        footprintId,
        placement: { type: 'free', position: { x, y }, rotation: normalizeDegrees(rotation) },
        properties: structuredClone(properties),
    };
}

export function mountedComponentTransform(project, component) {
    if (component?.placement?.type !== 'surface') return null;
    const surface = project.surfaces.find(item => item.id === component.placement.surfaceId);
    const footprint = getFootprintDefinition(component.footprintId);
    const anchorHoleId = component.placement.bindings?.[footprint?.anchorPinId];
    const anchorLocal = getSurfaceDefinition(surface)?.getHole(anchorHoleId);
    if (!surface || !footprint || !anchorLocal) return null;
    const anchorPin = footprint.pins.find(pin => pin.pinId === footprint.anchorPinId);
    const projectedAnchor = projectFootprintPoint(footprint, anchorPin);
    const localOriginOffset = rotatePoint({ x: -projectedAnchor.x, y: -projectedAnchor.y }, component.placement.rotation);
    return composeTransforms(surface.transform, {
        x: anchorLocal.x + localOriginOffset.x,
        y: anchorLocal.y + localOriginOffset.y,
        rotation: component.placement.rotation,
    });
}

export function componentWorldTransform(project, component) {
    if (component?.placement?.type === 'surface') return mountedComponentTransform(project, component);
    return {
        x: Number(component?.placement?.position?.x || 0),
        y: Number(component?.placement?.position?.y || 0),
        rotation: normalizeDegrees(component?.placement?.rotation || 0),
    };
}

export function resolveConnectionWorldPoint(project, ref) {
    if (ref?.type === 'surface-hole') {
        const surface = project.surfaces.find(item => item.id === ref.surfaceId);
        return surface ? holeWorldPosition(surface, ref.holeId) : null;
    }
    if (ref?.type !== 'component-pin') return null;
    const component = project.components.find(item => item.id === ref.componentId);
    const footprint = getFootprintDefinition(component?.footprintId);
    const pin = footprint?.pins.find(item => item.pinId === ref.pinId);
    if (!component || !pin) return null;
    if (component.placement?.type === 'surface') {
        const surface = project.surfaces.find(item => item.id === component.placement.surfaceId);
        const holeId = component.placement.bindings?.[ref.pinId];
        if (surface && holeId) return holeWorldPosition(surface, holeId);
    }
    return applyTransform(projectFootprintPoint(footprint, pin), componentWorldTransform(project, component));
}

export function normalizePersistedProject(project) {
    if (!project || ![3, PHYSICAL_PROJECT_SCHEMA_VERSION].includes(Number(project.schemaVersion))) {
        throw new TypeError(`Expected physical project schema 3 or ${PHYSICAL_PROJECT_SCHEMA_VERSION}.`);
    }
    const normalized = createPhysicalProject(project);
    for (const component of normalized.components) {
        if (component.definitionId === 'dip8' && component.footprintId === 'dip8-300mil') component.definitionId = 'test-ic';
    }
    return normalized;
}
