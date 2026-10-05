import { getComponentDef } from '../component-library.js';
import { getSurfaceDefinition, holeWorldPosition } from './breadboard.js';
import { ConnectivityResolver, UnionFind } from './connectivity.js';
import { connectionRefKey, componentPinRef, resolveConnectionWorldPoint, surfaceHoleRef } from './model.js';
import { buildBreadboardHoleStates, HOLE_OCCUPANCY } from './placement.js';
import { componentRoutingObstacles, scoreRoute } from './routing.js';
import { distance } from './geometry.js';

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
    // Once an island is fed by a power rail, further supply wiring lands on the
    // rail instead of on a component's strip, as it would on a real board.
    const railFed = island.nodes.some(node => node.rail);
    for (const node of island.nodes) {
        if (railFed && node.type === 'breadboard-group' && !node.rail) continue;
        if (node.type === 'breadboard-group') options.push(...freeGroupHoles(project, node, holeStates, reserved));
        else {
            const point = resolveConnectionWorldPoint(project, node.ref);
            if (point) options.push({ key: node.key, ref: node.ref, point, direct: true });
        }
    }
    return options;
}

// Drop the corner when the endpoints already line up, so a straight jumper is
// not scored as a bend with a zero-length leg.
function elbowRoute(from, corner, to) {
    const same = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
    return same(corner, from) || same(corner, to) ? [from, to] : [from, corner, to];
}

