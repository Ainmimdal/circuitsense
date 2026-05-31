/**
 * CircuitSense Store — Reactive state management for the circuit editor.
 *
 * Features:
 *  - Undo/redo history (Ctrl+Z / Ctrl+Y)
 *  - localStorage auto-save (debounced)
 *  - Grid snapping (20px grid)
 *  - Anti-overlap collision detection (toggleable)
 *  - Wire waypoints (draggable control points)
 *  - Wire cleanup (obstacle-aware auto-routing)
 *  - Component selection (for delete key, click-to-highlight)
 *  - Viewport state (scale + pan, shared with canvas)
 *  - Structural vs cosmetic change events (for efficient validation)
 */
import { getComponentDef } from './component-library.js';
import { generateWireColor } from './utils/wire-path.js';
import { PIN_ALIASES } from './component-library.js';
import { routeAll, clearRoutingCache } from './services/routing-engine.js';

function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

class CircuitStore extends EventTarget {
    constructor() {
        super();
        /** @type {Array<{id: string, componentId: string, x: number, y: number}>} */
        this.instances = [];
        /** @type {Array<{id: string, from: {instanceId: string, pinName: string}, to: {instanceId: string, pinName: string}}>} */
        this.wires = [];
        /** @type {Map<string, Array<{name: string, x: number, y: number, signals: Array}>>} */
        this.pinInfoMap = new Map();
        /** @type {null | {instanceId: string, pinName: string}} */
        this.wiringState = null;
        /** @type {{x: number, y: number}} */
        this.mousePos = { x: 0, y: 0 };
        this._nextId = 1;

        // Selection
        /** @type {Set<string>} */
        this.selectedInstanceIds = new Set();
        /** @type {string | null} */
        this.selectedWireId = null;

        // Viewport (shared with canvas for coordinate conversions)
        this.viewport = { scale: 1, panX: 0, panY: 0 };

        // Grid (10px matches 0.1-inch standard breadboard / Arduino header spacing)
        this.gridSize = 10;

        // Anti-overlap toggle (on by default)
        this.antiOverlap = true;

        // Fan-out toggle (on by default)
        this.fanOut = true;

        // Sharp wire corners toggle (off by default = rounded)
        this.sharpCorners = false;

        // Undo/redo history
        this._history = [];
        this._historyIndex = -1;
        this._maxHistory = 50;

        // Auto-save debounce timer
        this._saveTimer = null;

        // Load any saved project
        this._loadFromStorage();
    }

    // ——— Grid Snap ————————————————————————————————————
    snapToGrid(value) {
        return Math.round(value / this.gridSize) * this.gridSize;
    }

    /**
     * Snap component position so its anchor point aligns to the grid.
     * @param {number} x - desired top-left X
     * @param {number} y - desired top-left Y
     * @param {{x:number, y:number}} anchor — offset of the reference pin from top-left
     */
    snapWithAnchor(x, y, anchor = { x: 0, y: 0 }) {
        const ax = x + anchor.x;
        const ay = y + anchor.y;
        const sax = this.snapToGrid(ax);
        const say = this.snapToGrid(ay);
        return { x: sax - anchor.x, y: say - anchor.y };
    }

    setGridSize(size) {
        const valid = [10, 20, 50];
        if (!valid.includes(size)) return;
        this.gridSize = size;
        this._notify();
    }

    get gridSizeLabel() {
        return this.gridSize + 'px';
    }

    toggleAntiOverlap() {
        this.antiOverlap = !this.antiOverlap;
        this._notify();
    }

    toggleFanOut() {
        this.fanOut = !this.fanOut;
        this._notify();
        this._notifyStructural();
    }

    toggleSharpCorners() {
        this.sharpCorners = !this.sharpCorners;
        this._notify();
    }

