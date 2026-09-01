import { getComponentDef } from '../component-library.js';
import { planAutoWire } from '../core/auto-wire-planner.js';
import { applyTransform, normalizeDegrees, rotatePoint } from './geometry.js';
import { createComponentInstance, componentPinRef, componentWorldTransform, resolveConnectionWorldPoint } from './model.js';
import { defaultFootprintForComponent, getFootprintDefinition, projectFootprintPoint } from './footprints.js';
import { getSurfaceDefinition } from './breadboard.js';
import { layoutDirectClusterV2 } from './direct-layout-v2.js';
import { pinExitDirection, ROUTING_COMPONENT_MARGIN, ROUTING_WIRE_SEPARATION } from './routing.js';

const SIGNAL_COLORS = Object.freeze(['#22d3ee', '#a78bfa', '#f59e0b', '#10b981', '#f472b6', '#60a5fa']);
const COMPONENT_GAP = 12;
const ROW_GAP = 24;
const CLUSTER_GAP = 42;
const BOARD_GAP = 26;
const HELPER_OWNER_GAP = 6;

function stableCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function componentConnections(project) {
    return project.wires
        .filter(wire => wire.from?.type === 'component-pin' && wire.to?.type === 'component-pin')
        .map(wire => ({
            id: wire.id,
            from: { componentId: wire.from.componentId, pinId: wire.from.pinId },
            to: { componentId: wire.to.componentId, pinId: wire.to.pinId },
            generated: Boolean(wire.properties?.generated),
        }));
}

function plannerComponents(project) {
    return project.components.map(component => {
        const transform = componentWorldTransform(project, component);
        return {
            id: component.id,
            componentId: component.definitionId,
            controllerId: component.properties?.controllerId || component.properties?.provenance?.controllerId,
            x: transform.x,
            y: transform.y,
            rotation: component.placement?.rotation || 0,
            provenance: component.properties?.provenance,
        };
    });
}

function pinPositionFor(project, componentId, pinId) {
    const component = project.components.find(item => item.id === componentId);
    const footprint = getFootprintDefinition(component?.footprintId);
    const pin = footprint?.pins.find(item => item.pinId === pinId);
    return component && pin
        ? applyTransform(projectFootprintPoint(footprint, pin), componentWorldTransform(project, component))
        : null;
}

function colorForConnection(connection, index) {
    const ends = [connection.from.pinId, connection.to.pinId].map(value => String(value).toUpperCase());
    if (ends.some(pin => pin.includes('GND') || pin === 'VSS')) return '#111111';
    if (ends.some(pin => /^(?:5V|VCC|VDD|VIN|3V3|3\.3V)/.test(pin))) return '#ef4444';
    return SIGNAL_COLORS[index % SIGNAL_COLORS.length];
}

function buildAutoWirePlan(project, componentIds = null) {
    const eligible = project.components.filter(component => {
        const definition = getComponentDef(component.definitionId);
        return (!componentIds || componentIds.includes(component.id)) && definition?.autoWire && !definition.isBoard;
    });
    const result = planAutoWire({
        components: plannerComponents(project),
        connections: componentConnections(project),
        componentIds,
        pinPositionFor: (componentId, pinId) => pinPositionFor(project, componentId, pinId),
    });
    return { result, eligible };
}