function bestEndpointPair(project, left, right, holeStates, reserved, obstacles) {
    const leftOptions = endpointOptions(project, left, holeStates, reserved);
    const rightOptions = endpointOptions(project, right, holeStates, reserved);
    let best = null;
    for (const from of leftOptions) for (const to of rightOptions) {
        if (from.key === to.key) continue;
        const route = elbowRoute(from.point, { x: from.point.x, y: to.point.y }, to.point);
        const alternate = elbowRoute(from.point, { x: to.point.x, y: from.point.y }, to.point);
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

function initialIslands(project, net, baseConnectivity, railNodes = []) {
    const physical = new Map();
    for (const ref of net.refs) {
        const node = physicalNode(project, ref);
        if (!physical.has(node.key)) physical.set(node.key, node);
    }
    for (const node of railNodes) if (!physical.has(node.key)) physical.set(node.key, node);
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

/** Classify a net as a supply net when it includes a controller power or ground pin. */
function supplyPolarity(project, net) {
    for (const ref of net.refs) {
        const component = project.components.find(item => item.id === ref.componentId);
        const pins = getComponentDef(component?.definitionId)?.autoWirePins;
        if (!pins) continue;
        if ((pins.ground || []).includes(ref.pinId)) return 'ground';
        if ((pins.power || []).includes(ref.pinId)) return 'power';
    }
    return null;
}

function railNode(surface, definition, electricalGroup) {
    const holeId = definition.getGroupHoles(electricalGroup)[0];
    return {
        key: `group:${surface.id}:${electricalGroup}`,
        type: 'breadboard-group',
        rail: true,
        surfaceId: surface.id,
        electricalGroup,
        mountedHoleId: holeId,
    };
}

/**
 * Rail groups a supply net may use: matching polarity, not claimed by another
 * supply net in this run, and not already wired to a different net.
 */
function eligibleRailGroups(project, surface, definition, polarity, net, baseConnectivity, claimed, netIdByKey) {
    const groups = new Map();
    for (const hole of definition.holes) {
        if (hole.zone !== 'rail' || hole.polarity !== polarity || groups.has(hole.electricalGroup)) continue;
        const claimant = claimed.get(`${surface.id}:${hole.electricalGroup}`);
        if (claimant && claimant !== net.id) continue;
        // A rail already wired to a terminal of another intended net is taken.
        const foreign = baseConnectivity.netFor(surfaceHoleRef(surface.id, hole.id))
            .some(ref => (netIdByKey.get(connectionRefKey(ref)) ?? net.id) !== net.id);
        if (foreign) continue;
        groups.set(hole.electricalGroup, { rail: hole.rail, electricalGroup: hole.electricalGroup });
    }
    return [...groups.values()];
}

/**
 * Choose which rail each mounted part of a supply net plugs into: one rail row
 * per board (the one closest to the parts overall), and on split boards the
 * nearest segment of that row.
 */
function assignSupplyRails(project, net, polarity, islands, baseConnectivity, holeStates, reserved, claimed, netIdByKey) {
    const assignments = new Map();
    const bySurface = new Map();
    for (const island of islands) {
        if (island.nodes.some(node => node.rail)) continue;
        const mounted = island.nodes.filter(node => node.type === 'breadboard-group');
        if (!mounted.length) continue;
        const surfaceId = mounted[0].surfaceId;
        if (!bySurface.has(surfaceId)) bySurface.set(surfaceId, []);
        bySurface.get(surfaceId).push({ island, mounted: mounted.filter(node => node.surfaceId === surfaceId) });
    }
    const feeders = islands.flatMap(island => island.nodes)
        .filter(node => node.type === 'direct-terminal')
        .map(node => resolveConnectionWorldPoint(project, node.ref))
        .filter(Boolean);
    for (const [surfaceId, members] of bySurface) {
        const surface = project.surfaces.find(item => item.id === surfaceId);
        const definition = getSurfaceDefinition(surface);
        if (!definition) continue;
        const groups = eligibleRailGroups(project, surface, definition, polarity, net, baseConnectivity, claimed, netIdByKey)
            .map(group => ({
                ...group,
                holes: freeGroupHoles(project, { surfaceId, electricalGroup: group.electricalGroup }, holeStates, reserved)
                    .map(option => definition.getHole(option.ref.holeId)),
            }))
            .filter(group => group.holes.length);
        if (!groups.length) continue;
        const reach = (member, group) => Math.min(...member.mounted.flatMap(node => {
            const mountedHole = definition.getHole(node.mountedHoleId);
            return group.holes.map(hole => distance(hole, mountedHole));
        }));
        const rows = [...new Set(groups.map(group => group.rail))].map(rail => {
            const rowGroups = groups.filter(group => group.rail === rail);
            const picks = members.map(member => rowGroups
                .map(group => ({ group, reach: reach(member, group) }))
                .sort((a, b) => a.reach - b.reach || stableCompare(a.group.electricalGroup, b.group.electricalGroup))[0]);
            // The controller's feeder wire counts too, so a board above the
            // Arduino is fed on its bottom rail rather than across the parts.
            const feederReach = feeders.length ? Math.min(...feeders.flatMap(point => rowGroups.flatMap(group =>
                group.holes.map(hole => distance(point, holeWorldPosition(surface, hole.id)))))) : 0;
            // A rail the user already wired to this net is the one to keep using.
            const fed = rowGroups.some(group => net.refs.some(ref => baseConnectivity.areConnected(ref,
                surfaceHoleRef(surfaceId, definition.getGroupHoles(group.electricalGroup)[0]))));
            return { rail, picks, fed, total: picks.reduce((sum, pick) => sum + pick.reach, 0) + (fed ? 0 : feederReach) };
        }).sort((a, b) => Number(b.fed) - Number(a.fed) || a.total - b.total || stableCompare(a.rail, b.rail));
        const row = rows[0];
        row.picks.forEach((pick, index) => {
            const node = railNode(surface, definition, pick.group.electricalGroup);
            claimed.set(`${surfaceId}:${pick.group.electricalGroup}`, net.id);
            assignments.set(members[index].island.key, node);
        });
    }
    return assignments;
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
    const claimedRails = new Map();
    const netIdByKey = new Map(nets.flatMap(net => net.refs.map(ref => [connectionRefKey(ref), net.id])));

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

        const polarity = supplyPolarity(project, net);
        let islands = initialIslands(project, net, baseConnectivity);
        let wireIndex = 0;
        const pushWire = (pair, left, right) => {
            for (const endpoint of [pair.from, pair.to]) {
                if (!endpoint.direct) reserved.add(endpoint.key);
            }
            wireIndex++;
            realized.push(connectionRecord(
                `breadboard-wire:${net.id}:${wireIndex}`,
                pair,
                net,
                colorForConnection(net.connections[0], realized.length),
            ));
            const merged = {
                key: `${islands[left].key}+${islands[right].key}`,
                nodes: [...islands[left].nodes, ...islands[right].nodes],
            };
            islands.splice(Math.max(left, right), 1);
            islands.splice(Math.min(left, right), 1, merged);
        };

        if (polarity) {
            // Supply nets follow real breadboard practice: every mounted part
            // takes a short jumper to the nearest + or - rail, and the
            // controller feeds that rail, instead of daisy-chaining strips.
            const assignments = assignSupplyRails(project, net, polarity,
                islands, baseConnectivity, holeStates, reserved, claimedRails, netIdByKey);
            const railNodes = [...new Map([...assignments.values()].map(node => [node.key, node])).values()];
            if (railNodes.length) {
                const stripIslands = islands.filter(island => assignments.has(island.key));
                islands = initialIslands(project, net, baseConnectivity, railNodes);
                for (const stripIsland of stripIslands) {
                    const target = assignments.get(stripIsland.key);
                    const left = islands.findIndex(island => island.nodes.some(node => stripIsland.nodes.some(item => item.key === node.key)));
                    const right = islands.findIndex(island => island.nodes.some(node => node.key === target.key));
                    if (left < 0 || right < 0 || left === right) continue;
                    const pair = bestEndpointPair(project,
                        { nodes: islands[left].nodes.filter(node => !node.rail) },
                        { nodes: [target] },
                        holeStates, reserved, obstacles);
                    if (pair) pushWire(pair, left, right);
                }
            }
        }

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
            pushWire(best.pair, best.left, best.right);
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
