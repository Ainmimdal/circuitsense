import { getBoardDefinition } from './board-registry.js';
import {
    createRigidPlacementTransform,
    deriveFootprintHoles,
    footprintIsBreadboardLegal,
    getComponentGeometry,
    getFootprint,
    transformNativePoint,
} from './component-geometry.js';
import {
    buildLogicalNets,
    endpointKey,
    plannerFailure,
    plannerNeedsResourceAction,
    plannerSuccess,
} from './circuit-model.js';
import { inferJumperType } from '../breadboard-model.js';
import { getComponentDef } from '../component-library.js';

function isController(component) {
    return Boolean(getComponentDef(component?.componentId || component?.typeId)?.isControllerBoard);
}

function isAutoWireController(component) {
    return Boolean(getComponentDef(component?.componentId || component?.typeId)?.autoWirePins);
}

function boardResource(resource) {
    const definition = getBoardDefinition(resource.typeId || resource.componentId);
    if (!definition) return null;
    return {
        id: resource.id,
        typeId: definition.id,
        x: Number(resource.x) || 0,
        y: Number(resource.y) || 0,
        locked: Boolean(resource.locked),
        definition,
    };
}

function endpointNetMap(nets, components) {
    const result = new Map();
    for (const net of nets) {
        for (const endpoint of net.endpoints) result.set(endpointKey(endpoint), net.id);
    }
    for (const component of components) {
        const geometry = getComponentGeometry(component.componentId || component.typeId);
        for (const group of geometry?.footprints?.[0]?.internalPinGroups || []) {
            const assigned = group.map(pinId => result.get(endpointKey({ componentId: component.id, pinId }))).filter(Boolean);
            const unique = [...new Set(assigned)];
            if (unique.length > 1) return { map: result, conflict: { componentId: component.id, pins: group } };
            const netId = unique[0] || `floating:${component.id}:${group.join('|')}`;
            for (const pinId of group) result.set(endpointKey({ componentId: component.id, pinId }), netId);
        }
    }
    return { map: result, conflict: null };
}

function pointForHole(board, holeId) {
    const hole = board.definition.getHole(holeId);
    return hole ? { x: board.x + hole.x, y: board.y + hole.y } : null;
}

function visualRect(componentId, transform) {
    const size = getComponentGeometry(componentId).native.size;
    const corners = [
        { x: 0, y: 0 }, { x: size.width, y: 0 },
        { x: size.width, y: size.height }, { x: 0, y: size.height },
    ].map(point => transformNativePoint(point, transform));
    return {
        left: Math.min(...corners.map(point => point.x)),
        right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)),
        bottom: Math.max(...corners.map(point => point.y)),
    };
}

function rectsOverlap(a, b, margin = 3) {
    return a.left < b.right + margin && a.right > b.left - margin &&
        a.top < b.bottom + margin && a.bottom > b.top - margin;
}

