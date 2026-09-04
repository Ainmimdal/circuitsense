import { applyTransform } from './geometry.js';
import { componentWorldTransform, resolveConnectionWorldPoint } from './model.js';
import { getFootprintDefinition } from './footprints.js';
import { pinExitDirection, routeSegments, ROUTING_WIRE_SEPARATION } from './routing.js';

const TARGET_ASPECT_RATIO = 1.65;
const FANOUT_CORRIDOR_PADDING = 2.54;
const EPSILON = 1e-6;

function stableCompare(left, right) {
    return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function componentBounds(project, component) {
    const bounds = getFootprintDefinition(component.footprintId)?.routingBounds;
    const transform = componentWorldTransform(project, component);
    if (!bounds || !transform) {
        return {
            left: transform?.x || 0,
            top: transform?.y || 0,
            right: (transform?.x || 0) + 20,
            bottom: (transform?.y || 0) + 15,
        };
    }
    const corners = [
        applyTransform({ x: bounds.x, y: bounds.y }, transform),
        applyTransform({ x: bounds.x + bounds.width, y: bounds.y }, transform),
        applyTransform({ x: bounds.x, y: bounds.y + bounds.height }, transform),
        applyTransform({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, transform),
    ];
    return {
        left: Math.min(...corners.map(point => point.x)),
        right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)),
        bottom: Math.max(...corners.map(point => point.y)),
    };
}

function boundsSize(bounds) {
    return { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
}

function groupBounds(project, group) {
    const bounds = group.componentIds
        .map(id => project.components.find(component => component.id === id))
        .filter(Boolean)
        .map(component => componentBounds(project, component));
    return {
        left: Math.min(...bounds.map(item => item.left)),
        right: Math.max(...bounds.map(item => item.right)),
        top: Math.min(...bounds.map(item => item.top)),
        bottom: Math.max(...bounds.map(item => item.bottom)),
    };
}

function translateGroup(project, group, dx, dy) {
    for (const id of group.componentIds) {
        const component = project.components.find(item => item.id === id);
        if (component?.placement?.type !== 'free') continue;
        component.placement.position.x += dx;
        component.placement.position.y += dy;
    }
}

function placeGroup(project, group, left, top) {
    const bounds = groupBounds(project, group);
    translateGroup(project, group, left - bounds.left, top - bounds.top);
}

function placeComponentBounds(project, component, left, top) {
    if (component?.placement?.type !== 'free') return;
    const bounds = componentBounds(project, component);
    component.placement.position.x += left - bounds.left;
    component.placement.position.y += top - bounds.top;
}

function isGeneratedHelper(component) {
    return component?.properties?.provenance?.kind === 'generated';
}

function buildGroups(project, controllerId, memberIds) {
    const members = project.components.filter(component => memberIds.has(component.id));
    const helpersByOwner = new Map();
    for (const helper of members.filter(isGeneratedHelper)) {
        const ownerId = helper.properties?.provenance?.ownerId;
        if (!ownerId) continue;
        if (!helpersByOwner.has(ownerId)) helpersByOwner.set(ownerId, []);
        helpersByOwner.get(ownerId).push(helper.id);
    }
    const groups = members.filter(component => !isGeneratedHelper(component)).map(owner => ({
        id: owner.id,
        ownerId: owner.id,
        componentIds: [owner.id, ...(helpersByOwner.get(owner.id) || []).sort(stableCompare)],
        controllerId,
    }));
    const claimed = new Set(groups.flatMap(group => group.componentIds));
    for (const helper of members.filter(component => !claimed.has(component.id))) {
        groups.push({ id: helper.id, ownerId: helper.id, componentIds: [helper.id], controllerId });
    }
    return groups.sort((a, b) => stableCompare(a.id, b.id));
}

function endpointForComponent(wire, componentId) {
    if (wire.from?.type === 'component-pin' && wire.from.componentId === componentId) return wire.from;
    if (wire.to?.type === 'component-pin' && wire.to.componentId === componentId) return wire.to;
    return null;
}

function otherEndpoint(wire, componentId) {
    if (wire.from?.type === 'component-pin' && wire.from.componentId === componentId) return wire.to;
    if (wire.to?.type === 'component-pin' && wire.to.componentId === componentId) return wire.from;
    return null;
}

function supplyKind(value) {
    const pin = String(value || '').toUpperCase();
    if (/(GND|VSS|DGND|AGND)/.test(pin)) return 'ground';
    if (/^(?:3V3|3\.3V)$/.test(pin)) return '3v3';
    if (/^5V$/.test(pin)) return '5v';
    if (/(VCC|VDD|VIN|V\+|PWR|POWER)/.test(pin)) return 'power';
    return null;
}

function groupConnectionCount(project, group) {
    const ids = new Set(group.componentIds);
    return project.wires.filter(wire => [wire.from, wire.to].some(ref =>
        ref?.type === 'component-pin' && ids.has(ref.componentId))).length;
}

function groupPortDirection(project, group) {
    const owner = project.components.find(component => component.id === group.ownerId);
    if (!owner) return null;
    const scores = new Map(['up', 'down', 'left', 'right'].map(direction => [direction, 0]));
    for (const wire of project.wires) {
        const ref = endpointForComponent(wire, owner.id);
        if (!ref) continue;
        const direction = pinExitDirection(project, ref);
        if (!scores.has(direction)) continue;
        const other = otherEndpoint(wire, owner.id);
        const sharedSupply = supplyKind(ref.pinId) || supplyKind(other?.pinId);
        scores.set(direction, scores.get(direction) + (sharedSupply ? 0.25 : 1));
    }
    const ranked = [...scores].filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1] || ['down', 'left', 'up', 'right'].indexOf(a[0]) -
            ['down', 'left', 'up', 'right'].indexOf(b[0]));
    if (ranked.length) return ranked[0][0];

    const ids = new Set(group.componentIds);
    const controllerDirections = [];
    for (const wire of project.wires) {
        const controllerRef = endpointForComponent(wire, group.controllerId);
        if (!controllerRef) continue;
        const other = otherEndpoint(wire, group.controllerId);
        if (other?.type === 'component-pin' && ids.has(other.componentId)) {
            controllerDirections.push(pinExitDirection(project, controllerRef));
        }
    }
    return controllerDirections.filter(Boolean).sort(stableCompare)[0] || null;
}

