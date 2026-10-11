import { componentWorldTransform, resolveConnectionWorldPoint } from './model.js';
import { normalizeDegrees } from './geometry.js';
import { pinExitDirection } from './routing.js';
import { moveWireRouteEndpoints, translateWireRoute } from './wire-edit.js';
import { getComponentDef } from '../component-library.js';
import { canonicalLedColor, recommendedLedResistorOhms } from '../core/led-resistor.js';
import { getSurfaceDefinition } from './breadboard.js';
import { surfaceHoleRef } from './model.js';
import {
    buildBreadboardHoleStates, freeHoleInPinStrip, HOLE_OCCUPANCY, shiftedHole, shiftMountedPlacements,
} from './placement.js';

function clone(value) {
    return structuredClone(value);
}

export function addComponentCommand(component) {
    return {
        type: 'add-component',
        wireIds: [],
        apply(project) {
            if (project.components.some(item => item.id === component.id)) throw new Error(`Component ${component.id} already exists.`);
            project.components.push(clone(component));
        },
    };
}

export function addSurfaceCommand(surface) {
    return {
        type: 'add-surface',
        wireIds: [],
        apply(project) {
            if (project.surfaces.some(item => item.id === surface.id)) throw new Error(`Placement surface ${surface.id} already exists.`);
            project.surfaces.push(clone(surface));
        },
    };
}

export function setComponentPropertyCommand(componentId, propertyName, value) {
    return {
        type: 'set-component-property',
        componentId,
        // Property-only changes do not invalidate existing wire routes.
        wireIds: [],
        apply(project) {
            const component = project.components.find(item => item.id === componentId);
            if (!component) throw new Error(`Unknown component ${componentId}.`);
            component.properties ||= {};
            component.properties[propertyName] = clone(value);
            if (component.definitionId === 'led' && propertyName === 'color') {
                component.properties.color = canonicalLedColor(value);
                const helper = project.components.find(item => item.definitionId === 'resistor' &&
                    item.properties?.provenance?.kind === 'generated' &&
                    item.properties.provenance.ownerId === componentId);
                if (helper) {
                    const controllerId = component.properties.controllerId || helper.properties?.provenance?.controllerId;
                    const controller = project.components.find(item => item.id === controllerId);
                    const supplyVoltage = getComponentDef(controller?.definitionId)?.autoWirePins?.logicVoltage || 5;
                    const ledColor = component.properties.color;
                    helper.properties ||= {};
                    helper.properties.value = recommendedLedResistorOhms(ledColor, supplyVoltage);
                    helper.properties.recommendedFor = { ledColor, supplyVoltage };
                }
            }
        },
    };
}

export function deleteComponentCommand(componentId) {
    return {
        type: 'delete-component',
        wireIds: [],
        apply(project) {
            if (!project.components.some(item => item.id === componentId)) throw new Error(`Unknown component ${componentId}.`);
            project.components = project.components.filter(item => item.id !== componentId);
            project.wires = project.wires.filter(wire =>
                !(wire.from?.type === 'component-pin' && wire.from.componentId === componentId) &&
                !(wire.to?.type === 'component-pin' && wire.to.componentId === componentId) &&
                !(wire.properties?.logicalTerminals || []).some(ref => ref.componentId === componentId));
            if (Array.isArray(project.properties?.netlistIntent)) {
                project.properties.netlistIntent = project.properties.netlistIntent.filter(edge =>
                    edge.from?.componentId !== componentId && edge.to?.componentId !== componentId);
            }
        },
    };
}

export function mountComponentCommand(componentId, candidate) {
    return {
        type: 'mount-component',
        componentId,
        apply(project) {
            const component = project.components.find(item => item.id === componentId);
            if (!component) throw new Error(`Unknown component ${componentId}.`);
            if (candidate.footprintId) component.footprintId = candidate.footprintId;
            component.placement = {
                type: 'surface',
                surfaceId: candidate.surfaceId,
                rotation: candidate.rotation,
                bindings: clone(candidate.bindings),
            };
            plugPinWiresIntoStrips(project, componentId);
        },
    };
}

/**
 * Once a part is plugged in, its lead fills the socket, so a wire that was
 * attached to the lead moves to a free hole in the same strip. The electrical
 * connection is unchanged; without this the hole would hold both a lead and a
 * jumper, which a real breadboard cannot do.
 */