function candidateFor({ component, board, footprint, anchorHole, rotation, occupied, groupNets, netByEndpoint, rects, preferredX }) {
    const holes = deriveFootprintHoles(component.componentId, {
        anchorHole: anchorHole.id,
        footprintId: footprint.id,
        rotation,
        columns: board.definition.columns,
    });
    if (!holes) return null;
    if (!footprintIsBreadboardLegal(component.componentId, holes,
        holeId => board.definition.getHole(holeId), footprint.id)) return null;

    const localGroups = new Map();
    let score = 0;
    for (const [pinId, holeId] of Object.entries(holes)) {
        const hole = board.definition.getHole(holeId);
        if (!hole || hole.zone !== 'terminal' || occupied.has(`${board.id}:${holeId}`)) return null;
        const netId = netByEndpoint.get(endpointKey({ componentId: component.id, pinId })) || `floating:${component.id}:${pinId}`;
        const groupKey = `${board.id}:${hole.groupId}`;
        const assignedNet = groupNets.get(groupKey) || localGroups.get(groupKey);
        if (assignedNet && assignedNet !== netId) return null;
        localGroups.set(groupKey, netId);

        const sameNetGroups = [...groupNets.entries()].filter(([, value]) => value === netId);
        if (sameNetGroups.some(([key]) => key === groupKey)) score -= 1000;
        else if (sameNetGroups.length) {
            const nearest = Math.min(...sameNetGroups.map(([key]) => {
                const [otherBoardId, ...groupParts] = key.split(':');
                if (otherBoardId !== board.id) return 500;
                const groupId = groupParts.join(':');
                const representative = board.definition.holes.find(item => item.groupId === groupId);
                return representative ? Math.abs(representative.x - hole.x) + Math.abs(representative.y - hole.y) : 500;
            }));
            score += nearest;
        }
    }

    const anchorWorld = pointForHole(board, anchorHole.id);
    const transform = createRigidPlacementTransform(component.componentId, {
        anchorWorld,
        footprintId: footprint.id,
        rotation,
        pitch: board.definition.pitch,
    });
    const rect = transform && visualRect(component.componentId, transform);
    if (!rect) return null;
    const boardRect = { left: board.x + 4, right: board.x + board.definition.width - 4, top: board.y + 4, bottom: board.y + board.definition.height - 4 };
    if (rect.left < boardRect.left || rect.right > boardRect.right || rect.top < boardRect.top || rect.bottom > boardRect.bottom) return null;
    if (rects.some(existing => rectsOverlap(rect, existing.rect))) return null;

    const centerX = (rect.left + rect.right) / 2;
    score += Math.abs(centerX - (preferredX ?? board.x + board.definition.width / 2)) * 0.75;
    return { componentId: component.id, boardId: board.id, footprintId: footprint.id, rotation, anchorHole: anchorHole.id, holes, transform, rect, localGroups, score };
}

function signalPositionByComponent(components, connections) {
    const arduino = components.find(isAutoWireController);
    if (!arduino) return new Map();
    const controllerDef = getComponentDef(arduino.componentId);
    const controllerPins = controllerDef.autoWirePins;
    const controllerGeometry = getComponentGeometry(arduino.componentId);
    const adjacency = new Map();
    const add = (from, to) => {
        if (!adjacency.has(from.componentId)) adjacency.set(from.componentId, []);
        adjacency.get(from.componentId).push(to);
    };
    for (const connection of connections) {
        add(connection.from, connection.to);
        add(connection.to, connection.from);
    }
    const isSupply = pin => controllerPins.power.includes(pin) || controllerPins.ground.includes(pin) ||
        /^(?:GND(?:\.|$)|5V$|3\.3V$|3V3$|VIN$|VCC(?:\.|$)|VDD$|VSS$)/i.test(String(pin));
    const normalizedHeaderPosition = pin => {
        const physicalPin = controllerGeometry?.native?.pins?.[pin];
        if (physicalPin) return Math.max(0, Math.min(1, physicalPin.x / controllerGeometry.native.size.width));
        const digital = /^(\d+)$/.exec(String(pin));
        if (digital) return Math.max(0, Math.min(1, (13 - Number(digital[1])) / 13));
        const analog = /^A([0-5])$/.exec(String(pin));
        if (analog) return 0.64 + Number(analog[1]) * 0.055;
        return 0.5;
    };
    const result = new Map();
    for (const component of components) {
        if (component.id === arduino.id) continue;
        const queue = [{ id: component.id, distance: 0 }];
        const visited = new Set();
        let best = null;
        while (queue.length) {
            const current = queue.shift();
            if (visited.has(current.id) || current.distance > 4) continue;
            visited.add(current.id);
            for (const endpoint of adjacency.get(current.id) || []) {
                if (endpoint.componentId === arduino.id && !isSupply(endpoint.pinId)) {
                    best = normalizedHeaderPosition(endpoint.pinId);
                    break;
                }
                if (!visited.has(endpoint.componentId)) queue.push({ id: endpoint.componentId, distance: current.distance + 1 });
            }
            if (best !== null) break;
        }
        if (best !== null) result.set(component.id, best);
    }
    return result;
}

