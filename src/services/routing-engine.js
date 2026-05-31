/**
 * Compact obstacle-aware wire router.
 *
 * The priority order is deliberately simple:
 * 1. Leave source/destination pins just far enough to clear their component.
 * 2. Route the middle section with orthogonal segments that do not cross any
 *    inflated component rectangle.
 * 3. Prefer short paths with few bends.
 * 4. Add only small separation when a segment would hide another wire.
 */

import { store } from '../store.js';
import { getComponentDef } from '../component-library.js';

const GRID = 10;
const COMPONENT_MARGIN = 14;
const CORRIDOR_GAP = 10;
const RESISTOR_LEAD_CLEARANCE = 24;
const WIRE_SEPARATION = 6;
const TURN_PENALTY = 18;
const MAX_GRAPH_NODES = 2600;

const NET_ORDER = {
    SIGNAL: 0,
    I2C: 1,
    POWER: 2,
    GROUND: 3,
};

function snap(value) {
    return Math.round(value / GRID) * GRID;
}

function snapBefore(value) {
    return Math.floor((value - 1) / GRID) * GRID;
}

function snapAfter(value) {
    return Math.ceil((value + 1) / GRID) * GRID;
}

function classifyWire(wire) {
    const text = `${wire.from.pinName} ${wire.to.pinName}`.toUpperCase();
    if (/(VCC|VDD|VIN|5V|3\.3V|V\+|PWR|POWER)/.test(text)) return NET_ORDER.POWER;
    if (/(GND|VSS|DGND|AGND)/.test(text)) return NET_ORDER.GROUND;
    if (/(SDA|SCL|A4|A5)/.test(text)) return NET_ORDER.I2C;
    return NET_ORDER.SIGNAL;
}

function getVisualFrame(inst) {
    const def = getComponentDef(inst.componentId);
    const width = def?.size?.width || 80;
    const height = def?.size?.height || 60;
    const rot = inst.rotation || 0;
    const size = (rot === 90 || rot === 270)
        ? { width: height, height: width }
        : { width, height };

    return {
        width: size.width,
        height: size.height,
        left: inst.x + (width - size.width) / 2,
        top: inst.y + (height - size.height) / 2,
        cx: inst.x + width / 2,
        cy: inst.y + height / 2,
    };
}

function getBounds(inst, margin = COMPONENT_MARGIN) {
    const frame = getVisualFrame(inst);
    const def = getComponentDef(inst.componentId);
    const effectiveMargin = def?.isBoard ? Math.max(margin, 22) : margin;
    return {
        id: inst.id,
        left: frame.left - effectiveMargin,
        right: frame.left + frame.width + effectiveMargin,
        top: frame.top - effectiveMargin,
        bottom: frame.top + frame.height + effectiveMargin,
        cx: frame.cx,
        cy: frame.cy,
    };
}

function getObstacles(excludeIds = new Set()) {
    return store.instances
        .filter(inst => !excludeIds.has(inst.id))
        .map(inst => getBounds(inst));
}

function getLeadClearance(inst) {
    const def = getComponentDef(inst.componentId);
    return def?.id === 'resistor' ? RESISTOR_LEAD_CLEARANCE : 0;
}

function pointKey(point) {
    return `${point.x},${point.y}`;
}