    // ——— Anti-Overlap Collision Detection ————————————————
    /**
     * Find the nearest non-overlapping position for a component.
     * @param {string} instanceId — the component being placed/moved
     * @param {number} x — desired X
     * @param {number} y — desired Y
     * @param {number} depth — recursion guard
     * @returns {{x: number, y: number}}
     */
    resolveOverlap(instanceId, x, y, depth = 0) {
        if (depth > 8) return { x, y }; // Safety: stop after 8 nudges

        const inst = this.getInstance(instanceId);
        if (!inst) return { x, y };

        const def = getComponentDef(inst.componentId);

        const getRotatedSize = (compInst, compDef) => {
            const rot = compInst.rotation || 0;
            const w = compDef?.size?.width || 80;
            const h = compDef?.size?.height || 60;
            return (rot === 90 || rot === 270) ? { width: h, height: w } : { width: w, height: h };
        };

        const size = getRotatedSize(inst, def);
        const gap = this.gridSize; // 20px gap between components

        const box = {
            left: x,
            top: y,
            right: x + size.width,
            bottom: y + size.height,
        };

        for (const other of this.instances) {
            if (other.id === instanceId) continue;

            const otherDef = getComponentDef(other.componentId);
            const otherSize = getRotatedSize(other, otherDef);
            const otherBox = {
                left: other.x - gap,
                top: other.y - gap,
                right: other.x + otherSize.width + gap,
                bottom: other.y + otherSize.height + gap,
            };

            // Check overlap (with gap)
            if (box.left < otherBox.right && box.right > otherBox.left &&
                box.top < otherBox.bottom && box.bottom > otherBox.top) {

                // Try 4 nudge directions, pick the shortest move
                const nudges = [
                    { x: other.x + otherSize.width + gap, y }, // right
                    { x, y: other.y + otherSize.height + gap }, // below
                    { x: other.x - size.width - gap, y },      // left
                    { x, y: other.y - size.height - gap },      // above
                ];

                // Sort by distance from original position
                nudges.sort((a, b) => {
                    const da = Math.abs(a.x - x) + Math.abs(a.y - y);
                    const db = Math.abs(b.x - x) + Math.abs(b.y - y);
                    return da - db;
                });

                const best = nudges[0];
                const snapped = {
                    x: this.snapToGrid(best.x),
                    y: this.snapToGrid(best.y),
                };
                return this.resolveOverlap(instanceId, snapped.x, snapped.y, depth + 1);
            }
        }

        return { x, y }; // No overlap
    }

    // ——— Instance Management ———————————————————————————
    addInstance(componentId, x, y) {
        const def = getComponentDef(componentId);
        const anchor = def?.snapAnchor || { x: 0, y: 0 };
        const snapped = this.snapWithAnchor(x, y, anchor);
        let sx = snapped.x;
        let sy = snapped.y;

        const instance = {
            id: `inst_${this._nextId++}`,
            componentId,
            x: sx,
            y: sy,
            rotation: 0,
        };
        this.instances = [...this.instances, instance];

        // Resolve overlap after adding
        if (this.antiOverlap) {
            const resolved = this.resolveOverlap(instance.id, sx, sy);
            instance.x = resolved.x;
            instance.y = resolved.y;
        }

        this.selectedInstanceIds = new Set([instance.id]);
        this._pushHistory();
        this._notifyStructural();
        return instance;
    }

    moveInstance(id, x, y) {
        const inst = this.instances.find(i => i.id === id);
        if (inst) {
            const def = getComponentDef(inst.componentId);
            const anchor = def?.snapAnchor || { x: 0, y: 0 };
            inst.x = this.snapToGrid(x + anchor.x) - anchor.x;
            inst.y = this.snapToGrid(y + anchor.y) - anchor.y;
            this._notify(); // lightweight — no history during drag
        }
    }

    /** Call on pointerup after a drag to commit history + save */
    moveInstanceDone(id) {
        if (this.antiOverlap && id) {
            const inst = this.getInstance(id);
            if (inst) {
                const resolved = this.resolveOverlap(id, inst.x, inst.y);
                inst.x = resolved.x;
                inst.y = resolved.y;
            }
        }
        this._pushHistory();
        this._notifyStructural();
    }

    removeInstance(id) {
        this.instances = this.instances.filter(i => i.id !== id);
        this.wires = this.wires.filter(
            w => w.from.instanceId !== id && w.to.instanceId !== id
        );
        
        // Do NOT delete from pinInfoMap, as we need it if the user undoes the deletion.
        this.selectedInstanceIds.delete(id);
        this._pushHistory();
        this._notifyStructural();
    }

    getInstance(id) {
        return this.instances.find(i => i.id === id);
    }