function plugPinWiresIntoStrips(project, componentId) {
    const holeStates = buildBreadboardHoleStates(project);
    const reserved = new Set();
    for (const wire of project.wires) {
        const ends = ['from', 'to'].filter(end => wire[end]?.type === 'component-pin' && wire[end].componentId === componentId);
        if (!ends.length || ends.length === 2) continue;
        const end = ends[0];
        const target = freeHoleInPinStrip(project, componentId, wire[end].pinId, { reserved, holeStates });
        if (!target) continue;
        reserved.add(`${target.surfaceId}:${target.holeId}`);
        wire[end] = target;
        wire.route = { mode: 'auto', waypoints: [] };
    }
}

export function moveFreeComponentCommand(componentId, position) {
    return {
        type: 'move-component',
        componentId,
        apply(project) {
            const component = project.components.find(item => item.id === componentId);
            if (!component) throw new Error(`Unknown component ${componentId}.`);
            component.placement = {
                type: 'free',
                position: { x: Number(position.x), y: Number(position.y) },
                rotation: component.placement?.rotation || 0,
            };
        },
    };
}

/** Move the board ends of selected jumpers by the same whole-pitch step as their surface. */
function shiftSelectedJumperEnds(project, selectedWires, steps) {
    const moved = new Set();
    if (!steps.size || !selectedWires.size) return moved;
    const holeStates = buildBreadboardHoleStates(project, { excludeWireIds: [...selectedWires] });
    const taken = new Set();
    for (const wire of project.wires) {
        if (!selectedWires.has(wire.id)) continue;
        for (const end of ['from', 'to']) {
            const ref = wire[end];
            const step = ref?.type === 'surface-hole' ? steps.get(ref.surfaceId) : null;
            if (!step) continue;
            const surface = project.surfaces.find(item => item.id === ref.surfaceId);
            const target = shiftedHole(getSurfaceDefinition(surface), ref.holeId, step);
            const key = target && `${ref.surfaceId}:${target.id}`;
            if (!target || taken.has(key) || holeStates.get(key)?.state !== HOLE_OCCUPANCY.FREE) continue;
            taken.add(key);
            wire[end] = surfaceHoleRef(ref.surfaceId, target.id);
            moved.add(wire[end]);
        }
    }
    return moved;
}

export function moveSelectionCommand({ componentIds = [], wireIds = [], delta, routes = {} }) {
    const selectedComponents = new Set(componentIds);
    const selectedWires = new Set(wireIds);
    const movement = { x: Number(delta?.x || 0), y: Number(delta?.y || 0) };
    return {
        type: 'move-selection',
        componentIds: [...selectedComponents],
        wireIds: [...selectedWires],
        apply(project) {
            const transforms = new Map();
            for (const componentId of selectedComponents) {
                const component = project.components.find(item => item.id === componentId);
                if (!component) continue;
                transforms.set(componentId, componentWorldTransform(project, component));
            }
            // Parts plugged into a breadboard stay plugged in when the shift lands
            // on legal holes; only parts that cannot be remounted become free.
            const shifted = shiftMountedPlacements(project, [...selectedComponents], movement, {
                movingWireIds: [...selectedWires],
            });
            for (const [componentId, transform] of transforms) {
                const component = project.components.find(item => item.id === componentId);
                const mounted = shifted.placements.get(componentId);
                component.placement = mounted ? clone(mounted) : {
                    type: 'free',
                    position: { x: transform.x + movement.x, y: transform.y + movement.y },
                    rotation: transform.rotation || 0,
                };
            }
            const movedHoleEnds = shiftSelectedJumperEnds(project, selectedWires, shifted.steps);

            const endpointMoves = ref => (ref?.type === 'component-pin' && selectedComponents.has(ref.componentId)) ||
                movedHoleEnds.has(ref);
            for (const wire of project.wires) {
                const fromMoved = endpointMoves(wire.from);
                const toMoved = endpointMoves(wire.to);
                const routeSelected = selectedWires.has(wire.id);
                if (!fromMoved && !toMoved && !routeSelected) continue;
                const previous = routes[wire.id];
                if (!Array.isArray(previous) || previous.length < 2) {
                    wire.route = { mode: 'auto', waypoints: [] };
                    continue;
                }
                const nextFrom = resolveConnectionWorldPoint(project, wire.from);
                const nextTo = resolveConnectionWorldPoint(project, wire.to);
                const preserved = routeSelected
                    ? translateWireRoute(previous, { delta: movement, from: nextFrom, to: nextTo })
                    : moveWireRouteEndpoints(previous, {
                        from: nextFrom,
                        to: nextTo,
                        fromDirection: pinExitDirection(project, wire.from),
                        toDirection: pinExitDirection(project, wire.to),
                    });
                wire.route = { mode: 'manual', waypoints: preserved.slice(1, -1), preservedFromMove: true };
            }
        },
    };
}

