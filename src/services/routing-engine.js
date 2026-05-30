/**
 * Routing Engine — Deterministic Structural Layout Generator
 *
 * Implements a strict 7-step deterministic pipeline:
 * 1. Fan-out escape phase (no early grid snapping)
 * 2. Net classification
 * 3. Bundle formation
 * 4. Fixed routing structure (top/mid/bottom zones)
 * 5. Abstract route planning & Geometry rendering
 * 6. Deterministic local repair (NO pathfinding algorithms allowed)
 * 7. Structure locking (stability)
 */

import { store } from '../store.js';
import { getComponentDef } from '../component-library.js';

const GRID = 10;
const ESCAPE_DISTANCE = 30;

// ─── Step 2: Net Classification ─────────────────────────────
const NET = { POWER: 0, GROUND: 1, I2C: 2, SIGNAL: 3 };

function classifyNet(pinName) {
    const name = pinName.toUpperCase();
    if (name.includes('VCC') || name.includes('5V') || name.includes('3.3V') || name.includes('VDD')) return NET.POWER;
    if (name.includes('GND') || name.includes('VSS')) return NET.GROUND;
    if (name.includes('SDA') || name.includes('SCL')) return NET.I2C;
    return NET.SIGNAL;
}

// ─── Step 1: Escape Phase ───────────────────────────────────
function computeEscapePoint(pinPos, exitDir, dist) {
    let dx = 0, dy = 0;
    if (exitDir === 'up') dy = -dist;
    if (exitDir === 'down') dy = dist;
    if (exitDir === 'left') dx = -dist;
    if (exitDir === 'right') dx = dist;
    return { x: pinPos.x + dx, y: pinPos.y + dy };
}

// ─── Grid Helpers ───────────────────────────────────────────
function snap(v) {
    return Math.round(v / GRID) * GRID;
}

function cleanCollinear(points) {
    if (points.length <= 2) return points;
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = points[i];
        const next = points[i + 1];
        const sameX = Math.abs(prev.x - curr.x) < 2 && Math.abs(curr.x - next.x) < 2;
        const sameY = Math.abs(prev.y - curr.y) < 2 && Math.abs(curr.y - next.y) < 2;
        if (!sameX && !sameY) result.push(curr);
    }
    result.push(points[points.length - 1]);
    return result;
}

// ─── Component Bounds ───────────────────────────────────────
function getObstacles() {
    const rects = [];
    for (const inst of store.instances) {
        const def = getComponentDef(inst.componentId);
        if (!def) continue;
        const size = def.size || { width: 80, height: 60 };
        const margin = 10;
        rects.push({
            left: inst.x - margin,
            right: inst.x + size.width + margin,
            top: inst.y - margin,
            bottom: inst.y + size.height + margin
        });
    }
    return rects;
}

function segmentCrossesObstacles(p1, p2, obstacles) {
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    
    for (const obs of obstacles) {
        if (maxX > obs.left && minX < obs.right &&
            maxY > obs.top && minY < obs.bottom) {
            return true;
        }
    }
    return false;
}