function applyAutoWireResult(project, result) {
    const plannedById = new Map(result.components.map(component => [component.id, component]));
    project.components = project.components.filter(component =>
        component.properties?.provenance?.kind !== 'generated' || plannedById.has(component.id));

    for (const component of project.components) {
        const planned = plannedById.get(component.id);
        if (!planned) continue;
        component.properties ||= {};
        if (planned.controllerId) component.properties.controllerId = planned.controllerId;
    }

    for (const planned of result.components) {
        if (project.components.some(component => component.id === planned.id)) continue;
        const footprint = defaultFootprintForComponent(planned.componentId);
        if (!footprint) continue;
        project.components.push(createComponentInstance({
            id: planned.id,
            definitionId: planned.componentId,
            footprintId: footprint.id,
            x: Number(planned.x || 0),
            y: Number(planned.y || 0),
            properties: {
                controllerId: planned.controllerId,
                provenance: planned.provenance || { kind: 'generated', controllerId: planned.controllerId },
            },
        }));
    }

    const surfaceWires = project.wires.filter(wire =>
        wire.from?.type === 'surface-hole' || wire.to?.type === 'surface-hole');
    const plannedWires = result.connections.map((connection, index) => ({
        id: connection.id,
        from: { type: 'component-pin', componentId: connection.from.componentId, pinId: connection.from.pinId },
        to: { type: 'component-pin', componentId: connection.to.componentId, pinId: connection.to.pinId },
        route: { mode: 'auto', waypoints: [] },
        color: colorForConnection(connection, index),
        properties: { generated: Boolean(connection.generated) },
    }));
    project.wires = [...surfaceWires, ...plannedWires];
}

function publicWireResult(result, eligible) {
    return {
        ...result,
        total: eligible.length,
        success: result.status === 'success' ? result.connections.length : 0,
        errors: result.diagnostics.map(item => item.code),
    };
}

/** Apply metadata-driven Auto Wire to the active physical project without moving anything. */
export function autoWirePhysicalStore(store, { componentIds = null } = {}) {
    const { result, eligible } = buildAutoWirePlan(store.project, componentIds);
    if (result.status !== 'success') return publicWireResult(result, eligible);
    store.transaction('auto-wire', project => applyAutoWireResult(project, result));
    return publicWireResult(result, eligible);
}

function isController(component) {
    return Boolean(getComponentDef(component?.definitionId)?.autoWirePins);
}

function isPowerPin(pinId) {
    return /(GND|VSS|DGND|AGND|VCC|VDD|VIN|5V|3\.3V|3V3|V\+|PWR|POWER)/i.test(String(pinId || ''));
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function componentBounds(project, component) {
    const bounds = getFootprintDefinition(component.footprintId)?.routingBounds;
    const transform = componentWorldTransform(project, component);
    if (!bounds || !transform) return { left: transform?.x || 0, top: transform?.y || 0, right: (transform?.x || 0) + 20, bottom: (transform?.y || 0) + 15 };
    const corners = [
        applyTransform({ x: bounds.x, y: bounds.y }, transform),
        applyTransform({ x: bounds.x + bounds.width, y: bounds.y }, transform),
        applyTransform({ x: bounds.x, y: bounds.y + bounds.height }, transform),
        applyTransform({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, transform),
    ];
    return {
        left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y)),
    };
}