function desiredSide(project, group) {
    const portDirection = groupPortDirection(project, group);
    const ownerHasPort = project.wires.some(wire => endpointForComponent(wire, group.ownerId));
    if (ownerHasPort) {
        return { up: 'bottom', down: 'top', left: 'right', right: 'left' }[portDirection] || 'right';
    }
    return { up: 'top', down: 'bottom', left: 'left', right: 'right' }[portDirection] || 'right';
}

function canonicalizeRotations(project, groups, mode) {
    if (mode !== 'canonical') return;
    for (const group of groups) {
        const owner = project.components.find(component => component.id === group.ownerId);
        if (!owner || owner.placement?.type !== 'free' || owner.properties?.locked) continue;
        const rotations = getFootprintDefinition(owner.footprintId)?.validRotations || [0];
        if (rotations.includes(0)) owner.placement.rotation = 0;
    }
}

function normalizeController(project, controller) {
    placeComponentBounds(project, controller, 0, 40);
}

function groupMetadata(project, groups) {
    return groups.map(group => {
        const bounds = groupBounds(project, group);
        return {
            ...group,
            side: desiredSide(project, group),
            connections: groupConnectionCount(project, group),
            ...boundsSize(bounds),
        };
    });
}

function ordered(items, direction, orderMode) {
    const copy = [...items];
    copy.sort((a, b) => {
        if (direction === 'right' || direction === 'left') {
            return b.connections - a.connections || b.width - a.width || stableCompare(a.id, b.id);
        }
        return a.connections - b.connections || a.width - b.width || stableCompare(a.id, b.id);
    });
    if (orderMode === 'reverse') copy.reverse();
    if (orderMode === 'signals-first') copy.sort((a, b) => b.connections - a.connections || stableCompare(a.id, b.id));
    return copy;
}

