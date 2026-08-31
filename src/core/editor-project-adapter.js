import { normalizeProjectV2, PROJECT_SCHEMA_VERSION } from './project-schema.js';

export const UNRESOLVED_COMPONENT_TYPE = '__elera-unresolved__';

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function fallbackPosition(index) {
    return {
        x: 40 + (index % 6) * 100,
        y: 40 + Math.floor(index / 6) * 100,
    };
}

function highestNumericSuffix(ids) {
    let highest = 0;
    for (const id of ids) {
        const match = /(\d+)$/.exec(String(id));
        if (match) highest = Math.max(highest, Number(match[1]));
    }
    return highest;
}

/** Convert the current editor's legacy-shaped source state into schema v2. */
export function editorProjectToV2(editorProject, options = {}) {
    return normalizeProjectV2({
        instances: clone(editorProject?.instances || []),
        wires: clone(editorProject?.wires || []),
        _nextId: editorProject?._nextId,
        _savedAt: editorProject?._savedAt,
        version: editorProject?.version,
    }, options);
}

/**
 * Hydrate schema v2 into the clean source representation understood by the
 * existing editor. Physical realization is deliberately not reconstructed:
 * every logical net becomes a deterministic N-1 set of source pair wires.
 */
export function v2ToEditorProject(project, options = {}) {
    const normalized = normalizeProjectV2(project, options);
    const resources = normalized.physicalIntent.resources || [];
    const locks = normalized.physicalIntent.locks || [];
    const placementByComponent = new Map();
    const boardResources = [];

    for (const resource of resources) {
        if (resource.kind === 'component-placement' && resource.componentId) {
            placementByComponent.set(String(resource.componentId), resource);
        } else if (resource.kind === 'breadboard') {
            boardResources.push(resource);
        }
    }

    const componentById = new Map((normalized.logical.components || []).map(component => [String(component.id), component]));
    for (const net of normalized.logical.nets || []) {
        for (const endpoint of net.endpoints || []) {
            const id = String(endpoint.componentId);
            if (!componentById.has(id)) {
                componentById.set(id, {
                    id,
                    type: null,
                    unresolved: true,
                    provenance: { kind: 'user' },
                });
            }
        }
    }

    const logicalComponents = [...componentById.values()].sort((a, b) =>
        String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
    );
    const instances = logicalComponents.map((component, index) => {
        const placement = placementByComponent.get(String(component.id));
        const position = placement?.position || fallbackPosition(index);
        const instance = {
            ...(clone(component.properties || {})),
            id: String(component.id),
            componentId: component.type || UNRESOLVED_COMPONENT_TYPE,
            x: finiteNumber(position.x),
            y: finiteNumber(position.y),
            rotation: finiteNumber(placement?.rotation),
        };
        if (component.unresolved) {
            instance.unresolved = true;
            instance.planningDisabled = true;
            instance.unresolvedType = component.type;
        }
        if (component.provenance) instance.provenance = clone(component.provenance);
        return instance;
    });

    for (const resource of boardResources.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))) {
        const position = resource.position || { x: 0, y: 0 };
        instances.push({
            id: String(resource.id),
            componentId: String(resource.boardType || 'breadboard-half'),
            x: finiteNumber(position.x),
            y: finiteNumber(position.y),
            rotation: finiteNumber(resource.rotation),
        });
    }

    const instanceById = new Map(instances.map(instance => [instance.id, instance]));
    for (const lock of locks) {
        if (lock.kind === 'component-placement') {
            const instance = instanceById.get(String(lock.componentId));
            if (!instance) continue;
            instance.locked = true;
            if (lock.position) {
                instance.x = finiteNumber(lock.position.x, instance.x);
                instance.y = finiteNumber(lock.position.y, instance.y);
            }
            instance.rotation = finiteNumber(lock.rotation, instance.rotation);
        } else if (lock.kind === 'resource-placement') {
            const instance = instanceById.get(String(lock.resourceId));
            if (!instance) continue;
            instance.locked = true;
            if (lock.position) {
                instance.x = finiteNumber(lock.position.x, instance.x);
                instance.y = finiteNumber(lock.position.y, instance.y);
            }
            instance.rotation = finiteNumber(lock.rotation, instance.rotation);
        } else if (lock.kind === 'breadboard-mount') {
            const instance = instanceById.get(String(lock.componentId));
            const board = instanceById.get(String(lock.boardId));
            if (!instance || !board) continue;
            instance.mountedOn = board.id;
            instance.breadboardPlacement = {
                breadboardId: board.id,
                holes: clone(lock.holes || {}),
                locked: true,
            };
            instance.rotation = finiteNumber(lock.rotation, instance.rotation);
        }
    }

    const wires = [];
    for (const [netIndex, net] of (normalized.logical.nets || []).entries()) {
        const uniqueEndpoints = [];
        const seen = new Set();
        for (const endpoint of net.endpoints || []) {
            const key = `${endpoint.componentId}\u0000${endpoint.pinId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            uniqueEndpoints.push(endpoint);
        }
        if (uniqueEndpoints.length < 2) continue;
        const anchor = uniqueEndpoints[0];
        for (let pairIndex = 1; pairIndex < uniqueEndpoints.length; pairIndex++) {
            const endpoint = uniqueEndpoints[pairIndex];
            wires.push({
                id: `wire_v2_${netIndex + 1}_${pairIndex}`,
                from: { instanceId: String(anchor.componentId), pinName: String(anchor.pinId) },
                to: { instanceId: String(endpoint.componentId), pinName: String(endpoint.pinId) },
                waypoints: [],
                mode: 'orthogonal',
                logicalNetId: String(net.id),
            });
        }
    }

    const metadataNextId = finiteNumber(normalized.metadata?.nextId, 1);
    const derivedNextId = highestNumericSuffix([...instances.map(item => item.id), ...wires.map(item => item.id)]) + 1;
    return {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        instances,
        wires,
        _nextId: Math.max(1, metadataNextId, derivedNextId),
        unresolvedComponents: clone(normalized.logical.unresolvedComponents || []),
    };
}

export const serializeEditorProject = editorProjectToV2;
export const hydrateEditorProject = v2ToEditorProject;

