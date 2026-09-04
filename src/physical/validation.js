import { getComponentDef } from '../component-library.js';
import { componentPinRef, connectionRefKey, resolveConnectionWorldPoint } from './model.js';
import { BreadboardSnapSolver, buildBreadboardHoleStates, HOLE_OCCUPANCY } from './placement.js';
import { getFootprintDefinition } from './footprints.js';
import { ConnectivityResolver } from './connectivity.js';

export const PHYSICAL_SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning', INFO: 'info' });

function issue(id, severity, message, componentId = null, icon = null) {
    return { id, severity, message, instanceId: componentId, icon };
}

export function validatePhysicalProject(project) {
    const all = [];
    const solver = new BreadboardSnapSolver();
    const holeStates = buildBreadboardHoleStates(project, { includeMountedPinWireEndpoints: true });
    const connectivity = new ConnectivityResolver(project);

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
    }

    for (const state of holeStates.values()) {
        if (state.occupants.length < 2) continue;
        const pins = state.occupants.filter(item => item.type === HOLE_OCCUPANCY.COMPONENT_PIN);
        const endpoints = state.occupants.filter(item => item.type === HOLE_OCCUPANCY.WIRE_ENDPOINT);
        let message = `${state.holeId} has conflicting physical occupants.`;
        if (pins.length > 1) message = `${state.holeId} is occupied by more than one component pin.`;
        else if (pins.length && endpoints.length) message = `${state.holeId} cannot contain both a component pin and a jumper endpoint.`;
        else if (endpoints.length > 1) message = `${state.holeId} is occupied by more than one jumper endpoint.`;
        all.push(issue(`occupied:${state.key}`, PHYSICAL_SEVERITY.ERROR, message,
            pins[0]?.componentId || null, 'circleXmark'));
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

    // Validate socket identity without relying on coordinates or visual overlap.
    for (const wire of project.wires || []) for (const ref of [wire.from, wire.to]) {
        if (ref?.type !== 'surface-hole') continue;
        const state = holeStates.get(`${ref.surfaceId}:${ref.holeId}`);
        if (!state) all.push(issue(`invalid-wire-hole:${wire.id}:${ref.surfaceId}:${ref.holeId}`,
            PHYSICAL_SEVERITY.ERROR, `Wire ${wire.id} ends outside a valid breadboard hole.`, null, 'circleXmark'));
    }

    const intent = Array.isArray(project.properties?.netlistIntent) ? project.properties.netlistIntent : [];
    if (intent.length) {
        const intentGraph = new Map();
        const add = ref => {
            const key = connectionRefKey(ref);
            if (!intentGraph.has(key)) intentGraph.set(key, new Set([key]));
            return key;
        };
        const merge = (a, b) => {
            const left = intentGraph.get(a), right = intentGraph.get(b);
            if (left === right) return;
            const joined = new Set([...left, ...right]);
            for (const key of joined) intentGraph.set(key, joined);
        };
        for (const edge of intent) merge(add(edge.from), add(edge.to));
        const uniqueNets = [...new Set(intentGraph.values())];
        const netIdByRef = new Map();
        uniqueNets.forEach((refs, index) => refs.forEach(ref => netIdByRef.set(ref, `intent-${index + 1}`)));

        for (const refs of uniqueNets) {
            const members = [...refs];
            if (members.length < 2) continue;
            const first = intent.find(edge => connectionRefKey(edge.from) === members[0] || connectionRefKey(edge.to) === members[0]);
            const firstRef = connectionRefKey(first.from) === members[0] ? first.from : first.to;
            const disconnected = members.slice(1).some(key => {
                const edge = intent.find(item => connectionRefKey(item.from) === key || connectionRefKey(item.to) === key);
                const ref = connectionRefKey(edge.from) === key ? edge.from : edge.to;
                return !connectivity.areConnected(firstRef, ref);
            });
            if (disconnected) all.push(issue(`incomplete-net:${[...refs].sort()[0]}`, PHYSICAL_SEVERITY.ERROR,
                'A required circuit net is not completely connected.', null, 'circleXmark'));
        }

        const groupNets = new Map();
        for (const component of project.components || []) {
            if (component.placement?.type !== 'surface') continue;
            for (const [pinId, holeId] of Object.entries(component.placement.bindings || {})) {
                const netId = netIdByRef.get(connectionRefKey(componentPinRef(component.id, pinId)));
                const state = holeStates.get(`${component.placement.surfaceId}:${holeId}`);
                if (!netId || !state) continue;
                const groupKey = `${state.surfaceId}:${state.electricalGroup}`;
                if (!groupNets.has(groupKey)) groupNets.set(groupKey, new Set());
                groupNets.get(groupKey).add(netId);
            }
        }
        for (const [groupKey, nets] of groupNets) if (nets.size > 1) {
            all.push(issue(`breadboard-net-conflict:${groupKey}`, PHYSICAL_SEVERITY.ERROR,
                'Incompatible circuit nets share one internally connected breadboard group.', null, 'circleXmark'));
        }
    }

    for (const wire of project.wires || []) {
        if (!wire.properties?.generated) continue;
        const without = { ...project, wires: project.wires.filter(item => item.id !== wire.id) };
        if (new ConnectivityResolver(without).areConnected(wire.from, wire.to)) {
            all.push(issue(`redundant-wire:${wire.id}`, PHYSICAL_SEVERITY.WARNING,
                `Generated wire ${wire.id} is redundant because fixed connectivity already completes the connection.`,
                null, 'triangleExclamation'));
        }
    }

    for (const component of project.components || []) {
        if (component.definitionId !== 'led') continue;
        const anodeNet = connectivity.netFor(componentPinRef(component.id, 'A'));
        if (anodeNet.length < 2) continue;
        const hasSeriesResistor = anodeNet.some(ref => ref.type === 'component-pin' && ref.componentId !== component.id &&
            project.components.find(item => item.id === ref.componentId)?.definitionId === 'resistor');
        if (!hasSeriesResistor) {
            all.push(issue(`led-no-resistor:${component.id}`, PHYSICAL_SEVERITY.WARNING,
                `${getComponentDef('led')?.name || 'LED'} ${component.id} is wired without a current-limiting resistor.`,
                component.id, 'triangleExclamation'));
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

    return {
        errors: all.filter(item => item.severity === PHYSICAL_SEVERITY.ERROR),
        warnings: all.filter(item => item.severity === PHYSICAL_SEVERITY.WARNING),
        info: all.filter(item => item.severity === PHYSICAL_SEVERITY.INFO),
        all,
    };
}