function chunks(items, size) {
    const result = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
}

function facingLaneDepth(project, componentIds, direction) {
    let depth = 0;
    for (const componentId of componentIds) {
        const lanes = new Set();
        for (const wire of project.wires) {
            const ref = endpointForComponent(wire, componentId);
            if (!ref || pinExitDirection(project, ref) !== direction) continue;
            const other = otherEndpoint(wire, componentId);
            const supply = supplyKind(ref.pinId) || supplyKind(other?.pinId);
            lanes.add(supply ? `supply:${supply}` : `wire:${wire.id}`);
        }
        depth = Math.max(depth, Math.max(0, lanes.size - 1) * ROUTING_WIRE_SEPARATION);
    }
    return depth;
}

function fanoutAwareGap(project, controllerId, items, side, configuredGap) {
    const controllerDirection = { top: 'up', bottom: 'down', left: 'left', right: 'right' }[side];
    const itemDirection = { top: 'down', bottom: 'up', left: 'right', right: 'left' }[side];
    const controllerDepth = facingLaneDepth(project, [controllerId], controllerDirection);
    const itemDepth = facingLaneDepth(project, items.flatMap(item => item.componentIds), itemDirection);
    return Math.max(configuredGap, controllerDepth + itemDepth + FANOUT_CORRIDOR_PADDING);
}

function placeTopOrBottom(project, controller, controllerBounds, items, direction, spec) {
    const rows = chunks(ordered(items, direction, spec.orderMode), spec.wrap);
    const controllerGap = fanoutAwareGap(project, controller.id, items, direction, spec.controllerGap);
    let boundary = direction === 'top'
        ? controllerBounds.top - controllerGap
        : controllerBounds.bottom + controllerGap;
    for (const row of rows) {
        const rowHeight = Math.max(...row.map(item => item.height));
        let cursor = controllerBounds.left + (controllerBounds.right - controllerBounds.left) * spec.topStart;
        for (const item of row) {
            const top = direction === 'top' ? boundary - item.height : boundary;
            placeGroup(project, item, cursor, top);
            cursor += item.width + spec.itemGap;
        }
        boundary += direction === 'top' ? -(rowHeight + spec.bandGap) : rowHeight + spec.bandGap;
    }
}

function placeLeftOrRight(project, controller, controllerBounds, items, direction, spec) {
    const shelves = chunks(ordered(items, direction, spec.orderMode), spec.wrap);
    const centerY = (controllerBounds.top + controllerBounds.bottom) / 2;
    const controllerGap = fanoutAwareGap(project, controller.id, items, direction, spec.controllerGap);
    for (let shelfIndex = 0; shelfIndex < shelves.length; shelfIndex++) {
        const shelf = shelves[shelfIndex];
        const shelfHeight = Math.max(...shelf.map(item => item.height));
        const verticalOffset = shelfIndex === 0 ? 0 : Math.ceil(shelfIndex / 2) * (shelfHeight + spec.bandGap) *
            (shelfIndex % 2 ? 1 : -1);
        let cursor = direction === 'right'
            ? controllerBounds.right + controllerGap
            : controllerBounds.left - controllerGap;
        for (const item of shelf) {
            const left = direction === 'right' ? cursor : cursor - item.width;
            const top = centerY - item.height / 2 + verticalOffset;
            placeGroup(project, item, left, top);
            cursor += direction === 'right' ? item.width + spec.itemGap : -(item.width + spec.itemGap);
        }
    }
}

