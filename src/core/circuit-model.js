/**
 * Pure helpers for Elera's versioned logical circuit model.
 *
 * This module deliberately has no store, DOM, renderer, or component-library
 * dependency. Planner code can therefore operate on snapshots without exposing
 * partially-mutated editor state.
 */

const ENDPOINT_KEY_PREFIX = 'ep:';

function cloneValue(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

function requiredString(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${label} must be a non-empty string.`);
    }
    return value;
}

/** Return a collision-safe, reversible key for a component pin endpoint. */
export function endpointKey(endpoint) {
    const componentId = requiredString(endpoint?.componentId ?? endpoint?.instanceId, 'componentId');
    const pinId = requiredString(endpoint?.pinId ?? endpoint?.pinName, 'pinId');
    return ENDPOINT_KEY_PREFIX + JSON.stringify([componentId, pinId]);
}

/** Decode a key produced by endpointKey(). */
export function endpointFromKey(key) {
    if (typeof key !== 'string' || !key.startsWith(ENDPOINT_KEY_PREFIX)) {
        throw new TypeError('Invalid endpoint key.');
    }
    const parsed = JSON.parse(key.slice(ENDPOINT_KEY_PREFIX.length));
    if (!Array.isArray(parsed) || parsed.length !== 2) throw new TypeError('Invalid endpoint key.');
    return {
        componentId: requiredString(parsed[0], 'componentId'),
        pinId: requiredString(parsed[1], 'pinId'),
    };
}

/**
 * Identify Arduino pins that are internally common without combining different
 * voltage domains. VIN and IOREF intentionally remain separate.
 */
export function arduinoCommonPinGroup(pinId) {
    const pin = String(pinId || '').trim().toUpperCase();
    if (/^GND(?:[._-]?\d+)?$/.test(pin) || pin === 'VSS') return 'ground';
    if (/^(?:5V|VCC)(?:[._-]?\d+)?$/.test(pin)) return 'power-5v';
    if (/^(?:3\.3V|3V3)(?:[._-]?\d+)?$/.test(pin)) return 'power-3v3';
    return null;
}

function connectionEnds(connection) {
    if (Array.isArray(connection) && connection.length === 2) return connection;
    if (connection?.from && connection?.to) return [connection.from, connection.to];
    throw new TypeError('A logical connection must contain exactly two endpoints.');
}

class UnionFind {
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
        const rankA = this.rank.get(rootA);
        const rankB = this.rank.get(rootB);
        if (rankA < rankB) [rootA, rootB] = [rootB, rootA];
        this.parent.set(rootB, rootA);
        if (rankA === rankB) this.rank.set(rootA, rankA + 1);
    }
}

function endpointRole(endpoint, pinTypeFor) {
    const explicit = endpoint.role ?? endpoint.pinType ?? endpoint.signal;
    const supplied = typeof pinTypeFor === 'function' ? pinTypeFor(endpoint) : null;
    return String(explicit ?? supplied ?? endpoint.pinId ?? endpoint.pinName ?? '').trim().toUpperCase();
}

/** Classify a logical net without depending on physical wire colors or routes. */
export function classifyNet(endpoints, { pinTypeFor } = {}) {
    let hasGround = false;
    let hasPower = false;

    for (const endpoint of endpoints || []) {
        const role = endpointRole(endpoint, pinTypeFor);
        hasGround ||= /^(?:GND(?:[._-]?\d+)?|GROUND|VSS)$/.test(role);
        hasPower ||= /^(?:POWER|VCC|VDD|5V(?:[._-]?\d+)?|3\.3V(?:[._-]?\d+)?|3V3|VIN)$/.test(role);
    }

    if (hasGround && hasPower) return 'conflict';
    if (hasGround) return 'ground';
    if (hasPower) return 'power';
    return 'signal';
}

/**
 * Build deterministic logical nets from pair connections.
 *
 * arduinoComponents is an array of component IDs. Referenced GND pins on each
 * Arduino are unioned together, as are referenced aliases for each voltage
 * domain. Separate Arduino boards are never joined implicitly.
 */
export function buildLogicalNets(connections, {
    arduinoComponents = [],
    internalGroups = [],
    pinTypeFor,
} = {}) {
    const unionFind = new UnionFind();
    const endpointsByKey = new Map();
    const connectionIdsByKey = new Map();
    const normalizedConnections = [];

    for (const [index, connection] of (connections || []).entries()) {
        const [rawFrom, rawTo] = connectionEnds(connection);
        const fromKey = endpointKey(rawFrom);
        const toKey = endpointKey(rawTo);
        const from = endpointFromKey(fromKey);
        const to = endpointFromKey(toKey);
        endpointsByKey.set(fromKey, { ...from, ...cloneValue(rawFrom), componentId: from.componentId, pinId: from.pinId });
        endpointsByKey.set(toKey, { ...to, ...cloneValue(rawTo), componentId: to.componentId, pinId: to.pinId });
        unionFind.union(fromKey, toKey);
        normalizedConnections.push({ id: connection?.id ?? `connection-${index + 1}`, fromKey, toKey });
    }

    const referencedByComponent = new Map();
    for (const [key, endpoint] of endpointsByKey) {
        if (!referencedByComponent.has(endpoint.componentId)) referencedByComponent.set(endpoint.componentId, []);
        referencedByComponent.get(endpoint.componentId).push({ key, endpoint });
    }

    for (const componentId of arduinoComponents) {
        const byGroup = new Map();
        for (const item of referencedByComponent.get(componentId) || []) {
            const group = arduinoCommonPinGroup(item.endpoint.pinId);
            if (!group) continue;
            if (byGroup.has(group)) unionFind.union(item.key, byGroup.get(group));
            else byGroup.set(group, item.key);
        }
    }

    for (const group of internalGroups || []) {
        const keys = group.map(endpoint => {
            const key = endpointKey(endpoint);
            if (!endpointsByKey.has(key)) {
                const normalized = endpointFromKey(key);
                endpointsByKey.set(key, { ...normalized, ...cloneValue(endpoint), componentId: normalized.componentId, pinId: normalized.pinId });
            }
            unionFind.add(key);
            return key;
        });
        for (let index = 1; index < keys.length; index++) unionFind.union(keys[0], keys[index]);
    }

    for (const connection of normalizedConnections) {
        for (const key of [connection.fromKey, connection.toKey]) {
            const root = unionFind.find(key);
            if (!connectionIdsByKey.has(root)) connectionIdsByKey.set(root, new Set());
            connectionIdsByKey.get(root).add(connection.id);
        }
    }

    const groups = new Map();
    for (const [key, endpoint] of endpointsByKey) {
        const root = unionFind.find(key);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push({ key, endpoint });
    }

    return [...groups.values()]
        .map(items => {
            items.sort((a, b) => a.key.localeCompare(b.key));
            const endpoints = items.map(item => item.endpoint);
            return {
                id: `net:${items.map(item => item.key).join('|')}`,
                kind: classifyNet(endpoints, { pinTypeFor }),
                endpointKeys: items.map(item => item.key),
                endpoints,
                connectionIds: [...(connectionIdsByKey.get(unionFind.find(items[0].key)) || [])].sort(),
            };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
}

/** Make an independent copy of a serializable circuit document. */
export function cloneCircuitDocument(document) {
    if (!document || typeof document !== 'object') throw new TypeError('Circuit document must be an object.');
    return cloneValue(document);
}

export function revisionMatches(document, expectedRevision) {
    return Number(document?.revision ?? 0) === Number(expectedRevision);
}

/** Apply an update to a clone and advance its revision exactly once. */
export function withNextRevision(document, update) {
    const currentRevision = Number(document?.revision ?? 0);
    let next = cloneCircuitDocument(document);
    if (typeof update === 'function') {
        const replacement = update(next);
        if (replacement !== undefined) next = cloneCircuitDocument(replacement);
    } else if (update && typeof update === 'object') {
        Object.assign(next, cloneValue(update));
    }
    next.revision = currentRevision + 1;
    return next;
}

function immutablePlannerResult(result) {
    return deepFreeze(cloneValue(result));
}

export function plannerSuccess({ sourceRevision, documentPatch = null, physicalPlan }) {
    if (!physicalPlan || typeof physicalPlan !== 'object') throw new TypeError('physicalPlan is required.');
    return immutablePlannerResult({
        status: 'success',
        sourceRevision: Number(sourceRevision ?? 0),
        documentPatch,
        physicalPlan,
    });
}

export function plannerNeedsResourceAction({ sourceRevision, problem, alternatives = [] }) {
    if (!problem || typeof problem !== 'object') throw new TypeError('problem is required.');
    return immutablePlannerResult({
        status: 'needs-resource-action',
        sourceRevision: Number(sourceRevision ?? 0),
        problem,
        alternatives,
    });
}

export function plannerFailure({ sourceRevision, diagnostics = [] }) {
    return immutablePlannerResult({
        status: 'failure',
        sourceRevision: Number(sourceRevision ?? 0),
        diagnostics,
    });
}