function samePoint(a, b) {
    return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

function segmentLength(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function segmentDirection(a, b) {
    if (Math.abs(a.x - b.x) < 0.5) return 'v';
    if (Math.abs(a.y - b.y) < 0.5) return 'h';
    return 'x';
}

function rangeOverlap(a1, a2, b1, b2) {
    const minA = Math.min(a1, a2);
    const maxA = Math.max(a1, a2);
    const minB = Math.min(b1, b2);
    const maxB = Math.max(b1, b2);
    return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
}

function rectCrossesSegment(rect, a, b) {
    if (samePoint(a, b)) return false;

    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);

    if (Math.abs(a.y - b.y) < 0.5) {
        return a.y > rect.top && a.y < rect.bottom &&
            maxX > rect.left && minX < rect.right;
    }

    if (Math.abs(a.x - b.x) < 0.5) {
        return a.x > rect.left && a.x < rect.right &&
            maxY > rect.top && minY < rect.bottom;
    }

    return maxX > rect.left && minX < rect.right &&
        maxY > rect.top && minY < rect.bottom;
}

function segmentClear(a, b, obstacles) {
    return !obstacles.some(rect => rectCrossesSegment(rect, a, b));
}

function cleanPoints(points) {
    const deduped = [];
    for (const point of points) {
        if (!point) continue;
        const last = deduped[deduped.length - 1];
        if (!last || !samePoint(last, point)) {
            deduped.push({ x: point.x, y: point.y });
        }
    }

    if (deduped.length <= 2) return deduped;

    const result = [deduped[0]];
    for (let i = 1; i < deduped.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = deduped[i];
        const next = deduped[i + 1];
        const sameX = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;
        const sameY = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;
        if (!sameX && !sameY) result.push(curr);
    }
    result.push(deduped[deduped.length - 1]);
    return result;
}

function escapePoint(instanceId, pinPos, exitDir) {
    const inst = store.getInstance(instanceId);
    const bounds = getBounds(inst, COMPONENT_MARGIN);
    const leadClearance = getLeadClearance(inst);

    if (exitDir === 'up') {
        const y = leadClearance
            ? Math.min(snapBefore(bounds.top), snapBefore(pinPos.y - leadClearance))
            : snapBefore(bounds.top);
        return { x: pinPos.x, y };
    }
    if (exitDir === 'down') {
        const y = leadClearance
            ? Math.max(snapAfter(bounds.bottom), snapAfter(pinPos.y + leadClearance))
            : snapAfter(bounds.bottom);
        return { x: pinPos.x, y };
    }
    if (exitDir === 'left') {
        const x = leadClearance
            ? Math.min(snapBefore(bounds.left), snapBefore(pinPos.x - leadClearance))
            : snapBefore(bounds.left);
        return { x, y: pinPos.y };
    }
    if (exitDir === 'right') {
        const x = leadClearance
            ? Math.max(snapAfter(bounds.right), snapAfter(pinPos.x + leadClearance))
            : snapAfter(bounds.right);
        return { x, y: pinPos.y };
    }
    return { x: pinPos.x, y: snapBefore(bounds.top) };
}

function chooseEscapePoint(instanceId, pinPos, preferredDir, otherInstanceId) {
    const ignored = new Set([instanceId, otherInstanceId]);
    const obstacles = getObstacles(ignored);
    const fallbackOrder = {
        up: ['up', 'left', 'right', 'down'],
        down: ['down', 'left', 'right', 'up'],
        left: ['left', 'up', 'down', 'right'],
        right: ['right', 'up', 'down', 'left'],
    };
    const directions = (fallbackOrder[preferredDir] || [preferredDir, 'up', 'right', 'left', 'down'])
        .filter((dir, index, arr) => dir && arr.indexOf(dir) === index);

    for (const dir of directions) {
        const point = escapePoint(instanceId, pinPos, dir);
        if (segmentClear(pinPos, point, obstacles)) return point;
    }

    return escapePoint(instanceId, pinPos, preferredDir);
}

function routeContext(wire) {
    const from = store.getPinAbsolutePosition(wire.from.instanceId, wire.from.pinName);
    const to = store.getPinAbsolutePosition(wire.to.instanceId, wire.to.pinName);
    if (!from || !to) return null;

    const exitDir1 = store.getPinExitDirection(wire.from.instanceId, wire.from.pinName);
    const exitDir2 = store.getPinExitDirection(wire.to.instanceId, wire.to.pinName);

    return {
        wire,
        from,
        to,
        escape1: chooseEscapePoint(wire.from.instanceId, from, exitDir1, wire.to.instanceId),
        escape2: chooseEscapePoint(wire.to.instanceId, to, exitDir2, wire.from.instanceId),
        netType: classifyWire(wire),
    };
}

function sceneRange(points, obstacles) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    for (const obs of obstacles) {
        xs.push(obs.left, obs.right);
        ys.push(obs.top, obs.bottom);
    }
    return {
        left: snapBefore(Math.min(...xs) - 60),
        right: snapAfter(Math.max(...xs) + 60),
        top: snapBefore(Math.min(...ys) - 60),
        bottom: snapAfter(Math.max(...ys) + 60),
    };
}