function placePortFlow(project, controllerId, groups, spec) {
    const controller = project.components.find(component => component.id === controllerId);
    if (!controller) return;
    canonicalizeRotations(project, groups, spec.rotationMode);
    normalizeController(project, controller);
    const controllerBounds = componentBounds(project, controller);
    const metadata = groupMetadata(project, groups);
    for (const side of ['top', 'bottom']) {
        placeTopOrBottom(project, controller, controllerBounds, metadata.filter(group => group.side === side), side, spec);
    }
    for (const side of ['right', 'left']) {
        placeLeftOrRight(project, controller, controllerBounds, metadata.filter(group => group.side === side), side, spec);
    }
}

function pointEquals(left, right) {
    return Math.abs(left.x - right.x) < EPSILON && Math.abs(left.y - right.y) < EPSILON;
}

function segmentLength(segment) {
    return Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y);
}

function segmentDirection(segment) {
    if (Math.abs(segment.a.x - segment.b.x) < EPSILON) return 'v';
    if (Math.abs(segment.a.y - segment.b.y) < EPSILON) return 'h';
    return 'x';
}

function rangeOverlap(a1, a2, b1, b2) {
    return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) -
        Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function crossingPoint(first, second) {
    const firstDirection = segmentDirection(first), secondDirection = segmentDirection(second);
    if (!['h', 'v'].includes(firstDirection) || !['h', 'v'].includes(secondDirection) || firstDirection === secondDirection) return null;
    const horizontal = firstDirection === 'h' ? first : second;
    const vertical = firstDirection === 'v' ? first : second;
    const point = { x: vertical.a.x, y: horizontal.a.y };
    const insideHorizontal = point.x > Math.min(horizontal.a.x, horizontal.b.x) + EPSILON &&
        point.x < Math.max(horizontal.a.x, horizontal.b.x) - EPSILON;
    const insideVertical = point.y > Math.min(vertical.a.y, vertical.b.y) + EPSILON &&
        point.y < Math.max(vertical.a.y, vertical.b.y) - EPSILON;
    return insideHorizontal && insideVertical ? point : null;
}

function parallelOverlap(first, second) {
    const direction = segmentDirection(first);
    if (direction !== segmentDirection(second) || !['h', 'v'].includes(direction)) return 0;
    if (direction === 'h') {
        if (Math.abs(first.a.y - second.a.y) > EPSILON) return 0;
        return rangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
    }
    if (Math.abs(first.a.x - second.a.x) > EPSILON) return 0;
    return rangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
}

function wireBusKey(wire) {
    const kinds = [wire.from?.pinId, wire.to?.pinId].map(supplyKind).filter(Boolean);
    return kinds[0] || null;
}

function overlapArea(first, second) {
    return Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
        Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
}

function cleanPoints(points) {
    const result = [];
    for (const point of points.filter(Boolean)) {
        const normalized = { x: Number(point.x), y: Number(point.y) };
        const last = result.at(-1);
        if (!last || !pointEquals(last, normalized)) result.push(normalized);
    }
    for (let index = result.length - 2; index > 0; index--) {
        const before = result[index - 1], current = result[index], after = result[index + 1];
        const vertical = Math.abs(before.x - current.x) < EPSILON && Math.abs(current.x - after.x) < EPSILON;
        const horizontal = Math.abs(before.y - current.y) < EPSILON && Math.abs(current.y - after.y) < EPSILON;
        if (vertical || horizontal) result.splice(index, 1);
    }
    return result;
}

function segmentIntersectsBox(segment, box) {
    if (segmentDirection(segment) === 'h') {
        return segment.a.y > box.top && segment.a.y < box.bottom &&
            Math.max(segment.a.x, segment.b.x) > box.left && Math.min(segment.a.x, segment.b.x) < box.right;
    }
    if (segmentDirection(segment) === 'v') {
        return segment.a.x > box.left && segment.a.x < box.right &&
            Math.max(segment.a.y, segment.b.y) > box.top && Math.min(segment.a.y, segment.b.y) < box.bottom;
    }
    return true;
}

