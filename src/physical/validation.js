import { getComponentDef } from '../component-library.js';
import { resolveConnectionWorldPoint } from './model.js';
import { BreadboardSnapSolver, buildOccupancyMap } from './placement.js';
import { getFootprintDefinition } from './footprints.js';

export const PHYSICAL_SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning', INFO: 'info' });

function issue(id, severity, message, componentId = null, icon = null) {
    return { id, severity, message, instanceId: componentId, icon };
}

export function validatePhysicalProject(project) {
    const all = [];
    const solver = new BreadboardSnapSolver();
    const occupancy = buildOccupancyMap(project);
    const seenOccupancy = new Map();

    for (const component of project.components || []) {
        const footprint = getFootprintDefinition(component.footprintId);
        if (!footprint) {
            all.push(issue(`missing-footprint:${component.id}`, PHYSICAL_SEVERITY.ERROR,
                `${component.definitionId} has no physical footprint.`, component.id, 'circleXmark'));
            continue;
        }
        if (component.placement?.type !== 'surface') continue;
        const candidate = {
            valid: true,
            surfaceId: component.placement.surfaceId,
            rotation: component.placement.rotation,
            bindings: component.placement.bindings,
        };
        if (!solver.validateCandidate(project, component, candidate)) {
            all.push(issue(`invalid-placement:${component.id}`, PHYSICAL_SEVERITY.ERROR,
                `${getComponentDef(component.definitionId)?.name || component.definitionId} is not aligned to a complete legal footprint.`,
                component.id, 'triangleExclamation'));
        }
        for (const holeId of Object.values(component.placement.bindings || {})) {
            const key = `${component.placement.surfaceId}:${holeId}`;
            if (seenOccupancy.has(key) && seenOccupancy.get(key) !== component.id) {
                all.push(issue(`occupied:${key}`, PHYSICAL_SEVERITY.ERROR,
                    `${holeId} is occupied by more than one component pin.`, component.id, 'circleXmark'));
            }
            seenOccupancy.set(key, component.id);
        }
    }

    for (const wire of project.wires || []) {
        const from = resolveConnectionWorldPoint(project, wire.from);
        const to = resolveConnectionWorldPoint(project, wire.to);
        if (!from || !to) {
            all.push(issue(`broken-wire:${wire.id}`, PHYSICAL_SEVERITY.ERROR,
                `Wire ${wire.id} has a missing endpoint.`, null, 'circleXmark'));
        } else if (wire.from?.type === wire.to?.type && JSON.stringify(wire.from) === JSON.stringify(wire.to)) {
            all.push(issue(`loop-wire:${wire.id}`, PHYSICAL_SEVERITY.WARNING,
                `Wire ${wire.id} connects a terminal to itself.`, null, 'triangleExclamation'));
        }
    }

    const hasController = project.components.some(component => getComponentDef(component.definitionId)?.autoWirePins);
    const needsController = project.components.some(component => getComponentDef(component.definitionId)?.autoWire);
    if (needsController && !hasController) {
        all.push(issue('no-controller', PHYSICAL_SEVERITY.WARNING,
            'Add an Arduino or supported controller to power and auto-wire this circuit.', null, 'triangleExclamation'));
    }
    if (!(project.components || []).length) {
        all.push(issue('empty-project', PHYSICAL_SEVERITY.INFO, 'Add a component to begin building.', null, 'circleInfo'));
    }

    // Read the occupancy map so validation remains explicitly tied to the same
    // semantic bindings used by placement and connectivity.
    void occupancy;
    return {
        errors: all.filter(item => item.severity === PHYSICAL_SEVERITY.ERROR),
        warnings: all.filter(item => item.severity === PHYSICAL_SEVERITY.WARNING),
        info: all.filter(item => item.severity === PHYSICAL_SEVERITY.INFO),
        all,
    };
}
