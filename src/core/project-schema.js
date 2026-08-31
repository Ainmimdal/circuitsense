export const PROJECT_SCHEMA_VERSION = 2;

const LEGACY_PHYSICAL_INSTANCE_KEYS = new Set([
    'id',
    'componentId',
    'x',
    'y',
    'rotation',
    'locked',
    'positionLocked',
    'mountedOn',
    'breadboardPlacement',
    'physicalScale',
]);

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compareById(a, b) {
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
}

function endpointKey(endpoint) {
    return `${endpoint.componentId}\u0000${endpoint.pinId}`;
}

function endpointFromKey(key) {
    const separator = key.indexOf('\u0000');
    return { componentId: key.slice(0, separator), pinId: key.slice(separator + 1) };
}

function normalizeEndpoint(endpoint) {
    const componentId = endpoint?.componentId ?? endpoint?.instanceId;
    const pinId = endpoint?.pinId ?? endpoint?.pinName;
    if (componentId === undefined || componentId === null || pinId === undefined || pinId === null) return null;
    return { componentId: String(componentId), pinId: String(pinId) };
}

function propertiesFromLegacyInstance(instance) {
    const properties = {};
    for (const [key, value] of Object.entries(instance || {})) {
        if (!LEGACY_PHYSICAL_INSTANCE_KEYS.has(key)) properties[key] = clone(value);
    }
    return properties;
}

function hasProperties(value) {
    return value && Object.keys(value).length > 0;
}

function makeTypeChecks(options) {
    const knownIds = options.knownComponentIds
        ? new Set(Array.from(options.knownComponentIds, String))
        : null;
    const isKnown = typeof options.isKnownComponent === 'function'
        ? options.isKnownComponent
        : type => !knownIds || knownIds.has(type);
    const isBreadboard = typeof options.isBreadboardComponent === 'function'
        ? options.isBreadboardComponent
        : type => /^breadboard(?:-|$)/i.test(String(type || ''));
    return { isKnown, isBreadboard };
}

function normalizeLogicalComponent(component, checks) {
    const id = String(component?.id ?? component?.instanceId ?? '');
    const type = component?.type ?? component?.componentId ?? null;
    const properties = clone(component?.properties || {});
    const unresolved = component?.unresolved === true || component?.status === 'unresolved' || !type || !checks.isKnown(String(type));
    const normalized = {
        id,
        type: type === null ? null : String(type),
        provenance: clone(component?.provenance || { kind: 'user' }),
    };
    if (hasProperties(properties)) normalized.properties = properties;
    if (unresolved) normalized.unresolved = true;
    return normalized;
}

function normalizeResource(resource) {
    const normalized = clone(resource || {});
    delete normalized.physicalScale;
    return normalized;
}

function normalizeLock(lock) {
    const normalized = clone(lock || {});
    delete normalized.physicalScale;
    return normalized;
}

function canonicalizeV2(project, options) {
    const checks = makeTypeChecks(options);
    const components = (project.logical?.components || [])
        .map(component => normalizeLogicalComponent(component, checks))
        .filter(component => component.id)
        .sort(compareById);
    const componentById = new Map(components.map(component => [component.id, component]));

    const unresolvedById = new Map();
    for (const unresolved of project.logical?.unresolvedComponents || []) {
        const id = String(unresolved?.id ?? unresolved?.componentId ?? '');
        if (!id) continue;
        unresolvedById.set(id, {
            id,
            type: unresolved?.type ?? unresolved?.originalType ?? componentById.get(id)?.type ?? null,
            ...(hasProperties(unresolved?.properties) ? { properties: clone(unresolved.properties) } : {}),
        });
    }
    for (const component of components.filter(item => item.unresolved)) {
        unresolvedById.set(component.id, {
            id: component.id,
            type: component.type,
            ...(hasProperties(component.properties) ? { properties: clone(component.properties) } : {}),
        });
    }

    const nets = (project.logical?.nets || []).map((net, index) => {
        const unique = new Map();
        for (const endpoint of net?.endpoints || []) {
            const normalized = normalizeEndpoint(endpoint);
            if (normalized) unique.set(endpointKey(normalized), normalized);
        }
        return {
            id: String(net?.id || `net_${index + 1}`),
            endpoints: [...unique.values()].sort((a, b) => endpointKey(a).localeCompare(endpointKey(b), undefined, { numeric: true })),
        };
    }).filter(net => net.endpoints.length >= 2).sort(compareById);

    return {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        logical: {
            components,
            nets,
            unresolvedComponents: [...unresolvedById.values()].sort(compareById),
        },
        physicalIntent: {
            resources: (project.physicalIntent?.resources || []).map(normalizeResource).sort(compareById),
            locks: (project.physicalIntent?.locks || []).map(normalizeLock).sort((a, b) =>
                `${a.kind}:${a.componentId || a.resourceId || ''}`.localeCompare(`${b.kind}:${b.componentId || b.resourceId || ''}`, undefined, { numeric: true })
            ),
        },
        metadata: clone(project.metadata || {}),
    };
}