function escapePoint(project, ref, point, margin = 4) {
    if (ref?.type !== 'component-pin') return point;
    const component = project.components.find(item => item.id === ref.componentId);
    if (!component) return point;
    const bounds = componentBounds(project, component);
    const direction = pinExitDirection(project, ref);
    if (direction === 'up') return { x: point.x, y: Math.min(point.y, bounds.top - margin) };
    if (direction === 'down') return { x: point.x, y: Math.max(point.y, bounds.bottom + margin) };
    if (direction === 'left') return { x: Math.min(point.x, bounds.left - margin), y: point.y };
    if (direction === 'right') return { x: Math.max(point.x, bounds.right + margin), y: point.y };
    return point;
}

function estimatePathCost(points, obstacles, usedSegments, busKey) {
    const segments = routeSegments(points);
    let cost = Math.max(0, points.length - 2) * 20;
    for (const segment of segments) {
        cost += segmentLength(segment);
        cost += obstacles.filter(box => segmentIntersectsBox(segment, box)).length * 1_000_000;
        for (const used of usedSegments) {
            if (!busKey || busKey !== used.busKey) {
                if (crossingPoint(segment, used)) cost += 8_000;
                cost += parallelOverlap(segment, used) * 80;
            }
        }
    }
    return cost;
}

function quickRouteAll(project) {
    const routes = new Map(), usedSegments = [];
    const boxes = project.components.map(component => ({ id: component.id, ...componentBounds(project, component) }));
    for (const wire of project.wires) {
        const from = resolveConnectionWorldPoint(project, wire.from);
        const to = resolveConnectionWorldPoint(project, wire.to);
        if (!from || !to) continue;
        const escape1 = escapePoint(project, wire.from, from);
        const escape2 = escapePoint(project, wire.to, to);
        // The candidate path starts at the already-cleared endpoint escapes, so
        // both endpoint bodies remain solid obstacles for every middle segment.
        const obstacles = boxes;
        const xs = new Set([
            (escape1.x + escape2.x) / 2,
            Math.min(escape1.x, escape2.x) - 8,
            Math.max(escape1.x, escape2.x) + 8,
        ]);
        const ys = new Set([
            (escape1.y + escape2.y) / 2,
            Math.min(escape1.y, escape2.y) - 8,
            Math.max(escape1.y, escape2.y) + 8,
        ]);
        for (const box of obstacles) {
            xs.add(box.left - 6); xs.add(box.right + 6);
            ys.add(box.top - 6); ys.add(box.bottom + 6);
        }
        const middleCandidates = [
            cleanPoints([escape1, { x: escape2.x, y: escape1.y }, escape2]),
            cleanPoints([escape1, { x: escape1.x, y: escape2.y }, escape2]),
            ...[...xs].flatMap(x => [cleanPoints([escape1, { x, y: escape1.y }, { x, y: escape2.y }, escape2])]),
            ...[...ys].flatMap(y => [cleanPoints([escape1, { x: escape1.x, y }, { x: escape2.x, y }, escape2])]),
        ];
        const busKey = wireBusKey(wire);
        let best = middleCandidates[0];
        let bestCost = Number.POSITIVE_INFINITY;
        for (const candidate of middleCandidates) {
            const cost = estimatePathCost(candidate, obstacles, usedSegments, busKey);
            if (cost >= bestCost) continue;
            best = candidate;
            bestCost = cost;
        }
        const points = cleanPoints([from, escape1, ...best.slice(1, -1), escape2, to]);
        routes.set(wire.id, points);
        usedSegments.push(...routeSegments(points).map(segment => ({ ...segment, busKey })));
    }
    return routes;
}