// ─── Step 6: Deterministic Local Repair ─────────────────────
function repairSegment(p1, p2, obstacles, existingSegments) {
    // Operations: shift segment by 1 grid unit up/down/left/right
    let dogleg1 = { ...p1 };
    let dogleg2 = { ...p2 };

    let isHorizontal = (p1.y === p2.y);
    
    // Check conflicts (obstacles + parallel overlap)
    const hasConflict = () => {
        if (segmentCrossesObstacles(dogleg1, dogleg2, obstacles)) return true;
        
        // Check exact overlap with existing segments
        for (const seg of existingSegments) {
            if (isHorizontal && seg.p1.y === seg.p2.y && seg.p1.y === dogleg1.y) {
                if (Math.max(dogleg1.x, dogleg2.x) >= Math.min(seg.p1.x, seg.p2.x) &&
                    Math.min(dogleg1.x, dogleg2.x) <= Math.max(seg.p1.x, seg.p2.x)) {
                    return true;
                }
            } else if (!isHorizontal && seg.p1.x === seg.p2.x && seg.p1.x === dogleg1.x) {
                if (Math.max(dogleg1.y, dogleg2.y) >= Math.min(seg.p1.y, seg.p2.y) &&
                    Math.min(dogleg1.y, dogleg2.y) <= Math.max(seg.p1.y, seg.p2.y)) {
                    return true;
                }
            }
        }
        return false;
    };

    if (!hasConflict()) return [dogleg1, dogleg2];

    // Try shifting by GRID units
    for (let shift = GRID; shift <= GRID * 5; shift += GRID) {
        // Try positive shift
        if (isHorizontal) {
            dogleg1.y = p1.y + shift; dogleg2.y = p2.y + shift;
        } else {
            dogleg1.x = p1.x + shift; dogleg2.x = p2.x + shift;
        }
        if (!hasConflict()) return [dogleg1, dogleg2];

        // Try negative shift
        if (isHorizontal) {
            dogleg1.y = p1.y - shift; dogleg2.y = p2.y - shift;
        } else {
            dogleg1.x = p1.x - shift; dogleg2.x = p2.x - shift;
        }
        if (!hasConflict()) return [dogleg1, dogleg2];
    }
    
    // If repair fails, return original (will overlap but better than chaotic routing)
    return [p1, p2];
}

// ─── Doubt Handling (Async Event) ───────────────────────────
async function askClarification(question, options, context) {
    return new Promise(resolve => {
        store.dispatchEvent(new CustomEvent('needsClarification', {
            detail: { question, options, context, resolve }
        }));
    });
}

// ─── Step 5: Abstract Route Planning & Geometry Rendering ───
function routeToZone(escPoint, targetZoneY, instId) {
    const inst = store.getInstance(instId);
    if (!inst) return [];
    const def = getComponentDef(inst.componentId);
    const size = def?.size || { width: 80, height: 60 };
    const margin = 20;
    const bounds = {
        left: snap(inst.x - margin),
        right: snap(inst.x + size.width + margin),
        top: snap(inst.y - margin),
        bottom: snap(inst.y + size.height + margin)
    };

    const directMinY = Math.min(escPoint.y, targetZoneY);
    const directMaxY = Math.max(escPoint.y, targetZoneY);

    // Check if direct vertical line from escape point to zone crosses the component body
    const crossesComponent = (escPoint.x >= bounds.left && escPoint.x <= bounds.right) &&
                             (directMaxY > bounds.top && directMinY < bounds.bottom);

    if (!crossesComponent) return [];

    // Detour to the nearest side
    const distLeft = Math.abs(escPoint.x - bounds.left);
    const distRight = Math.abs(escPoint.x - bounds.right);
    const sideX = (distLeft < distRight) ? bounds.left : bounds.right;

    return [
        { x: sideX, y: escPoint.y },
        { x: sideX, y: targetZoneY }
    ];
}

const structureCache = new Map();

export function clearRoutingCache() {
    structureCache.clear();
}