function addNearValue(set, value, min, max) {
    const snapped = snap(value);
    if (snapped >= min && snapped <= max) set.add(snapped);
}

function addExactValue(set, value, min, max) {
    const exact = Math.round(value * 10) / 10;
    if (exact >= min && exact <= max) set.add(exact);
}

function buildGridValues(route, obstacles, usedSegments) {
    const range = sceneRange([route.escape1, route.escape2], obstacles);
    const xs = new Set([route.escape1.x, route.escape2.x]);
    const ys = new Set([route.escape1.y, route.escape2.y]);

    for (const obs of obstacles) {
        addNearValue(xs, obs.left - CORRIDOR_GAP, range.left, range.right);
        addNearValue(xs, obs.right + CORRIDOR_GAP, range.left, range.right);
        addNearValue(ys, obs.top - CORRIDOR_GAP, range.top, range.bottom);
        addNearValue(ys, obs.bottom + CORRIDOR_GAP, range.top, range.bottom);
    }

    for (const seg of usedSegments) {
        if (seg.horizontal) {
            addExactValue(ys, seg.a.y - WIRE_SEPARATION, range.top, range.bottom);
            addExactValue(ys, seg.a.y + WIRE_SEPARATION, range.top, range.bottom);
        }
        if (seg.vertical) {
            addExactValue(xs, seg.a.x - WIRE_SEPARATION, range.left, range.right);
            addExactValue(xs, seg.a.x + WIRE_SEPARATION, range.left, range.right);
        }
    }

    return {
        xs: [...xs].sort((a, b) => a - b),
        ys: [...ys].sort((a, b) => a - b),
    };
}

function toSegments(points) {
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (segmentLength(a, b) < 2) continue;
        segments.push({
            a,
            b,
            horizontal: Math.abs(a.y - b.y) < 0.5,
            vertical: Math.abs(a.x - b.x) < 0.5,
        });
    }
    return segments;
}

function overlapCost(a, b, usedSegments) {
    let cost = 0;
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const vertical = Math.abs(a.x - b.x) < 0.5;

    for (const used of usedSegments) {
        if (horizontal && used.horizontal) {
            const distance = Math.abs(a.y - used.a.y);
            const overlap = rangeOverlap(a.x, b.x, used.a.x, used.b.x);
            if (overlap > 2 && distance < WIRE_SEPARATION) {
                cost += 900 + overlap * (WIRE_SEPARATION - distance);
            }
        }
        if (vertical && used.vertical) {
            const distance = Math.abs(a.x - used.a.x);
            const overlap = rangeOverlap(a.y, b.y, used.a.y, used.b.y);
            if (overlap > 2 && distance < WIRE_SEPARATION) {
                cost += 900 + overlap * (WIRE_SEPARATION - distance);
            }
        }
    }

    return cost;
}

function edgeCost(a, b, usedSegments) {
    return segmentLength(a, b) + overlapCost(a, b, usedSegments);
}

function turnCost(points) {
    let cost = 0;
    let lastDir = null;
    for (let i = 0; i < points.length - 1; i++) {
        const dir = segmentDirection(points[i], points[i + 1]);
        if (dir === 'x') continue;
        if (lastDir && lastDir !== dir) cost += TURN_PENALTY;
        lastDir = dir;
    }
    return cost;
}

function pathCost(points, usedSegments) {
    const segments = toSegments(points);
    let cost = turnCost(points);
    for (const seg of segments) {
        cost += edgeCost(seg.a, seg.b, usedSegments);
    }
    return cost;
}