function scoreCandidate(project, name) {
    const routedProject = structuredClone(project);
    for (const wire of routedProject.wires) wire.route = { mode: 'auto', waypoints: [] };
    const routes = quickRouteAll(routedProject);
    const componentBoxes = routedProject.components.map(component => ({ id: component.id, ...componentBounds(routedProject, component) }));
    let overlaps = 0;
    for (let first = 0; first < componentBoxes.length; first++) {
        for (let second = first + 1; second < componentBoxes.length; second++) {
            if (overlapArea(componentBoxes[first], componentBoxes[second]) > EPSILON) overlaps++;
        }
    }

    const routed = [];
    let unresolved = 0, length = 0, bends = 0, detour = 0, backtracks = 0;
    for (const wire of routedProject.wires) {
        const points = routes.get(wire.id);
        if (!points?.length) {
            unresolved++;
            continue;
        }
        const segments = routeSegments(points);
        const wireLength = segments.reduce((total, segment) => total + segmentLength(segment), 0);
        const direct = Math.abs(points[0].x - points.at(-1).x) + Math.abs(points[0].y - points.at(-1).y);
        const extra = Math.max(0, wireLength - direct);
        length += wireLength;
        bends += Math.max(0, points.length - 2);
        detour += extra;
        if (wireLength > direct * 1.7 + 12) backtracks++;
        routed.push({ wire, points, segments, busKey: wireBusKey(wire) });
    }

    let crossings = 0, crowdedLength = 0;
    for (let first = 0; first < routed.length; first++) {
        for (let second = first + 1; second < routed.length; second++) {
            const sameBus = routed[first].busKey && routed[first].busKey === routed[second].busKey;
            for (const firstSegment of routed[first].segments) {
                for (const secondSegment of routed[second].segments) {
                    const crossing = crossingPoint(firstSegment, secondSegment);
                    if (crossing && !sameBus &&
                        ![firstSegment.a, firstSegment.b].some(point => pointEquals(point, crossing)) &&
                        ![secondSegment.a, secondSegment.b].some(point => pointEquals(point, crossing))) crossings++;
                    const shared = parallelOverlap(firstSegment, secondSegment);
                    if (!sameBus && shared > 0) crowdedLength += shared;
                }
            }
        }
    }

    const scenePoints = [
        ...componentBoxes.flatMap(box => [{ x: box.left, y: box.top }, { x: box.right, y: box.bottom }]),
        ...routed.flatMap(route => route.points),
    ];
    const left = Math.min(...scenePoints.map(point => point.x));
    const right = Math.max(...scenePoints.map(point => point.x));
    const top = Math.min(...scenePoints.map(point => point.y));
    const bottom = Math.max(...scenePoints.map(point => point.y));
    const width = Math.max(1, right - left), height = Math.max(1, bottom - top);
    const aspectRatio = width / height;
    const aspectPenalty = Math.abs(Math.log(aspectRatio / TARGET_ASPECT_RATIO));
    const area = width * height;
    const score = unresolved * 1_000_000_000 + overlaps * 100_000_000 + crossings * 20_000 +
        crowdedLength * 300 + backtracks * 15_000 + detour * 12 + bends * 180 +
        aspectPenalty * 4_000 + area * 0.15 + length;
    return {
        name, score, unresolved, overlaps, crossings, crowdedLength, backtracks,
        detour, bends, length, width, height, aspectRatio, area,
    };
}

function scoreIsBad(score, wireCount) {
    return score.unresolved > 0 || score.overlaps > 0 || score.backtracks > 0 ||
        score.crossings > Math.max(1, Math.floor(wireCount / 6)) ||
        score.aspectRatio < 0.75 || score.aspectRatio > 2.9;
}

function internalProject(project, includedIds) {
    const clone = structuredClone(project);
    clone.surfaces = [];
    clone.components = clone.components.filter(component => includedIds.has(component.id));
    clone.wires = clone.wires.filter(wire => [wire.from, wire.to].every(ref =>
        ref?.type === 'component-pin' && includedIds.has(ref.componentId)));
    return clone;
}

