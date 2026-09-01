import { componentWorldTransform, resolveConnectionWorldPoint } from './model.js';
import { normalizeDegrees } from './geometry.js';
import { pinExitDirection } from './routing.js';
import { moveWireRouteEndpoints, translateWireRoute } from './wire-edit.js';

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

export function deleteComponentCommand(componentId) {
    return {
        type: 'delete-component',
        wireIds: [],
        apply(project) {
            if (!project.components.some(item => item.id === componentId)) throw new Error(`Unknown component ${componentId}.`);
            project.components = project.components.filter(item => item.id !== componentId);
            project.wires = project.wires.filter(wire =>
                !(wire.from?.type === 'component-pin' && wire.from.componentId === componentId) &&
                !(wire.to?.type === 'component-pin' && wire.to.componentId === componentId));
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
            component.placement = {
                type: 'surface',
                surfaceId: candidate.surfaceId,
                rotation: candidate.rotation,
                bindings: clone(candidate.bindings),
            };
        },
    };
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
            for (const [componentId, transform] of transforms) {
                const component = project.components.find(item => item.id === componentId);
                component.placement = {
                    type: 'free',
                    position: { x: transform.x + movement.x, y: transform.y + movement.y },
                    rotation: transform.rotation || 0,
                };
            }

            const endpointMoves = ref => ref?.type === 'component-pin' && selectedComponents.has(ref.componentId);
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
                ![wire.from, wire.to].some(ref => ref?.type === 'component-pin' && selectedComponents.has(ref.componentId)));
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
