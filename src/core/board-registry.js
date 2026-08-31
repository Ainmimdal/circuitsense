export const BREADBOARD_PITCH = 10;

const TERMINAL_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const TERMINAL_Y = { A: 60, B: 70, C: 80, D: 90, E: 100, F: 120, G: 130, H: 140, I: 150, J: 160 };
const RAIL_Y = { TN: 20, TP: 30, BP: 190, BN: 200 };

function createBoard({ id, name, width, columns, terminalStartX, railColumns, splitRails }) {
    const terminals = TERMINAL_ROWS.flatMap(row => Array.from({ length: columns }, (_, index) => {
        const column = index + 1;
        return {
            id: `${row}${column}`,
            x: terminalStartX + index * BREADBOARD_PITCH,
            y: TERMINAL_Y[row],
            zone: 'terminal',
            bank: row <= 'E' ? 'upper' : 'lower',
            groupId: `${row <= 'E' ? 'upper' : 'lower'}-${column}`,
            connectorType: 'female',
        };
    }));

    const rails = Object.keys(RAIL_Y).flatMap(rail => railColumns.map((column, index) => {
        const segment = splitRails && index >= railColumns.length / 2 ? 'right' : 'left';
        return {
            id: `${rail}${index + 1}`,
            x: terminalStartX + (column - 1) * BREADBOARD_PITCH,
            y: RAIL_Y[rail],
            zone: 'rail',
            polarity: rail.endsWith('P') ? 'power' : 'ground',
            groupId: splitRails ? `rail-${rail}-${segment}` : `rail-${rail}`,
            connectorType: 'female',
        };
    }));

    const holes = [...terminals, ...rails];
    const holeById = new Map(holes.map(hole => [hole.id, hole]));
    const holeByPoint = new Map(holes.map(hole => [`${hole.x},${hole.y}`, hole]));
    return Object.freeze({
        id,
        name,
        width,
        height: 214,
        pitch: BREADBOARD_PITCH,
        physicalWidthMm: width / (BREADBOARD_PITCH / 2.54),
        physicalHeightMm: 214 / (BREADBOARD_PITCH / 2.54),
        columns,
        holes: Object.freeze(holes),
        getHole: holeId => holeById.get(holeId) || null,
        getHoleAt: (x, y) => holeByPoint.get(`${x},${y}`) || null,
    });
}

const halfRailColumns = Array.from({ length: 25 }, (_, index) => index + 3);
const fullRailColumns = [
    ...Array.from({ length: 25 }, (_, index) => index + 1),
    ...Array.from({ length: 25 }, (_, index) => index + 39),
];

export const boardRegistry = Object.freeze({
    'breadboard-half-400': createBoard({
        id: 'breadboard-half-400',
        name: 'Half-size 400-point breadboard',
        width: 330,
        columns: 30,
        terminalStartX: 20,
        railColumns: halfRailColumns,
        splitRails: false,
    }),
    'breadboard-full-830': createBoard({
        id: 'breadboard-full-830',
        name: 'Full-size 830-point breadboard',
        width: 650,
        columns: 63,
        terminalStartX: 15,
        railColumns: fullRailColumns,
        splitRails: true,
    }),
});

export function getBoardDefinition(typeId) {
    if (typeId === 'breadboard-half') return boardRegistry['breadboard-half-400'];
    if (typeId === 'breadboard-full') return boardRegistry['breadboard-full-830'];
    return boardRegistry[typeId] || null;
}

export function boardTypeForComponentId(componentId) {
    if (componentId === 'breadboard-half') return 'breadboard-half-400';
    if (componentId === 'breadboard-full') return 'breadboard-full-830';
    return null;
}
