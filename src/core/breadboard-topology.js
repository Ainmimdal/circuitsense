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

/**
 * Real power rails are not one continuous run of sockets: holes come in
 * clusters of five with a one-pitch gap between clusters. `railSlots` lists the
 * pitch slot (relative to the first terminal column) of every rail hole, so a
 * board can model half-pitch-offset rails (400-point) or split rails (830-point).
 */
function railSlotsFor({ clusters, offset, splitAfterCluster = null, splitGap = 0 }) {
    const slots = [];
    let slot = offset;
    for (let cluster = 0; cluster < clusters; cluster++) {
        if (cluster > 0) slot += 1 + (cluster === splitAfterCluster ? splitGap : 0);
        for (let hole = 0; hole < 5; hole++) slots.push({ slot: slot++, cluster });
    }
    return slots;
}

function createDefinition({ id, name, width, columns, terminalStartX, railSlots, splitAfterCluster = null }) {
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
            row,
            column,
            electricalGroup: `${bank}-strip-${column}`,
            canOccupy: true,
        });
    }));
    const splitRails = splitAfterCluster !== null;
    const rails = RAILS.flatMap(rail => railSlots.map(({ slot, cluster }, index) => {
        const segment = splitRails && cluster >= splitAfterCluster ? 'right' : 'left';
        return Object.freeze({
            id: `${rail.prefix}${index + 1}`,
            gx: slot,
            gy: rail.gridY,
            x: terminalStartX + slot * BREADBOARD_PITCH_MM,
            y: terminalStartY + rail.gridY * BREADBOARD_PITCH_MM,
            zone: 'rail',
            bank: 'rail',
            rail: rail.prefix,
            polarity: rail.polarity,
            cluster,
            segment,
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
    const railBuses = Object.freeze(RAILS.flatMap(rail => {
        const segments = new Map();
        for (const hole of rails.filter(item => item.rail === rail.prefix)) {
            const current = segments.get(hole.electricalGroup);
            if (!current) segments.set(hole.electricalGroup, { minX: hole.x, maxX: hole.x });
            else current.maxX = Math.max(current.maxX, hole.x);
        }
        return [...segments].map(([electricalGroup, extent]) => Object.freeze({
            rail: rail.prefix,
            polarity: rail.polarity,
            side: rail.gridY < 0 ? 'top' : 'bottom',
            electricalGroup,
            y: terminalStartY + rail.gridY * BREADBOARD_PITCH_MM,
            x1: extent.minX,
            x2: extent.maxX,
        }));
    }));
    return Object.freeze({
        id,
        name,
        pitch: BREADBOARD_PITCH_MM,
        width,
        height: 56.896,
        columns,
        rows: TERMINAL_ROWS,
        splitRails,
        holes,
        railBuses,
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
    // 5 clusters of 5 span 29 of the 30 columns. Rail holes stay on the
    // terminal column grid so supply jumpers drop straight into a strip.
    railSlots: railSlotsFor({ clusters: 5, offset: 0 }),
});

export const FULL_BREADBOARD_DEFINITION = createDefinition({
    id: 'full-breadboard-830',
    name: 'Full-size 830-point breadboard',
    width: 165.1,
    columns: 63,
    terminalStartX: 3.81,
    // Two independent halves of 5 clusters each, separated by a wider gap in
    // the middle where the printed rail lines break.
    railSlots: railSlotsFor({ clusters: 10, offset: 1, splitAfterCluster: 5, splitGap: 2 }),
    splitAfterCluster: 5,
});

const DEFINITIONS = Object.freeze([HALF_BREADBOARD_DEFINITION, FULL_BREADBOARD_DEFINITION]);

export function getBreadboardDefinition(definitionId) {
    return DEFINITIONS.find(definition => definition.id === definitionId) || null;
}

export function listBreadboardDefinitions() {
    return [...DEFINITIONS];
}
