/**
 * Wire Path Utility — Generates SVG paths for wires between pins.
 *
 * Supports:
 *  - Smart routing: wires approach pins perpendicular to the component edge
 *  - Waypoint-based paths (user-adjustable control points)
 *  - Staggered parallel wires to avoid overlap
 *  - Smooth bezier fallback (for temp wires during wiring)
 */

const EXTENSION = 35; // How far wires extend from a pin before turning
const CORNER_RADIUS = 10;

// ─── Public API ──────────────────────────────────────────────

/**
 * Generate an SVG path between two points.
 *
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @param {object} options
 * @param {string} [options.style='smart'] - 'smart', 'orthogonal', or 'smooth'
 * @param {Array<{x,y}>} [options.waypoints=[]] - User waypoints
 * @param {string} [options.exitDir1='up'] - Pin 1 exit direction
 * @param {string} [options.exitDir2='up'] - Pin 2 exit direction
 * @param {number} [options.index=0] - Wire index for staggering
 */
export function wirePath(x1, y1, x2, y2, options = {}) {
    const {
        style = 'smart',
        waypoints = [],
        exitDir1 = 'up',
        exitDir2 = 'up',
        index = 0,
        stagger1,
        stagger2,
        sharp = false,
        mode = 'orthogonal',
    } = options;

    if (style === 'smooth') {
        return smoothPath(x1, y1, x2, y2);
    }

    if (waypoints.length > 0 || mode === 'freestyle') {
        return buildManualWirePath([
            { x: x1, y: y1 },
            ...waypoints,
            { x: x2, y: y2 },
        ], mode, sharp, { exitDir1, exitDir2 });
    }

    if (style === 'orthogonal') {
        return oldOrthogonalPath(x1, y1, x2, y2, index);
    }

    // Smart routing: approach each pin perpendicular to its component edge
    return smartRoute(x1, y1, exitDir1, x2, y2, exitDir2, index, stagger1, stagger2);
}

export function buildManualWirePath(points, mode = 'orthogonal', sharp = false, options = {}) {
    const normalized = mode === 'freestyle'
        ? cleanDuplicatePoints(points)
        : normalizeOrthogonalPoints(points, options);
    return buildPathThroughPoints(normalized, sharp);
}

export function getManualWirePoints(points, mode = 'orthogonal', options = {}) {
    return mode === 'freestyle'
        ? cleanDuplicatePoints(points)
        : normalizeOrthogonalPoints(points, options);
}

export function normalizeOrthogonalPoints(points, options = {}) {
    const input = cleanDuplicatePoints(points);
    if (input.length <= 1) return input;

    const result = [input[0]];
    let lastDir = axisFromExitDir(options.exitDir1);

    for (let i = 1; i < input.length; i++) {
        const target = input[i];
        const current = result[result.length - 1];
        const dx = target.x - current.x;
        const dy = target.y - current.y;

        if (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) {
            pushUniquePoint(result, target);
            lastDir = Math.abs(dx) < 0.5 ? 'v' : 'h';
            continue;
        }

        const isFinal = i === input.length - 1;
        const finalAxis = isFinal ? axisFromExitDir(options.exitDir2) : null;
        let firstAxis = lastDir ? oppositeAxis(lastDir) : 'h';

        if (i === 1 && axisFromExitDir(options.exitDir1)) {
            firstAxis = axisFromExitDir(options.exitDir1);
        }
        if (finalAxis) {
            firstAxis = oppositeAxis(finalAxis);
        }

        const elbow = firstAxis === 'h'
            ? { x: target.x, y: current.y }
            : { x: current.x, y: target.y };

        pushUniquePoint(result, elbow);
        pushUniquePoint(result, target);
        lastDir = firstAxis === 'h' ? 'v' : 'h';
    }

    return cleanCollinear(result);
}

function axisFromExitDir(dir) {
    if (dir === 'up' || dir === 'down') return 'v';
    if (dir === 'left' || dir === 'right') return 'h';
    return null;
}

function oppositeAxis(axis) {
    return axis === 'h' ? 'v' : 'h';
}

function cleanDuplicatePoints(points) {
    const result = [];
    for (const point of points) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        pushUniquePoint(result, point);
    }
    return result;
}

function pushUniquePoint(points, point) {
    const last = points[points.length - 1];
    if (!last || Math.abs(last.x - point.x) >= 0.5 || Math.abs(last.y - point.y) >= 0.5) {
        points.push({ x: point.x, y: point.y });
    }
}

// ─── Smart Routing (new) ─────────────────────────────────────