function boundsSize(bounds) {
    return { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
}

function setFreePosition(component, x, y, rotation = component.placement?.rotation || 0) {
    if (component.placement?.type !== 'free') return;
    component.placement.position = { x, y };
    component.placement.rotation = rotation;
}

function endpointFor(wire, componentId) {
    if (wire.from?.type === 'component-pin' && wire.from.componentId === componentId) return wire.from;
    if (wire.to?.type === 'component-pin' && wire.to.componentId === componentId) return wire.to;
    return null;
}

function otherEndpoint(wire, componentId) {
    if (wire.from?.type === 'component-pin' && wire.from.componentId === componentId) return wire.to;
    if (wire.to?.type === 'component-pin' && wire.to.componentId === componentId) return wire.from;
    return null;
}

function wiresBetween(project, firstId, secondId) {
    return project.wires.filter(wire => endpointFor(wire, firstId) && endpointFor(wire, secondId));
}

function helpersFor(project, ownerId) {
    return project.components.filter(component => component.properties?.provenance?.kind === 'generated' &&
        component.properties.provenance.ownerId === ownerId);
}

function controllerConnections(project, controller, owner) {
    const candidates = [];
    for (const wire of wiresBetween(project, controller.id, owner.id)) {
        candidates.push({ wire, controllerRef: endpointFor(wire, controller.id), ownerRef: endpointFor(wire, owner.id), helper: null });
    }
    for (const helper of helpersFor(project, owner.id)) {
        for (const controllerWire of wiresBetween(project, controller.id, helper.id)) {
            const ownerWire = wiresBetween(project, helper.id, owner.id)[0];
            if (!ownerWire) continue;
            candidates.push({
                wire: controllerWire,
                controllerRef: endpointFor(controllerWire, controller.id),
                ownerRef: endpointFor(ownerWire, owner.id),
                helper,
                helperControllerRef: endpointFor(controllerWire, helper.id),
                helperOwnerRef: endpointFor(ownerWire, helper.id),
            });
        }
    }
    return candidates;
}

function primaryConnection(project, controller, owner) {
    return controllerConnections(project, controller, owner)
        .sort((a, b) => Number(isPowerPin(a.controllerRef.pinId)) - Number(isPowerPin(b.controllerRef.pinId)) ||
            stableCompare(a.controllerRef.pinId, b.controllerRef.pinId))[0] || null;
}

function directLayoutConnection(project, controller, owner) {
    const connections = controllerConnections(project, controller, owner);
    const primary = primaryConnection(project, controller, owner);
    if (!connections.length) return { link: null, direction: 'right' };
    const directionOrder = ['up', 'down', 'left', 'right'];
    const counts = new Map(directionOrder.map(direction => [direction, 0]));
    for (const connection of connections) {
        const direction = pinExitDirection(project, connection.controllerRef);
        // Shared supply conductors collapse onto one bus, so they should
        // influence placement without outweighing every independent signal.
        const weight = isPowerPin(connection.controllerRef.pinId) ? 0.35 : 1;
        if (counts.has(direction)) counts.set(direction, counts.get(direction) + weight);
    }
    const primaryDirection = primary ? pinExitDirection(project, primary.controllerRef) : null;
    const direction = directionOrder.sort((a, b) => counts.get(b) - counts.get(a) ||
        Number(b === primaryDirection) - Number(a === primaryDirection) || stableCompare(a, b))[0];
    const link = connections.filter(connection => pinExitDirection(project, connection.controllerRef) === direction)
        .sort((a, b) => Number(isPowerPin(a.controllerRef.pinId)) - Number(isPowerPin(b.controllerRef.pinId)) ||
            stableCompare(a.controllerRef.pinId, b.controllerRef.pinId))[0] || primary;
    return { link, direction };
}

function inferredControllerId(project, component, controllers) {
    const valid = new Set(controllers.map(controller => controller.id));
    const stored = component.properties?.controllerId || component.properties?.provenance?.controllerId;
    if (valid.has(stored)) return stored;
    const candidates = new Set();
    for (const wire of project.wires) {
        const other = otherEndpoint(wire, component.id);
        if (other?.type === 'component-pin' && valid.has(other.componentId)) candidates.add(other.componentId);
    }
    for (const helper of helpersFor(project, component.id)) {
        for (const wire of project.wires) {
            const other = otherEndpoint(wire, helper.id);
            if (other?.type === 'component-pin' && valid.has(other.componentId)) candidates.add(other.componentId);
        }
    }
    if (candidates.size) return [...candidates].sort(stableCompare)[0];
    const point = componentWorldTransform(project, component);
    return [...controllers].sort((a, b) => {
        const distance = controller => {
            const target = componentWorldTransform(project, controller);
            return Math.hypot(point.x - target.x, point.y - target.y);
        };
        return distance(a) - distance(b) || stableCompare(a.id, b.id);
    })[0]?.id || null;
}

function buildOwnership(project, controllers) {
    const ownership = new Map();
    for (const controller of controllers) ownership.set(controller.id, controller.id);
    for (const component of project.components) {
        if (isController(component)) continue;
        ownership.set(component.id, inferredControllerId(project, component, controllers));
    }
    return ownership;
}

function surfaceOwnership(project, ownership) {
    const result = new Map();
    for (const surface of project.surfaces) {
        const counts = new Map();
        for (const component of project.components.filter(item => item.placement?.type === 'surface' && item.placement.surfaceId === surface.id)) {
            const owner = ownership.get(component.id);
            if (owner) counts.set(owner, (counts.get(owner) || 0) + 1);
        }
        for (const wire of project.wires) {
            const touchesSurface = [wire.from, wire.to].some(ref => ref?.type === 'surface-hole' && ref.surfaceId === surface.id);
            if (!touchesSurface) continue;
            const componentRef = [wire.from, wire.to].find(ref => ref?.type === 'component-pin');
            const owner = componentRef && ownership.get(componentRef.componentId);
            if (owner) counts.set(owner, (counts.get(owner) || 0) + 1);
        }
        const selected = [...counts].sort((a, b) => b[1] - a[1] || stableCompare(a[0], b[0]))[0]?.[0];
        if (selected) result.set(surface.id, selected);
    }
    return result;
}

function pinOffset(component, pinId) {
    const footprint = getFootprintDefinition(component.footprintId);
    const pin = footprint?.pins.find(item => item.pinId === pinId);
    return pin ? rotatePoint(projectFootprintPoint(footprint, pin), component.placement?.rotation || 0) : { x: 0, y: 0 };
}

function helperRotation(helper, link, direction) {
    const footprint = getFootprintDefinition(helper.footprintId);
    const controllerPin = footprint?.pins.find(pin => pin.pinId === link.helperControllerRef.pinId);
    const ownerPin = footprint?.pins.find(pin => pin.pinId === link.helperOwnerRef.pinId);
    if (!controllerPin || !ownerPin) return helper.placement?.rotation || 0;
    const from = projectFootprintPoint(footprint, controllerPin);
    const to = projectFootprintPoint(footprint, ownerPin);
    const nativeAngle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    const desiredAngle = { right: 0, down: 90, left: 180, up: 270 }[direction] ?? nativeAngle;
    const target = normalizeDegrees(desiredAngle - nativeAngle);
    const rotations = footprint.validRotations?.length ? footprint.validRotations : [0, 90, 180, 270];
    const angularDistance = value => {
        const delta = Math.abs(normalizeDegrees(value) - target);
        return Math.min(delta, 360 - delta);
    };
    return [...rotations].sort((a, b) => angularDistance(a) - angularDistance(b) || a - b)[0];
}

function helperOwnerClearance(helper, link, direction, rotation) {
    const footprint = getFootprintDefinition(helper.footprintId);
    const bounds = footprint?.routingBounds;
    const pin = footprint?.pins.find(item => item.pinId === link.helperOwnerRef.pinId);
    const vector = {
        up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
        left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    }[direction];
    if (!bounds || !pin || !vector) return HELPER_OWNER_GAP;
    const pinPoint = rotatePoint(projectFootprintPoint(footprint, pin), rotation);
    const corners = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x, y: bounds.y + bounds.height },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ].map(point => rotatePoint(point, rotation));
    const forwardExtent = Math.max(0, ...corners.map(point =>
        (point.x - pinPoint.x) * vector.x + (point.y - pinPoint.y) * vector.y));
    return forwardExtent + ROUTING_COMPONENT_MARGIN + HELPER_OWNER_GAP;
}