export function deleteSelectionCommand({ componentIds = [], wireIds = [] }) {
    const selectedComponents = new Set(componentIds);
    const selectedWires = new Set(wireIds);
    return {
        type: 'delete-selection',
        wireIds: [],
        apply(project) {
            project.components = project.components.filter(component => !selectedComponents.has(component.id));
            project.wires = project.wires.filter(wire => !selectedWires.has(wire.id) &&
                ![wire.from, wire.to].some(ref => ref?.type === 'component-pin' && selectedComponents.has(ref.componentId)) &&
                !(wire.properties?.logicalTerminals || []).some(ref => selectedComponents.has(ref.componentId)));
            if (Array.isArray(project.properties?.netlistIntent)) {
                project.properties.netlistIntent = project.properties.netlistIntent.filter(edge =>
                    !selectedComponents.has(edge.from?.componentId) && !selectedComponents.has(edge.to?.componentId));
            }
        },
    };
}

export function rotateFreeComponentCommand(componentId, delta = 90) {
    return {
        type: 'rotate-component',
        componentId,
        apply(project) {
            const component = project.components.find(item => item.id === componentId);
            if (!component) throw new Error(`Unknown component ${componentId}.`);
            if (component.placement?.type !== 'free') throw new Error('Mounted components must use a legal breadboard rotation.');
            component.placement.rotation = normalizeDegrees((component.placement.rotation || 0) + Number(delta || 0));
            for (const wire of project.wires.filter(item => [item.from, item.to].some(ref =>
                ref?.type === 'component-pin' && ref.componentId === componentId))) {
                wire.route = { mode: 'auto', waypoints: [] };
            }
        },
    };
}

export function moveSurfaceCommand(surfaceId, transform) {
    return {
        type: 'move-surface',
        surfaceId,
        apply(project) {
            const surface = project.surfaces.find(item => item.id === surfaceId);
            if (!surface) throw new Error(`Unknown placement surface ${surfaceId}.`);
            surface.transform = { ...surface.transform, ...clone(transform) };
        },
    };
}

export function deleteSurfaceCommand(surfaceId) {
    return {
        type: 'delete-surface',
        apply(project) {
            const surface = project.surfaces.find(item => item.id === surfaceId);
            if (!surface) throw new Error(`Unknown placement surface ${surfaceId}.`);
            for (const component of project.components.filter(item => item.placement?.surfaceId === surfaceId)) {
                const world = componentWorldTransform(project, component);
                component.placement = {
                    type: 'free',
                    position: { x: world.x, y: world.y },
                    rotation: world.rotation || 0,
                };
            }
            project.surfaces = project.surfaces.filter(item => item.id !== surfaceId);
            project.wires = project.wires.filter(wire =>
                !(wire.from?.type === 'surface-hole' && wire.from.surfaceId === surfaceId) &&
                !(wire.to?.type === 'surface-hole' && wire.to.surfaceId === surfaceId));
        },
    };
}

export function addWireCommand(wire) {
    return {
        type: 'add-wire',
        wireIds: [wire.id],
        apply(project) {
            if (project.wires.some(item => item.id === wire.id)) throw new Error(`Wire ${wire.id} already exists.`);
            project.wires.push(clone(wire));
        },
    };
}

export function deleteWireCommand(wireId) {
    return {
        type: 'delete-wire',
        wireIds: [],
        apply(project) {
            project.wires = project.wires.filter(item => item.id !== wireId);
        },
    };
}