function pathClear(points, obstacles) {
    return toSegments(points).every(seg => segmentClear(seg.a, seg.b, obstacles));
}

function routeViaY(route, y) {
    return cleanPoints([
        route.escape1,
        { x: route.escape1.x, y },
        { x: route.escape2.x, y },
        route.escape2,
    ]);
}

function routeViaX(route, x) {
    return cleanPoints([
        route.escape1,
        { x, y: route.escape1.y },
        { x, y: route.escape2.y },
        route.escape2,
    ]);
}

function boardChannelCandidates(route, obstacles) {
    const board = store.instances.find(i => getComponentDef(i.componentId)?.isBoard);
    if (!board) return [];

    const fromIsBoard = route.wire.from.instanceId === board.id;
    const toIsBoard = route.wire.to.instanceId === board.id;
    if (!fromIsBoard && !toIsBoard) return [];

    const boardPin = fromIsBoard ? route.wire.from.pinName : route.wire.to.pinName;
    const boardEscape = fromIsBoard ? route.escape1 : route.escape2;
    const exitDir = store.getPinExitDirection(board.id, boardPin);
    const bounds = getBounds(board, COMPONENT_MARGIN);
    const candidates = [];

    if (exitDir === 'up') {
        candidates.push(routeViaY(route, boardEscape.y));
        candidates.push(routeViaY(route, snapBefore(bounds.top - CORRIDOR_GAP)));
    } else if (exitDir === 'down') {
        candidates.push(routeViaY(route, boardEscape.y));
        candidates.push(routeViaY(route, snapAfter(bounds.bottom + CORRIDOR_GAP)));
    } else if (exitDir === 'left') {
        candidates.push(routeViaX(route, boardEscape.x));
        candidates.push(routeViaX(route, snapBefore(bounds.left - CORRIDOR_GAP)));
    } else if (exitDir === 'right') {
        candidates.push(routeViaX(route, boardEscape.x));
        candidates.push(routeViaX(route, snapAfter(bounds.right + CORRIDOR_GAP)));
    }

    return candidates.filter(path => pathClear(path, obstacles));
}

function reconstruct(cameFrom, endState, nodesByKey) {
    const path = [];
    let state = endState;
    while (state) {
        const pointKey = state.slice(0, state.lastIndexOf('|'));
        path.push(nodesByKey.get(pointKey));
        state = cameFrom.get(state);
    }
    return path.reverse();
}

function stateKey(pointKey, dir) {
    return `${pointKey}|${dir}`;
}

function findOrthogonalPath(route, obstacles, usedSegments) {
    const preferred = boardChannelCandidates(route, obstacles);
    const { xs, ys } = buildGridValues(route, obstacles, usedSegments);
    if (xs.length * ys.length > MAX_GRAPH_NODES) {
        return chooseBestPath([...preferred, fallbackPath(route, obstacles, usedSegments)], obstacles, usedSegments);
    }

    const nodesByKey = new Map();
    for (const x of xs) {
        for (const y of ys) {
            const point = { x, y };
            nodesByKey.set(pointKey(point), point);
        }
    }

    const startKey = pointKey(route.escape1);
    const endKey = pointKey(route.escape2);
    const startState = stateKey(startKey, 'n');
    const open = new Set([startState]);
    const cameFrom = new Map();
    const gScore = new Map([[startState, 0]]);
    const fScore = new Map([[startState, segmentLength(route.escape1, route.escape2)]]);

    const neighbors = (point) => {
        const result = [];
        for (const x of xs) {
            if (x !== point.x) result.push({ x, y: point.y });
        }
        for (const y of ys) {
            if (y !== point.y) result.push({ x: point.x, y });
        }
        return result;
    };

    while (open.size > 0) {
        let currentState = null;
        let currentScore = Infinity;
        for (const state of open) {
            const score = fScore.get(state) ?? Infinity;
            if (score < currentScore) {
                currentScore = score;
                currentState = state;
            }
        }

        const splitAt = currentState.lastIndexOf('|');
        const currentKey = currentState.slice(0, splitAt);
        const currentDir = currentState.slice(splitAt + 1);

        if (currentKey === endKey) {
            return chooseBestPath([...preferred, reconstruct(cameFrom, currentState, nodesByKey)], obstacles, usedSegments);
        }

        open.delete(currentState);
        const current = nodesByKey.get(currentKey);
        for (const next of neighbors(current)) {
            const nextKey = pointKey(next);
            if (!segmentClear(current, next, obstacles)) continue;

            const nextDir = segmentDirection(current, next);
            const bendCost = currentDir !== 'n' && currentDir !== nextDir ? TURN_PENALTY : 0;
            const nextState = stateKey(nextKey, nextDir);
            const tentative = (gScore.get(currentState) ?? Infinity) + edgeCost(current, next, usedSegments) + bendCost;
            if (tentative >= (gScore.get(nextState) ?? Infinity)) continue;

            cameFrom.set(nextState, currentState);
            gScore.set(nextState, tentative);
            fScore.set(nextState, tentative + segmentLength(next, route.escape2));
            open.add(nextState);
        }
    }

    return chooseBestPath([...preferred, fallbackPath(route, obstacles, usedSegments)], obstacles, usedSegments);
}