function placeHelper(project, controller, owner, link, direction) {
    const helper = link?.helper;
    if (!helper || helper.placement?.type !== 'free') return;
    const controllerPoint = resolveConnectionWorldPoint(project, link.controllerRef);
    const ownerPoint = resolveConnectionWorldPoint(project, link.ownerRef);
    if (!controllerPoint || !ownerPoint) return;
    const rotation = helperRotation(helper, link, direction);
    helper.placement.rotation = rotation;
    const ownerOffset = pinOffset(helper, link.helperOwnerRef.pinId);
    const vector = {
        up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
        left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    }[direction] || { x: 1, y: 0 };
    // Anchor the owner-facing helper pin a real distance before the owner's
    // terminal. This prevents the helper body clearance from extending beyond
    // the destination pin and forcing an out-and-back route.
    const clearance = helperOwnerClearance(helper, link, direction, rotation);
    const x = ownerPoint.x - vector.x * clearance - ownerOffset.x;
    const y = ownerPoint.y - vector.y * clearance - ownerOffset.y;
    setFreePosition(helper, x, y, rotation);
}

function keepDirectHelperOutsideController(project, owner, link, direction) {
    const helper = link?.helper;
    if (!helper || helper.placement?.type !== 'free' || owner.placement?.type !== 'free') return;
    const controllerPoint = resolveConnectionWorldPoint(project, link.controllerRef);
    const helperPoint = resolveConnectionWorldPoint(project, link.helperControllerRef);
    const vector = {
        up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
        left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    }[direction];
    if (!controllerPoint || !helperPoint || !vector) return;
    const progress = (helperPoint.x - controllerPoint.x) * vector.x +
        (helperPoint.y - controllerPoint.y) * vector.y;
    const minimum = ROUTING_COMPONENT_MARGIN + HELPER_OWNER_GAP;
    if (progress >= minimum) return;
    const shift = minimum - progress;
    for (const component of [owner, helper]) {
        component.placement.position.x += vector.x * shift;
        component.placement.position.y += vector.y * shift;
    }
}

