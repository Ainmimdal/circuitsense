import { getComponentDef } from '../component-library.js';
import { planAutoWire } from '../core/auto-wire-planner.js';
import { applyTransform, rotatePoint } from './geometry.js';
import { createComponentInstance, componentWorldTransform, resolveConnectionWorldPoint } from './model.js';
import { defaultFootprintForComponent, getFootprintDefinition, projectFootprintPoint } from './footprints.js';
import { getSurfaceDefinition } from './breadboard.js';
import { pinExitDirection } from './routing.js';

const SIGNAL_COLORS = Object.freeze(['#22d3ee', '#a78bfa', '#f59e0b', '#10b981', '#f472b6', '#60a5fa']);
const COMPONENT_GAP = 12;
const ROW_GAP = 24;
const CLUSTER_GAP = 42;
const BOARD_GAP = 26;

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

function primaryConnection(project, controller, owner) {
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
    return candidates.sort((a, b) => Number(isPowerPin(a.controllerRef.pinId)) - Number(isPowerPin(b.controllerRef.pinId)) ||
        stableCompare(a.controllerRef.pinId, b.controllerRef.pinId))[0] || null;
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

function placeHelper(project, controller, owner, link, direction) {
    const helper = link?.helper;
    if (!helper || helper.placement?.type !== 'free') return;
    const controllerPoint = resolveConnectionWorldPoint(project, link.controllerRef);
    const ownerPoint = resolveConnectionWorldPoint(project, link.ownerRef);
    if (!controllerPoint || !ownerPoint) return;
    const vertical = direction === 'up' || direction === 'down';
    helper.placement.rotation = vertical ? 90 : 0;
    const helperOffset = pinOffset(helper, link.helperControllerRef.pinId);
    const ownerOffset = pinOffset(helper, link.helperOwnerRef.pinId);
    if (vertical) {
        const x = (controllerPoint.x + ownerPoint.x) / 2 - (helperOffset.x + ownerOffset.x) / 2;
        const y = (controllerPoint.y + ownerPoint.y) / 2 - (helperOffset.y + ownerOffset.y) / 2;
        setFreePosition(helper, x, y, 90);
    } else {
        const x = (controllerPoint.x + ownerPoint.x) / 2 - (helperOffset.x + ownerOffset.x) / 2;
        const y = (controllerPoint.y + ownerPoint.y) / 2 - (helperOffset.y + ownerOffset.y) / 2;
        setFreePosition(helper, x, y, 0);
    }
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
    const groups = { up: [], down: [], left: [], right: [] };
    for (const owner of owners) {
        const link = primaryConnection(project, controller, owner);
        const direction = link ? pinExitDirection(project, link.controllerRef) : 'right';
        const target = link ? resolveConnectionWorldPoint(project, link.controllerRef) : null;
        groups[direction || 'right'].push({ owner, link, target });
    }
    for (const values of Object.values(groups)) values.sort((a, b) =>
        (a.target?.x || a.target?.y || 0) - (b.target?.x || b.target?.y || 0) || stableCompare(a.owner.id, b.owner.id));

    const placeHorizontalRow = (items, direction) => {
        let edge = Number.NEGATIVE_INFINITY;
        for (const item of items) {
            const offset = item.link ? pinOffset(item.owner, item.link.ownerRef.pinId) : { x: 0, y: 0 };
            const size = boundsSize(componentBounds(project, item.owner));
            const desiredX = (item.target?.x ?? controllerBounds.left) - offset.x;
            const x = Math.max(desiredX, edge + COMPONENT_GAP);
            const y = direction === 'up' ? controllerBounds.top - ROW_GAP - size.height : controllerBounds.bottom + ROW_GAP;
            setFreePosition(item.owner, x, y);
            edge = componentBounds(project, item.owner).right;
            placeHelper(project, controller, item.owner, item.link, direction);
        }
    };
    placeHorizontalRow(groups.up, 'up');
    placeHorizontalRow(groups.down, 'down');

    const placeVerticalColumn = (items, direction) => {
        let edge = Number.NEGATIVE_INFINITY;
        for (const item of items) {
            const offset = item.link ? pinOffset(item.owner, item.link.ownerRef.pinId) : { x: 0, y: 0 };
            const size = boundsSize(componentBounds(project, item.owner));
            const desiredY = (item.target?.y ?? controllerBounds.top) - offset.y;
            const y = Math.max(desiredY, edge + COMPONENT_GAP);
            const x = direction === 'left' ? controllerBounds.left - ROW_GAP - size.width : controllerBounds.right + ROW_GAP;
            setFreePosition(item.owner, x, y);
            edge = componentBounds(project, item.owner).bottom;
            placeHelper(project, controller, item.owner, item.link, direction);
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
    if (!controllers.length) return;
    const ownership = buildOwnership(project, controllers);
    const surfaceOwners = surfaceOwnership(project, ownership);
    let cursorX = 28;
    for (const controller of controllers) {
        setFreePosition(controller, 0, 80, 0);
        const members = project.components.filter(component => !isController(component) && ownership.get(component.id) === controller.id);
        const surfaces = project.surfaces.filter(surface => surfaceOwners.get(surface.id) === controller.id);
        for (const surface of surfaces) placeOwnedSurface(project, controller, surface, ownership);
        placeDirectOwners(project, controller, members);

        const componentIds = new Set([controller.id, ...members.map(component => component.id)]);
        const before = clusterBounds(project, componentIds, surfaces);
        const dx = cursorX - before.left;
        const dy = 28 - before.top;
        translateCluster(project, componentIds, surfaces, dx, dy);
        const after = clusterBounds(project, componentIds, surfaces);
        cursorX = after.right + CLUSTER_GAP;
    }
    for (const wire of project.wires) wire.route = { mode: 'auto', waypoints: [] };
}

/** Arrange the active project using one atomic Auto Wire -> Layout -> Clean transaction. */
export function autoLayoutPhysicalStore(store, { wire = true, componentIds = null } = {}) {
    const plan = wire ? buildAutoWirePlan(store.project, componentIds) : null;
    if (plan && plan.result.status !== 'success') return publicWireResult(plan.result, plan.eligible);
    store.transaction('auto-layout', project => {
        if (plan) applyAutoWireResult(project, plan.result);
        layoutProject(project);
    });
    return { status: 'success', wireResult: plan ? publicWireResult(plan.result, plan.eligible) : null };
}
