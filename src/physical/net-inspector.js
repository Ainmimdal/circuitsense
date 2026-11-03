import { getSurfaceDefinition } from './breadboard.js';
import { connectionRefKey, componentPinRef, surfaceHoleRef } from './model.js';
import { getFootprintDefinition } from './footprints.js';

function addEdge(graph, left, right) {
    if (!left || !right || left === right) return;
    if (!graph.has(left)) graph.set(left, new Set());
    if (!graph.has(right)) graph.set(right, new Set());
    graph.get(left).add(right);
    graph.get(right).add(left);
}

function pinDomain(pinId) {
    const pin = String(pinId || '').toUpperCase();
    if (/(?:^|[._-])(GND|VSS|DGND|AGND)(?:$|[._-])/.test(`.${pin}.`)) return 'ground';
    if (/(?:^|[._-])(5V|VCC5)(?:$|[._-])/.test(`.${pin}.`)) return 'power-5v';
    if (/(?:^|[._-])(3V3|3\.3V)(?:$|[._-])/.test(`.${pin}.`)) return 'power-3v3';
    return null;
}

function connectComponentDomains(project, graph) {
    for (const component of project.components || []) {
        const groups = new Map();
        const footprint = getFootprintDefinition(component.footprintId);
        for (const pin of footprint?.pins || []) {
            const domain = pinDomain(pin.pinId);
            if (!domain) continue;
            if (!groups.has(domain)) groups.set(domain, []);
            groups.get(domain).push(connectionRefKey(componentPinRef(component.id, pin.pinId)));
        }
        for (const keys of groups.values()) {
            for (let index = 1; index < keys.length; index++) addEdge(graph, keys[0], keys[index]);
        }
    }
}

function buildGraph(project) {
    const graph = new Map();
    for (const wire of project.wires || []) {
        addEdge(graph, connectionRefKey(wire.from), connectionRefKey(wire.to));
    }
    for (const component of project.components || []) {
        if (component.placement?.type !== 'surface') continue;
        for (const [pinId, holeId] of Object.entries(component.placement.bindings || {})) {
            addEdge(graph,
                connectionRefKey(componentPinRef(component.id, pinId)),
                connectionRefKey(surfaceHoleRef(component.placement.surfaceId, holeId)));
        }
    }
    for (const surface of project.surfaces || []) {
        const definition = getSurfaceDefinition(surface);
        if (!definition) continue;
        const groupAnchors = new Map();
        for (const hole of definition.holes) {
            const key = connectionRefKey(surfaceHoleRef(surface.id, hole.id));
            const anchor = groupAnchors.get(hole.electricalGroup);
            if (anchor) addEdge(graph, anchor, key);
            else groupAnchors.set(hole.electricalGroup, key);
        }
    }
    connectComponentDomains(project, graph);
    return graph;
}

function connectedKeys(graph, start) {
    const visited = new Set(), queue = [start];
    while (queue.length) {
        const key = queue.shift();
        if (!key || visited.has(key)) continue;
        visited.add(key);
        for (const next of graph.get(key) || []) if (!visited.has(next)) queue.push(next);
    }
    return visited;
}

function labelFor(terminals) {
    const pins = terminals.map(item => String(item.pinId).toUpperCase());
    if (pins.some(pin => /(GND|VSS|DGND|AGND)/.test(pin))) return 'Ground net';
    if (pins.some(pin => /(^|[._-])5V($|[._-])/.test(pin))) return '5V power net';
    if (pins.some(pin => /(3V3|3\.3V)/.test(pin))) return '3.3V power net';
    return 'Signal net';
}

export function inspectWireNet(project, wireId) {
    const selected = (project.wires || []).find(wire => wire.id === wireId);
    if (!selected) return null;
    const graph = buildGraph(project);
    const keys = connectedKeys(graph, connectionRefKey(selected.from));
    const terminals = [];
    for (const component of project.components || []) {
        const footprint = getFootprintDefinition(component.footprintId);
        for (const pin of footprint?.pins || []) {
            const key = connectionRefKey(componentPinRef(component.id, pin.pinId));
            if (keys.has(key)) terminals.push({ componentId: component.id, definitionId: component.definitionId, pinId: pin.pinId });
        }
    }
    const wireIds = (project.wires || []).filter(wire =>
        keys.has(connectionRefKey(wire.from)) && keys.has(connectionRefKey(wire.to))).map(wire => wire.id);
    const contacts = (project.wires || []).flatMap(wire => [wire.from, wire.to])
        .filter(ref => ref.type === 'surface-hole' && keys.has(connectionRefKey(ref)))
        .filter((ref, index, all) => all.findIndex(item => connectionRefKey(item) === connectionRefKey(ref)) === index);
    return { wireId, wireIds, terminals, contacts, label: labelFor(terminals) };
}

/**
 * Everything electrically joined to one terminal (a pin, a hole or a wire end):
 * the wires, the parts with a pin in the net and every breadboard hole that
 * shares it. Used to light up a whole connection while hovering.
 */
export function inspectNetAt(project, ref) {
    if (!ref) return null;
    const graph = buildGraph(project);
    const keys = connectedKeys(graph, connectionRefKey(ref));
    const wireIds = (project.wires || []).filter(wire =>
        keys.has(connectionRefKey(wire.from)) || keys.has(connectionRefKey(wire.to))).map(wire => wire.id);
    const terminals = [];
    for (const component of project.components || []) {
        const footprint = getFootprintDefinition(component.footprintId);
        for (const pin of footprint?.pins || []) {
            if (keys.has(connectionRefKey(componentPinRef(component.id, pin.pinId)))) {
                terminals.push({ componentId: component.id, pinId: pin.pinId });
            }
        }
    }
    const holes = [];
    for (const surface of project.surfaces || []) {
        for (const hole of getSurfaceDefinition(surface)?.holes || []) {
            if (keys.has(connectionRefKey(surfaceHoleRef(surface.id, hole.id)))) holes.push({ surfaceId: surface.id, holeId: hole.id });
        }
    }
    return {
        wireIds,
        terminals,
        componentIds: [...new Set(terminals.map(terminal => terminal.componentId))],
        holes,
        label: labelFor(terminals),
        // A lone pin or an empty strip has nothing to trace.
        connected: wireIds.length > 0 || terminals.length > 1,
    };
}

/** How long the pointer must rest on a wire, pin or hole before its net lights up. */
export const NET_HOVER_DELAY_MS = 200;

/**
 * Decide which net to show and how strongly. Hovering only highlights a net,
 * so sweeping the pointer across a busy board never dims anything. Holding
 * Alt over a terminal, or selecting a single wire, isolates its net by
 * dimming everything else. Nothing shows while a drag, placement or wire
 * draw is in progress.
 */
export function resolveNetFocus({ hoverRef = null, selectedWireRef = null, altHeld = false, busy = false } = {}) {
    if (busy) return null;
    if (altHeld && hoverRef) return { ref: hoverRef, mode: 'isolate' };
    if (selectedWireRef) return { ref: selectedWireRef, mode: 'isolate' };
    if (hoverRef) return { ref: hoverRef, mode: 'highlight' };
    return null;
}