function supplyLaneKind(pinId) {
    const pin = String(pinId || '').toUpperCase();
    if (/(GND|VSS|DGND|AGND)/.test(pin)) return 'gnd';
    if (/^(?:3V3|3\.3V)$/.test(pin)) return '3v3';
    if (/^5V$/.test(pin)) return '5v';
    if (/^(?:VIN|VCC|VDD|V\+|PWR|POWER)$/.test(pin)) return pin.toLowerCase();
    return null;
}

function controllerSideLaneCounts(project, controller) {
    const lanes = new Map(['up', 'down', 'left', 'right'].map(direction => [direction, new Set()]));
    for (const wire of project.wires) {
        const ref = endpointFor(wire, controller.id);
        if (!ref) continue;
        const direction = pinExitDirection(project, ref);
        if (!lanes.has(direction)) continue;
        const supply = supplyLaneKind(ref.pinId);
        lanes.get(direction).add(supply ? `supply:${supply}` : `wire:${wire.id}`);
    }
    return new Map([...lanes].map(([direction, values]) => [direction, values.size]));
}

function orientOwnerTowardController(project, owner, link, direction) {
    if (!link?.ownerRef || owner.placement?.type !== 'free') return;
    const footprint = getFootprintDefinition(owner.footprintId);
    const rotations = footprint?.validRotations?.length ? footprint.validRotations : [owner.placement.rotation || 0];
    const desired = { up: 'down', down: 'up', left: 'right', right: 'left' }[direction];
    if (!desired) return;
    const original = owner.placement.rotation || 0;
    const axis = value => ['up', 'down'].includes(value) ? 'v' : ['left', 'right'].includes(value) ? 'h' : null;
    const rotationDistance = value => {
        const delta = Math.abs(normalizeDegrees(value) - normalizeDegrees(original));
        return Math.min(delta, 360 - delta);
    };
    const ranked = rotations.map(rotation => {
        owner.placement.rotation = rotation;
        const exit = pinExitDirection(project, link.ownerRef);
        const penalty = exit === desired ? 0 : axis(exit) === axis(desired) ? 1 : 2;
        return { rotation, penalty, distance: rotationDistance(rotation) };
    }).sort((a, b) => a.penalty - b.penalty || a.distance - b.distance || a.rotation - b.rotation);
    owner.placement.rotation = ranked[0]?.rotation ?? original;
}

function localSurfacePoint(project, surface, ref) {
    const definition = getSurfaceDefinition(surface);
    if (!definition) return null;
    if (ref?.type === 'surface-hole' && ref.surfaceId === surface.id) return definition.getHole(ref.holeId);
    if (ref?.type !== 'component-pin') return null;
    const component = project.components.find(item => item.id === ref.componentId);
    if (component?.placement?.type !== 'surface' || component.placement.surfaceId !== surface.id) return null;
    return definition.getHole(component.placement.bindings?.[ref.pinId]);
}