function placeOnBoards({ components, connections, resources, constraints = [], pinTypeFor }) {
    const boards = resources.map(boardResource).filter(Boolean);
    const mountable = components.filter(component => getComponentGeometry(component.componentId));
    if (mountable.length && !boards.length) return { ok: false, reason: 'breadboard-required', unplaced: mountable.map(item => item.id) };

    const arduinoComponents = components.filter(isController).map(component => component.id);
    const nets = buildLogicalNets(connections, { arduinoComponents, pinTypeFor });
    const netMapResult = endpointNetMap(nets, components);
    if (netMapResult.conflict) return { ok: false, reason: 'component-internal-short', conflict: netMapResult.conflict, unplaced: [] };

    const constraintsByComponent = new Map(constraints.map(constraint => [constraint.componentId || constraint.instanceId, constraint]));
    const occupied = new Set();
    const groupNets = new Map();
    const rects = [];
    const placements = [];
    const signalPositions = signalPositionByComponent(components, connections);
    const sorted = [...mountable].sort((a, b) => {
        const lockA = Number(Boolean(constraintsByComponent.get(a.id)?.locked));
        const lockB = Number(Boolean(constraintsByComponent.get(b.id)?.locked));
        if (lockA !== lockB) return lockB - lockA;
        const pinsA = Object.keys(getFootprint(a.componentId)?.pins || {}).length;
        const pinsB = Object.keys(getFootprint(b.componentId)?.pins || {}).length;
        return pinsB - pinsA ||
            (signalPositions.get(a.id) ?? 0.5) - (signalPositions.get(b.id) ?? 0.5) ||
            String(a.id).localeCompare(String(b.id));
    });

    for (const component of sorted) {
        const geometry = getComponentGeometry(component.componentId);
        const constraint = constraintsByComponent.get(component.id);
        const candidates = [];
        for (const board of boards) {
            if (constraint?.boardId && constraint.boardId !== board.id) continue;
            const preferredX = board.x + 35 + (signalPositions.get(component.id) ?? 0.5) * (board.definition.width - 70);
            for (const footprint of geometry.footprints) {
                for (const rotation of footprint.rotations) {
                    if (constraint?.rotation !== undefined && Number(constraint.rotation) !== rotation) continue;
                    for (const anchorHole of board.definition.holes) {
                        if (anchorHole.zone !== 'terminal') continue;
                        if (constraint?.anchorHole && constraint.anchorHole !== anchorHole.id) continue;
                        const candidate = candidateFor({ component, board, footprint, anchorHole, rotation, occupied, groupNets, netByEndpoint: netMapResult.map, rects, preferredX });
                        if (candidate) candidates.push(candidate);
                    }
                }
            }
        }
        candidates.sort((a, b) => a.score - b.score || a.boardId.localeCompare(b.boardId) || a.anchorHole.localeCompare(b.anchorHole));
        const chosen = candidates[0];
        if (!chosen) return { ok: false, reason: constraint?.locked ? 'locked-placement-invalid' : 'no-legal-footprint-placement', unplaced: [component.id, ...sorted.slice(sorted.indexOf(component) + 1).map(item => item.id)] };

        placements.push(chosen);
        rects.push({ componentId: component.id, rect: chosen.rect });
        for (const holeId of Object.values(chosen.holes)) occupied.add(`${chosen.boardId}:${holeId}`);
        for (const [groupKey, netId] of chosen.localGroups) groupNets.set(groupKey, netId);
    }

    const contacts = placements.flatMap(placement => Object.entries(placement.holes).map(([pinId, holeId]) => ({ componentId: placement.componentId, pinId, boardId: placement.boardId, holeId })));
    return { ok: true, boards, nets, placements, contacts, groupNets: [...groupNets].map(([groupKey, netId]) => ({ groupKey, netId })) };
}

