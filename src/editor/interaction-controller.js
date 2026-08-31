import { getSurfaceDefinition, worldToSurfaceLocal } from '../physical/breadboard.js';
import { addWireCommand, mountComponentCommand, moveFreeComponentCommand, moveSurfaceCommand } from '../physical/commands.js';
import { BreadboardSnapSolver } from '../physical/placement.js';
import { distance } from '../physical/geometry.js';
import { componentPinRef, resolveConnectionWorldPoint } from '../physical/model.js';
import { pinExitDirection } from '../physical/routing.js';
import { getFootprintDefinition } from '../physical/footprints.js';

const WIRE_GRID = 2.54;

function axisForDirection(direction) {
    return ['up', 'down'].includes(direction) ? 'vertical' :
        ['left', 'right'].includes(direction) ? 'horizontal' : null;
}

function segmentAxis(a, b) {
    if (!a || !b) return null;
    if (Math.abs(a.x - b.x) < 1e-6) return 'vertical';
    if (Math.abs(a.y - b.y) < 1e-6) return 'horizontal';
    return null;
}

function snapPoint(point, enabled, gridSize = WIRE_GRID, origin = { x: 0, y: 0 }) {
    if (!enabled) return { x: Number(point.x), y: Number(point.y) };
    return {
        x: origin.x + Math.round((Number(point.x) - origin.x) / gridSize) * gridSize,
        y: origin.y + Math.round((Number(point.y) - origin.y) / gridSize) * gridSize,
    };
}

function snapToComponentPinAxes(project, pointer, fallback, tolerance = 1.15) {
    let bestX = null, bestY = null;
    for (const component of project.components || []) {
        const footprint = getFootprintDefinition(component.footprintId);
        for (const pin of footprint?.pins || []) {
            const pinPoint = resolveConnectionWorldPoint(project, componentPinRef(component.id, pin.pinId));
            if (!pinPoint) continue;
            const dx = Math.abs(pointer.x - pinPoint.x), dy = Math.abs(pointer.y - pinPoint.y);
            if (dx <= tolerance && (!bestX || dx < bestX.distance)) bestX = { value: pinPoint.x, distance: dx };
            if (dy <= tolerance && (!bestY || dy < bestY.distance)) bestY = { value: pinPoint.y, distance: dy };
        }
    }
    return { x: bestX?.value ?? fallback.x, y: bestY?.value ?? fallback.y };
}

function pushUnique(points, point) {
    if (!point) return;
    const normalized = { x: Number(point.x), y: Number(point.y) };
    const last = points.at(-1);
    if (!last || Math.hypot(last.x - normalized.x, last.y - normalized.y) > 1e-6) points.push(normalized);
}

function appendOrthogonal(points, target, startAxis = null, endAxis = null) {
    const from = points.at(-1);
    if (!from || !target) return points;
    if (Math.abs(from.x - target.x) < 1e-6 || Math.abs(from.y - target.y) < 1e-6) {
        pushUnique(points, target);
        return points;
    }
    const firstAxis = startAxis || (endAxis === 'horizontal' ? 'vertical' : 'horizontal');
    if (endAxis && endAxis === firstAxis) {
        if (firstAxis === 'vertical') {
            const middle = (from.y + target.y) / 2;
            pushUnique(points, { x: from.x, y: middle });
            pushUnique(points, { x: target.x, y: middle });
        } else {
            const middle = (from.x + target.x) / 2;
            pushUnique(points, { x: middle, y: from.y });
            pushUnique(points, { x: middle, y: target.y });
        }
    } else {
        pushUnique(points, firstAxis === 'horizontal'
            ? { x: target.x, y: from.y }
            : { x: from.x, y: target.y });
    }
    pushUnique(points, target);
    return points;
}

export class InteractionController extends EventTarget {
    constructor(store, { solver = new BreadboardSnapSolver(), hysteresis = 1.15 } = {}) {
        super();
        this.store = store;
        this.solver = solver;
        this.hysteresis = hysteresis;
        this.state = { type: 'idle' };
    }

