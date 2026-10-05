// Renderer-independent artwork for a breadboard definition. Everything here is
// in board-local millimetres and is derived from the hole topology, so the
// printed markings always agree with the modelled electrical groups.

const RAIL_LINE_OFFSET = 1.65;
const RAIL_LINE_OVERHANG = 1.3;

export const BREADBOARD_COLORS = Object.freeze({
    body: '#f6f4ee',
    bodyEdge: '#d3cfc4',
    seam: '#e2ded3',
    channel: '#e4e0d6',
    channelShade: '#cfc9bb',
    hole: '#34322e',
    holeRim: '#c3beb1',
    label: '#6b675e',
    power: '#d62828',
    ground: '#1f4fbf',
});

function columnLabels(columns) {
    const labels = [1];
    for (let column = 5; column <= columns; column += 5) labels.push(column);
    if (labels.at(-1) !== columns) labels.push(columns);
    return labels;
}

/**
 * Describe the printed face of a breadboard: rail stripes beside (never
 * through) the rail holes, one stripe per electrically continuous rail
 * segment, the centre channel, the detachable rail seams, and row/column
 * labels on both sides.
 */
export function breadboardArtwork(definition) {
    const hole = id => definition.getHole(id);
    const firstColumn = hole('A1');
    const lastColumn = hole(`A${definition.columns}`);
    const rowE = hole('E1').y;
    const rowF = hole('F1').y;
    const rowA = firstColumn.y;
    const rowJ = hole('J1').y;
    const topInner = Math.max(...definition.railBuses.filter(bus => bus.side === 'top').map(bus => bus.y));
    const bottomInner = Math.min(...definition.railBuses.filter(bus => bus.side === 'bottom').map(bus => bus.y));
    const topOuter = Math.min(...definition.railBuses.filter(bus => bus.side === 'top').map(bus => bus.y));
    const bottomOuter = Math.max(...definition.railBuses.filter(bus => bus.side === 'bottom').map(bus => bus.y));

    const railStripes = definition.railBuses.map(bus => {
        const outer = bus.side === 'top' ? bus.y === topOuter : bus.y === bottomOuter;
        const awayFromCentre = bus.side === 'top' ? -1 : 1;
        const direction = outer ? awayFromCentre : -awayFromCentre;
        return Object.freeze({
            rail: bus.rail,
            polarity: bus.polarity,
            electricalGroup: bus.electricalGroup,
            color: bus.polarity === 'power' ? BREADBOARD_COLORS.power : BREADBOARD_COLORS.ground,
            y: bus.y + direction * RAIL_LINE_OFFSET,
            x1: bus.x1 - RAIL_LINE_OVERHANG,
            x2: bus.x2 + RAIL_LINE_OVERHANG,
        });
    });

    const leftLabelX = firstColumn.x - Math.min(2.6, firstColumn.x - 1.2);
    const rightLabelX = lastColumn.x + Math.min(2.6, definition.width - lastColumn.x - 1.2);
    const railSigns = [];
    for (const rail of new Set(definition.railBuses.map(bus => bus.rail))) {
        const buses = definition.railBuses.filter(bus => bus.rail === rail);
        const text = buses[0].polarity === 'power' ? '+' : '−';
        const color = buses[0].polarity === 'power' ? BREADBOARD_COLORS.power : BREADBOARD_COLORS.ground;
        railSigns.push(
            Object.freeze({ text, color, x: leftLabelX, y: buses[0].y }),
            Object.freeze({ text, color, x: rightLabelX, y: buses[0].y }),
        );
    }

    const rowLabels = definition.rows.flatMap(row => [
        Object.freeze({ text: row, x: leftLabelX, y: hole(`${row}1`).y }),
        Object.freeze({ text: row, x: rightLabelX, y: hole(`${row}1`).y }),
    ]);
    const columnNumberLabels = columnLabels(definition.columns).flatMap(column => [
        Object.freeze({ text: String(column), x: hole(`A${column}`).x, y: rowA - 2.7 }),
        Object.freeze({ text: String(column), x: hole(`J${column}`).x, y: rowJ + 2.7 }),
    ]);

    return Object.freeze({
        width: definition.width,
        height: definition.height,
        cornerRadius: 1.6,
        channel: Object.freeze({ y1: rowE + 2.1, y2: rowF - 2.1 }),
        seams: Object.freeze([(topInner + rowA) / 2, (rowJ + bottomInner) / 2]),
        railStripes: Object.freeze(railStripes),
        labels: Object.freeze([...railSigns, ...rowLabels, ...columnNumberLabels]),
        holeSize: 1.02,
    });
}
