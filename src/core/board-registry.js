import {
    FULL_BREADBOARD_DEFINITION,
    HALF_BREADBOARD_DEFINITION,
} from './breadboard-topology.js';
import { BREADBOARD_PITCH_MM } from './units.js';

// Compatibility projection for the original pixel-based canvas and planners.
// Electrical topology and physical spacing are owned by breadboard-topology.
export const BREADBOARD_PITCH = 10;
const PIXELS_PER_MM = BREADBOARD_PITCH / BREADBOARD_PITCH_MM;

// The legacy schema-v2 planner was tuned for contiguous rail runs that line up
// with terminal columns. The live engine now models clustered rails, so this
// adapter keeps the old rail columns to leave the legacy planner unchanged.
const LEGACY_RAIL_COLUMN = Object.freeze({
    [HALF_BREADBOARD_DEFINITION.id]: index => index + 2,
    [FULL_BREADBOARD_DEFINITION.id]: index => (index < 25 ? index : index + 13),
});

function legacyHoleX(definition, hole) {
    if (hole.zone !== 'rail') return hole.x;
    const firstColumnX = definition.getHole('A1').x;
    const railIndex = Number(hole.id.slice(2)) - 1;
    return firstColumnX + LEGACY_RAIL_COLUMN[definition.id](railIndex) * BREADBOARD_PITCH_MM;
}

function createLegacyBoard(definition, id) {
    const holes = definition.holes.map(hole => Object.freeze({
        id: hole.id,
        x: legacyHoleX(definition, hole) * PIXELS_PER_MM,
        y: hole.y * PIXELS_PER_MM,
        zone: hole.zone,
        bank: hole.bank,
        polarity: hole.polarity,
        groupId: hole.electricalGroup,
        connectorType: 'female',
    }));
    const holeById = new Map(holes.map(hole => [hole.id, hole]));
    const holeByPoint = new Map(holes.map(hole => [`${hole.x},${hole.y}`, hole]));

    return Object.freeze({
        id,
        canonicalDefinitionId: definition.id,
        name: definition.name,
        width: definition.width * PIXELS_PER_MM,
        // This remains a presentation bound for the existing SVG adapter.
        height: 214,
        pitch: BREADBOARD_PITCH,
        physicalWidthMm: definition.width,
        physicalHeightMm: definition.height,
        columns: definition.columns,
        holes: Object.freeze(holes),
        getHole: holeId => holeById.get(String(holeId)) || null,
        getHoleAt: (x, y) => holeByPoint.get(`${x},${y}`) || null,
    });
}

export const boardRegistry = Object.freeze({
    'breadboard-half-400': createLegacyBoard(HALF_BREADBOARD_DEFINITION, 'breadboard-half-400'),
    'breadboard-full-830': createLegacyBoard(FULL_BREADBOARD_DEFINITION, 'breadboard-full-830'),
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