function fallbackPath(route, obstacles, usedSegments) {
    const candidates = [
        cleanPoints([route.escape1, { x: route.escape2.x, y: route.escape1.y }, route.escape2]),
        cleanPoints([route.escape1, { x: route.escape1.x, y: route.escape2.y }, route.escape2]),
    ];

    let best = candidates[0];
    let bestScore = Infinity;
    for (const points of candidates) {
        const segments = toSegments(points);
        let score = 0;
        for (const segment of segments) {
            score += edgeCost(segment.a, segment.b, usedSegments);
            if (!segmentClear(segment.a, segment.b, obstacles)) score += 100000;
        }
        if (score < bestScore) {
            best = points;
            bestScore = score;
        }
    }
    return best;
}

function chooseBestPath(paths, obstacles, usedSegments) {
    let best = null;
    let bestScore = Infinity;
    for (const raw of paths) {
        const path = cleanPoints(raw);
        if (path.length < 2 || !pathClear(path, obstacles)) continue;
        const score = pathCost(path, usedSegments);
        if (score < bestScore) {
            best = path;
            bestScore = score;
        }
    }
    return best || cleanPoints(paths.find(Boolean) || []);
}

export function clearRoutingCache() {
    // Kept for callers. The compact router is stateless between cleanup runs.
}

export async function routeAll() {
    if (store.wires.length === 0) return { routed: 0, failed: 0, errors: [] };

    const obstacles = getObstacles();
    const usedSegments = [];
    const errors = [];
    let routed = 0;

    const routes = store.wires
        .map(routeContext)
        .filter((route, index) => {
            if (route) return true;
            errors.push(`Wire ${store.wires[index]?.id || index}: cannot resolve pin positions`);
            return false;
        })
        .sort((a, b) => {
            if (a.netType !== b.netType) return a.netType - b.netType;
            const ax = Math.min(a.from.x, a.to.x);
            const bx = Math.min(b.from.x, b.to.x);
            if (ax !== bx) return ax - bx;
            return Math.min(a.from.y, a.to.y) - Math.min(b.from.y, b.to.y);
        });

    for (const route of routes) {
        const middle = cleanPoints(findOrthogonalPath(route, obstacles, usedSegments));
        const fullPath = cleanPoints([
            route.from,
            route.escape1,
            ...middle.slice(1, middle.length - 1),
            route.escape2,
            route.to,
        ]);

        route.wire.waypoints = fullPath.slice(1, fullPath.length - 1);
        route.wire.mode = 'orthogonal';
        usedSegments.push(...toSegments(fullPath).filter(seg => segmentLength(seg.a, seg.b) >= GRID));
        routed++;
    }

    store._pushHistory();
    store._notifyStructural();
    return { routed, failed: errors.length, errors };
}