    rotateInstance(id) {
        const inst = this.getInstance(id);
        if (inst) {
            inst.rotation = ((inst.rotation || 0) + 90) % 360;
            
            // Adjust overlap if it now hits something
            if (this.antiOverlap) {
                const resolved = this.resolveOverlap(id, inst.x, inst.y);
                inst.x = resolved.x;
                inst.y = resolved.y;
            }
            
            this._pushHistory();
            this._notifyStructural();
        }
    }

    // ——— Selection ————————————————————————————————————
    /** Select a single instance (replaces current selection unless Ctrl/Cmd). */
    selectInstance(id, addToSelection = false) {
        if (addToSelection) {
            if (this.selectedInstanceIds.has(id)) {
                this.selectedInstanceIds.delete(id);
            } else {
                this.selectedInstanceIds = new Set([...this.selectedInstanceIds, id]);
            }
        } else {
            this.selectedInstanceIds = new Set([id]);
        }
        this.selectedWireId = null;
        this._notify();
    }

    /** Select multiple instances at once (replace current). */
    selectInstances(ids) {
        this.selectedInstanceIds = new Set(ids);
        this.selectedWireId = null;
        this._notify();
    }

    selectAllInstances() {
        this.selectedInstanceIds = new Set(this.instances.map(i => i.id));
        this.selectedWireId = null;
        this._notify();
    }

    isInstanceSelected(id) {
        return this.selectedInstanceIds.has(id);
    }

    clearSelection() {
        if (this.selectedInstanceIds.size > 0 || this.selectedWireId !== null) {
            this.selectedInstanceIds = new Set();
            this.selectedWireId = null;
            this._notify();
        }
    }

    selectWire(id) {
        this.selectedWireId = id;
        this.selectedInstanceIds = new Set();
        this._notify();
    }

    deleteSelected() {
        if (this.selectedInstanceIds.size > 0) {
            const ids = [...this.selectedInstanceIds];
            for (const id of ids) {
                this.removeInstance(id);
            }
            this.selectedInstanceIds = new Set();
        } else if (this.selectedWireId) {
            this.removeWire(this.selectedWireId);
            this.selectedWireId = null;
        }
    }

    // ——— Pin Info ——————————————————————————————————————
    registerPinInfo(instanceId, pinInfo) {
        this.pinInfoMap.set(instanceId, pinInfo);
        
        // Dynamically update snapAnchor based on actual SVG pins.
        // This guarantees that when users drag components, the PINS snap to the grid, not the top-left corners.
        const inst = this.getInstance(instanceId);
        if (inst && pinInfo && pinInfo.length > 0) {
            const def = getComponentDef(inst.componentId);
            if (def && !def.snapAnchor) {
                let anchorPin = pinInfo.find(p => p.name === 'GND.1' || p.name === 'GND');
                if (!anchorPin) anchorPin = pinInfo.find(p => p.name === 'A' || p.name === 'VCC');
                if (!anchorPin) anchorPin = pinInfo[0];
                
                if (anchorPin) {
                    def.snapAnchor = { x: anchorPin.x, y: anchorPin.y };
                    
                    // Immediately re-snap this instance so it snaps perfectly upon first load
                    if (!inst.rotation || inst.rotation === 0) {
                        const nx = this.snapToGrid(inst.x + anchorPin.x) - anchorPin.x;
                        const ny = this.snapToGrid(inst.y + anchorPin.y) - anchorPin.y;
                        
                        if (nx !== inst.x || ny !== inst.y) {
                            inst.x = nx;
                            inst.y = ny;
                            this._notifyStructural();
                        }
                    }
                }
            }
        }
        this._notify(); // Force re-render of canvas so wires appear after load
    }