class UnionFind {
    constructor() {
        this.parent = new Map();
    }

    add(key) {
        if (!this.parent.has(key)) this.parent.set(key, key);
    }

    find(key) {
        this.add(key);
        const parent = this.parent.get(key);
        if (parent !== key) this.parent.set(key, this.find(parent));
        return this.parent.get(key);
    }

    union(a, b) {
        const rootA = this.find(a);
        const rootB = this.find(b);
        if (rootA !== rootB) this.parent.set(rootB, rootA);
    }
}

function breadboardGroup(pinId) {
    const terminal = /^([A-J])(\d+)$/i.exec(pinId);
    if (terminal) {
        const row = terminal[1].toUpperCase();
        return `${row <= 'E' ? 'upper' : 'lower'}-${Number(terminal[2])}`;
    }
    const rail = /^(TP|TN|BP|BN)(\d+)$/i.exec(pinId);
    return rail ? `rail-${rail[1].toUpperCase()}` : null;
}

function legacyWireEndpoints(wire) {
    const auto = wire?.physical?.autoBreadboard;
    if (auto?.originalFrom && auto?.originalTo) {
        return [normalizeEndpoint(auto.originalFrom), normalizeEndpoint(auto.originalTo)];
    }
    if (auto) return null;
    return [normalizeEndpoint(wire?.from), normalizeEndpoint(wire?.to)];
}

