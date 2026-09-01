const EPSILON = 1e-9;

export function normalizeSelectionRect(start, end) {
    const left = Math.min(Number(start.x), Number(end.x));
    const right = Math.max(Number(start.x), Number(end.x));
    const top = Math.min(Number(start.y), Number(end.y));
    const bottom = Math.max(Number(start.y), Number(end.y));
    return { x: left, y: top, width: right - left, height: bottom - top, left, right, top, bottom };
}

export function rectsIntersect(a, b) {
    const first = normalizeSelectionRect(
        { x: a.left ?? a.x, y: a.top ?? a.y },
        { x: a.right ?? (a.x + a.width), y: a.bottom ?? (a.y + a.height) },
    );
    const second = normalizeSelectionRect(
        { x: b.left ?? b.x, y: b.top ?? b.y },
        { x: b.right ?? (b.x + b.width), y: b.bottom ?? (b.y + b.height) },
    );
    return first.left <= second.right + EPSILON && first.right + EPSILON >= second.left &&
        first.top <= second.bottom + EPSILON && first.bottom + EPSILON >= second.top;
}

function pointInRect(point, rect) {
    return point.x >= rect.left - EPSILON && point.x <= rect.right + EPSILON &&
        point.y >= rect.top - EPSILON && point.y <= rect.bottom + EPSILON;
}

function orientation(a, b, c) {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (Math.abs(value) <= EPSILON) return 0;
    return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
    return b.x <= Math.max(a.x, c.x) + EPSILON && b.x + EPSILON >= Math.min(a.x, c.x) &&
        b.y <= Math.max(a.y, c.y) + EPSILON && b.y + EPSILON >= Math.min(a.y, c.y);
}

function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && onSegment(a, c, b)) ||
        (o2 === 0 && onSegment(a, d, b)) ||
        (o3 === 0 && onSegment(c, a, d)) ||
        (o4 === 0 && onSegment(c, b, d));
}

export function routeIntersectsRect(points, value) {
    if (!Array.isArray(points) || points.length < 2) return false;
    const rect = normalizeSelectionRect(
        { x: value.left ?? value.x, y: value.top ?? value.y },
        { x: value.right ?? (value.x + value.width), y: value.bottom ?? (value.y + value.height) },
    );
    if (points.some(point => pointInRect(point, rect))) return true;
    const corners = [
        { x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
        { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom },
    ];
    for (let index = 0; index < points.length - 1; index++) {
        const a = points[index], b = points[index + 1];
        for (let edge = 0; edge < corners.length; edge++) {
            if (segmentsIntersect(a, b, corners[edge], corners[(edge + 1) % corners.length])) return true;
        }
    }
    return false;
}