function candidateSpecs(memberCount) {
    const wrap = memberCount <= 4 ? 4 : memberCount <= 8 ? 3 : 2;
    return [
        { name: 'port-flow-compact', rotationMode: 'canonical', controllerGap: 8, itemGap: 7, bandGap: 8, wrap, topStart: 0.5, orderMode: 'normal' },
        { name: 'port-flow-balanced', rotationMode: 'canonical', controllerGap: 11, itemGap: 9, bandGap: 10, wrap: Math.min(3, wrap), topStart: 0.45, orderMode: 'normal' },
        { name: 'port-flow-airy', rotationMode: 'canonical', controllerGap: 15, itemGap: 12, bandGap: 12, wrap: Math.min(3, wrap), topStart: 0.6, orderMode: 'normal' },
        { name: 'port-flow-wrapped', rotationMode: 'canonical', controllerGap: 9, itemGap: 8, bandGap: 9, wrap: 2, topStart: 0.4, orderMode: 'signals-first' },
        { name: 'port-flow-preserve', rotationMode: 'preserve', controllerGap: 11, itemGap: 9, bandGap: 10, wrap: Math.min(3, wrap), topStart: 0.5, orderMode: 'normal' },
    ];
}

function retrySpecs() {
    return [
        { name: 'retry-wide-reversed', rotationMode: 'canonical', controllerGap: 17, itemGap: 13, bandGap: 13, wrap: 3, topStart: 0.25, orderMode: 'reverse' },
        { name: 'retry-two-lane', rotationMode: 'canonical', controllerGap: 14, itemGap: 11, bandGap: 14, wrap: 2, topStart: 0.7, orderMode: 'normal' },
        { name: 'retry-signals-first', rotationMode: 'preserve', controllerGap: 16, itemGap: 12, bandGap: 13, wrap: 2, topStart: 0.35, orderMode: 'signals-first' },
    ];
}

/**
 * Try several direct-scene placements, route each one in memory, and apply the
 * best-scoring component placement. The incoming project is already the old
 * deterministic layout, so that layout remains a baseline candidate.
 */
export function layoutDirectClusterV2(project, controllerId, memberIds) {
    const includedIds = new Set([controllerId, ...memberIds]);
    const source = internalProject(project, includedIds);
    const groups = buildGroups(source, controllerId, new Set(memberIds));
    if (!groups.length) return { selected: 'baseline', attempts: 1, candidates: [] };

    const candidates = [];
    const addCandidate = (name, candidate) => {
        const metrics = scoreCandidate(candidate, name);
        candidates.push({ project: candidate, metrics });
    };
    addCandidate('baseline', structuredClone(source));
    for (const spec of candidateSpecs(groups.length)) {
        const candidate = structuredClone(source);
        const candidateGroups = buildGroups(candidate, controllerId, new Set(memberIds));
        placePortFlow(candidate, controllerId, candidateGroups, spec);
        addCandidate(spec.name, candidate);
    }

    let best = [...candidates].sort((a, b) => a.metrics.score - b.metrics.score ||
        stableCompare(a.metrics.name, b.metrics.name))[0];
    if (scoreIsBad(best.metrics, source.wires.length)) {
        for (const spec of retrySpecs()) {
            const candidate = structuredClone(source);
            const candidateGroups = buildGroups(candidate, controllerId, new Set(memberIds));
            placePortFlow(candidate, controllerId, candidateGroups, spec);
            addCandidate(spec.name, candidate);
        }
        best = [...candidates].sort((a, b) => a.metrics.score - b.metrics.score ||
            stableCompare(a.metrics.name, b.metrics.name))[0];
    }

    const selectedById = new Map(best.project.components.map(component => [component.id, component]));
    for (const component of project.components) {
        const selected = selectedById.get(component.id);
        if (!selected || component.placement?.type !== 'free') continue;
        component.placement = structuredClone(selected.placement);
    }
    return {
        selected: best.metrics.name,
        attempts: candidates.length,
        score: best.metrics.score,
        metrics: { ...best.metrics },
        candidates: candidates.map(candidate => ({ ...candidate.metrics })),
    };
}