function placeOwnedSurface(project, controller, surface, ownership) {
    const definition = getSurfaceDefinition(surface);
    if (!definition) return;
    const mountedOwners = project.components.filter(component => component.placement?.type === 'surface' &&
        component.placement.surfaceId === surface.id && ownership.get(component.id) === controller.id);
    const links = mountedOwners.map(owner => ({ owner, link: primaryConnection(project, controller, owner) })).filter(item => item.link);
    const signalLinks = links.filter(item => !isPowerPin(item.link.controllerRef.pinId));
    const active = signalLinks.length ? signalLinks : links;
    const directions = active.map(item => pinExitDirection(project, item.link.controllerRef)).filter(Boolean);
    const count = direction => directions.filter(item => item === direction).length;
    let direction = ['up', 'down', 'left', 'right'].sort((a, b) => count(b) - count(a))[0] || 'up';
    if (direction === 'left' || direction === 'right') direction = 'up';
    const controllerBounds = componentBounds(project, controller);
    surface.transform = { ...surface.transform, rotation: 0 };
    const xCandidates = [];
    for (const { link } of active) {
        const controllerPoint = resolveConnectionWorldPoint(project, link.controllerRef);
        const local = localSurfacePoint(project, surface, link.ownerRef);
        if (controllerPoint && local) xCandidates.push(controllerPoint.x - local.x);
    }
    const x = median(xCandidates) ?? (controllerBounds.left + controllerBounds.right - definition.width) / 2;
    const y = direction === 'up'
        ? controllerBounds.top - BOARD_GAP - definition.height
        : controllerBounds.bottom + BOARD_GAP;
    surface.transform = { x, y, rotation: 0 };
    for (const { owner, link } of links) placeHelper(project, controller, owner, link, direction);
}

function placeDirectOwners(project, controller, members) {
    const helpers = new Set(members.filter(component => component.properties?.provenance?.kind === 'generated').map(component => component.id));
    const owners = members.filter(component => component.placement?.type === 'free' && !helpers.has(component.id));
    const controllerBounds = componentBounds(project, controller);
    const laneCounts = controllerSideLaneCounts(project, controller);
    const sideGap = direction => ROW_GAP + Math.max(0, (laneCounts.get(direction) || 1) - 1) * ROUTING_WIRE_SEPARATION;
    const groups = { up: [], down: [], left: [], right: [] };
    for (const owner of owners) {
        const { link, direction } = directLayoutConnection(project, controller, owner);
        const target = link ? resolveConnectionWorldPoint(project, link.controllerRef) : null;
        groups[direction || 'right'].push({ owner, link, target });
    }
    for (const values of Object.values(groups)) values.sort((a, b) =>
        (a.target?.x || a.target?.y || 0) - (b.target?.x || b.target?.y || 0) || stableCompare(a.owner.id, b.owner.id));

    const placeHorizontalRow = (items, direction) => {
        let edge = Number.NEGATIVE_INFINITY;
        for (const item of items) {
            orientOwnerTowardController(project, item.owner, item.link, direction);
            const offset = item.link ? pinOffset(item.owner, item.link.ownerRef.pinId) : { x: 0, y: 0 };
            const size = boundsSize(componentBounds(project, item.owner));
            const desiredX = (item.target?.x ?? controllerBounds.left) - offset.x;
            const x = Math.max(desiredX, edge + COMPONENT_GAP);
            const gap = sideGap(direction);
            const y = direction === 'up' ? controllerBounds.top - gap - size.height : controllerBounds.bottom + gap;
            setFreePosition(item.owner, x, y);
            placeHelper(project, controller, item.owner, item.link, direction);
            keepDirectHelperOutsideController(project, item.owner, item.link, direction);
            edge = componentBounds(project, item.owner).right;
        }
    };
    placeHorizontalRow(groups.up, 'up');
    placeHorizontalRow(groups.down, 'down');

    const placeVerticalColumn = (items, direction) => {
        let edge = Number.NEGATIVE_INFINITY;
        for (const item of items) {
            orientOwnerTowardController(project, item.owner, item.link, direction);
            const offset = item.link ? pinOffset(item.owner, item.link.ownerRef.pinId) : { x: 0, y: 0 };
            const size = boundsSize(componentBounds(project, item.owner));
            const desiredY = (item.target?.y ?? controllerBounds.top) - offset.y;
            const y = Math.max(desiredY, edge + COMPONENT_GAP);
            const gap = sideGap(direction);
            const x = direction === 'left' ? controllerBounds.left - gap - size.width : controllerBounds.right + gap;
            setFreePosition(item.owner, x, y);
            placeHelper(project, controller, item.owner, item.link, direction);
            keepDirectHelperOutsideController(project, item.owner, item.link, direction);
            edge = componentBounds(project, item.owner).bottom;
        }
    };
    placeVerticalColumn(groups.left, 'left');
    placeVerticalColumn(groups.right, 'right');
}

