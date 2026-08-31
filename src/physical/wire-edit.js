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

function connectorFromEndpoint(endpoint, pivot, direction, escape = 2.54) {
    if (!endpoint || !pivot) return [endpoint || pivot].filter(Boolean);
    if (direction === 'up' || direction === 'down') {
        const y = endpoint.y + (direction === 'up' ? -escape : escape);
        return simplify([endpoint, { x: endpoint.x, y }, { x: pivot.x, y }, pivot]);
    }
    if (direction === 'left' || direction === 'right') {
        const x = endpoint.x + (direction === 'left' ? -escape : escape);
        return simplify([endpoint, { x, y: endpoint.y }, { x, y: pivot.y }, pivot]);
    }
    return simplify([endpoint, { x: pivot.x, y: endpoint.y }, pivot]);
}

export function moveWireRouteEndpoints(points, {
    from = null, to = null, fromDirection = null, toDirection = null,
} = {}) {
    if (!Array.isArray(points) || points.length < 2) return [];
    let result = points.map(point => ({ ...point }));
    if (from) {
        const pivot = result[1] || result.at(-1);
        result = [...connectorFromEndpoint(from, pivot, fromDirection), ...result.slice(2)];
    }
    if (to) {
        const pivot = result.at(-2) || result[0];
        const connector = connectorFromEndpoint(to, pivot, toDirection).reverse();
        result = [...result.slice(0, -2), ...connector];
    }
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
