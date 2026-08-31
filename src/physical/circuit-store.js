import { createHalfBreadboardSurface } from './breadboard.js';
import { createPhysicalProject, normalizePersistedProject, resolveConnectionWorldPoint } from './model.js';
import { pinExitDirection, routeAllWires, routeWire } from './routing.js';
import { moveWireRouteEndpoints } from './wire-edit.js';

const STORAGE_KEY = 'elera_physical_project_v5_empty_workspace';

function emptyProject() {
    return createPhysicalProject({
        surfaces: [createHalfBreadboardSurface()],
        components: [],
        wires: [],
        properties: { title: 'Physical breadboard workspace' },
    });
}

function defaultProject() {
    const surface = createHalfBreadboardSurface();
    return createPhysicalProject({
        surfaces: [surface],
        components: [
            {
                id: 'part-1', definitionId: 'test-ic', footprintId: 'dip8-300mil', properties: { demo: true },
                placement: {
                    type: 'surface', surfaceId: surface.id, rotation: 0,
                    bindings: { '1': 'E12', '2': 'E13', '3': 'E14', '4': 'E15', '8': 'F12', '7': 'F13', '6': 'F14', '5': 'F15' },
                },
            },
            {
                id: 'part-2', definitionId: 'led', footprintId: 'led-2.54', properties: { demo: true },
                placement: { type: 'surface', surfaceId: surface.id, rotation: 0, bindings: { C: 'C14', A: 'C15' } },
            },
        ],
        wires: [{
            id: 'wire-1',
            from: { type: 'component-pin', componentId: 'part-1', pinId: '1' },
            to: { type: 'component-pin', componentId: 'part-2', pinId: 'A' },
            route: { mode: 'auto', waypoints: [] },
            color: '#22d3ee',
        }],
        properties: { title: 'Physical breadboard workspace', sample: 'generic-dip-package-vertical-slice' },
    });
}

export class PhysicalCircuitStore extends EventTarget {
    constructor({ load = true } = {}) {
        super();
        this.manualWireMode = 'orthogonal';
        this.manualWireSnap = true;
        this.project = load ? this.#load() : defaultProject();
        this.routes = routeAllWires(this.project);
        this.history = [structuredClone(this.project)];
        this.historyIndex = 0;
        this.nextComponentId = this.#nextSuffix('part');
        this.nextWireId = this.#nextSuffix('wire');
    }