function clusterBounds(project, componentIds, surfaces) {
    const bounds = [];
    for (const component of project.components.filter(item => componentIds.has(item.id))) bounds.push(componentBounds(project, component));
    for (const surface of surfaces) {
        const definition = getSurfaceDefinition(surface);
        if (!definition) continue;
        bounds.push({ left: surface.transform.x, top: surface.transform.y,
            right: surface.transform.x + definition.width, bottom: surface.transform.y + definition.height });
    }
    return {
        left: Math.min(...bounds.map(item => item.left)), right: Math.max(...bounds.map(item => item.right)),
        top: Math.min(...bounds.map(item => item.top)), bottom: Math.max(...bounds.map(item => item.bottom)),
    };
}

function translateCluster(project, componentIds, surfaces, dx, dy) {
    for (const component of project.components.filter(item => componentIds.has(item.id) && item.placement?.type === 'free')) {
        component.placement.position.x += dx;
        component.placement.position.y += dy;
    }
    for (const surface of surfaces) {
        surface.transform.x += dx;
        surface.transform.y += dy;
    }
}

function layoutProject(project) {
    const controllers = project.components.filter(isController).sort((a, b) => stableCompare(a.id, b.id));
    if (!controllers.length) return { clusters: [] };
    const ownership = buildOwnership(project, controllers);
    const surfaceOwners = surfaceOwnership(project, ownership);
    const reports = [];
    let cursorX = 28;
    for (const controller of controllers) {
        // Layout is expressed in world-space pin exit directions, so retaining
        // the user's controller rotation produces the same topology on every MCU.
        setFreePosition(controller, 0, 80);
        const members = project.components.filter(component => !isController(component) && ownership.get(component.id) === controller.id);
        const surfaces = project.surfaces.filter(surface => surfaceOwners.get(surface.id) === controller.id);
        for (const surface of surfaces) placeOwnedSurface(project, controller, surface, ownership);
        placeDirectOwners(project, controller, members);
        const directReport = surfaces.length ? null : layoutDirectClusterV2(
            project,
            controller.id,
            members.map(component => component.id),
        );

        const componentIds = new Set([controller.id, ...members.map(component => component.id)]);
        const before = clusterBounds(project, componentIds, surfaces);
        const dx = cursorX - before.left;
        const dy = 28 - before.top;
        translateCluster(project, componentIds, surfaces, dx, dy);
        const after = clusterBounds(project, componentIds, surfaces);
        cursorX = after.right + CLUSTER_GAP;
        reports.push({ controllerId: controller.id, mode: surfaces.length ? 'breadboard' : 'direct-v2', ...directReport });
    }
    return { clusters: reports };
}

function resetAutomaticRouteIntent(project) {
    for (const wire of project.wires) wire.route = { mode: 'auto', waypoints: [] };
}

