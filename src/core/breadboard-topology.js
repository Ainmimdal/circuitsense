import { BREADBOARD_PITCH_MM } from './units.js';

const TERMINAL_ROWS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
export const TERMINAL_GRID_Y = Object.freeze({
    A: 0, B: 1, C: 2, D: 3, E: 4,
    F: 7, G: 8, H: 9, I: 10, J: 11,
});
const RAILS = Object.freeze([
    { prefix: 'TN', polarity: 'ground', gridY: -4 },
    { prefix: 'TP', polarity: 'power', gridY: -3 },
    { prefix: 'BP', polarity: 'power', gridY: 14 },
    { prefix: 'BN', polarity: 'ground', gridY: 15 },
]);

function createDefinition({ id, name, width, columns, terminalStartX, railIndexes, splitRails }) {
    const terminalStartY = 15.24;
    const terminals = TERMINAL_ROWS.flatMap(row => Array.from({ length: columns }, (_, index) => {
        const column = index + 1;
        const bank = row <= 'E' ? 'upper' : 'lower';
        return Object.freeze({
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
    const rails = RAILS.flatMap(rail => railIndexes.map((columnIndex, index) => {
        const segment = splitRails && index >= railIndexes.length / 2 ? 'right' : 'left';
        return Object.freeze({
            id: `${rail.prefix}${index + 1}`,
            gx: columnIndex,
            gy: rail.gridY,
            x: terminalStartX + columnIndex * BREADBOARD_PITCH_MM,
            y: terminalStartY + rail.gridY * BREADBOARD_PITCH_MM,
            zone: 'rail',
            bank: 'rail',
            polarity: rail.polarity,
            electricalGroup: splitRails ? `rail-${rail.prefix}-${segment}` : `rail-${rail.prefix}`,
            canOccupy: true,
        });
    }));
    const holes = Object.freeze([...terminals, ...rails]);
    const holeById = new Map(holes.map(hole => [hole.id, hole]));
    const groupHoles = new Map();
    for (const hole of holes) {
        if (!groupHoles.has(hole.electricalGroup)) groupHoles.set(hole.electricalGroup, []);
        groupHoles.get(hole.electricalGroup).push(hole.id);
    }
    return Object.freeze({
        id,
        name,
        pitch: BREADBOARD_PITCH_MM,
        width,
        height: 56.896,
        columns,
        holes,
        getHole(holeId) { return holeById.get(String(holeId)) || null; },
        getGroupHoles(groupId) { return [...(groupHoles.get(String(groupId)) || [])]; },
    });
}

export const HALF_BREADBOARD_DEFINITION = createDefinition({
    id: 'half-breadboard-400',
    name: 'Half-size 400-point breadboard',
    width: 83.82,
    columns: 30,
    terminalStartX: 5.08,
    railIndexes: Array.from({ length: 25 }, (_, index) => index + 2),
    splitRails: false,
});

export const FULL_BREADBOARD_DEFINITION = createDefinition({
    id: 'full-breadboard-830',
    name: 'Full-size 830-point breadboard',
    width: 165.1,
    columns: 63,
    terminalStartX: 3.81,
    railIndexes: [
        ...Array.from({ length: 25 }, (_, index) => index),
        ...Array.from({ length: 25 }, (_, index) => index + 38),
    ],
    splitRails: true,
});

const DEFINITIONS = Object.freeze([HALF_BREADBOARD_DEFINITION, FULL_BREADBOARD_DEFINITION]);

export function getBreadboardDefinition(definitionId) {
    return DEFINITIONS.find(definition => definition.id === definitionId) || null;
}

export function listBreadboardDefinitions() {
    return [...DEFINITIONS];
}
