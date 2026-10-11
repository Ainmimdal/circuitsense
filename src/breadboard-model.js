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