function alignGeneratedGroundBusPinsToLayout(project) {
    const componentsById = new Map(project.components.map(component => [component.id, component]));
    const buses = new Map();
    for (const wire of project.wires) {
        if (!wire.properties?.generated) continue;
        const controllerIndex = [wire.from, wire.to].findIndex(ref =>
            ref?.type === 'component-pin' && isController(componentsById.get(ref.componentId)));
        if (controllerIndex < 0) continue;
        const controllerRef = controllerIndex === 0 ? wire.from : wire.to;
        const componentRef = controllerIndex === 0 ? wire.to : wire.from;
        const controller = componentsById.get(controllerRef.componentId);
        const groundPins = getComponentDef(controller?.definitionId)?.autoWirePins?.ground || [];
        if (!groundPins.includes(controllerRef.pinId) || componentRef?.type !== 'component-pin') continue;
        const componentPoint = resolveConnectionWorldPoint(project, componentRef);
        if (!componentPoint) continue;
        if (!buses.has(controller.id)) buses.set(controller.id, { controller, groundPins, connections: [] });
        buses.get(controller.id).connections.push({ controllerRef, componentPoint });
    }
    for (const { controller, groundPins, connections } of buses.values()) {
        const bounds = componentBounds(project, controller);
        const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
        const vectors = {
            up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
            left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
        };
        const candidates = groundPins.map(pinId => ({
            pinId,
            point: resolveConnectionWorldPoint(project, componentPinRef(controller.id, pinId)),
            direction: pinExitDirection(project, componentPinRef(controller.id, pinId)),
        })).filter(candidate => candidate.point && vectors[candidate.direction]);
        const directions = [...new Set(candidates.map(candidate => candidate.direction))];
        const sideGroups = new Map();
        for (const connection of connections) {
            const delta = {
                x: connection.componentPoint.x - center.x,
                y: connection.componentPoint.y - center.y,
            };
            const side = directions.sort((a, b) =>
                delta.x * vectors[b].x + delta.y * vectors[b].y -
                (delta.x * vectors[a].x + delta.y * vectors[a].y) || stableCompare(a, b))[0];
            if (!sideGroups.has(side)) sideGroups.set(side, []);
            sideGroups.get(side).push(connection);
        }
        for (const [side, sideConnections] of sideGroups) {
            const totalDistance = candidate => sideConnections.reduce((total, connection) =>
                total + Math.hypot(connection.componentPoint.x - candidate.point.x,
                    connection.componentPoint.y - candidate.point.y), 0);
            const sharedPin = candidates.filter(candidate => candidate.direction === side)
                .sort((a, b) => totalDistance(a) - totalDistance(b) || stableCompare(a.pinId, b.pinId))[0]?.pinId;
            if (!sharedPin) continue;
            for (const connection of sideConnections) connection.controllerRef.pinId = sharedPin;
        }
    }
}

/** Arrange component and surface positions without changing semantic connectivity or route intent. */
export function arrangePhysicalStore(store) {
    let layout = null;
    store.transaction('arrange-components', project => { layout = layoutProject(project); });
    return { status: 'success', layout };
}

/** Route existing wires without changing semantic connectivity or placement. */
export function routePhysicalStore(store) {
    const routedWireIds = store.project.wires.map(wire => wire.id);
    store.transaction('route-wires', project => resetAutomaticRouteIntent(project));
    return { status: 'success', routedWireIds };
}

/** Preserve the user-facing convenience pipeline: Auto Wire -> Layout -> Route. */
export function autoLayoutPhysicalStore(store, { wire = true, componentIds = null } = {}) {
    const plan = wire ? buildAutoWirePlan(store.project, componentIds) : null;
    if (plan && plan.result.status !== 'success') return publicWireResult(plan.result, plan.eligible);
    let layout = null;
    store.transaction('auto-layout', project => {
        if (plan) applyAutoWireResult(project, plan.result);
        layout = layoutProject(project);
        if (plan) alignGeneratedGroundBusPinsToLayout(project);
        resetAutomaticRouteIntent(project);
    });
    return { status: 'success', wireResult: plan ? publicWireResult(plan.result, plan.eligible) : null, layout };
}
