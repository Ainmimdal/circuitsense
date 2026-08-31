import { getComponentDef } from '../component-library.js';
import { applyTransform, normalizeDegrees } from './geometry.js';
import { componentWorldTransform, resolveConnectionWorldPoint } from './model.js';
import { getFootprintDefinition, projectFootprintPoint } from './footprints.js';

const COMPONENT_MARGIN = 3;
const CORRIDOR_GAP = 2.54;
const WIRE_SEPARATION = 1.8;
const TURN_PENALTY = 8;
const CROSSING_PENALTY = 12;
const PARALLEL_LANE_PENALTY = 18;
const PARALLEL_LENGTH_PENALTY = 0.6;
const MAX_GRAPH_NODES = 2600;

const DEFAULT_WEIGHTS = Object.freeze({
    length: 1, bend: TURN_PENALTY, crossing: CROSSING_PENALTY, obstacle: 100000,
    crowding: PARALLEL_LANE_PENALTY, awkwardFanout: 8,
});
const NET_ORDER = Object.freeze({ signal: 0, i2c: 1, power: 2, ground: 3 });

function cleanPoints(points) {
    const result = [];
    for (const point of points.filter(Boolean)) {
        const normalized = { x: Number(point.x), y: Number(point.y) };
        const last = result.at(-1);
        if (!last || Math.hypot(last.x - normalized.x, last.y - normalized.y) > 1e-6) result.push(normalized);
    }
    for (let index = result.length - 2; index > 0; index--) {
        const before = result[index - 1], current = result[index], after = result[index + 1];
        const verticalForward = Math.abs(before.x - current.x) < 1e-6 && Math.abs(current.x - after.x) < 1e-6 &&
            (current.y - before.y) * (after.y - current.y) >= 0;
        const horizontalForward = Math.abs(before.y - current.y) < 1e-6 && Math.abs(current.y - after.y) < 1e-6 &&
            (current.x - before.x) * (after.x - current.x) >= 0;
        if (verticalForward || horizontalForward) result.splice(index, 1);
    }
    return result;
}

function cleanAutomaticPoints(points) {
    const result = cleanPoints(points);
    let changed = true;
    while (changed) {
        changed = false;
        for (let index = result.length - 2; index > 0; index--) {
            const before = result[index - 1], current = result[index], after = result[index + 1];
            const collinearVertical = Math.abs(before.x - current.x) < 1e-6 &&
                Math.abs(current.x - after.x) < 1e-6;
            const collinearHorizontal = Math.abs(before.y - current.y) < 1e-6 &&
                Math.abs(current.y - after.y) < 1e-6;
            if (!collinearVertical && !collinearHorizontal) continue;
            result.splice(index, 1);
            changed = true;
        }
        for (let index = result.length - 1; index > 0; index--) {
            if (Math.hypot(result[index].x - result[index - 1].x, result[index].y - result[index - 1].y) < 1e-6) {
                result.splice(index, 1);
                changed = true;
            }
        }
    }
    return result;
}

export function routeSegments(points) {
    return points.slice(0, -1).map((point, index) => ({ a: point, b: points[index + 1] }));
}

