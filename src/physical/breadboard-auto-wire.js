import { getSurfaceDefinition, holeWorldPosition } from './breadboard.js';
import { ConnectivityResolver, UnionFind } from './connectivity.js';
import { connectionRefKey, componentPinRef, resolveConnectionWorldPoint, surfaceHoleRef } from './model.js';
import { buildBreadboardHoleStates, HOLE_OCCUPANCY } from './placement.js';
import { componentRoutingObstacles, scoreRoute } from './routing.js';

function stableCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function logicalRef(endpoint) {
    return componentPinRef(endpoint.componentId, endpoint.pinId);
}

function mountedGroup(project, ref) {
    if (ref?.type !== 'component-pin') return null;
    const component = project.components.find(item => item.id === ref.componentId);
    if (component?.placement?.type !== 'surface') return null;
    const surface = project.surfaces.find(item => item.id === component.placement.surfaceId);
    const holeId = component.placement.bindings?.[ref.pinId];
    const hole = getSurfaceDefinition(surface)?.getHole(holeId);
    return hole ? {
        key: `group:${surface.id}:${hole.electricalGroup}`,
        type: 'breadboard-group',
        surfaceId: surface.id,
        electricalGroup: hole.electricalGroup,
        mountedHoleId: hole.id,
    } : null;
}

function physicalNode(project, ref) {
    return mountedGroup(project, ref) || {
        key: connectionRefKey(ref),
        type: 'direct-terminal',
        ref,
    };
}

function intendedNets(connections) {
    const graph = new UnionFind();
    const refs = new Map();
    for (const connection of connections) {
        const from = logicalRef(connection.from), to = logicalRef(connection.to);
        const fromKey = connectionRefKey(from), toKey = connectionRefKey(to);
        refs.set(fromKey, from); refs.set(toKey, to);
        graph.union(fromKey, toKey);
    }
    const nets = new Map();
    for (const [key, ref] of refs) {
        const root = graph.find(key);
        if (!nets.has(root)) nets.set(root, { refs: [], connections: [] });
        nets.get(root).refs.push(ref);
    }
    for (const connection of connections) {
        const root = graph.find(connectionRefKey(logicalRef(connection.from)));
        nets.get(root).connections.push(connection);
    }
    return [...nets.values()].map((net, index) => ({
        ...net,
        id: `net-${index + 1}:${net.refs.map(connectionRefKey).sort(stableCompare)[0]}`,
    }));
}

function freeGroupHoles(project, node, holeStates, reserved) {
    const surface = project.surfaces.find(item => item.id === node.surfaceId);
    const definition = getSurfaceDefinition(surface);
    return (definition?.getGroupHoles(node.electricalGroup) || [])
        .filter(holeId => {
            const key = `${node.surfaceId}:${holeId}`;
            return !reserved.has(key) && holeStates.get(key)?.state === HOLE_OCCUPANCY.FREE;
        })
        .map(holeId => ({
            key: `${node.surfaceId}:${holeId}`,
            ref: surfaceHoleRef(node.surfaceId, holeId),
            point: holeWorldPosition(surface, holeId),
        }));
}

function endpointOptions(project, island, holeStates, reserved) {
    const options = [];
    for (const node of island.nodes) {
        if (node.type === 'breadboard-group') options.push(...freeGroupHoles(project, node, holeStates, reserved));
        else {
            const point = resolveConnectionWorldPoint(project, node.ref);
            if (point) options.push({ key: node.key, ref: node.ref, point, direct: true });
        }
    }
    return options;
}

function bestEndpointPair(project, left, right, holeStates, reserved, obstacles) {
    const leftOptions = endpointOptions(project, left, holeStates, reserved);
    const rightOptions = endpointOptions(project, right, holeStates, reserved);
    let best = null;
    for (const from of leftOptions) for (const to of rightOptions) {
        if (from.key === to.key) continue;
        const route = [from.point, { x: from.point.x, y: to.point.y }, to.point];
        const alternate = [from.point, { x: to.point.x, y: from.point.y }, to.point];
        const routeScore = Math.min(
            scoreRoute(route, { obstacles }).score,
            scoreRoute(alternate, { obstacles }).score,
        );
        const score = routeScore + Number(!from.direct) * .05 + Number(!to.direct) * .05;
        if (!best || score < best.score || (score === best.score && `${from.key}:${to.key}` < `${best.from.key}:${best.to.key}`)) {
            best = { from, to, score };
        }
    }
    return best;
}

