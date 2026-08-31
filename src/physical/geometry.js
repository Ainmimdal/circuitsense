export const MM_PER_INCH = 25.4;
export const BREADBOARD_PITCH_MM = 2.54;

export function normalizeDegrees(value = 0) {
    const normalized = ((Number(value) % 360) + 360) % 360;
    return Math.abs(normalized) < 1e-9 ? 0 : normalized;
}

export function rotatePoint(point, degrees = 0) {
    const radians = normalizeDegrees(degrees) * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return {
        x: point.x * cosine - point.y * sine,
        y: point.x * sine + point.y * cosine,
    };
}

export function applyTransform(point, transform = {}) {
    const rotated = rotatePoint(point, transform.rotation || 0);
    return {
        x: rotated.x + Number(transform.x || 0),
        y: rotated.y + Number(transform.y || 0),
    };
}

export function invertTransform(point, transform = {}) {
    return rotatePoint({
        x: point.x - Number(transform.x || 0),
        y: point.y - Number(transform.y || 0),
    }, -Number(transform.rotation || 0));
}

export function composeTransforms(parent = {}, child = {}) {
    const childOrigin = applyTransform({ x: child.x || 0, y: child.y || 0 }, parent);
    return {
        x: childOrigin.x,
        y: childOrigin.y,
        rotation: normalizeDegrees(Number(parent.rotation || 0) + Number(child.rotation || 0)),
    };
}

export function worldToScreen(point, camera = {}) {
    const pixelsPerMillimetre = Number(camera.pixelsPerMillimetre || 1);
    const zoom = Number(camera.zoom || 1);
    return {
        x: Number(camera.panX || 0) + point.x * pixelsPerMillimetre * zoom,
        y: Number(camera.panY || 0) + point.y * pixelsPerMillimetre * zoom,
    };
}

export function screenToWorld(point, camera = {}) {
    const scale = Number(camera.pixelsPerMillimetre || 1) * Number(camera.zoom || 1);
    return {
        x: (point.x - Number(camera.panX || 0)) / scale,
        y: (point.y - Number(camera.panY || 0)) / scale,
    };
}

export function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointsEqual(a, b, epsilon = 1e-6) {
    return Boolean(a && b && Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon);
}

