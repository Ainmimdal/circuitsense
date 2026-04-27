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
import { getObstacles, generateWireColor } from './utils/wire-path.js';
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
        /** @type {string | null} */
        this.selectedInstanceId = null;
        /** @type {string | null} */
        this.selectedWireId = null;

        // Viewport (shared with canvas for coordinate conversions)
        this.viewport = { scale: 1, panX: 0, panY: 0 };

        // Grid
        this.gridSize = 20;

        // Anti-overlap toggle (on by default)
        this.antiOverlap = true;

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

    toggleAntiOverlap() {
        this.antiOverlap = !this.antiOverlap;
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
        const size = def?.size || { width: 80, height: 60 };
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
            const otherSize = otherDef?.size || { width: 80, height: 60 };
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
        let sx = this.snapToGrid(x);
        let sy = this.snapToGrid(y);

        const instance = {
            id: `inst_${this._nextId++}`,
            componentId,
            x: sx,
            y: sy,
        };
        this.instances = [...this.instances, instance];

        // Resolve overlap after adding
        if (this.antiOverlap) {
            const resolved = this.resolveOverlap(instance.id, sx, sy);
            instance.x = resolved.x;
            instance.y = resolved.y;
        }

        this.selectedInstanceId = instance.id;
        this._pushHistory();
        this._notifyStructural();
        return instance;
    }

    moveInstance(id, x, y) {
        const inst = this.instances.find(i => i.id === id);
        if (inst) {
            inst.x = this.snapToGrid(x);
            inst.y = this.snapToGrid(y);
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
        this.pinInfoMap.delete(id);
        if (this.selectedInstanceId === id) this.selectedInstanceId = null;
        this._pushHistory();
        this._notifyStructural();
    }

    getInstance(id) {
        return this.instances.find(i => i.id === id);
    }

    // ——— Selection ————————————————————————————————————
    selectInstance(id) {
        this.selectedInstanceId = id;
        this.selectedWireId = null;
        this._notify();
    }

    clearSelection() {
        if (this.selectedInstanceId !== null || this.selectedWireId !== null) {
            this.selectedInstanceId = null;
            this.selectedWireId = null;
            this._notify();
        }
    }

    selectWire(id) {
        this.selectedWireId = id;
        this.selectedInstanceId = null;
        this._notify();
    }

    deleteSelected() {
        if (this.selectedInstanceId) {
            this.removeInstance(this.selectedInstanceId);
        } else if (this.selectedWireId) {
            this.removeWire(this.selectedWireId);
            this.selectedWireId = null;
        }
    }

    // ——— Pin Info ——————————————————————————————————————
    registerPinInfo(instanceId, pinInfo) {
        this.pinInfoMap.set(instanceId, pinInfo);
    }

    getPinAbsolutePosition(instanceId, pinName) {
        const inst = this.getInstance(instanceId);
        if (!inst) return null;
        const pinInfo = this.pinInfoMap.get(instanceId);
        if (!pinInfo) return null;
        const pin = pinInfo.find(p => p.name === pinName);
        if (!pin) return null;
        return {
            x: inst.x + pin.x,
            y: inst.y + pin.y,
        };
    }

    getPinSignals(instanceId, pinName) {
        const pinInfo = this.pinInfoMap.get(instanceId);
        if (!pinInfo) return [];
        const pin = pinInfo.find(p => p.name === pinName);
        return (pin && pin.signals) || [];
    }

    /**
     * Determine which edge of the component a pin exits from.
     * Returns 'up', 'down', 'left', or 'right'.
     *
     * Uses actual pin positions to compute the real bounding box,
     * because wokwi elements often have pins outside the nominal library size.
     */
    getPinExitDirection(instanceId, pinName) {
        const inst = this.getInstance(instanceId);
        if (!inst) return 'up';
        const pinInfo = this.pinInfoMap.get(instanceId);
        if (!pinInfo || pinInfo.length === 0) return 'up';
        const pin = pinInfo.find(p => p.name === pinName);
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
        if (min === distTop) return 'up';
        if (min === distBottom) return 'down';
        if (min === distLeft) return 'left';
        return 'right';
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
     */
    completeWiringDirect(fromInstanceId, fromPinName, toInstanceId, toPinName) {
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
            color: generateWireColor(signals),
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
     * Auto-cleanup all wires: generate obstacle-aware waypoints
     * that route around component bounding boxes.
     */
    cleanupWires() {
        for (const wire of this.wires) {
            const from = this.getPinAbsolutePosition(wire.from.instanceId, wire.from.pinName);
            const to = this.getPinAbsolutePosition(wire.to.instanceId, wire.to.pinName);
            if (!from || !to) continue;

            // Get obstacles: all instances except the two connected by this wire
            const excludeIds = [wire.from.instanceId, wire.to.instanceId];
            const obstacles = getObstacles(this.instances, excludeIds, getComponentDef);

            // Import the route generator
            wire.waypoints = generateCleanWaypoints(
                from.x, from.y, to.x, to.y, obstacles, this.gridSize
            );
        }
        this._pushHistory();
        this._notifyStructural();
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
        this.selectedInstanceId = null;
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

    clearProject() {
        this.instances = [];
        this.wires = [];
        this.pinInfoMap.clear();
        this.wiringState = null;
        this.selectedInstanceId = null;
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

// ─── Helper utilities ──────────────────────────────────────

/** Distance from point (px,py) to line segment (ax,ay)-(bx,by) */
function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);

    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return Math.hypot(px - projX, py - projY);
}

/**
 * Generate obstacle-aware waypoints for a single wire.
 * Routes around component bounding boxes by going above or below.
 */
function generateCleanWaypoints(x1, y1, x2, y2, obstacles, gridSize = 20) {
    const snap = (v) => Math.round(v / gridSize) * gridSize;
    const margin = 25;

    // Find obstacles that the direct Z-path would cross
    const crossed = obstacles.filter(obs => {
        const midY = (y1 + y2) / 2;
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);

        // Horizontal segment crosses box
        if (midY >= obs.top && midY <= obs.bottom &&
            maxX >= obs.left && minX <= obs.right) return true;

        // Vertical segment from x1 crosses box
        if (x1 >= obs.left && x1 <= obs.right) {
            const segTop = Math.min(y1, midY);
            const segBot = Math.max(y1, midY);
            if (segBot >= obs.top && segTop <= obs.bottom) return true;
        }

        // Vertical segment from x2 crosses box
        if (x2 >= obs.left && x2 <= obs.right) {
            const segTop = Math.min(midY, y2);
            const segBot = Math.max(midY, y2);
            if (segBot >= obs.top && segTop <= obs.bottom) return true;
        }

        return false;
    });

    if (crossed.length === 0) return [];

    // Sort by distance from start
    crossed.sort((a, b) =>
        Math.hypot(a.cx - x1, a.cy - y1) - Math.hypot(b.cx - x1, b.cy - y1)
    );

    const waypoints = [];

    for (const obs of crossed) {
        // Choose above or below based on which is closer to the wire endpoints
        const aboveDist = Math.abs(y1 - (obs.top - margin)) + Math.abs(y2 - (obs.top - margin));
        const belowDist = Math.abs(y1 - (obs.bottom + margin)) + Math.abs(y2 - (obs.bottom + margin));
        const clearY = aboveDist <= belowDist
            ? snap(obs.top - margin)
            : snap(obs.bottom + margin);

        waypoints.push({ x: snap(obs.left - margin), y: clearY });
        waypoints.push({ x: snap(obs.right + margin), y: clearY });
    }

    return waypoints;
}

export const store = new CircuitStore();