    #nextSuffix(prefix) {
        const ids = [
            ...(this.project.components || []).map(item => item.id),
            ...(this.project.wires || []).map(item => item.id),
        ];
        return Math.max(0, ...ids.map(id => Number(new RegExp(`^${prefix}-(\\d+)$`).exec(id)?.[1] || 0))) + 1;
    }

    #load() {
        if (typeof localStorage === 'undefined') return defaultProject();
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? normalizePersistedProject(JSON.parse(raw)) : emptyProject();
        } catch (error) {
            console.warn('[Elera] Physical project could not be loaded; using a new semantic project.', error);
            return emptyProject();
        }
    }

    #changed({ persist = true, rerouteWireIds = null } = {}) {
        if (rerouteWireIds) {
            const affected = new Set(rerouteWireIds);
            const nextRoutes = new Map();
            for (const wire of this.project.wires) {
                if (!affected.has(wire.id) && this.routes.has(wire.id)) nextRoutes.set(wire.id, this.routes.get(wire.id));
            }
            const usedRoutes = [...nextRoutes.values()];
            for (const wire of this.project.wires) {
                if (!affected.has(wire.id) && nextRoutes.has(wire.id)) continue;
                const points = routeWire(this.project, wire, { existingRoutes: usedRoutes });
                if (!points) continue;
                nextRoutes.set(wire.id, points);
                usedRoutes.push(points);
            }
            this.routes = nextRoutes;
        } else {
            this.routes = routeAllWires(this.project);
        }
        if (persist) this.save();
        this.dispatchEvent(new CustomEvent('change', { detail: { project: this.project } }));
    }

    execute(command) {
        const next = structuredClone(this.project);
        command.apply(next);
        let rerouteWireIds = command.wireIds ? new Set(command.wireIds) : null;
        if (['move-component', 'mount-component'].includes(command.type) && command.componentId) {
            rerouteWireIds = new Set(next.wires.filter(wire => [wire.from, wire.to].some(ref =>
                ref?.type === 'component-pin' && ref.componentId === command.componentId)).map(wire => wire.id));
        }
        if (command.type === 'move-surface' && command.surfaceId) {
            const mountedIds = new Set(next.components.filter(component =>
                component.placement?.type === 'surface' && component.placement.surfaceId === command.surfaceId).map(component => component.id));
            rerouteWireIds = new Set(next.wires.filter(wire => [wire.from, wire.to].some(ref =>
                (ref?.type === 'surface-hole' && ref.surfaceId === command.surfaceId) ||
                (ref?.type === 'component-pin' && mountedIds.has(ref.componentId)))).map(wire => wire.id));
        }
        if (rerouteWireIds && ['move-component', 'mount-component', 'move-surface'].includes(command.type)) {
            for (const wire of next.wires.filter(item => rerouteWireIds.has(item.id))) {
                const previous = this.routes.get(wire.id);
                if (!previous?.length) continue;
                const nextFrom = resolveConnectionWorldPoint(next, wire.from);
                const nextTo = resolveConnectionWorldPoint(next, wire.to);
                const fromMoved = nextFrom && Math.hypot(previous[0].x - nextFrom.x, previous[0].y - nextFrom.y) > 1e-6;
                const toMoved = nextTo && Math.hypot(previous.at(-1).x - nextTo.x, previous.at(-1).y - nextTo.y) > 1e-6;
                const preserved = moveWireRouteEndpoints(previous, {
                    from: fromMoved ? nextFrom : null,
                    to: toMoved ? nextTo : null,
                    fromDirection: fromMoved ? pinExitDirection(next, wire.from) : null,
                    toDirection: toMoved ? pinExitDirection(next, wire.to) : null,
                });
                wire.route = { mode: 'manual', waypoints: preserved.slice(1, -1), preservedFromMove: true };
            }
        }
        this.project = next;
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(structuredClone(next));
        if (this.history.length > 80) this.history.shift();
        this.historyIndex = this.history.length - 1;
        this.#changed({ rerouteWireIds });
        return true;
    }

    transaction(type, mutate) {
        return this.execute({ type, apply: mutate });
    }

    undo() {
        if (this.historyIndex <= 0) return false;
        this.project = structuredClone(this.history[--this.historyIndex]);
        this.#changed();
        return true;
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return false;
        this.project = structuredClone(this.history[++this.historyIndex]);
        this.#changed();
        return true;
    }

    save() {
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
    }

    exportProject() {
        return JSON.stringify(this.project, null, 2);
    }

    importProject(value) {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        this.project = normalizePersistedProject(parsed);
        this.history = [structuredClone(this.project)];
        this.historyIndex = 0;
        this.nextComponentId = this.#nextSuffix('part');
        this.nextWireId = this.#nextSuffix('wire');
        this.#changed();
    }

    clear() {
        this.project = emptyProject();
        this.history = [structuredClone(this.project)];
        this.historyIndex = 0;
        this.nextComponentId = 1;
        this.nextWireId = 1;
        this.#changed();
    }

    newComponentId() {
        return `part-${this.nextComponentId++}`;
    }

    newWireId() {
        return `wire-${this.nextWireId++}`;
    }

    recomputeRoutes() {
        this.routes = routeAllWires(this.project);
        this.dispatchEvent(new CustomEvent('change', { detail: { project: this.project, routesOnly: true } }));
        return this.routes;
    }

    setManualRoute(wireId, waypoints) {
        this.execute({
            type: 'edit-wire-route', wireIds: [wireId],
            apply(project) {
                const wire = project.wires.find(item => item.id === wireId);
                if (!wire) throw new Error(`Unknown wire ${wireId}.`);
                wire.route = { mode: 'manual', waypoints: structuredClone(waypoints) };
            },
        });
    }

    toggleManualWireMode() {
        this.manualWireMode = this.manualWireMode === 'orthogonal' ? 'freestyle' : 'orthogonal';
        this.dispatchEvent(new CustomEvent('settings-change'));
        return this.manualWireMode;
    }

    toggleManualWireSnap() {
        this.manualWireSnap = !this.manualWireSnap;
        this.dispatchEvent(new CustomEvent('settings-change'));
        return this.manualWireSnap;
    }
}

export const physicalCircuitStore = new PhysicalCircuitStore();
export { STORAGE_KEY as PHYSICAL_PROJECT_STORAGE_KEY };
