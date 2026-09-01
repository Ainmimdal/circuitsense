function samePoint(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
}

function simplify(points) {
    const result = [];
    for (const point of points) {
        const normalized = { x: Number(point.x), y: Number(point.y) };
        if (!result.length || !samePoint(result.at(-1), normalized)) result.push(normalized);
    }
    for (let index = result.length - 2; index > 0; index--) {
        const before = result[index - 1], current = result[index], after = result[index + 1];
        const vertical = Math.abs(before.x - current.x) < 1e-6 && Math.abs(current.x - after.x) < 1e-6 &&
            (current.y - before.y) * (after.y - current.y) >= 0;
        const horizontal = Math.abs(before.y - current.y) < 1e-6 && Math.abs(current.y - after.y) < 1e-6 &&
            (current.x - before.x) * (after.x - current.x) >= 0;
        if (vertical || horizontal) result.splice(index, 1);
    }
    return result;
}

function snapPoint(point, enabled, gridSize) {
    if (!enabled || !Number.isFinite(gridSize) || gridSize <= 0) return { x: point.x, y: point.y };
    return {
        x: Math.round(point.x / gridSize) * gridSize,
        y: Math.round(point.y / gridSize) * gridSize,
    };
}

function followsDirection(endpoint, next, direction) {
    if (direction === 'up') return next.y < endpoint.y - 1e-6;
    if (direction === 'down') return next.y > endpoint.y + 1e-6;
    if (direction === 'left') return next.x < endpoint.x - 1e-6;
    if (direction === 'right') return next.x > endpoint.x + 1e-6;
    return true;
}

function rubberBandEndpoint(points, endpoint, direction, escape = 2.54) {
    if (!endpoint || points.length < 2) return points;
    const result = points.map(point => ({ ...point }));
    const oldEndpoint = result[0], pivot = result[1];
    const vertical = Math.abs(oldEndpoint.x - pivot.x) < 1e-6;
    const horizontal = Math.abs(oldEndpoint.y - pivot.y) < 1e-6;
    result[0] = { ...endpoint };

    if (result.length === 2) {
        const other = result[1];
        if (vertical && Math.abs(endpoint.x - other.x) > 1e-6) result.splice(1, 0, { x: endpoint.x, y: other.y });
        else if (horizontal && Math.abs(endpoint.y - other.y) > 1e-6) result.splice(1, 0, { x: other.x, y: endpoint.y });
        return simplify(result);
    }

    if (vertical) {
        pivot.x = endpoint.x;
        if (!followsDirection(endpoint, pivot, direction) && result.length >= 4 &&
            Math.abs(pivot.y - result[2].y) < 1e-6) {
            const laneY = endpoint.y + (direction === 'up' ? -escape : escape);
            pivot.y = laneY;
            result[2].y = laneY;
        }
    } else if (horizontal) {
        pivot.y = endpoint.y;
        if (!followsDirection(endpoint, pivot, direction) && result.length >= 4 &&
            Math.abs(pivot.x - result[2].x) < 1e-6) {
            const laneX = endpoint.x + (direction === 'left' ? -escape : escape);
            pivot.x = laneX;
            result[2].x = laneX;
        }
    }
    // Freestyle/diagonal legs simply stretch from the moved endpoint. Orthogonal
    // legs slide their existing first segment and do not manufacture new bends.
    return simplify(result);
}

export function moveWireRouteEndpoints(points, {
    from = null, to = null, fromDirection = null, toDirection = null,
} = {}) {
    if (!Array.isArray(points) || points.length < 2) return [];
    let result = points.map(point => ({ ...point }));
    if (from) result = rubberBandEndpoint(result, from, fromDirection);
    if (to) result = rubberBandEndpoint(result.reverse(), to, toDirection).reverse();
    return simplify(result);
}

function appendOrthogonalTarget(points, target) {
    const from = points.at(-1);
    if (!from || !target) return;
    if (Math.abs(from.x - target.x) > 1e-6 && Math.abs(from.y - target.y) > 1e-6) {
        points.push({ x: target.x, y: from.y });
    }
    points.push({ x: target.x, y: target.y });
}

export function translateWireRoute(points, { delta, from, to } = {}) {
    if (!Array.isArray(points) || points.length < 2 || !from || !to) return [];
    const movement = { x: Number(delta?.x || 0), y: Number(delta?.y || 0) };
    const translated = points.map(point => ({
        x: Number(point.x) + movement.x,
        y: Number(point.y) + movement.y,
    }));
    const result = [{ x: Number(from.x), y: Number(from.y) }];
    appendOrthogonalTarget(result, translated[0]);
    for (const point of translated.slice(1)) result.push(point);
    appendOrthogonalTarget(result, { x: Number(to.x), y: Number(to.y) });
    return simplify(result);
}

export function editableWirePoints(wire, computedRoute) {
    if (!computedRoute || computedRoute.length < 2) return [];
    // The routed polyline is already the normalized visible geometry. Using raw
    // persisted waypoints here exposes collinear or superseded points that the
    // renderer has removed, leaving handles floating on apparently straight wire.
    return computedRoute.map(point => ({ ...point }));
}