function segmentLength(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function routeLength(points) {
    return routeSegments(points).reduce((total, segment) => total + segmentLength(segment.a, segment.b), 0);
}

function segmentDirection(a, b) {
    if (Math.abs(a.x - b.x) < 1e-6) return 'v';
    if (Math.abs(a.y - b.y) < 1e-6) return 'h';
    return 'x';
}

function rangeOverlap(a1, a2, b1, b2) {
    return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) -
        Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function rectIntersectsSegment(rect, segment) {
    const { a, b } = segment;
    if (Math.abs(a.y - b.y) < 1e-6) {
        return a.y > rect.top && a.y < rect.bottom &&
            Math.max(a.x, b.x) > rect.left && Math.min(a.x, b.x) < rect.right;
    }
    if (Math.abs(a.x - b.x) < 1e-6) {
        return a.x > rect.left && a.x < rect.right &&
            Math.max(a.y, b.y) > rect.top && Math.min(a.y, b.y) < rect.bottom;
    }
    return true;
}

function segmentClear(a, b, obstacles) {
    return segmentDirection(a, b) !== 'x' && !obstacles.some(rect => rectIntersectsSegment(rect, { a, b }));
}

function segmentCrosses(a, b) {
    const aHorizontal = segmentDirection(a.a, a.b) === 'h';
    const bHorizontal = segmentDirection(b.a, b.b) === 'h';
    if (aHorizontal === bHorizontal) return false;
    const horizontal = aHorizontal ? a : b;
    const vertical = aHorizontal ? b : a;
    return vertical.a.x > Math.min(horizontal.a.x, horizontal.b.x) &&
        vertical.a.x < Math.max(horizontal.a.x, horizontal.b.x) &&
        horizontal.a.y > Math.min(vertical.a.y, vertical.b.y) &&
        horizontal.a.y < Math.max(vertical.a.y, vertical.b.y);
}

function parallelOverlap(a, b, clearance = WIRE_SEPARATION) {
    const aDirection = segmentDirection(a.a, a.b), bDirection = segmentDirection(b.a, b.b);
    if (aDirection !== bDirection || !['h', 'v'].includes(aDirection)) return 0;
    if (aDirection === 'h') {
        const overlap = rangeOverlap(a.a.x, a.b.x, b.a.x, b.b.x);
        return overlap > 0 && Math.abs(a.a.y - b.a.y) < clearance ? overlap : 0;
    }
    const overlap = rangeOverlap(a.a.y, a.b.y, b.a.y, b.b.y);
    return overlap > 0 && Math.abs(a.a.x - b.a.x) < clearance ? overlap : 0;
}

export function componentRoutingObstacles(project, { excludeComponentIds = [], margin = COMPONENT_MARGIN } = {}) {
    const excluded = new Set(excludeComponentIds), obstacles = [];
    for (const component of project.components || []) {
        if (excluded.has(component.id)) continue;
        const bounds = getFootprintDefinition(component.footprintId)?.routingBounds;
        if (!bounds) continue;
        const transform = componentWorldTransform(project, component);
        const corners = [
            applyTransform({ x: bounds.x, y: bounds.y }, transform),
            applyTransform({ x: bounds.x + bounds.width, y: bounds.y }, transform),
            applyTransform({ x: bounds.x, y: bounds.y + bounds.height }, transform),
            applyTransform({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, transform),
        ];
        obstacles.push({ id: component.id,
            left: Math.min(...corners.map(point => point.x)) - margin,
            right: Math.max(...corners.map(point => point.x)) + margin,
            top: Math.min(...corners.map(point => point.y)) - margin,
            bottom: Math.max(...corners.map(point => point.y)) + margin });
    }
    return obstacles;
}

export function scoreRoute(points, { obstacles = [], existingRoutes = [], weights = DEFAULT_WEIGHTS } = {}) {
    const segments = routeSegments(points);
    let length = 0, obstacleHits = 0, crossings = 0, crowding = 0;
    for (const segment of segments) {
        length += segmentLength(segment.a, segment.b);
        obstacleHits += obstacles.filter(rect => rectIntersectsSegment(rect, segment)).length;
        for (const route of existingRoutes) for (const other of routeSegments(route)) {
            crossings += segmentCrosses(segment, other) ? 1 : 0;
            crowding += parallelOverlap(segment, other) > 0 ? 1 : 0;
        }
    }
    const bends = Math.max(0, points.length - 2), first = segments[0], last = segments.at(-1);
    const awkwardFanout = Number(first && segmentLength(first.a, first.b) < 1.2) +
        Number(last && segmentLength(last.a, last.b) < 1.2);
    const score = length * weights.length + bends * weights.bend + crossings * weights.crossing +
        obstacleHits * weights.obstacle + crowding * weights.crowding + awkwardFanout * weights.awkwardFanout;
    return { score, length, bends, crossings, obstacleHits, crowding, awkwardFanout };
}

function rotateDirection(direction, rotation) {
    const directions = ['up', 'right', 'down', 'left'], start = directions.indexOf(direction);
    return start < 0 ? direction : directions[(start + Math.round(normalizeDegrees(rotation) / 90)) % 4];
}

export function pinExitDirection(project, ref) {
    if (ref?.type !== 'component-pin') return null;
    const component = project.components.find(item => item.id === ref.componentId);
    const footprint = getFootprintDefinition(component?.footprintId);
    const pin = footprint?.pins.find(item => item.pinId === ref.pinId);
    if (!component || !footprint || !pin) return null;
    const transform = componentWorldTransform(project, component);
    const definition = getComponentDef(component.definitionId);
    const override = definition?.pinExitOverride?.[ref.pinId];
    const bounds = footprint.routingBounds;
    if (!bounds) return rotateDirection(override || 'up', transform.rotation);
    const projectedPin = projectFootprintPoint(footprint, pin);
    const distances = [
        ['left', Math.abs(projectedPin.x - bounds.x)], ['right', Math.abs(bounds.x + bounds.width - projectedPin.x)],
        ['up', Math.abs(projectedPin.y - bounds.y)], ['down', Math.abs(bounds.y + bounds.height - projectedPin.y)],
    ].sort((a, b) => a[1] - b[1]);
    if (!definition?.isControllerBoard && override) return rotateDirection(override, transform.rotation);
    return rotateDirection(distances[0][0], transform.rotation);
}

function endpointLaneOffset(project, wire, ref) {
    if (ref?.type !== 'component-pin') return 0;
    const direction = pinExitDirection(project, ref);
    const peers = [];
    for (const candidate of project.wires || []) {
        for (const endpoint of [candidate.from, candidate.to]) {
            if (endpoint?.type !== 'component-pin' || endpoint.componentId !== ref.componentId) continue;
            if (pinExitDirection(project, endpoint) !== direction) continue;
            const point = resolveConnectionWorldPoint(project, endpoint);
            peers.push({ wireId: candidate.id, pinId: endpoint.pinId, point });
        }
    }
    peers.sort((a, b) => {
        const alongHeader = ['up', 'down'].includes(direction)
            ? (a.point?.x || 0) - (b.point?.x || 0)
            : (a.point?.y || 0) - (b.point?.y || 0);
        return alongHeader || String(a.pinId).localeCompare(String(b.pinId)) || String(a.wireId).localeCompare(String(b.wireId));
    });
    const index = peers.findIndex(item => item.wireId === wire.id && item.pinId === ref.pinId);
    return Math.max(0, index) * WIRE_SEPARATION;
}

function escapeFor(project, wire, ref, point, obstacle) {
    if (!obstacle || ref?.type !== 'component-pin') return point;
    const direction = pinExitDirection(project, ref);
    const lane = endpointLaneOffset(project, wire, ref);
    if (direction === 'up') return { x: point.x, y: obstacle.top - 0.01 - lane };
    if (direction === 'down') return { x: point.x, y: obstacle.bottom + 0.01 + lane };
    if (direction === 'left') return { x: obstacle.left - 0.01 - lane, y: point.y };
    return { x: obstacle.right + 0.01 + lane, y: point.y };
}

function classifyWire(wire) {
    const text = `${wire.from?.pinId || wire.from?.holeId || ''} ${wire.to?.pinId || wire.to?.holeId || ''}`.toUpperCase();
    if (/(GND|VSS|DGND|AGND)/.test(text)) return NET_ORDER.ground;
    if (/(VCC|VDD|VIN|5V|3\.3V|V\+|PWR|POWER)/.test(text)) return NET_ORDER.power;
    if (/(SDA|SCL|A4|A5)/.test(text)) return NET_ORDER.i2c;
    return NET_ORDER.signal;
}

function routeContext(project, wire) {
    const from = resolveConnectionWorldPoint(project, wire.from), to = resolveConnectionWorldPoint(project, wire.to);
    if (!from || !to) return null;
    const obstacles = componentRoutingObstacles(project);
    const fromObstacle = wire.from?.type === 'component-pin' ? obstacles.find(item => item.id === wire.from.componentId) : null;
    const toObstacle = wire.to?.type === 'component-pin' ? obstacles.find(item => item.id === wire.to.componentId) : null;
    return { wire, from, to, obstacles,
        escape1: escapeFor(project, wire, wire.from, from, fromObstacle),
        escape2: escapeFor(project, wire, wire.to, to, toObstacle), netType: classifyWire(wire) };
}

function pathClear(points, obstacles) {
    return routeSegments(points).every(segment => segmentClear(segment.a, segment.b, obstacles));
}

function pathCost(points, usedRoutes) {
    let cost = Math.max(0, points.length - 2) * TURN_PENALTY;
    for (const segment of routeSegments(points)) {
        cost += segmentLength(segment.a, segment.b);
        for (const route of usedRoutes) for (const used of routeSegments(route)) {
            const overlap = parallelOverlap(segment, used);
            if (overlap > 0) cost += PARALLEL_LANE_PENALTY + overlap * PARALLEL_LENGTH_PENALTY;
            if (segmentCrosses(segment, used)) cost += CROSSING_PENALTY;
        }
    }
    return cost;
}

function addRounded(set, value) {
    if (Number.isFinite(value)) set.add(Math.round(value * 100) / 100);
}

function gridValues(context, usedRoutes) {
    const xs = new Set([context.escape1.x, context.escape2.x]);
    const ys = new Set([context.escape1.y, context.escape2.y]);
    for (const obstacle of context.obstacles) {
        addRounded(xs, obstacle.left - CORRIDOR_GAP); addRounded(xs, obstacle.right + CORRIDOR_GAP);
        addRounded(ys, obstacle.top - CORRIDOR_GAP); addRounded(ys, obstacle.bottom + CORRIDOR_GAP);
    }
    for (const route of usedRoutes) for (const segment of routeSegments(route)) {
        if (segmentDirection(segment.a, segment.b) === 'h') {
            addRounded(ys, segment.a.y - WIRE_SEPARATION); addRounded(ys, segment.a.y + WIRE_SEPARATION);
        } else {
            addRounded(xs, segment.a.x - WIRE_SEPARATION); addRounded(xs, segment.a.x + WIRE_SEPARATION);
        }
    }
    return { xs: [...xs].sort((a, b) => a - b), ys: [...ys].sort((a, b) => a - b) };
}

function pointKey(point) { return `${point.x},${point.y}`; }
function stateKey(point, direction) { return `${pointKey(point)}|${direction}`; }

function reconstruct(cameFrom, endState, nodes) {
    const points = [];
    let state = endState;
    while (state) {
        points.push(nodes.get(state.slice(0, state.lastIndexOf('|'))));
        state = cameFrom.get(state);
    }
    return cleanPoints(points.reverse());
}

function fallbackPath(context, usedRoutes) {
    const { escape1: from, escape2: to, obstacles } = context;
    const candidates = [cleanPoints([from, { x: to.x, y: from.y }, to]), cleanPoints([from, { x: from.x, y: to.y }, to])];
    for (const obstacle of obstacles) {
        candidates.push(cleanPoints([from, { x: obstacle.left - CORRIDOR_GAP, y: from.y },
            { x: obstacle.left - CORRIDOR_GAP, y: to.y }, to]));
        candidates.push(cleanPoints([from, { x: from.x, y: obstacle.top - CORRIDOR_GAP },
            { x: to.x, y: obstacle.top - CORRIDOR_GAP }, to]));
    }
    const valid = candidates.filter(points => pathClear(points, obstacles));
    const score = points => pathCost(points, usedRoutes) + routeSegments(points)
        .reduce((total, segment) => total + obstacles.filter(rect => rectIntersectsSegment(rect, segment)).length * 100000, 0);
    return (valid.length ? valid : candidates).sort((a, b) => score(a) - score(b))[0];
}

function findOrthogonalPath(context, usedRoutes) {
    const { xs, ys } = gridValues(context, usedRoutes);
    if (xs.length * ys.length > MAX_GRAPH_NODES) return fallbackPath(context, usedRoutes);
    const nodes = new Map();
    for (const x of xs) for (const y of ys) nodes.set(pointKey({ x, y }), { x, y });
    const start = context.escape1, end = context.escape2;
    const startState = stateKey(start, 'n'), open = new Set([startState]), cameFrom = new Map();
    const gScore = new Map([[startState, 0]]), fScore = new Map([[startState, segmentLength(start, end)]]);
    while (open.size) {
        let currentState = null;
        for (const state of open) if (currentState === null || fScore.get(state) < fScore.get(currentState)) currentState = state;
        const split = currentState.lastIndexOf('|'), current = nodes.get(currentState.slice(0, split));
        const currentDirection = currentState.slice(split + 1);
        if (pointKey(current) === pointKey(end)) return reconstruct(cameFrom, currentState, nodes);
        open.delete(currentState);
        const neighbors = [...xs.filter(x => x !== current.x).map(x => ({ x, y: current.y })),
            ...ys.filter(y => y !== current.y).map(y => ({ x: current.x, y }))];
        for (const next of neighbors) {
            if (!segmentClear(current, next, context.obstacles)) continue;
            const direction = segmentDirection(current, next);
            const bend = currentDirection !== 'n' && currentDirection !== direction ? TURN_PENALTY : 0;
            const nextState = stateKey(next, direction);
            const tentative = (gScore.get(currentState) ?? Infinity) + pathCost([current, next], usedRoutes) + bend;
            if (tentative >= (gScore.get(nextState) ?? Infinity)) continue;
            cameFrom.set(nextState, currentState); gScore.set(nextState, tentative);
            fScore.set(nextState, tentative + segmentLength(next, end)); open.add(nextState);
        }
    }
    return fallbackPath(context, usedRoutes);
}

function routedContext(context, usedRoutes) {
    if (context.wire.route?.mode === 'manual') return cleanPoints([context.from, ...(context.wire.route.waypoints || []), context.to]);
    const shortest = findOrthogonalPath(context, []);
    const spaced = usedRoutes.length ? findOrthogonalPath(context, usedRoutes) : shortest;
    const allowedSeparationDetour = Math.max(WIRE_SEPARATION * 4 + TURN_PENALTY, routeLength(shortest) * 0.18);
    const middle = routeLength(spaced) <= routeLength(shortest) + allowedSeparationDetour ? spaced : shortest;
    return cleanAutomaticPoints([context.from, context.escape1, ...middle.slice(1, -1), context.escape2, context.to]);
}

export function routeWire(project, wire, { existingRoutes = [] } = {}) {
    const context = routeContext(project, wire);
    return context ? routedContext(context, existingRoutes) : null;
}

export function routeAllWires(project) {
    const routes = new Map(), usedRoutes = [];
    const contexts = (project.wires || []).map((wire, index) => ({ context: routeContext(project, wire), index }))
        .filter(item => item.context)
        .sort((a, b) => a.context.netType - b.context.netType ||
            Math.min(a.context.from.x, a.context.to.x) - Math.min(b.context.from.x, b.context.to.x) ||
            Math.min(a.context.from.y, a.context.to.y) - Math.min(b.context.from.y, b.context.to.y) || a.index - b.index);
    for (const { context } of contexts) {
        const points = routedContext(context, usedRoutes);
        routes.set(context.wire.id, points); usedRoutes.push(points);
    }
    return routes;
}
