import { applyTransform, distance, invertTransform } from './geometry.js';
import {
    FULL_BREADBOARD_DEFINITION,
    getBreadboardDefinition,
    HALF_BREADBOARD_DEFINITION,
} from '../core/breadboard-topology.js';

export { FULL_BREADBOARD_DEFINITION, HALF_BREADBOARD_DEFINITION } from '../core/breadboard-topology.js';

export function createHalfBreadboardSurface({
    id = 'breadboard-1',
    x = 22,
    y = 18,
    rotation = 0,
} = {}) {
    return {
        id,
        type: 'breadboard',
        definitionId: HALF_BREADBOARD_DEFINITION.id,
        transform: { x, y, rotation },
    };
}

export function createFullBreadboardSurface({ id = 'breadboard-1', x = 22, y = 18, rotation = 0 } = {}) {
    return { id, type: 'breadboard', definitionId: FULL_BREADBOARD_DEFINITION.id, transform: { x, y, rotation } };
}

export function getSurfaceDefinition(surface) {
    if (surface?.type !== 'breadboard') return null;
    return getBreadboardDefinition(surface.definitionId);
}

export function surfaceLocalToWorld(surface, point) {
    return applyTransform(point, surface?.transform);
}

export function worldToSurfaceLocal(surface, point) {
    return invertTransform(point, surface?.transform);
}

export function holeWorldPosition(surface, holeId) {
    const hole = getSurfaceDefinition(surface)?.getHole(holeId);
    return hole ? surfaceLocalToWorld(surface, hole) : null;
}

export function nearestHole(surface, worldPoint, { maxDistance = Infinity, zone } = {}) {
    const definition = getSurfaceDefinition(surface);
    if (!definition) return null;
    const localPoint = worldToSurfaceLocal(surface, worldPoint);
    let best = null;
    for (const hole of definition.holes) {
        if (zone && hole.zone !== zone) continue;
        const candidateDistance = distance(localPoint, hole);
        if (candidateDistance > maxDistance) continue;
        if (!best || candidateDistance < best.distance - 1e-9 ||
            (Math.abs(candidateDistance - best.distance) <= 1e-9 && hole.id.localeCompare(best.hole.id, undefined, { numeric: true }) < 0)) {
            best = { hole, distance: candidateDistance, localPoint };
        }
    }
    return best;
}

export function holesInElectricalGroup(surface, holeId) {
    const definition = getSurfaceDefinition(surface);
    const hole = definition?.getHole(holeId);
    return hole ? definition.getGroupHoles(hole.electricalGroup) : [];
}