export function moveWireWaypoint(wire, computedRoute, waypointIndex, point, {
    mode = 'freestyle', snap = true, gridSize = 2.54,
} = {}) {
    const full = editableWirePoints(wire, computedRoute);
    const fullIndex = waypointIndex + 1;
    if (fullIndex <= 0 || fullIndex >= full.length - 1) return full.slice(1, -1);
    const target = snapPoint(point, snap, gridSize);
    if (mode === 'freestyle') {
        full[fullIndex] = target;
        return full.slice(1, -1);
    }

    const before = full[fullIndex - 1], current = full[fullIndex], after = full[fullIndex + 1];
    const incomingVertical = Math.abs(before.x - current.x) < 1e-6;
    const outgoingVertical = Math.abs(current.x - after.x) < 1e-6;
    const incomingHorizontal = Math.abs(before.y - current.y) < 1e-6;
    const outgoingHorizontal = Math.abs(current.y - after.y) < 1e-6;
    if ((!incomingVertical && !incomingHorizontal) || (!outgoingVertical && !outgoingHorizontal) ||
        incomingVertical === outgoingVertical) {
        full[fullIndex] = target;
        return full.slice(1, -1);
    }
    const beforeIsEndpoint = fullIndex - 1 === 0;
    const afterIsEndpoint = fullIndex + 1 === full.length - 1;
    if (incomingVertical) {
        if (beforeIsEndpoint) full.splice(fullIndex, 0, { x: target.x, y: before.y });
        else before.x = target.x;
        const shiftedIndex = beforeIsEndpoint ? fullIndex + 1 : fullIndex;
        full[shiftedIndex] = target;
        const shiftedAfter = full[shiftedIndex + 1];
        if (afterIsEndpoint) full.splice(shiftedIndex + 1, 0, { x: shiftedAfter.x, y: target.y });
        else shiftedAfter.y = target.y;
    } else {
        if (beforeIsEndpoint) full.splice(fullIndex, 0, { x: before.x, y: target.y });
        else before.y = target.y;
        const shiftedIndex = beforeIsEndpoint ? fullIndex + 1 : fullIndex;
        full[shiftedIndex] = target;
        const shiftedAfter = full[shiftedIndex + 1];
        if (afterIsEndpoint) full.splice(shiftedIndex + 1, 0, { x: target.x, y: shiftedAfter.y });
        else shiftedAfter.x = target.x;
    }
    return simplify(full).slice(1, -1);
}

export function moveWireSegment(wire, computedRoute, segmentIndex, point, {
    snap = true, gridSize = 2.54,
} = {}) {
    const full = editableWirePoints(wire, computedRoute);
    if (segmentIndex < 0 || segmentIndex >= full.length - 1) return full.slice(1, -1);
    const a = full[segmentIndex], b = full[segmentIndex + 1];
    const horizontal = Math.abs(a.y - b.y) < 1e-6;
    const vertical = Math.abs(a.x - b.x) < 1e-6;
    if (!horizontal && !vertical) return full.slice(1, -1);
    const target = snapPoint(point, snap, gridSize);
    const lastIndex = full.length - 1;
    const before = full.slice(0, segmentIndex);
    const after = full.slice(segmentIndex + 2);
    let moved;

    if (horizontal) {
        const movedA = { x: a.x, y: target.y }, movedB = { x: b.x, y: target.y };
        moved = [
            ...(segmentIndex === 0 ? [{ ...a }, movedA] : [movedA]),
            ...(segmentIndex + 1 === lastIndex ? [movedB, { ...b }] : [movedB]),
        ];
    } else {
        const movedA = { x: target.x, y: a.y }, movedB = { x: target.x, y: b.y };
        moved = [
            ...(segmentIndex === 0 ? [{ ...a }, movedA] : [movedA]),
            ...(segmentIndex + 1 === lastIndex ? [movedB, { ...b }] : [movedB]),
        ];
    }
    return simplify([...before, ...moved, ...after]).slice(1, -1);
}

function projectToSegment(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-9) return { point: { ...a }, distance: Math.hypot(point.x - a.x, point.y - a.y) };
    const amount = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    const projected = { x: a.x + amount * dx, y: a.y + amount * dy };
    return { point: projected, distance: Math.hypot(point.x - projected.x, point.y - projected.y) };
}

export function insertWireWaypoint(wire, computedRoute, point, { snap = true, gridSize = 2.54 } = {}) {
    const full = editableWirePoints(wire, computedRoute);
    if (full.length < 2) return [];
    let best = null;
    for (let index = 0; index < full.length - 1; index++) {
        const candidate = projectToSegment(point, full[index], full[index + 1]);
        if (!best || candidate.distance < best.distance) best = { ...candidate, index };
    }
    const projected = snapPoint(best.point, snap, gridSize);
    full.splice(best.index + 1, 0, projected);
    return full.slice(1, -1);
}

export function removeWireWaypoint(wire, computedRoute, waypointIndex) {
    const full = editableWirePoints(wire, computedRoute);
    if (waypointIndex < 0 || waypointIndex >= full.length - 2) return full.slice(1, -1);
    full.splice(waypointIndex + 1, 1);
    return full.slice(1, -1);
}