function virtualHalfBoard(resources, components) {
    const first = resources[0];
    const arduino = components.find(isController);
    return {
        id: `planned-breadboard-${resources.length + 1}`,
        typeId: 'breadboard-half-400',
        x: first ? first.x + getBoardDefinition(first.typeId).width + 60 : (arduino?.x || 100) - 28,
        y: first ? first.y : (arduino?.y || 100) + 280,
    };
}

function virtualFullBoard(resources, components) {
    const first = resources[0];
    const arduino = components.find(isController);
    return {
        id: first?.id || 'planned-breadboard-full',
        typeId: 'breadboard-full-830',
        x: first?.x ?? (arduino?.x || 100) - 188,
        y: first?.y ?? (arduino?.y || 100) + 280,
    };
}

function connectorTypeForComponent(component) {
    if (component?.connectorType) return component.connectorType;
    return getComponentDef(component?.componentId || component?.typeId)?.connectorType || 'male';
}

function componentPinEndpoint(endpoint, componentsById) {
    return {
        kind: 'component-pin',
        componentId: endpoint.componentId,
        pinId: endpoint.pinId,
        connectorType: connectorTypeForComponent(componentsById.get(endpoint.componentId)),
    };
}

function boardHoleEndpoint(board, hole) {
    return {
        kind: 'board-hole',
        boardId: board.id,
        holeId: hole.id,
        groupId: hole.groupId,
        connectorType: hole.connectorType,
    };
}

function conductorId(netId, kind, index) {
    return `conductor:${encodeURIComponent(netId)}:${kind}:${index}`;
}

/**
 * Convert logical nets and rigid contacts into serializable physical conductors.
 * Mounted leads are contacts, not artificial wires, and logical endpoints are
 * never rewritten onto breadboard holes.
 */
