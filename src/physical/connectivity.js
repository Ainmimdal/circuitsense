import { connectionRefKey, componentPinRef, surfaceHoleRef } from './model.js';
import { getSurfaceDefinition } from './breadboard.js';
import { getFootprintDefinition } from './footprints.js';

export class UnionFind {
    constructor() {
        this.parent = new Map();
        this.rank = new Map();
    }

    add(key) {
        if (!this.parent.has(key)) {
            this.parent.set(key, key);
            this.rank.set(key, 0);
        }
    }

    find(key) {
        this.add(key);
        const parent = this.parent.get(key);
        if (parent !== key) this.parent.set(key, this.find(parent));
        return this.parent.get(key);
    }

    union(a, b) {
        let rootA = this.find(a);
        let rootB = this.find(b);
        if (rootA === rootB) return;
        if (this.rank.get(rootA) < this.rank.get(rootB)) [rootA, rootB] = [rootB, rootA];
        this.parent.set(rootB, rootA);
        if (this.rank.get(rootA) === this.rank.get(rootB)) this.rank.set(rootA, this.rank.get(rootA) + 1);
    }
}

export class ConnectivityResolver {
    constructor(project) {
        this.project = project;
        this.graph = new UnionFind();
        this.refs = new Map();
        this.#build();
    }

    #remember(ref) {
        const key = connectionRefKey(ref);
        this.refs.set(key, ref);
        this.graph.add(key);
        return key;
    }

    #build() {
        for (const surface of this.project.surfaces || []) {
            const definition = getSurfaceDefinition(surface);
            if (!definition) continue;
            const firstByGroup = new Map();
            for (const hole of definition.holes) {
                const ref = surfaceHoleRef(surface.id, hole.id);
                const key = this.#remember(ref);
                const first = firstByGroup.get(hole.electricalGroup);
                if (first) this.graph.union(first, key);
                else firstByGroup.set(hole.electricalGroup, key);
            }
        }

        for (const component of this.project.components || []) {
            const footprint = getFootprintDefinition(component.footprintId);
            for (const internalNet of footprint?.internalNets || []) {
                const pins = internalNet.pins || [];
                for (let index = 1; index < pins.length; index++) {
                    this.graph.union(
                        this.#remember(componentPinRef(component.id, pins[0])),
                        this.#remember(componentPinRef(component.id, pins[index])),
                    );
                }
            }
            if (component.placement?.type !== 'surface') continue;
            for (const [pinId, holeId] of Object.entries(component.placement.bindings || {})) {
                const pinKey = this.#remember(componentPinRef(component.id, pinId));
                const holeKey = this.#remember(surfaceHoleRef(component.placement.surfaceId, holeId));
                this.graph.union(pinKey, holeKey);
            }
        }

        for (const wire of this.project.wires || []) {
            this.graph.union(this.#remember(wire.from), this.#remember(wire.to));
        }
    }

    resolveElectricalGroup(componentId, pinId) {
        const component = this.project.components.find(item => item.id === componentId);
        if (component?.placement?.type !== 'surface') return null;
        const surface = this.project.surfaces.find(item => item.id === component.placement.surfaceId);
        const holeId = component.placement.bindings?.[pinId];
        const hole = getSurfaceDefinition(surface)?.getHole(holeId);
        return hole ? { surfaceId: surface.id, holeId, electricalGroup: hole.electricalGroup } : null;
    }

    areConnected(a, b) {
        return this.graph.find(connectionRefKey(a)) === this.graph.find(connectionRefKey(b));
    }

    netFor(ref) {
        const root = this.graph.find(connectionRefKey(ref));
        return [...this.refs.entries()]
            .filter(([key]) => this.graph.find(key) === root)
            .map(([, value]) => structuredClone(value));
    }

    nets() {
        const groups = new Map();
        for (const [key, ref] of this.refs) {
            const root = this.graph.find(key);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(structuredClone(ref));
        }
        return [...groups.values()];
    }
}
