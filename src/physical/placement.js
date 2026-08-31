import { distance, normalizeDegrees, rotatePoint } from './geometry.js';
import { getFootprintDefinition, projectFootprintPoint } from './footprints.js';
import { getSurfaceDefinition, worldToSurfaceLocal } from './breadboard.js';

function coordinateKey(point) {
    return `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
}

export function buildOccupancyMap(project, { excludeComponentId = null } = {}) {
    const occupancy = new Map();
    for (const component of project?.components || []) {
        if (component.id === excludeComponentId || component.placement?.type !== 'surface') continue;
        for (const [pinId, holeId] of Object.entries(component.placement.bindings || {})) {
            const key = `${component.placement.surfaceId}:${holeId}`;
            occupancy.set(key, { componentId: component.id, pinId, holeId, surfaceId: component.placement.surfaceId });
        }
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

    solve({ project, component, pointerWorld, surfaceId, preferredRotation } = {}) {
        const surface = (project?.surfaces || []).find(item => item.id === surfaceId);
        const definition = getSurfaceDefinition(surface);
        const footprint = getFootprintDefinition(component?.footprintId);
        if (!surface || !definition || !footprint || footprint.placementMode !== 'breadboard-rigid') return null;

        const pointerLocal = worldToSurfaceLocal(surface, pointerWorld);
        const anchorPin = footprint.pins.find(pin => pin.pinId === footprint.anchorPinId);
        if (!anchorPin) return null;
        const occupancy = buildOccupancyMap(project, { excludeComponentId: component.id });
        const holeAtPoint = new Map(definition.holes.map(hole => [coordinateKey(hole), hole]));
        const rotations = [...footprint.validRotations].sort((a, b) => {
            const preferred = normalizeDegrees(preferredRotation ?? component.placement?.rotation ?? 0);
            const deltaA = Math.min(Math.abs(a - preferred), 360 - Math.abs(a - preferred));
            const deltaB = Math.min(Math.abs(b - preferred), 360 - Math.abs(b - preferred));
            return deltaA - deltaB || a - b;
        });
        const candidates = [];

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
                    score: anchorDistance + rotationDelta * 0.002,
                    valid: true,
                });
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
        const footprint = getFootprintDefinition(component.footprintId);
        if (!definition || !footprint || !footprint.validRotations.includes(candidate.rotation)) return false;
        const requiredPins = footprint.pins.filter(pin => pin.mount === 'breadboard-hole').map(pin => pin.pinId).sort();
        if (JSON.stringify(Object.keys(candidate.bindings).sort()) !== JSON.stringify(requiredPins)) return false;
        if (!candidateMatchesFootprintGeometry(footprint, definition, candidate)) return false;
        if (!candidateSatisfiesBoardRules(footprint, definition, candidate.bindings)) return false;
        return placementBindingsAreAvailable(candidate, buildOccupancyMap(project, { excludeComponentId: component.id }));
    }
}