    getPinAbsolutePosition(instanceId, pinName) {
        const inst = this.getInstance(instanceId);
        if (!inst) return null;
        const pinInfo = this.pinInfoMap.get(instanceId);
        if (!pinInfo) return null;
        const resolvedName = this.resolvePinName(pinInfo, pinName);
        const pin = pinInfo.find(p => p.name === resolvedName);
        if (!pin) return null;
        
        const rotation = inst.rotation || 0;
        let baseX, baseY;
        
        if (rotation === 0) {
            baseX = inst.x + pin.x;
            baseY = inst.y + pin.y;
        } else {
            const def = getComponentDef(inst.componentId);
            const width = def?.size?.width || 80;
            const height = def?.size?.height || 60;
            
            const cx = width / 2;
            const cy = height / 2;
            const dx = pin.x - cx;
            const dy = pin.y - cy;
            
            let rx, ry;
            switch (rotation) {
                case 90: rx = -dy; ry = dx; break;
                case 180: rx = -dx; ry = -dy; break;
                case 270: rx = dy; ry = -dx; break;
                default: rx = dx; ry = dy;
            }

            baseX = inst.x + cx + rx;
            baseY = inst.y + cy + ry;
        }

        return {
            x: baseX,
            y: baseY,
        };
    }

    /**
     * Resolve a logical pin name against the actual pinInfo array.
     * Tries the exact name first, then checks PIN_ALIASES.
     * E.g. 'VCC' will match a pin named 'VDD' if the alias exists.
     */
    resolvePinName(pinInfo, pinName) {
        // Exact match first
        if (pinInfo.find(p => p.name === pinName)) return pinName;
        // Try alias: is pinName an alias for something in pinInfo?
        const canonical = PIN_ALIASES[pinName];
        if (canonical && pinInfo.find(p => p.name === canonical)) return canonical;
        // Try reverse: does pinInfo have a pin whose name is aliased to pinName?
        for (const p of pinInfo) {
            if (PIN_ALIASES[p.name] === pinName) return p.name;
        }
        return pinName; // fallback — let caller deal with null
    }

    getPinSignals(instanceId, pinName) {
        const pinInfo = this.pinInfoMap.get(instanceId);
        if (!pinInfo) return [];
        const resolvedName = this.resolvePinName(pinInfo, pinName);
        const pin = pinInfo.find(p => p.name === resolvedName);
        return (pin && pin.signals) || [];
    }

