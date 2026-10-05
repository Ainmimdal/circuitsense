import { distance, normalizeDegrees, rotatePoint } from './geometry.js';
import { footprintsForComponent, getFootprintDefinition, projectFootprintPoint } from './footprints.js';
import { getSurfaceDefinition, holeWorldPosition, worldToSurfaceLocal } from './breadboard.js';
import { surfaceHoleRef } from './model.js';

export const HOLE_OCCUPANCY = Object.freeze({
    FREE: 'FREE',
    COMPONENT_PIN: 'COMPONENT_PIN',
    WIRE_ENDPOINT: 'WIRE_ENDPOINT',
});

function coordinateKey(point) {
    return `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
}

function physicalHoleForRef(project, ref) {
    if (ref?.type === 'surface-hole') return { surfaceId: ref.surfaceId, holeId: ref.holeId };
    if (ref?.type !== 'component-pin') return null;
    const component = project?.components?.find(item => item.id === ref.componentId);
    if (component?.placement?.type !== 'surface') return null;
    const holeId = component.placement.bindings?.[ref.pinId];
    return holeId ? { surfaceId: component.placement.surfaceId, holeId } : null;
}

/**
 * Materialize every stable breadboard socket with its dynamic occupancy. Hole
 * identity/topology remains on the board definition; occupancy belongs to the
 * project state and is therefore reversible and renderer-independent.
 */
export function buildBreadboardHoleStates(project, {
    excludeComponentId = null,
    excludeComponentIds = [],
    excludeWireIds = [],
    includeMountedPinWireEndpoints = false,
} = {}) {
    const excludedWires = new Set(excludeWireIds);
    const excludedComponents = new Set(excludeComponentIds);
    if (excludeComponentId !== null) excludedComponents.add(excludeComponentId);
    const states = new Map();
    for (const surface of project?.surfaces || []) {
        const definition = getSurfaceDefinition(surface);
        if (!definition) continue;
        for (const hole of definition.holes) {
            states.set(`${surface.id}:${hole.id}`, {
                key: `${surface.id}:${hole.id}`,
                surfaceId: surface.id,
                holeId: hole.id,
                position: { x: hole.x, y: hole.y },
                worldPosition: holeWorldPosition(surface, hole.id),
                electricalGroup: hole.electricalGroup,
                state: HOLE_OCCUPANCY.FREE,
                occupants: [],
            });
        }
    }

    const occupy = (physical, occupant) => {
        const record = states.get(`${physical.surfaceId}:${physical.holeId}`);
        if (!record) return;
        record.occupants.push(occupant);
        if (record.state === HOLE_OCCUPANCY.FREE) record.state = occupant.type;
    };
    for (const component of project?.components || []) {
        if (excludedComponents.has(component.id) || component.placement?.type !== 'surface') continue;
        for (const [pinId, holeId] of Object.entries(component.placement.bindings || {})) {
            occupy({ surfaceId: component.placement.surfaceId, holeId }, {
                type: HOLE_OCCUPANCY.COMPONENT_PIN,
                componentId: component.id,
                pinId,
            });
        }
    }
    for (const wire of project?.wires || []) {
        if (excludedWires.has(wire.id)) continue;
        for (const [end, ref] of [['from', wire.from], ['to', wire.to]]) {
            if (ref?.type !== 'surface-hole' && !includeMountedPinWireEndpoints) continue;
            const physical = physicalHoleForRef(project, ref);
            if (!physical) continue;
            occupy(physical, {
                type: HOLE_OCCUPANCY.WIRE_ENDPOINT,
                wireId: wire.id,
                end,
                ref,
            });
        }
    }
    return states;
}

export function buildOccupancyMap(project, options = {}) {
    const occupancy = new Map();
    for (const [key, state] of buildBreadboardHoleStates(project, options)) {
        if (state.state === HOLE_OCCUPANCY.FREE) continue;
        const first = state.occupants[0] || {};
        occupancy.set(key, {
            ...first,
            holeId: state.holeId,
            surfaceId: state.surfaceId,
            state: state.state,
            occupants: state.occupants,
        });
    }
    return occupancy;
}

export function placementBindingsAreAvailable(candidate, occupancy) {
    return Object.values(candidate?.bindings || {}).every(holeId =>
        !occupancy.has(`${candidate.surfaceId}:${holeId}`));
}

function candidateMatchesFootprintGeometry(footprint, definition, candidate) {
    const anchorPin = footprint.pins.find(pin => pin.pinId === footprint.anchorPinId);
    const anchorHoleId = candidate.bindings?.[footprint.anchorPinId];
    const anchorHole = definition.getHole(anchorHoleId);
    if (!anchorPin || !anchorHole) return false;
    const projectedAnchor = projectFootprintPoint(footprint, anchorPin);
    for (const pin of footprint.pins.filter(item => item.mount === 'breadboard-hole')) {
        const hole = definition.getHole(candidate.bindings?.[pin.pinId]);
        if (!hole) return false;
        const projected = projectFootprintPoint(footprint, pin);
        const offset = rotatePoint({
            x: projected.x - projectedAnchor.x,
            y: projected.y - projectedAnchor.y,
        }, candidate.rotation);
        if (coordinateKey(hole) !== coordinateKey({ x: anchorHole.x + offset.x, y: anchorHole.y + offset.y })) return false;
    }
    return true;
}

function candidateIsElectricallyLegal(definition, bindings) {
    const groups = new Map();
    for (const [pinId, holeId] of Object.entries(bindings)) {
        const group = definition.getHole(holeId)?.electricalGroup;
        if (!group) return false;
        const prior = groups.get(group);
        if (prior && prior !== pinId) return false;
        groups.set(group, pinId);
    }
    return true;
}

function candidateSatisfiesBoardRules(footprint, definition, bindings) {
    if (!candidateIsElectricallyLegal(definition, bindings)) return false;
    if (!footprint.requiresTrench) return true;
    const banks = new Set(Object.values(bindings).map(holeId => definition.getHole(holeId)?.bank));
    return banks.has('upper') && banks.has('lower');
}

export class BreadboardSnapSolver {
    constructor({ acquisitionRadius = 4.25 } = {}) {
        this.acquisitionRadius = acquisitionRadius;
    }

    solve({ project, component, pointerWorld, surfaceId, preferredRotation, preferredFootprintId = null } = {}) {
        const surface = (project?.surfaces || []).find(item => item.id === surfaceId);
        const definition = getSurfaceDefinition(surface);
        const currentFootprint = getFootprintDefinition(component?.footprintId);
        const footprints = footprintsForComponent(component?.definitionId)
            .filter(footprint => footprint.placementMode === 'breadboard-rigid');
        if (!surface || !definition || !currentFootprint || !footprints.length) return null;

        const requestedFootprintId = preferredFootprintId || component.footprintId;
        const resolvedPreferredFootprintId = footprints.some(footprint => footprint.id === requestedFootprintId)
            ? requestedFootprintId
            : footprints.find(footprint => footprint.preferred)?.id || footprints[0].id;

        const pointerLocal = worldToSurfaceLocal(surface, pointerWorld);
        const occupancy = buildOccupancyMap(project, { excludeComponentId: component.id });
        const holeAtPoint = new Map(definition.holes.map(hole => [coordinateKey(hole), hole]));
        const candidates = [];

        for (const footprint of footprints) {
            const anchorPin = footprint.pins.find(pin => pin.pinId === footprint.anchorPinId);
            if (!anchorPin) continue;
            const rotations = [...footprint.validRotations].sort((a, b) => {
                const preferred = normalizeDegrees(preferredRotation ?? component.placement?.rotation ?? 0);
                const deltaA = Math.min(Math.abs(a - preferred), 360 - Math.abs(a - preferred));
                const deltaB = Math.min(Math.abs(b - preferred), 360 - Math.abs(b - preferred));
                return deltaA - deltaB || a - b;
            });
            for (const anchorHole of definition.holes) {
                if (anchorHole.zone !== 'terminal') continue;
                const anchorDistance = distance(pointerLocal, anchorHole);
                if (anchorDistance > this.acquisitionRadius) continue;

                for (const rotation of rotations) {
                const bindings = {};
                let valid = true;
                for (const pin of footprint.pins.filter(item => item.mount === 'breadboard-hole')) {
                    const projectedPin = projectFootprintPoint(footprint, pin);
                    const projectedAnchor = projectFootprintPoint(footprint, anchorPin);
                    const offset = rotatePoint({
                        x: projectedPin.x - projectedAnchor.x,
                        y: projectedPin.y - projectedAnchor.y,
                    }, rotation);
                    const requiredPoint = { x: anchorHole.x + offset.x, y: anchorHole.y + offset.y };
                    const requiredHole = holeAtPoint.get(coordinateKey(requiredPoint));
                    if (!requiredHole || requiredHole.zone !== 'terminal' || !requiredHole.canOccupy) {
                        valid = false;
                        break;
                    }
                    if (occupancy.has(`${surface.id}:${requiredHole.id}`)) {
                        valid = false;
                        break;
                    }
                    bindings[pin.pinId] = requiredHole.id;
                }
                if (!valid || !candidateSatisfiesBoardRules(footprint, definition, bindings)) continue;

                const rotationDelta = Math.min(
                    Math.abs(rotation - normalizeDegrees(preferredRotation ?? component.placement?.rotation ?? 0)),
                    360 - Math.abs(rotation - normalizeDegrees(preferredRotation ?? component.placement?.rotation ?? 0)),
                );
                candidates.push({
                    surfaceId: surface.id,
                    footprintId: footprint.id,
                    rotation,
                    bindings,
                    anchorHoleId: anchorHole.id,
                    score: anchorDistance + rotationDelta * 0.002 +
                        Number(footprint.id !== resolvedPreferredFootprintId) * .08,
                    valid: true,
                });
                }
            }
        }

        candidates.sort((a, b) => a.score - b.score ||
            a.anchorHoleId.localeCompare(b.anchorHoleId, undefined, { numeric: true }) || a.rotation - b.rotation);
        return candidates[0] || null;
    }

    validateCandidate(project, component, candidate) {
        if (!candidate?.valid) return false;
        const surface = project.surfaces.find(item => item.id === candidate.surfaceId);
        const definition = getSurfaceDefinition(surface);
        const footprint = getFootprintDefinition(candidate.footprintId || component.footprintId);
        if (!definition || !footprint || !footprint.validRotations.includes(candidate.rotation)) return false;
        const requiredPins = footprint.pins.filter(pin => pin.mount === 'breadboard-hole').map(pin => pin.pinId).sort();
        if (JSON.stringify(Object.keys(candidate.bindings).sort()) !== JSON.stringify(requiredPins)) return false;
        if (!candidateMatchesFootprintGeometry(footprint, definition, candidate)) return false;
        if (!candidateSatisfiesBoardRules(footprint, definition, candidate.bindings)) return false;
        return placementBindingsAreAvailable(candidate, buildOccupancyMap(project, { excludeComponentId: component.id }));
    }
}

/**
 * A jumper cannot share a socket with a component lead. For a mounted pin,
 * return the nearest free hole in the same internally connected strip, which
 * is where a real jumper would be plugged in to reach that pin.
 */
export function freeHoleInPinStrip(project, componentId, pinId, {
    reserved = new Set(),
    holeStates = buildBreadboardHoleStates(project),
} = {}) {
    const component = project?.components?.find(item => item.id === componentId);
    if (component?.placement?.type !== 'surface') return null;
    const surface = project.surfaces.find(item => item.id === component.placement.surfaceId);
    const definition = getSurfaceDefinition(surface);
    const mountedHole = definition?.getHole(component.placement.bindings?.[pinId]);
    if (!mountedHole) return null;
    const holeId = definition.getGroupHoles(mountedHole.electricalGroup)
        .filter(candidate => {
            const key = `${surface.id}:${candidate}`;
            return !reserved.has(key) && holeStates.get(key)?.state === HOLE_OCCUPANCY.FREE;
        })
        .sort((a, b) => distance(definition.getHole(a), mountedHole) - distance(definition.getHole(b), mountedHole) ||
            String(a).localeCompare(String(b), undefined, { numeric: true }))[0];
    return holeId ? surfaceHoleRef(surface.id, holeId) : null;
}

/** Find the hole a whole number of pitches away from `holeId` in surface-local space. */
export function shiftedHole(definition, holeId, steps) {
    const hole = definition?.getHole(holeId);
    if (!hole) return null;
    const target = {
        x: hole.x + steps.x * definition.pitch,
        y: hole.y + steps.y * definition.pitch,
    };
    const key = coordinateKey(target);
    return definition.holes.find(candidate => coordinateKey(candidate) === key) || null;
}

/** Convert a world-space drag into whole-pitch steps on a (possibly rotated) surface. */
export function surfacePitchSteps(surface, delta) {
    const definition = getSurfaceDefinition(surface);
    if (!definition) return null;
    const local = rotatePoint({ x: Number(delta?.x || 0), y: Number(delta?.y || 0) }, -(surface.transform?.rotation || 0));
    return {
        x: Math.round(local.x / definition.pitch) || 0,
        y: Math.round(local.y / definition.pitch) || 0,
    };
}

/**
 * Move a set of mounted components together by a world-space drag while
 * keeping them plugged into the board. Each surface is shifted by the nearest
 * whole number of pitches; if any part on that surface would leave the board
 * or collide, none of that surface's parts are remounted and null is returned
 * for them so callers can fall back to free placement.
 */
export function shiftMountedPlacements(project, componentIds, delta, {
    movingWireIds = [],
    solver = new BreadboardSnapSolver(),
} = {}) {
    const moving = project.components.filter(component => componentIds.includes(component.id) &&
        component.placement?.type === 'surface');
    const movingIds = new Set(moving.map(component => component.id));
    const result = new Map();
    const steps = new Map();
    const bySurface = new Map();
    for (const component of moving) {
        if (!bySurface.has(component.placement.surfaceId)) bySurface.set(component.placement.surfaceId, []);
        bySurface.get(component.placement.surfaceId).push(component);
    }
    // Jumpers that travel with the selection must not block the parts they move with.
    const planning = {
        ...project,
        components: project.components.filter(component => !movingIds.has(component.id)),
        wires: (project.wires || []).filter(wire => !movingWireIds.includes(wire.id)),
    };
    for (const [surfaceId, components] of bySurface) {
        const surface = project.surfaces.find(item => item.id === surfaceId);
        const definition = getSurfaceDefinition(surface);
        const step = surface && surfacePitchSteps(surface, delta);
        const placed = [];
        let legal = Boolean(definition && step);
        for (const component of legal ? components : []) {
            const bindings = {};
            for (const [pinId, holeId] of Object.entries(component.placement.bindings || {})) {
                const target = shiftedHole(definition, holeId, step);
                if (!target) { legal = false; break; }
                bindings[pinId] = target.id;
            }
            const placement = { type: 'surface', surfaceId, rotation: component.placement.rotation, bindings };
            const candidate = { valid: true, surfaceId, rotation: placement.rotation, bindings, footprintId: component.footprintId };
            if (!legal || !solver.validateCandidate(planning, component, candidate)) { legal = false; break; }
            const mounted = { ...component, placement };
            planning.components.push(mounted);
            placed.push(mounted);
        }
        if (!legal) {
            planning.components = planning.components.filter(component => !placed.includes(component));
            for (const component of components) result.set(component.id, null);
            continue;
        }
        steps.set(surfaceId, step);
        for (const component of placed) result.set(component.id, component.placement);
    }
    return { placements: result, steps };
}
