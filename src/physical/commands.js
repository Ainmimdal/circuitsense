import { componentWorldTransform } from './model.js';

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