/**
 * Route a wire that exits perpendicularly from each pin's component edge.
 * This prevents wires from running along pin header rows.
 */
function smartRoute(x1, y1, dir1, x2, y2, dir2, index, s1, s2) {
    const stagger1 = s1 !== undefined ? s1 : (index % 5) * 6;
    const stagger2 = s2 !== undefined ? s2 : (index % 5) * 6;
    const ext1 = EXTENSION + stagger1;
    const ext2 = EXTENSION + stagger2;

    const extPt1 = extendPoint(x1, y1, dir1, ext1);
    const extPt2 = extendPoint(x2, y2, dir2, ext2);

    const midStagger = Math.max(stagger1, stagger2);
    const midPoints = connectExtensions(extPt1, extPt2, dir1, dir2, midStagger);

    const allPoints = [
        { x: x1, y: y1 },
        extPt1,
        ...midPoints,
        extPt2,
        { x: x2, y: y2 },
    ];

    const cleaned = cleanCollinear(allPoints);

    return buildPathThroughPoints(cleaned);
}

/**
 * Extend a point in the given direction.
 */
function extendPoint(x, y, dir, dist) {
    switch (dir) {
        case 'up':    return { x, y: y - dist };
        case 'down':  return { x, y: y + dist };
        case 'left':  return { x: x - dist, y };
        case 'right': return { x: x + dist, y };
        default:      return { x, y: y - dist };
    }
}

/**
 * Connect two extension points with orthogonal segments.
 * Returns intermediate waypoints (0-2 points).
 */
function connectExtensions(p1, p2, dir1, dir2, stagger = 0) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    // If they share an axis, no intermediate needed
    if (Math.abs(dx) < 4) return []; // vertically aligned
    if (Math.abs(dy) < 4) return []; // horizontally aligned

    // Determine whether to do an L-bend or a Z-bend
    const exits1V = (dir1 === 'up' || dir1 === 'down');
    const exits2V = (dir2 === 'up' || dir2 === 'down');

    if (exits1V && exits2V) {
        // Both exit vertically → connect with horizontal-then-vertical
        // Use the midY between them, adjusted by stagger to avoid overlaps
        const midY = (p1.y + p2.y) / 2 + stagger;
        return [
            { x: p1.x, y: midY },
            { x: p2.x, y: midY },
        ];
    }

    if (!exits1V && !exits2V) {
        // Both exit horizontally → connect with vertical
        // Use the midX between them, adjusted by stagger
        const midX = (p1.x + p2.x) / 2 + stagger;
        return [
            { x: midX, y: p1.y },
            { x: midX, y: p2.y },
        ];
    }

    // One vertical, one horizontal → single L-bend
    if (exits1V) {
        // p1 exits vertically, p2 exits horizontally
        return [{ x: p1.x, y: p2.y }];
    } else {
        // p1 exits horizontally, p2 exits vertically
        return [{ x: p2.x, y: p1.y }];
    }
}

// ─── Path Building ───────────────────────────────────────────

/**
 * Build an SVG path through a series of points with rounded corners.
 */
function buildPathThroughPoints(points, sharp = false) {
    if (points.length < 2) return '';
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    // Sharp mode: no rounded corners, just straight lines
    if (sharp) {
        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            path += ` L ${points[i].x} ${points[i].y}`;
        }
        return path;
    }

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];

        if (!next) {
            // Last point — straight line
            path += ` L ${curr.x} ${curr.y}`;
        } else {
            // Calculate corner radius (capped by segment lengths)
            const segLen1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
            const segLen2 = Math.hypot(next.x - curr.x, next.y - curr.y);
            const r = Math.min(CORNER_RADIUS, segLen1 / 2, segLen2 / 2);

            if (r < 1) {
                path += ` L ${curr.x} ${curr.y}`;
                continue;
            }

            // Direction vectors
            const len1 = segLen1 || 1;
            const len2 = segLen2 || 1;
            const dx1 = (curr.x - prev.x) / len1;
            const dy1 = (curr.y - prev.y) / len1;
            const dx2 = (next.x - curr.x) / len2;
            const dy2 = (next.y - curr.y) / len2;

            // Round corner
            const beforeX = curr.x - dx1 * r;
            const beforeY = curr.y - dy1 * r;
            const afterX = curr.x + dx2 * r;
            const afterY = curr.y + dy2 * r;

            path += ` L ${beforeX} ${beforeY}`;
            path += ` Q ${curr.x} ${curr.y}, ${afterX} ${afterY}`;
        }
    }

    return path;
}

/**
 * Remove collinear points (points on the same line between neighbors).
 */