    /**
     * Determine which edge of the component a pin exits from.
     * Returns 'up', 'down', 'left', or 'right'.
     *
     * Checks component def's pinExitOverride first (for components like resistors
     * whose wokwi pins exit horizontally), then falls back to geometric detection.
     */
    getPinExitDirection(instanceId, pinName) {
        const inst = this.getInstance(instanceId);
        if (!inst) return 'up';
        const pinInfo = this.pinInfoMap.get(instanceId);
        if (!pinInfo || pinInfo.length === 0) return 'up';

        const resolvedName = this.resolvePinName(pinInfo, pinName);
        const pin = pinInfo.find(p => p.name === resolvedName);
        if (!pin) return 'up';

        // Compute actual bounding box from ALL pin positions
        let maxX = 0, maxY = 0;
        for (const p of pinInfo) {
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        // Add small margin so edge pins aren't at exactly 0 distance
        const width = maxX + 5;
        const height = maxY + 5;

        const distTop = pin.y;
        const distBottom = height - pin.y;
        const distLeft = pin.x;
        const distRight = width - pin.x;

        const min = Math.min(distTop, distBottom, distLeft, distRight);
        let baseDir = 'up';
        
        // Check component-level exit direction override first
        const def = getComponentDef(inst.componentId);
        if (def && def.pinExitOverride && (def.pinExitOverride[resolvedName] || def.pinExitOverride[pinName])) {
            baseDir = def.pinExitOverride[resolvedName] || def.pinExitOverride[pinName];
        } else {
            if (min === distBottom) baseDir = 'down';
            else if (min === distLeft) baseDir = 'left';
            else if (min === distRight) baseDir = 'right';
        }

        const rotation = inst.rotation || 0;
        if (rotation === 0) return baseDir;

        const dirs = ['up', 'right', 'down', 'left'];
        const currentIdx = dirs.indexOf(baseDir);
        const newIdx = (currentIdx + (rotation / 90)) % 4;
        return dirs[newIdx];
    }

    /**
     * Compute per-edge stagger offsets for fan-out routing.
     * Groups wires sharing the same component edge and assigns
     * sequential stagger distances so wires fan out cleanly
     * from header rows.
     * @returns {{ s1: number, s2: number }}
     */
    getFanoutStagger(wireId) {
        if (!this.fanOut) return { s1: 0, s2: 0 };
        const wire = this.wires.find(w => w.id === wireId);
        if (!wire) return { s1: 0, s2: 0 };

        const dir1 = this.getPinExitDirection(wire.from.instanceId, wire.from.pinName);
        const dir2 = this.getPinExitDirection(wire.to.instanceId, wire.to.pinName);
        const key1 = `${wire.from.instanceId}|${dir1}`;
        const key2 = `${wire.to.instanceId}|${dir2}`;

        let idx1 = 0;
        let idx2 = 0;
        for (const w of this.wires) {
            if (w.id === wireId) break;
            const d1 = this.getPinExitDirection(w.from.instanceId, w.from.pinName);
            if (`${w.from.instanceId}|${d1}` === key1) idx1++;
            const d2 = this.getPinExitDirection(w.to.instanceId, w.to.pinName);
            if (`${w.to.instanceId}|${d2}` === key2) idx2++;
        }

        const SPACING = 8;
        return { s1: idx1 * SPACING, s2: idx2 * SPACING };
    }

    // ——— Wiring ———————————————————————————————————————
    startWiring(instanceId, pinName) {
        this.wiringState = { instanceId, pinName };
        this._notify();
    }

    completeWiring(instanceId, pinName) {
        if (!this.wiringState) return;
        // Clicking same pin cancels
        if (this.wiringState.instanceId === instanceId && this.wiringState.pinName === pinName) {
            this.cancelWiring();
            return;
        }
        const signals = this.getPinSignals(this.wiringState.instanceId, this.wiringState.pinName);
        const wire = {
            id: `wire_${this._nextId++}`,
            from: { ...this.wiringState },
            to: { instanceId, pinName },
            waypoints: [],
            color: generateWireColor(signals),
        };
        this.wires = [...this.wires, wire];
        this.wiringState = null;
        this._pushHistory();
        this._notifyStructural();
    }

    /**
     * Directly create a wire between two pins (used by auto-wire engine).
     * @param {string} pinType - Optional PIN.* type to force correct wire color
     */
    completeWiringDirect(fromInstanceId, fromPinName, toInstanceId, toPinName, pinType) {
        // Don't duplicate an existing wire
        const exists = this.wires.some(
            w => (w.from.instanceId === fromInstanceId && w.from.pinName === fromPinName &&
                    w.to.instanceId === toInstanceId && w.to.pinName === toPinName) ||
                (w.from.instanceId === toInstanceId && w.from.pinName === toPinName &&
                    w.to.instanceId === fromInstanceId && w.to.pinName === fromPinName)
        );
        if (exists) return;

        const signals = this.getPinSignals(fromInstanceId, fromPinName);
        const wire = {
            id: `wire_${this._nextId++}`,
            from: { instanceId: fromInstanceId, pinName: fromPinName },
            to: { instanceId: toInstanceId, pinName: toPinName },
            waypoints: [],
            color: generateWireColor(signals, pinType),
        };
        this.wires = [...this.wires, wire];
        this._notify(); // no individual history for batch auto-wires
    }

    /** Push history after a batch of auto-wires complete */
    commitAutoWire() {
        this._pushHistory();
        this._notifyStructural();
    }

    cancelWiring() {
        this.wiringState = null;
        this._notify();
    }

    /**
     * Remove all wires connected to specific logical pins on an instance.
     * Handles pin-name aliases (VDD↔VCC, VSS↔GND, etc.) so auto-wire can
     * cleanly re-wire regardless of wokwi naming quirks.
     */
    stripWiresForPins(instanceId, pinNames) {
        const pinInfo = this.pinInfoMap.get(instanceId);

        // Build the full set of pin names to strip: input names +
        // canonical forms + all alias variants present in pinInfo.
        const pinsToStrip = new Set(pinNames);
        if (pinInfo) {
            for (const name of pinNames) {
                const canonical = this.resolvePinName(pinInfo, name);
                pinsToStrip.add(canonical);
                // Walk pinInfo and include names that alias to/from the canonical
                for (const p of pinInfo) {
                    if (PIN_ALIASES[p.name] === canonical) pinsToStrip.add(p.name);
                    if (PIN_ALIASES[canonical] === p.name) pinsToStrip.add(p.name);
                }
            }
        }

        this.wires = this.wires.filter(w => {
            if (w.from.instanceId === instanceId && pinsToStrip.has(w.from.pinName)) return false;
            if (w.to.instanceId === instanceId && pinsToStrip.has(w.to.pinName)) return false;
            return true;
        });
        this._notify(); // Immediate visual update
    }

    removeWire(id) {
        this.wires = this.wires.filter(w => w.id !== id);
        this._pushHistory();
        this._notifyStructural();
    }

    changeWireColor(id, color) {
        const wire = this.wires.find(w => w.id === id);
        if (wire) {
            wire.color = color;
            this._pushHistory();
            this._notifyStructural();
        }
    }

    // ——— Wire Waypoints ——————————————————————————————————
    getWire(id) {
        return this.wires.find(w => w.id === id);
    }

    /**
     * Add a waypoint to a wire at the given position.
     * Inserts at the closest segment.
     */
    addWireWaypoint(wireId, x, y) {
        const wire = this.getWire(wireId);
        if (!wire) return;
        if (!wire.waypoints) wire.waypoints = [];

        const sx = this.snapToGrid(x);
        const sy = this.snapToGrid(y);

        // Get start/end points
        const from = this.getPinAbsolutePosition(wire.from.instanceId, wire.from.pinName);
        const to = this.getPinAbsolutePosition(wire.to.instanceId, wire.to.pinName);
        if (!from || !to) return;

        // Build full point list and find closest segment
        const pts = [from, ...wire.waypoints, to];
        let bestIdx = 0;
        let bestDist = Infinity;

        for (let i = 0; i < pts.length - 1; i++) {
            const d = distToSegment(sx, sy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }

        wire.waypoints.splice(bestIdx, 0, { x: sx, y: sy });
        this._pushHistory();
        this._notifyStructural();
    }

    moveWireWaypoint(wireId, wpIndex, x, y) {
        const wire = this.getWire(wireId);
        if (!wire || !wire.waypoints || !wire.waypoints[wpIndex]) return;
        wire.waypoints[wpIndex].x = this.snapToGrid(x);
        wire.waypoints[wpIndex].y = this.snapToGrid(y);
        this._notify();
    }

    moveWireWaypointDone() {
        this._pushHistory();
        this._notifyStructural();
    }

    deleteWireWaypoint(wireId, wpIndex) {
        const wire = this.getWire(wireId);
        if (!wire || !wire.waypoints) return;
        wire.waypoints.splice(wpIndex, 1);
        this._pushHistory();
        this._notifyStructural();
    }

    /**
     * Route All — Deterministic structural layout engine.
     * Rips up all wire waypoints and recomputes clean orthogonal paths
     * respecting structural zones, net grouping, and stability.
     * @returns {Promise<{ routed: number, failed: number, errors: string[] }>}
     */
    async cleanupWires() {
        clearRoutingCache();
        this.resetWireRouting();
        return await routeAll();
    }

    /** Clear all waypoints (reset wires to default routing) */
    resetWireRouting() {
        for (const wire of this.wires) {
            wire.waypoints = [];
        }
        this._pushHistory();
        this._notifyStructural();
    }

    // ——— Mouse —————————————————————————————————————————
    updateMousePos(x, y) {
        this.mousePos = { x, y };
        this.dispatchEvent(new CustomEvent('mousemove'));
    }

    // ——— Viewport ——————————————————————————————————————
    updateViewport(scale, panX, panY) {
        this.viewport = { scale, panX, panY };
    }

    /** Convert screen-relative coords (within canvas area) to world coords */
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.viewport.panX) / this.viewport.scale,
            y: (screenY - this.viewport.panY) / this.viewport.scale,
        };
    }

    // ——— Undo / Redo ——————————————————————————————————
    get canUndo() { return this._historyIndex > 0; }
    get canRedo() { return this._historyIndex < this._history.length - 1; }

    undo() {
        if (!this.canUndo) return false;
        this._historyIndex--;
        this._restoreSnapshot(this._history[this._historyIndex]);
        return true;
    }

    redo() {
        if (!this.canRedo) return false;
        this._historyIndex++;
        this._restoreSnapshot(this._history[this._historyIndex]);
        return true;
    }

    _pushHistory() {
        const snapshot = {
            instances: JSON.parse(JSON.stringify(this.instances)),
            wires: JSON.parse(JSON.stringify(this.wires)),
            _nextId: this._nextId,
        };
        // Remove any forward history (we branched off)
        this._history = this._history.slice(0, this._historyIndex + 1);
        this._history.push(snapshot);
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }
        this._historyIndex = this._history.length - 1;
    }

    _restoreSnapshot(snapshot) {
        this.instances = JSON.parse(JSON.stringify(snapshot.instances));
        this.wires = JSON.parse(JSON.stringify(snapshot.wires));
        this._nextId = snapshot._nextId || this._nextId;
        this.wiringState = null;
        this.selectedInstanceIds = new Set();
        this.selectedWireId = null;
        // Do NOT clear pinInfoMap here! If we undo a deletion, we need the cached pinInfo to render the restored wires.
        this._notifyStructural();
    }

    // ——— Persistence ——————————————————————————————————
    _scheduleSave() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._saveToStorage(), 500);
    }

    _saveToStorage() {
        try {
            const data = {
                instances: this.instances,
                wires: this.wires,
                _nextId: this._nextId,
                _savedAt: Date.now(),
            };
            localStorage.setItem('circuitsense_project', JSON.stringify(data));
        } catch (e) {
            console.warn('[CircuitSense] Save failed:', e);
        }
    }

    _loadFromStorage() {
        try {
            const raw = localStorage.getItem('circuitsense_project');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.instances) this.instances = data.instances;
            if (data.wires) this.wires = data.wires;
            if (data._nextId) this._nextId = data._nextId;
            this._pushHistory(); // initial state as first history entry
        } catch (e) {
            console.warn('[CircuitSense] Load failed:', e);
        }
    }

    exportProject() {
        return JSON.stringify({
            instances: this.instances,
            wires: this.wires,
            _nextId: this._nextId,
            version: '1.0'
        }, null, 2);
    }

    importProject(data) {
        if (!data) return false;
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            this.instances = parsed.instances || [];
            this.wires = parsed.wires || [];
            this._nextId = parsed._nextId || 1;
            
            this.pinInfoMap.clear();
            this.wiringState = null;
            this.selectedInstanceIds = new Set();
            this.selectedWireId = null;
            
            this._pushHistory();
            this._notifyStructural();
            return true;
        } catch (e) {
            console.error('Failed to import project:', e);
            return false;
        }
    }

    // ——— Cloud Account Simulation —————————————————————
    getSavedProjects() {
        try {
            const raw = localStorage.getItem('circuitsense_cloud_projects');
            return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
    }

    saveProjectToAccount(name) {
        const projects = this.getSavedProjects();
        const existing = projects.find(p => p.name === name);
        const data = {
            instances: this.instances,
            wires: this.wires,
            _nextId: this._nextId
        };
        
        if (existing) {
            existing.data = data;
            existing.updatedAt = Date.now();
        } else {
            projects.push({
                id: 'proj_' + Date.now(),
                name,
                updatedAt: Date.now(),
                data
            });
        }
        localStorage.setItem('circuitsense_cloud_projects', JSON.stringify(projects));
        this._notify(); // triggers UI update
    }

    loadProjectFromAccount(id) {
        const projects = this.getSavedProjects();
        const project = projects.find(p => p.id === id);
        if (project) {
            this.importProject(project.data);
            return true;
        }
        return false;
    }

    deleteProjectFromAccount(id) {
        let projects = this.getSavedProjects();
        projects = projects.filter(p => p.id !== id);
        localStorage.setItem('circuitsense_cloud_projects', JSON.stringify(projects));
        this._notify();
    }

    clearProject() {
        this.instances = [];
        this.wires = [];
        this.pinInfoMap.clear();
        this.wiringState = null;
        this.selectedInstanceIds = new Set();
        this.selectedWireId = null;
        this._nextId = 1;
        this._pushHistory();
        this._notifyStructural();
    }

    // ——— Internal Notifications ———————————————————————
    _notify() {
        this.dispatchEvent(new CustomEvent('change'));
    }

    /** Structural changes trigger save + validation refresh */
    _notifyStructural() {
        this._notify();
        this._scheduleSave();
        this.dispatchEvent(new CustomEvent('structural-change'));
    }
}

export const store = new CircuitStore();