function migrateLegacyProject(project, options) {
    const checks = makeTypeChecks(options);
    const instances = Array.isArray(project?.instances) ? project.instances : [];
    const wires = Array.isArray(project?.wires) ? project.wires : [];
    const boardIds = new Set();
    const componentById = new Map();
    const resources = [];
    const locks = [];
    const unresolvedComponents = [];

    for (const instance of instances) {
        const id = String(instance?.id ?? '');
        const type = instance?.componentId === undefined ? null : String(instance.componentId);
        if (!id) continue;
        const position = { x: Number(instance.x) || 0, y: Number(instance.y) || 0 };
        const rotation = Number(instance.rotation) || 0;

        if (checks.isBreadboard(type)) {
            boardIds.add(id);
            resources.push({ id, kind: 'breadboard', boardType: type, position, rotation });
            if (instance.locked || instance.positionLocked) {
                locks.push({ kind: 'resource-placement', resourceId: id, position, rotation });
            }
            continue;
        }

        const properties = propertiesFromLegacyInstance(instance);
        const unresolved = !type || !checks.isKnown(type);
        const component = {
            id,
            type,
            provenance: clone(instance.provenance || { kind: 'user' }),
            ...(hasProperties(properties) ? { properties } : {}),
            ...(unresolved ? { unresolved: true } : {}),
        };
        componentById.set(id, component);
        resources.push({ id: `placement:${id}`, kind: 'component-placement', componentId: id, position, rotation });
        if (instance.locked || instance.positionLocked) {
            locks.push({ kind: 'component-placement', componentId: id, position, rotation });
        }
        if (instance.breadboardPlacement?.locked && boardIds.has(String(instance.mountedOn || instance.breadboardPlacement.breadboardId))) {
            locks.push({
                kind: 'breadboard-mount',
                componentId: id,
                boardId: String(instance.mountedOn || instance.breadboardPlacement.breadboardId),
                holes: clone(instance.breadboardPlacement.holes || {}),
                rotation,
            });
        }
        if (unresolved) {
            unresolvedComponents.push({
                id,
                type,
                ...(hasProperties(properties) ? { properties: clone(properties) } : {}),
            });
        }
    }

    // A mount may reference a board that appeared later in the legacy instance array.
    for (const instance of instances) {
        const id = String(instance?.id ?? '');
        if (!componentById.has(id) || !instance?.breadboardPlacement?.locked) continue;
        const boardId = String(instance.mountedOn || instance.breadboardPlacement.breadboardId || '');
        if (!boardIds.has(boardId) || locks.some(lock => lock.kind === 'breadboard-mount' && lock.componentId === id)) continue;
        locks.push({
            kind: 'breadboard-mount',
            componentId: id,
            boardId,
            holes: clone(instance.breadboardPlacement.holes || {}),
            rotation: Number(instance.rotation) || 0,
        });
    }

    const unionFind = new UnionFind();
    const acceptedEdges = [];
    const netRepresentatives = new Map();
    const breadboardEndpointsByGroup = new Map();

    for (const wire of wires) {
        const endpoints = legacyWireEndpoints(wire);
        if (!endpoints || !endpoints[0] || !endpoints[1]) continue;
        const [from, to] = endpoints;
        const fromKey = endpointKey(from);
        const toKey = endpointKey(to);
        unionFind.union(fromKey, toKey);
        acceptedEdges.push({ fromKey, toKey, logicalNetId: wire.logicalNetId ? String(wire.logicalNetId) : null });

        if (wire.logicalNetId) {
            const netId = String(wire.logicalNetId);
            if (netRepresentatives.has(netId)) unionFind.union(netRepresentatives.get(netId), fromKey);
            else netRepresentatives.set(netId, fromKey);
        }

        for (const endpoint of [from, to]) {
            if (!boardIds.has(endpoint.componentId)) continue;
            const group = breadboardGroup(endpoint.pinId);
            if (!group) continue;
            const groupKey = `${endpoint.componentId}\u0000${group}`;
            const key = endpointKey(endpoint);
            if (breadboardEndpointsByGroup.has(groupKey)) unionFind.union(breadboardEndpointsByGroup.get(groupKey), key);
            else breadboardEndpointsByGroup.set(groupKey, key);
        }
    }

    const endpointsByRoot = new Map();
    for (const key of unionFind.parent.keys()) {
        const endpoint = endpointFromKey(key);
        if (boardIds.has(endpoint.componentId)) continue;
        if (!componentById.has(endpoint.componentId)) {
            const placeholder = { id: endpoint.componentId, type: null, provenance: { kind: 'user' }, unresolved: true };
            componentById.set(endpoint.componentId, placeholder);
            unresolvedComponents.push({ id: endpoint.componentId, type: null });
        }
        const root = unionFind.find(key);
        if (!endpointsByRoot.has(root)) endpointsByRoot.set(root, new Map());
        endpointsByRoot.get(root).set(key, endpoint);
    }

    const preferredIdsByRoot = new Map();
    for (const edge of acceptedEdges) {
        if (!edge.logicalNetId) continue;
        const root = unionFind.find(edge.fromKey);
        if (!preferredIdsByRoot.has(root)) preferredIdsByRoot.set(root, new Set());
        preferredIdsByRoot.get(root).add(edge.logicalNetId);
    }

    const netCandidates = [...endpointsByRoot.entries()]
        .map(([root, endpoints]) => ({
            root,
            endpoints: [...endpoints.values()].sort((a, b) => endpointKey(a).localeCompare(endpointKey(b), undefined, { numeric: true })),
        }))
        .filter(net => net.endpoints.length >= 2)
        .sort((a, b) => endpointKey(a.endpoints[0]).localeCompare(endpointKey(b.endpoints[0]), undefined, { numeric: true }));
    const usedNetIds = new Set();
    const nets = netCandidates.map((net, index) => {
        const preferred = [...(preferredIdsByRoot.get(net.root) || [])].sort()[0];
        let id = preferred || `net_${index + 1}`;
        let suffix = 2;
        while (usedNetIds.has(id)) id = `${preferred || `net_${index + 1}`}_${suffix++}`;
        usedNetIds.add(id);
        return { id, endpoints: net.endpoints };
    });

    return canonicalizeV2({
        schemaVersion: PROJECT_SCHEMA_VERSION,
        logical: {
            components: [...componentById.values()],
            nets,
            unresolvedComponents,
        },
        physicalIntent: { resources, locks },
        metadata: {
            nextId: Number(project?._nextId) || 1,
            ...(project?._savedAt ? { savedAt: project._savedAt } : {}),
            migratedFrom: project?.version || 1,
        },
    }, options);
}

export function normalizeProjectV2(project, options = {}) {
    if (Number(project?.schemaVersion) === PROJECT_SCHEMA_VERSION && project?.logical && project?.physicalIntent) {
        return canonicalizeV2(project, options);
    }
    return migrateLegacyProject(project || {}, options);
}

export const migrateProjectToV2 = normalizeProjectV2;
export const normalizeProject = normalizeProjectV2;