function initialIslands(project, net, baseConnectivity) {
    const physical = new Map();
    for (const ref of net.refs) {
        const node = physicalNode(project, ref);
        if (!physical.has(node.key)) physical.set(node.key, node);
    }
    const nodes = [...physical.values()];
    const graph = new UnionFind();
    for (const node of nodes) graph.add(node.key);
    for (let left = 0; left < nodes.length; left++) for (let right = left + 1; right < nodes.length; right++) {
        const leftRef = nodes[left].type === 'direct-terminal'
            ? nodes[left].ref
            : surfaceHoleRef(nodes[left].surfaceId, nodes[left].mountedHoleId);
        const rightRef = nodes[right].type === 'direct-terminal'
            ? nodes[right].ref
            : surfaceHoleRef(nodes[right].surfaceId, nodes[right].mountedHoleId);
        if (baseConnectivity.areConnected(leftRef, rightRef)) graph.union(nodes[left].key, nodes[right].key);
    }
    const islands = new Map();
    for (const node of nodes) {
        const root = graph.find(node.key);
        if (!islands.has(root)) islands.set(root, { key: root, nodes: [] });
        islands.get(root).nodes.push(node);
    }
    return [...islands.values()];
}

function connectionRecord(id, pair, net, color) {
    return {
        id,
        from: pair.from.ref,
        to: pair.to.ref,
        route: { mode: 'auto', waypoints: [] },
        color,
        properties: {
            generated: true,
            logicalNetId: net.id,
            logicalTerminals: net.refs.map(ref => structuredClone(ref)),
            breadboardAware: true,
        },
    };
}

/**
 * Convert logical Auto Wire intent into the minimum additional physical
 * jumpers. Existing manual wiring and fixed breadboard copper are considered
 * before any socket is reserved.
 */
export function realizeAutoWireConnections(project, connections, colorForConnection) {
    const preservedWires = project.wires.filter(wire => !wire.properties?.generated);
    const baseProject = { ...project, wires: preservedWires };
    const baseConnectivity = new ConnectivityResolver(baseProject);
    const generatedWireIds = project.wires.filter(wire => wire.properties?.generated).map(wire => wire.id);
    const holeStates = buildBreadboardHoleStates(project, { excludeWireIds: generatedWireIds });
    const reserved = new Set();
    const obstacles = componentRoutingObstacles(project);
    const realized = [];
    const diagnostics = [];
    const nets = intendedNets(connections);

    for (const net of nets) {
        const hasMountedPin = net.refs.some(ref => mountedGroup(project, ref));
        if (!hasMountedPin) {
            for (const connection of net.connections) {
                const from = logicalRef(connection.from), to = logicalRef(connection.to);
                if (baseConnectivity.areConnected(from, to)) continue;
                realized.push({
                    id: connection.id,
                    from,
                    to,
                    route: { mode: 'auto', waypoints: [] },
                    color: colorForConnection(connection, realized.length),
                    properties: { generated: Boolean(connection.generated), logicalNetId: net.id,
                        logicalTerminals: net.refs.map(ref => structuredClone(ref)) },
                });
            }
            continue;
        }

        const islands = initialIslands(project, net, baseConnectivity);
        let wireIndex = 0;
        while (islands.length > 1) {
            let best = null;
            for (let left = 0; left < islands.length; left++) for (let right = left + 1; right < islands.length; right++) {
                const pair = bestEndpointPair(project, islands[left], islands[right], holeStates, reserved, obstacles);
                if (!pair) continue;
                if (!best || pair.score < best.pair.score) best = { left, right, pair };
            }
            if (!best) {
                diagnostics.push({ code: 'breadboard-no-free-hole', netId: net.id });
                break;
            }
            for (const endpoint of [best.pair.from, best.pair.to]) {
                if (!endpoint.direct) reserved.add(endpoint.key);
            }
            wireIndex++;
            realized.push(connectionRecord(
                `breadboard-wire:${net.id}:${wireIndex}`,
                best.pair,
                net,
                colorForConnection(net.connections[0], realized.length),
            ));
            const merged = {
                key: `${islands[best.left].key}+${islands[best.right].key}`,
                nodes: [...islands[best.left].nodes, ...islands[best.right].nodes],
            };
            islands.splice(best.right, 1);
            islands.splice(best.left, 1, merged);
        }
    }

    return {
        status: diagnostics.length ? 'failure' : 'success',
        wires: diagnostics.length ? [] : realized,
        preservedWires,
        diagnostics,
        intent: connections.map(connection => ({
            id: connection.id,
            from: logicalRef(connection.from),
            to: logicalRef(connection.to),
            generated: Boolean(connection.generated),
        })),
    };
}