function cleanCollinear(points) {
    if (points.length <= 2) return points;
    const result = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = points[i];
        const next = points[i + 1];

        // Skip if all three are on the same horizontal or vertical line
        const sameX = Math.abs(prev.x - curr.x) < 2 && Math.abs(curr.x - next.x) < 2;
        const sameY = Math.abs(prev.y - curr.y) < 2 && Math.abs(curr.y - next.y) < 2;

        if (!sameX && !sameY) {
            result.push(curr);
        }
    }

    result.push(points[points.length - 1]);
    return result;
}

// ─── Legacy Orthogonal Path ──────────────────────────────────

function oldOrthogonalPath(x1, y1, x2, y2, index = 0) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const stagger = index * 12;

    if (Math.abs(dy) < 4) return `M ${x1} ${y1} L ${x2} ${y2}`;
    if (Math.abs(dx) < 4) return `M ${x1} ${y1} L ${x2} ${y2}`;

    const maxR = Math.min(Math.abs(dx) / 2, Math.abs(dy) / 2, 12);
    const r = Math.max(3, maxR);
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;

    const midY = (y1 + y2) / 2 + stagger;
    return `M ${x1} ${y1} ` +
           `L ${x1} ${midY - r * sy} ` +
           `Q ${x1} ${midY}, ${x1 + r * sx} ${midY} ` +
           `L ${x2 - r * sx} ${midY} ` +
           `Q ${x2} ${midY}, ${x2} ${midY + r * sy} ` +
           `L ${x2} ${y2}`;
}

// ─── Smooth Bezier ───────────────────────────────────────────

function smoothPath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.max(30, Math.min(100, dist * 0.4));

    if (Math.abs(dy) > Math.abs(dx)) {
        const cpY1 = y1 + (dy > 0 ? offset : -offset);
        const cpY2 = y2 - (dy > 0 ? offset : -offset);
        return `M ${x1} ${y1} C ${x1} ${cpY1}, ${x2} ${cpY2}, ${x2} ${y2}`;
    } else {
        const cpX1 = x1 + (dx > 0 ? offset : -offset);
        const cpX2 = x2 - (dx > 0 ? offset : -offset);
        return `M ${x1} ${y1} C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2}`;
    }
}

// ─── Wire Color ──────────────────────────────────────────────

export const WIRE_COLORS = [
    '#4CAF50', // Green
    '#2196F3', // Blue
    '#FFEB3B', // Yellow
    '#FF9800', // Orange
    '#9C27B0', // Purple
    '#795548', // Brown
    '#FAFAFA', // White
    '#E91E63', // Pink
    '#00BCD4', // Cyan
    '#F44336', // Red (VCC)
    '#111111'  // GND (Black)
];

const SIGNAL_COLORS = WIRE_COLORS.slice(0, 9); // Exclude Red/GND

// Rotating index so each new signal wire gets a different colour (deterministic)
let _signalColorIndex = 0;

/**
 * Generate a wire color.
 *
 * @param {Array} signals   - Wokwi pin signals array (fallback detection)
 * @param {string} [pinType] - Optional PIN.* constant from auto-wire rules (takes priority)
 * @returns {string} CSS color string
 */
export function generateWireColor(signals, pinType) {
    // pinType from auto-wire rules takes priority — always deterministic
    if (pinType) {
        if (pinType === 'GND')    return '#111111';
        if (pinType === 'VCC')    return '#F44336';
        // Signal types get a rotating palette entry
        return SIGNAL_COLORS[(_signalColorIndex++) % SIGNAL_COLORS.length];
    }

    // Fallback: check wokwi signal metadata
    if (signals && signals.length > 0) {
        for (const sig of signals) {
            if (sig.signal === 'GND') return '#111111';
            if (sig.signal === 'VCC') return '#F44336';
        }
    }

    // Last resort: rotate through palette
    return SIGNAL_COLORS[(_signalColorIndex++) % SIGNAL_COLORS.length];
}

// Re-export for store usage
export function getObstacles(instances, excludeIds, getComponentDefFn) {
    const margin = 15;
    return instances
        .filter(inst => !excludeIds.includes(inst.id))
        .map(inst => {
            const def = getComponentDefFn(inst.componentId);
            const size = def?.size || { width: 80, height: 60 };
            return {
                left: inst.x - margin,
                top: inst.y - margin,
                right: inst.x + size.width + margin,
                bottom: inst.y + size.height + margin,
                cx: inst.x + size.width / 2,
                cy: inst.y + size.height / 2,
            };
        });
}