function synthesizeConductors(result, components) {
    const componentsById = new Map(components.map(component => [component.id, component]));
    const boardsById = new Map(result.boards.map(board => [board.id, board]));
    const netByEndpoint = new Map();
    for (const net of result.nets) {
        for (const endpoint of net.endpoints) netByEndpoint.set(endpointKey(endpoint), net.id);
    }
    const groupNetMap = new Map(result.groupNets.map(({ groupKey, netId }) => [groupKey, netId]));
    const usedHoles = new Set(result.contacts.map(contact => `${contact.boardId}:${contact.holeId}`));
    const blockedHoles = new Set();
    for (const placement of result.placements) {
        const board = boardsById.get(placement.boardId);
        if (!board) continue;
        for (const hole of board.definition.holes) {
            const x = board.x + hole.x;
            const y = board.y + hole.y;
            if (x > placement.rect.left && x < placement.rect.right &&
                y > placement.rect.top && y < placement.rect.bottom) {
                blockedHoles.add(`${board.id}:${hole.id}`);
            }
        }
    }
    const railGroupNets = new Map();
    const contacts = result.contacts.map(contact => {
        const board = boardsById.get(contact.boardId);
        const hole = board?.definition.getHole(contact.holeId);
        return {
            kind: 'mounted-contact',
            componentId: contact.componentId,
            pinId: contact.pinId,
            boardId: contact.boardId,
            holeId: contact.holeId,
            groupId: hole?.groupId || null,
            netId: netByEndpoint.get(endpointKey(contact)) || groupNetMap.get(`${contact.boardId}:${hole?.groupId}`) || null,
            componentConnectorType: connectorTypeForComponent(componentsById.get(contact.componentId)),
            holeConnectorType: hole?.connectorType || 'female',
        };
    });
    const contactByEndpoint = new Map(contacts.map(contact => [endpointKey(contact), contact]));
    const conductors = [];
    const diagnostics = [];

    const addConductor = (netId, kind, from, to) => {
        conductors.push({
            id: conductorId(netId, kind, conductors.length + 1),
            netId,
            kind,
            from,
            to,
            jumperType: inferJumperType(from.connectorType, to.connectorType),
        });
    };

    const distance = (a, b) => a && b ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) : 0;

    const freeGroupHole = (board, groupId, target = null) => {
        const hole = board.definition.holes
            .filter(item => item.groupId === groupId &&
                !usedHoles.has(`${board.id}:${item.id}`) &&
                !blockedHoles.has(`${board.id}:${item.id}`))
            .sort((a, b) => distance(a, target) - distance(b, target) ||
                a.id.localeCompare(b.id, undefined, { numeric: true }))[0];
        if (hole) usedHoles.add(`${board.id}:${hole.id}`);
        return hole || null;
    };

    const railGroups = (board, kind) => {
        const polarity = kind === 'ground' ? 'ground' : 'power';
        const grouped = new Map();
        for (const hole of board.definition.holes.filter(item => item.zone === 'rail' && item.polarity === polarity)) {
            if (!grouped.has(hole.groupId)) grouped.set(hole.groupId, []);
            grouped.get(hole.groupId).push(hole);
        }
        return [...grouped.entries()].map(([groupId, holes]) => ({
            groupId,
            holes: holes.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
        }));
    };

    const allocateRail = (board, netId, requiredHoles, targets = []) => {
        const netKind = result.nets.find(net => net.id === netId)?.kind;
        const candidates = railGroups(board, netKind)
            .filter(candidate => {
                const assigned = railGroupNets.get(`${board.id}:${candidate.groupId}`);
                const free = candidate.holes.filter(hole =>
                    !usedHoles.has(`${board.id}:${hole.id}`) &&
                    !blockedHoles.has(`${board.id}:${hole.id}`)).length;
                return (!assigned || assigned === netId) && free >= requiredHoles;
            })
            .sort((a, b) => {
                const score = candidate => targets.filter(Boolean).reduce((sum, target) =>
                    sum + Math.min(...candidate.holes.map(hole => distance(
                        { x: board.x + hole.x, y: board.y + hole.y }, target))), 0);
                return score(a) - score(b) || a.groupId.localeCompare(b.groupId);
            });
        const chosen = candidates[0];
        if (chosen) railGroupNets.set(`${board.id}:${chosen.groupId}`, netId);
        return chosen || null;
    };

    const takeRailHole = (board, allocation, target = null) => {
        const localTarget = target ? { x: target.x - board.x, y: target.y - board.y } : null;
        const hole = allocation?.holes
            .filter(item =>
                !usedHoles.has(`${board.id}:${item.id}`) &&
                !blockedHoles.has(`${board.id}:${item.id}`))
            .sort((a, b) => distance(a, localTarget) - distance(b, localTarget) ||
                a.id.localeCompare(b.id, undefined, { numeric: true }))[0];
        if (hole) usedHoles.add(`${board.id}:${hole.id}`);
        return hole || null;
    };

    const groupRefsForNet = net => {
        const refs = new Map();
        const netContacts = contacts.filter(item => item.netId === net.id && item.groupId);
        const suppressed = new Set();
        for (const component of components) {
            const internalGroups = getComponentGeometry(component.componentId || component.typeId)?.footprints?.[0]?.internalPinGroups || [];
            for (const internalPins of internalGroups) {
                const keys = [...new Set(netContacts
                    .filter(contact => contact.componentId === component.id && internalPins.includes(contact.pinId))
                    .map(contact => `${contact.boardId}:${contact.groupId}`))].sort();
                for (const key of keys.slice(1)) suppressed.add(key);
            }
        }
        for (const contact of netContacts) {
            const key = `${contact.boardId}:${contact.groupId}`;
            if (suppressed.has(key)) continue;
            if (!refs.has(key)) refs.set(key, { kind: 'group', boardId: contact.boardId, groupId: contact.groupId });
        }
        return [...refs.values()].sort((a, b) => `${a.boardId}:${a.groupId}`.localeCompare(`${b.boardId}:${b.groupId}`));
    };

    const nodePoint = node => {
        if (node.kind === 'component-pin') {
            const component = componentsById.get(node.componentId);
            return component ? { x: Number(component.x) || 0, y: Number(component.y) || 0 } : null;
        }
        const board = boardsById.get(node.boardId);
        const holes = board?.definition.holes.filter(hole => hole.groupId === node.groupId) || [];
        if (!holes.length) return null;
        return {
            x: board.x + holes.reduce((sum, hole) => sum + hole.x, 0) / holes.length,
            y: board.y + holes.reduce((sum, hole) => sum + hole.y, 0) / holes.length,
        };
    };

    const resolveNode = (node, target = null) => {
        if (node.kind === 'component-pin') return node;
        const board = boardsById.get(node.boardId);
        const localTarget = target && board ? { x: target.x - board.x, y: target.y - board.y } : null;
        const hole = board && freeGroupHole(board, node.groupId, localTarget);
        if (!board || !hole) return null;
        return boardHoleEndpoint(board, hole);
    };

    const endpointPoint = endpoint => {
        if (!endpoint) return null;
        if (endpoint.kind === 'component-pin') return nodePoint(endpoint);
        const board = boardsById.get(endpoint.boardId);
        const hole = board?.definition.getHole(endpoint.holeId);
        return board && hole ? { x: board.x + hole.x, y: board.y + hole.y } : null;
    };

    for (const net of [...result.nets].sort((a, b) => a.id.localeCompare(b.id))) {
        const groups = groupRefsForNet(net);
        const external = net.endpoints
            .filter(endpoint => !contactByEndpoint.has(endpointKey(endpoint)))
            .map(endpoint => componentPinEndpoint(endpoint, componentsById))
            .sort((a, b) => `${a.componentId}:${a.pinId}`.localeCompare(`${b.componentId}:${b.pinId}`));
        external.sort((a, b) => {
            const arduinoA = Number(isController(componentsById.get(a.componentId)));
            const arduinoB = Number(isController(componentsById.get(b.componentId)));
            return arduinoB - arduinoA || `${a.componentId}:${a.pinId}`.localeCompare(`${b.componentId}:${b.pinId}`);
        });

        const useRail = (net.kind === 'power' || net.kind === 'ground') && groups.length > 0;
        if (!useRail) {
            const nodes = [...external, ...groups];
            // One physical node means the net is already complete. In particular,
            // multiple mounted contacts in the same terminal strip need no jumper.
            const connected = nodes.length ? [nodes.shift()] : [];
            while (nodes.length) {
                let best = null;
                for (const fromNode of connected) {
                    for (const toNode of nodes) {
                        const score = distance(nodePoint(fromNode), nodePoint(toNode));
                        if (!best || score < best.score) best = { fromNode, toNode, score };
                    }
                }
                const from = resolveNode(best.fromNode, nodePoint(best.toNode));
                const to = resolveNode(best.toNode, endpointPoint(from) || nodePoint(best.fromNode));
                if (!from || !to) {
                    diagnostics.push({ code: 'NO_FREE_TERMINAL_HOLE', netId: net.id });
                } else {
                    addConductor(net.id, from.kind === 'component-pin' && to.kind === 'component-pin' ? 'direct' : 'jumper', from, to);
                }
                connected.push(best.toNode);
                nodes.splice(nodes.indexOf(best.toNode), 1);
            }
            continue;
        }

        const groupsByBoard = new Map();
        for (const group of groups) {
            if (!groupsByBoard.has(group.boardId)) groupsByBoard.set(group.boardId, []);
            groupsByBoard.get(group.boardId).push(group);
        }
        const boardIds = [...groupsByBoard.keys()].sort();
        let feederSource = external.shift() || null;
        let previousRail = null;
        const allAllocations = [];

        const allocationPoint = (board, allocation) => ({
            x: board.x + allocation.holes.reduce((sum, hole) => sum + hole.x, 0) / allocation.holes.length,
            y: board.y + allocation.holes.reduce((sum, hole) => sum + hole.y, 0) / allocation.holes.length,
        });

        for (const [boardIndex, boardId] of boardIds.entries()) {
            const board = boardsById.get(boardId);
            const boardGroups = [...groupsByBoard.get(boardId)];
            const incoming = feederSource || previousRail;
            const incomingPoint = endpointPoint(incoming) || nodePoint(boardGroups[0]);
            const assignments = new Map();

            // A half board has one continuous rail group per polarity on each edge.
            // Prefer one adequately sized bus for the whole net; assigning each
            // terminal group independently creates needless top-to-bottom loops.
            const availableRails = board ? railGroups(board, net.kind) : [];
            const sharedRequired = boardGroups.length + 1 + external.length +
                Number(boardIndex < boardIds.length - 1);
            const sharedAllocation = availableRails.length <= 2
                ? allocateRail(board, net.id, sharedRequired, [incomingPoint, ...boardGroups.map(nodePoint)])
                : null;
            if (sharedAllocation) {
                assignments.set(sharedAllocation.groupId, {
                    allocation: sharedAllocation,
                    groups: [...boardGroups],
                });
            } else {
                for (const group of boardGroups) {
                    const allocation = board && allocateRail(board, net.id, 4, [nodePoint(group)]);
                    if (!allocation) continue;
                    if (!assignments.has(allocation.groupId)) assignments.set(allocation.groupId, { allocation, groups: [] });
                    assignments.get(allocation.groupId).groups.push(group);
                }
            }
            const boardAllocations = [...assignments.values()];
            if (!board || !boardAllocations.length) {
                diagnostics.push({ code: 'NO_FREE_RAIL_GROUP', netId: net.id, boardId });
                continue;
            }

            boardAllocations.sort((a, b) =>
                distance(allocationPoint(board, a.allocation), incomingPoint) -
                distance(allocationPoint(board, b.allocation), incomingPoint));
            const feederAllocation = boardAllocations[0];
            const feederHole = takeRailHole(board, feederAllocation.allocation, incomingPoint);
            let feederFrom = incoming;
            let sourceGroup = null;
            if (!feederFrom && feederAllocation.groups.length) {
                sourceGroup = feederAllocation.groups.shift();
                feederFrom = resolveNode(sourceGroup, feederHole && { x: board.x + feederHole.x, y: board.y + feederHole.y });
            }
            if (feederFrom && feederHole) {
                addConductor(net.id, 'rail-feeder', feederFrom, boardHoleEndpoint(board, feederHole));
            }
            feederSource = null;
            previousRail = null;

            for (const assignment of boardAllocations) {
                for (const group of assignment.groups) {
                    const railHole = takeRailHole(board, assignment.allocation, nodePoint(group));
                    const terminal = resolveNode(group, railHole && { x: board.x + railHole.x, y: board.y + railHole.y });
                    if (!terminal || !railHole) {
                        diagnostics.push({ code: 'NO_FREE_BRANCH_HOLE', netId: net.id, boardId });
                        continue;
                    }
                    addConductor(net.id, 'rail-branch', terminal, boardHoleEndpoint(board, railHole));
                }
            }

            const connected = [feederAllocation];
            const remaining = boardAllocations.filter(item => item !== feederAllocation);
            while (remaining.length) {
                let best = null;
                for (const from of connected) {
                    for (const to of remaining) {
                        const score = distance(allocationPoint(board, from.allocation), allocationPoint(board, to.allocation));
                        if (!best || score < best.score) best = { from, to, score };
                    }
                }
                const fromTarget = allocationPoint(board, best.to.allocation);
                const toTarget = allocationPoint(board, best.from.allocation);
                const fromHole = takeRailHole(board, best.from.allocation, fromTarget);
                const toHole = takeRailHole(board, best.to.allocation, toTarget);
                if (fromHole && toHole) {
                    addConductor(net.id, 'rail-link', boardHoleEndpoint(board, fromHole), boardHoleEndpoint(board, toHole));
                }
                connected.push(best.to);
                remaining.splice(remaining.indexOf(best.to), 1);
            }

            for (const assignment of boardAllocations) allAllocations.push({ board, allocation: assignment.allocation });
            if (boardIndex < boardIds.length - 1) {
                const nextTarget = nodePoint(groupsByBoard.get(boardIds[boardIndex + 1])?.[0]);
                const outgoingAllocation = [...boardAllocations].sort((a, b) =>
                    distance(allocationPoint(board, a.allocation), nextTarget) -
                    distance(allocationPoint(board, b.allocation), nextTarget))[0];
                const linkHole = takeRailHole(board, outgoingAllocation.allocation, nextTarget);
                previousRail = linkHole ? boardHoleEndpoint(board, linkHole) : null;
            }
        }

        for (const endpoint of external) {
            const target = nodePoint(endpoint);
            const nearest = [...allAllocations].sort((a, b) =>
                distance(allocationPoint(a.board, a.allocation), target) -
                distance(allocationPoint(b.board, b.allocation), target))[0];
            const railHole = nearest && takeRailHole(nearest.board, nearest.allocation, target);
            if (!railHole) {
                diagnostics.push({ code: 'NO_FREE_EXTERNAL_RAIL_HOLE', netId: net.id, boardId: nearest?.board.id });
                continue;
            }
            addConductor(net.id, 'rail-branch', endpoint, boardHoleEndpoint(nearest.board, railHole));
        }
    }

    return { contacts, conductors, diagnostics };
}