    #emit() {
        this.dispatchEvent(new CustomEvent('change', { detail: this.state }));
    }

    #surfaceUnderPoint(worldPoint) {
        return [...this.store.project.surfaces].reverse().find(surface => {
            const definition = getSurfaceDefinition(surface);
            if (!definition) return false;
            const local = worldToSurfaceLocal(surface, worldPoint);
            return local.x >= -3 && local.y >= -3 && local.x <= definition.width + 3 && local.y <= definition.height + 3;
        }) || null;
    }

    beginComponentDrag(componentId) {
        const component = this.store.project.components.find(item => item.id === componentId);
        if (!component) return false;
        this.state = {
            type: 'dragging-component',
            componentId,
            originalPlacement: structuredClone(component.placement),
            candidate: null,
            pointerWorld: null,
        };
        this.#emit();
        return true;
    }

    updateComponentDrag(worldPoint) {
        if (this.state.type !== 'dragging-component') return null;
        const component = this.store.project.components.find(item => item.id === this.state.componentId);
        const surface = this.#surfaceUnderPoint(worldPoint);
        let nextCandidate = surface ? this.solver.solve({
            project: this.store.project,
            component,
            pointerWorld: worldPoint,
            surfaceId: surface.id,
            preferredRotation: component.placement?.rotation,
        }) : null;

        const previous = this.state.candidate;
        if (previous && nextCandidate && previous.surfaceId === nextCandidate.surfaceId &&
            this.solver.validateCandidate(this.store.project, component, previous)) {
            const previousSurface = this.store.project.surfaces.find(item => item.id === previous.surfaceId);
            const anchor = getSurfaceDefinition(previousSurface)?.getHole(previous.anchorHoleId);
            const local = worldToSurfaceLocal(previousSurface, worldPoint);
            const previousScore = anchor ? distance(anchor, local) : Infinity;
            if (previousScore <= nextCandidate.score + this.hysteresis) {
                nextCandidate = { ...previous, score: previousScore };
            }
        }

        this.state = { ...this.state, pointerWorld: { ...worldPoint }, candidate: nextCandidate };
        this.#emit();
        return nextCandidate;
    }

    commitComponentDrag(worldPoint) {
        if (this.state.type !== 'dragging-component') return false;
        const componentId = this.state.componentId;
        const component = this.store.project.components.find(item => item.id === componentId);
        const candidate = this.state.candidate;
        let committed = false;
        if (candidate && this.solver.validateCandidate(this.store.project, component, candidate)) {
            committed = this.store.execute(mountComponentCommand(componentId, candidate));
        } else {
            committed = this.store.execute(moveFreeComponentCommand(componentId, worldPoint));
        }
        this.state = { type: 'idle' };
        this.#emit();
        return committed;
    }

    cancel() {
        this.state = { type: 'idle' };
        this.#emit();
    }

    moveSurface(surfaceId, transform) {
        this.store.execute(moveSurfaceCommand(surfaceId, transform));
    }

    activateTerminal(ref) {
        if (this.state.type !== 'drawing-wire') {
            this.state = { type: 'drawing-wire', from: structuredClone(ref), waypoints: [] };
            this.#emit();
            return 'started';
        }
        const from = this.state.from;
        if (JSON.stringify(from) === JSON.stringify(ref)) {
            this.state = { type: 'idle' };
            this.#emit();
            return 'cancelled';
        }
        const endpoint = resolveConnectionWorldPoint(this.store.project, ref);
        const points = this.previewWire(endpoint, { targetRef: ref, snap: false });
        this.state = { type: 'idle' };
        this.store.execute(addWireCommand({
            id: this.store.newWireId(),
            from,
            to: structuredClone(ref),
            route: { mode: 'manual', waypoints: points.slice(1, -1) },
            color: '#22d3ee',
        }));
        this.#emit();
        return 'completed';
    }

    previewWire(point, { targetRef = null, snap = true, gridSize = WIRE_GRID } = {}) {
        if (this.state.type !== 'drawing-wire') return [];
        const from = resolveConnectionWorldPoint(this.store.project, this.state.from);
        if (!from || !point) return [];
        const points = [{ ...from }, ...(this.state.waypoints || []).map(item => ({ ...item }))];
        const previous = points.at(-2), current = points.at(-1);
        const previousAxis = segmentAxis(previous, current);
        const startAxis = previousAxis
            ? (previousAxis === 'horizontal' ? 'vertical' : 'horizontal')
            : axisForDirection(pinExitDirection(this.store.project, this.state.from));
        const endAxis = targetRef ? axisForDirection(pinExitDirection(this.store.project, targetRef)) : null;
        const gridTarget = snapPoint(point, snap, gridSize, from);
        const target = snap ? snapToComponentPinAxes(this.store.project, point, gridTarget) : gridTarget;
        return appendOrthogonal(points, target, startAxis, endAxis);
    }

    addWireWaypoint(point, { snap = true, gridSize = WIRE_GRID } = {}) {
        if (this.state.type !== 'drawing-wire') return false;
        const preview = this.previewWire(point, { snap, gridSize });
        if (preview.length < 2) return false;
        this.state = { ...this.state, waypoints: preview.slice(1) };
        this.#emit();
        return true;
    }
}
