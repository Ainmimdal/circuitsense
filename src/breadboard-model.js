import { boardRegistry } from './core/board-registry.js';

const halfBoard = boardRegistry['breadboard-half-400'];

export const BREADBOARD = Object.freeze({
    width: halfBoard.width,
    height: halfBoard.height,
    pitch: halfBoard.pitch,
    pxPerMm: halfBoard.pitch / 2.54,
    physicalWidthMm: halfBoard.physicalWidthMm,
    physicalHeightMm: halfBoard.physicalHeightMm,
    terminalRows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    columns: 30,
    railNames: ['TN', 'TP', 'BP', 'BN'],
    railLength: 25,
});

export const breadboardHoles = Object.freeze(halfBoard.holes.map(hole => Object.freeze({
    name: hole.id,
    x: hole.x,
    y: hole.y,
    group: hole.groupId,
    kind: hole.zone,
    polarity: hole.zone === 'rail' ? (hole.polarity === 'power' ? 'positive' : 'negative') : undefined,
    connectorType: hole.connectorType,
    signals: Object.freeze(hole.zone === 'rail'
        ? [{ signal: hole.polarity === 'power' ? 'VCC' : 'GND' }]
        : [{ signal: 'SIGNAL' }]),
})));

const HOLE_BY_NAME = new Map(breadboardHoles.map(hole => [hole.name, hole]));

export function getBreadboardHole(name) {
    return HOLE_BY_NAME.get(name) || null;
}

export function getBreadboardGroup(name) {
    return getBreadboardHole(name)?.group || null;
}

export function areBreadboardHolesConnected(a, b) {
    const group = getBreadboardGroup(a);
    return Boolean(group && group === getBreadboardGroup(b));
}

export function inferJumperType(fromConnector = 'male', toConnector = 'male') {
    const endFor = connector => connector === 'female' ? 'male' : 'female';
    return `${endFor(fromConnector)}-${endFor(toConnector)}`;
}

export function occupiedBreadboardHoles(wires, breadboardId, placements = []) {
    const occupied = new Map();
    for (const wire of wires) {
        for (const end of [wire.from, wire.to]) {
            if (end.instanceId === breadboardId && HOLE_BY_NAME.has(end.pinName)) {
                if (!occupied.has(end.pinName)) occupied.set(end.pinName, []);
                occupied.get(end.pinName).push(wire.id);
            }
        }
    }
    for (const placement of placements) {
        for (const hole of Object.values(placement.holes || {})) {
            if (!occupied.has(hole)) occupied.set(hole, []);
            occupied.get(hole).push(placement.instanceId);
        }
    }
    return occupied;
}

export function findBreadboardCapacity(occupied = new Map(), requiredTerminalHoles = 0, requiredRailHoles = 0) {
    const freeTerminals = breadboardHoles.filter(h => h.kind === 'terminal' && !occupied.has(h.name)).length;
    const freeRails = breadboardHoles.filter(h => h.kind === 'rail' && !occupied.has(h.name)).length;
    return {
        fits: freeTerminals >= requiredTerminalHoles && freeRails >= requiredRailHoles,
        freeTerminals,
        freeRails,
        requiredTerminalHoles,
        requiredRailHoles,
    };
}

export function decideBreadboard(componentDefs, hasBreadboard = false) {
    const mountable = componentDefs.filter(def => def?.breadboard?.mountable);
    const powered = componentDefs.filter(def => def?.autoWire && Object.values(def.autoWire).some(type => type === 'VCC' || type === 'GND'));
    const required = mountable.some(def => def.breadboard.required);
    const useful = required || mountable.length >= 2 || powered.length >= 3;
    return {
        status: required ? 'required' : useful ? 'useful' : 'unnecessary',
        shouldAdd: !hasBreadboard && (required || useful),
        mountable,
        terminalHoles: mountable.reduce((sum, def) => sum + Object.keys(def.pinMeta || {}).length, 0),
        railHoles: powered.length * 2 + (powered.length ? 2 : 0),
    };
}

export function buildElectricalNets(instances, wires) {
    const parent = new Map();
    const find = key => {
        if (!parent.has(key)) parent.set(key, key);
        if (parent.get(key) !== key) parent.set(key, find(parent.get(key)));
        return parent.get(key);
    };
    const union = (a, b) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(rb, ra);
    };
    for (const wire of wires) union(`${wire.from.instanceId}:${wire.from.pinName}`, `${wire.to.instanceId}:${wire.to.pinName}`);
    for (const inst of instances.filter(item => item.componentId === 'breadboard-half')) {
        const byGroup = new Map();
        for (const hole of breadboardHoles) {
            const key = `${inst.id}:${hole.name}`;
            if (byGroup.has(hole.group)) union(key, byGroup.get(hole.group));
            else byGroup.set(hole.group, key);
        }
    }
    const nets = new Map();
    for (const key of parent.keys()) {
        const root = find(key);
        if (!nets.has(root)) nets.set(root, []);
        nets.get(root).push(key);
    }
    return [...nets.values()];
}