export async function routeAll() {
    if (store.wires.length === 0) return { routed: 0, failed: 0, errors: [] };

    const errors = [];
    let routed = 0;

    // Step 4: Fixed Routing Structure boundaries
    let minY = Infinity, maxY = -Infinity;
    for (const inst of store.instances) {
        const def = getComponentDef(inst.componentId);
        const h = def?.size?.height || 60;
        if (inst.y < minY) minY = inst.y;
        if (inst.y + h > maxY) maxY = inst.y + h;
    }

    const ZONES = {
        top: snap(minY - 80),
        middle: snap(maxY + 40),
        bottom: snap(maxY + 80),
    };

    const obstacles = getObstacles();
    const routedSegments = [];
    const bundles = new Map();

    // Step 2 & 3: Classify & Bundle Formation
    for (const wire of store.wires) {
        wire._netType = classifyNet(wire.from.pinName);
        const ids = [wire.from.instanceId, wire.to.instanceId].sort();
        const bKey = `${ids[0]}_${ids[1]}`;
        if (!bundles.has(bKey)) bundles.set(bKey, []);
        bundles.get(bKey).push(wire);
    }

    // Sort bundles by X position to minimize crossings when fanning out
    for (const wireList of bundles.values()) {
        wireList.sort((a, b) => {
            const pA1 = store.getPinAbsolutePosition(a.from.instanceId, a.from.pinName) || {x:0};
            const pB1 = store.getPinAbsolutePosition(b.from.instanceId, b.from.pinName) || {x:0};
            return pA1.x - pB1.x;
        });
    }

    // Sort: Power, Ground, I2C, Signal
    const wiresToRoute = [...store.wires].sort((a, b) => a._netType - b._netType);

    const midY = (minY + maxY) / 2;

    for (const wire of wiresToRoute) {
        const fromPos = store.getPinAbsolutePosition(wire.from.instanceId, wire.from.pinName);
        const toPos = store.getPinAbsolutePosition(wire.to.instanceId, wire.to.pinName);
        if (!fromPos || !toPos) {
            errors.push(`Wire ${wire.id}: cannot resolve pin positions`);
            continue;
        }

        // Check Stability / Structure Cache
        let cached = structureCache.get(wire.id);
        
        let exitDir1 = store.getPinExitDirection(wire.from.instanceId, wire.from.pinName);
        let exitDir2 = store.getPinExitDirection(wire.to.instanceId, wire.to.pinName);
        
        // Step 4: Lane / Zone Assignment using Manhattan Cost Function
        const inst1 = store.getInstance(wire.from.instanceId);
        const inst2 = store.getInstance(wire.to.instanceId);
        const def1 = getComponentDef(inst1.componentId);
        const def2 = getComponentDef(inst2.componentId);
        
        const top1 = inst1.y;
        const bot1 = inst1.y + (def1?.size?.height || 60);
        const top2 = inst2.y;
        const bot2 = inst2.y + (def2?.size?.height || 60);

        const localMinY = Math.min(top1, top2);
        const localMaxY = Math.max(bot1, bot2);
        
        const searchMinX = Math.min(fromPos.x, toPos.x) - 40;
        const searchMaxX = Math.max(fromPos.x, toPos.x) + 40;

        // Helper to find a safe horizontal corridor
        const getSafeZone = (startY, isTop) => {
            let safeY = snap(startY);
            let conflict = true;
            let attempts = 0;
            while (conflict && attempts < 50) {
                conflict = false;
                for (const obs of obstacles) {
                    if (searchMaxX > obs.left && searchMinX < obs.right) {
                        if (safeY >= obs.top - 10 && safeY <= obs.bottom + 10) {
                            conflict = true;
                            safeY += isTop ? -GRID : GRID;
                            break;
                        }
                    }
                }
                attempts++;
            }
            return safeY;
        };

        const safeTopZoneY = getSafeZone(localMinY - 40, true);
        const safeBottomZoneY = getSafeZone(localMaxY + 40, false);

        // Calculate a Middle Zone candidate between the two components
        let midY_candidate;
        if (bot1 < top2) midY_candidate = (bot1 + top2) / 2;
        else if (bot2 < top1) midY_candidate = (bot2 + top1) / 2;
        else midY_candidate = (snappedEsc1.y + snappedEsc2.y) / 2;

        const isMostlyVertical = Math.abs(snappedEsc1.x - snappedEsc2.x) <= 40;
        if (isMostlyVertical) {
            // Push the horizontal jog closer to the lower component so it doesn't float in the middle
            if (bot1 < top2) midY_candidate = top2 - 40;
            else if (bot2 < top1) midY_candidate = top1 - 40;
        }

        const safeMidZoneY = getSafeZone(midY_candidate, true);

        // Step 1: Escape Phase (pre-computed here for cost analysis)
        const esc1 = computeEscapePoint(fromPos, exitDir1, ESCAPE_DISTANCE);
        const esc2 = computeEscapePoint(toPos, exitDir2, ESCAPE_DISTANCE);
        const snappedEsc1 = { x: snap(esc1.x), y: snap(esc1.y) };
        const snappedEsc2 = { x: snap(esc2.x), y: snap(esc2.y) };

        // Evaluate routing cost for a candidate zone
        const evaluateCost = (zoneY) => {
            const detour1 = routeToZone(snappedEsc1, zoneY, inst1.id);
            const detour2 = routeToZone(snappedEsc2, zoneY, inst2.id);
            const penalty1 = detour1.length > 0 ? (def1?.size?.width || 80) + (def1?.size?.height || 60) : 0;
            const penalty2 = detour2.length > 0 ? (def2?.size?.width || 80) + (def2?.size?.height || 60) : 0;
            const dist = Math.abs(snappedEsc1.y - zoneY) + Math.abs(snappedEsc2.y - zoneY);
            return dist + penalty1 + penalty2;
        };

        const costTop = evaluateCost(safeTopZoneY);
        const costBottom = evaluateCost(safeBottomZoneY);
        const costMid = evaluateCost(safeMidZoneY);

        let targetZoneY = safeMidZoneY;
        let minCost = costMid;
        
        if (costTop < minCost) { targetZoneY = safeTopZoneY; minCost = costTop; }
        if (costBottom < minCost) { targetZoneY = safeBottomZoneY; minCost = costBottom; }
        
        const isTopHalf = (targetZoneY === safeTopZoneY || targetZoneY < midY_candidate);

        // Step 7: Structure Locking Check
        if (cached && cached.valid) {
            // Re-use locked structural choices
            exitDir1 = cached.exitDir1;
            exitDir2 = cached.exitDir2;
            targetZoneY = cached.targetZoneY;
        } else {
            structureCache.set(wire.id, {
                valid: true,
                exitDir1,
                exitDir2,
                targetZoneY
            });
        }

        // Bundle stagger margin
        const ids = [wire.from.instanceId, wire.to.instanceId].sort();
        const bundleList = bundles.get(`${ids[0]}_${ids[1]}`);
        let bundleIndex = bundleList.findIndex(w => w.id === wire.id);

        // Smart stagger direction to prevent bundle crossings
        const isLeftToRight = (toPos.x > fromPos.x);
        if (isLeftToRight) {
            bundleIndex = bundleList.length - 1 - bundleIndex;
        }

        const staggerOffset = bundleIndex * GRID;

        // Ensure stagger expands away from the local components
        const adjustedZoneY = isTopHalf 
            ? targetZoneY - staggerOffset 
            : targetZoneY + staggerOffset;

        // Route around parent components if needed to reach the zone
        const detour1 = routeToZone(snappedEsc1, adjustedZoneY, wire.from.instanceId);
        const pZone1 = detour1.length > 0 ? { x: detour1[1].x, y: adjustedZoneY } : { x: snappedEsc1.x, y: adjustedZoneY };

        const detour2 = routeToZone(snappedEsc2, adjustedZoneY, wire.to.instanceId);
        const pZone2 = detour2.length > 0 ? { x: detour2[1].x, y: adjustedZoneY } : { x: snappedEsc2.x, y: adjustedZoneY };

        // Step 6: Local Repair on the main trunk
        // If the main horizontal trunk segment has conflicts, repair it deterministically
        const [repZone1, repZone2] = repairSegment(pZone1, pZone2, obstacles, routedSegments);

        // Build final path
        let waypoints = [
            fromPos,
            esc1,
            snappedEsc1
        ];

        if (detour1.length > 0) waypoints.push(...detour1);
        waypoints.push(repZone1, repZone2);
        if (detour2.length > 0) {
            waypoints.push({ x: detour2[1].x, y: detour2[1].y });
            waypoints.push({ x: detour2[0].x, y: detour2[0].y });
        }
        waypoints.push(snappedEsc2, esc2, toPos);

        // Clean collinear points to remove unnecessary doglegs
        waypoints = cleanCollinear(waypoints);

        // Record segments for conflict avoidance of next wires
        for (let i = 0; i < waypoints.length - 1; i++) {
            routedSegments.push({ p1: waypoints[i], p2: waypoints[i+1] });
        }

        // Exclude the actual pin positions from stored waypoints (canvas handles the first/last draw)
        wire.waypoints = waypoints.slice(1, waypoints.length - 1);
        routed++;
    }

    store._pushHistory();
    store._notifyStructural();
    return { routed, failed: errors.length, errors };
}
