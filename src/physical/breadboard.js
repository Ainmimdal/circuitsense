import { applyTransform, BREADBOARD_PITCH_MM, distance, invertTransform } from './geometry.js';

const TERMINAL_ROWS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
// The E/F centres are three pitches apart: 7.62 mm. That is the physical
// centre-trench spacing required by standard 300-mil DIP packages.
const TERMINAL_GRID_Y = Object.freeze({ A: 0, B: 1, C: 2, D: 3, E: 4, F: 7, G: 8, H: 9, I: 10, J: 11 });
const RAILS = Object.freeze([
    { prefix: 'TN', polarity: 'ground', gridY: -4 },
    { prefix: 'TP', polarity: 'power', gridY: -3 },
    { prefix: 'BP', polarity: 'power', gridY: 14 },
    { prefix: 'BN', polarity: 'ground', gridY: 15 },
]);

function freezeHole(hole) {
    return Object.freeze(hole);
}

function makeHalfBoardHoles() {
    const terminalStartX = 5.08;
    const terminalStartY = 15.24;
    const terminals = TERMINAL_ROWS.flatMap(row => Array.from({ length: 30 }, (_, index) => {
        const column = index + 1;
        const bank = row <= 'E' ? 'upper' : 'lower';
        return freezeHole({
            id: `${row}${column}`,
            gx: index,
            gy: TERMINAL_GRID_Y[row],
            x: terminalStartX + index * BREADBOARD_PITCH_MM,
            y: terminalStartY + TERMINAL_GRID_Y[row] * BREADBOARD_PITCH_MM,
            zone: 'terminal',
            bank,
            electricalGroup: `${bank}-strip-${column}`,
            canOccupy: true,
        });
    }));

    const rails = RAILS.flatMap(rail => Array.from({ length: 25 }, (_, index) => freezeHole({
        id: `${rail.prefix}${index + 1}`,
        gx: index + 2,
        gy: rail.gridY,
        x: terminalStartX + (index + 2) * BREADBOARD_PITCH_MM,
        y: terminalStartY + rail.gridY * BREADBOARD_PITCH_MM,
        zone: 'rail',
        bank: 'rail',
        polarity: rail.polarity,
        electricalGroup: `rail-${rail.prefix}`,
        canOccupy: true,
    })));

    return Object.freeze([...terminals, ...rails]);
}

const HALF_BOARD_HOLES = makeHalfBoardHoles();
const HALF_BOARD_BY_ID = new Map(HALF_BOARD_HOLES.map(hole => [hole.id, hole]));
const HALF_BOARD_GROUPS = new Map();
for (const hole of HALF_BOARD_HOLES) {
    if (!HALF_BOARD_GROUPS.has(hole.electricalGroup)) HALF_BOARD_GROUPS.set(hole.electricalGroup, []);
    HALF_BOARD_GROUPS.get(hole.electricalGroup).push(hole.id);
}

export const HALF_BREADBOARD_DEFINITION = Object.freeze({
    id: 'half-breadboard-400',
    name: 'Half-size 400-point breadboard',
    pitch: BREADBOARD_PITCH_MM,
    width: 83.82,
    height: 56.896,
    columns: 30,
    holes: HALF_BOARD_HOLES,
    getHole(holeId) {
        return HALF_BOARD_BY_ID.get(String(holeId)) || null;
    },
    getGroupHoles(groupId) {
        return [...(HALF_BOARD_GROUPS.get(String(groupId)) || [])];
    },
});

function makeFullBoardHoles() {
    const terminalStartX = 3.81;
    const terminalStartY = 15.24;
    const columns = 63;
    const terminals = TERMINAL_ROWS.flatMap(row => Array.from({ length: columns }, (_, index) => {
        const column = index + 1;
        const bank = row <= 'E' ? 'upper' : 'lower';
        return freezeHole({
            id: `${row}${column}`, gx: index, gy: TERMINAL_GRID_Y[row],
            x: terminalStartX + index * BREADBOARD_PITCH_MM,
            y: terminalStartY + TERMINAL_GRID_Y[row] * BREADBOARD_PITCH_MM,
            zone: 'terminal', bank, electricalGroup: `${bank}-strip-${column}`, canOccupy: true,
        });
    }));
    const railIndexes = [...Array.from({ length: 25 }, (_, index) => index), ...Array.from({ length: 25 }, (_, index) => index + 38)];
    const rails = RAILS.flatMap(rail => railIndexes.map((columnIndex, index) => {
        const segment = index < 25 ? 'left' : 'right';
        return freezeHole({
            id: `${rail.prefix}${index + 1}`, gx: columnIndex, gy: rail.gridY,
            x: terminalStartX + columnIndex * BREADBOARD_PITCH_MM,
            y: terminalStartY + rail.gridY * BREADBOARD_PITCH_MM,
            zone: 'rail', bank: 'rail', polarity: rail.polarity,
            electricalGroup: `rail-${rail.prefix}-${segment}`, canOccupy: true,
        });
    }));
    return Object.freeze([...terminals, ...rails]);
}

const FULL_BOARD_HOLES = makeFullBoardHoles();
const FULL_BOARD_BY_ID = new Map(FULL_BOARD_HOLES.map(hole => [hole.id, hole]));
const FULL_BOARD_GROUPS = new Map();
for (const hole of FULL_BOARD_HOLES) {
    if (!FULL_BOARD_GROUPS.has(hole.electricalGroup)) FULL_BOARD_GROUPS.set(hole.electricalGroup, []);
    FULL_BOARD_GROUPS.get(hole.electricalGroup).push(hole.id);
}

export const FULL_BREADBOARD_DEFINITION = Object.freeze({
    id: 'full-breadboard-830', name: 'Full-size 830-point breadboard', pitch: BREADBOARD_PITCH_MM,
    width: 165.1, height: 56.896, columns: 63, holes: FULL_BOARD_HOLES,
    getHole(holeId) { return FULL_BOARD_BY_ID.get(String(holeId)) || null; },
    getGroupHoles(groupId) { return [...(FULL_BOARD_GROUPS.get(String(groupId)) || [])]; },
});

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
    if (surface.definitionId === HALF_BREADBOARD_DEFINITION.id) return HALF_BREADBOARD_DEFINITION;
    if (surface.definitionId === FULL_BREADBOARD_DEFINITION.id) return FULL_BREADBOARD_DEFINITION;
    return null;
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