function physicalPlanFromPlacement(result, sourceRevision, components) {
    const realization = synthesizeConductors(result, components);
    return {
        sourceRevision,
        status: 'complete',
        resources: result.boards.map(({ definition, ...board }) => board),
        placements: result.placements,
        contacts: realization.contacts,
        nets: result.nets,
        groupAssignments: result.groupNets,
        conductors: realization.conductors,
        routes: [],
        diagnostics: realization.diagnostics,
    };
}

export function planBreadboardCircuit({ revision = 0, components = [], connections = [], resources = [], constraints = [], pinTypeFor } = {}) {
    const current = placeOnBoards({ components, connections, resources, constraints, pinTypeFor });
    if (current.ok) {
        return plannerSuccess({ sourceRevision: revision, physicalPlan: physicalPlanFromPlacement(current, revision, components) });
    }
    if (current.reason === 'component-internal-short') {
        return plannerFailure({ sourceRevision: revision, diagnostics: [{ code: current.reason, ...current.conflict }] });
    }

    const alternatives = [];
    const addedResources = [...resources, virtualHalfBoard(resources, components)];
    const added = placeOnBoards({ components, connections, resources: addedResources, constraints, pinTypeFor });
    if (added.ok) alternatives.push({ action: 'add-board', boardType: 'breadboard-half-400', count: 1, physicalPlan: physicalPlanFromPlacement(added, revision, components) });

    const fullResource = virtualFullBoard(resources, components);
    const replacedResources = resources.length ? [fullResource, ...resources.slice(1)] : [fullResource];
    const replaced = placeOnBoards({ components, connections, resources: replacedResources, constraints: constraints.filter(constraint => !constraint.boardId || constraint.boardId === fullResource.id), pinTypeFor });
    if (replaced.ok) alternatives.push({ action: resources.length ? 'replace-board' : 'add-board', boardType: 'breadboard-full-830', count: 1, physicalPlan: physicalPlanFromPlacement(replaced, revision, components) });

    if (!alternatives.length && current.reason !== 'breadboard-required') {
        return plannerFailure({ sourceRevision: revision, diagnostics: [{ code: current.reason, unplacedComponents: current.unplaced }] });
    }
    return plannerNeedsResourceAction({
        sourceRevision: revision,
        problem: { code: 'INSUFFICIENT_BOARD_CAPACITY', reason: current.reason, unplacedComponents: current.unplaced },
        alternatives,
    });
}
