import { PIN, getComponentDef } from '../component-library.js';
import { canonicalLedColor, recommendedLedResistorOhms } from './led-resistor.js';

const clone = value => typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

function touches(connection, componentId, pinNames = null) {
    return [connection.from, connection.to].some(endpoint =>
        (endpoint.componentId ?? endpoint.instanceId) === componentId &&
        (!pinNames || pinNames.has(endpoint.pinId ?? endpoint.pinName))
    );
}

function endpoint(componentId, pinId) {
    return { componentId, pinId };
}

function connectionId(ownerId, pinId, suffix) {
    return `generated-wire:${ownerId}:${pinId}:${suffix}`;
}

function stableCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function controllerDefinition(component) {
    const definition = getComponentDef(component?.componentId);
    return definition?.autoWirePins ? definition : null;
}

function pinRoleIsShared(type) {
    return type === PIN.VCC || type === PIN.GND;
}

function hasI2cRole(component) {
    return Object.values(getComponentDef(component.componentId)?.autoWire || {})
        .some(type => type === PIN.I2C_SDA || type === PIN.I2C_SCL);
}

function boardPinFor(type, used, i2cUsed, avoided, sourcePosition, boardId, pinPositionFor, pins) {
    const i2cPins = Object.values(pins.i2c || {}).filter(Boolean);
    const withoutReservedI2c = candidates => (candidates || []).filter(pin => !i2cUsed || !i2cPins.includes(pin));
    const avoid = new Set(avoided || []);
    const closestFree = candidates => {
        const available = (candidates || []).filter(pin => !used.has(pin) && !avoid.has(pin));
        if (!available.length) return null;
        if (!sourcePosition || !pinPositionFor) return available[0];
        return available
            .map(pin => ({ pin, position: pinPositionFor(boardId, pin) }))
            .sort((a, b) => {
                const distance = item => item.position
                    ? Math.hypot(item.position.x - sourcePosition.x, item.position.y - sourcePosition.y)
                    : Number.POSITIVE_INFINITY;
                return distance(a) - distance(b) || stableCompare(a.pin, b.pin);
            })[0].pin;
    };
    if (type === PIN.VCC) return pins.power?.[0] || null;
    if (type === PIN.GND) return closestFree(pins.ground) || pins.ground?.[0] || null;
    if (type === PIN.I2C_SDA) return pins.i2c?.sda || null;
    if (type === PIN.I2C_SCL) return pins.i2c?.scl || null;
    if (type === PIN.PWM) return closestFree(withoutReservedI2c(pins.pwm));
    if (type === PIN.ANALOG) return closestFree(withoutReservedI2c(pins.analog));
    return closestFree(withoutReservedI2c(pins.digital));
}

function existingControllerOwner(component, controllers, components, connections) {
    const byId = new Map(controllers.map(controller => [controller.id, controller]));
    if (byId.has(component.controllerId)) return byId.get(component.controllerId);
    if (byId.has(component.properties?.controllerId)) return byId.get(component.properties.controllerId);

    const relatedIds = new Set([component.id]);
    for (const candidate of components) {
        if (candidate.provenance?.kind === 'generated' && candidate.provenance.ownerId === component.id) relatedIds.add(candidate.id);
    }
    const candidates = new Set();
    for (const connection of connections) {
        const fromId = connection.from.componentId ?? connection.from.instanceId;
        const toId = connection.to.componentId ?? connection.to.instanceId;
        if (relatedIds.has(fromId) && byId.has(toId)) candidates.add(toId);
        if (relatedIds.has(toId) && byId.has(fromId)) candidates.add(fromId);
    }
    const selected = [...candidates].sort(stableCompare)[0];
    return selected ? byId.get(selected) : null;
}

function initialControllerState(controllers, connections) {
    const states = new Map(controllers.map(controller => [controller.id, {
        controller,
        pins: controllerDefinition(controller).autoWirePins,
        used: new Set(),
        i2cUsed: false,
    }]));
    for (const connection of connections) {
        for (const end of [connection.from, connection.to]) {
            const componentId = end.componentId ?? end.instanceId;
            const state = states.get(componentId);
            if (!state) continue;
            const pinId = end.pinId ?? end.pinName;
            state.used.add(pinId);
            if (Object.values(state.pins.i2c || {}).includes(pinId)) state.i2cUsed = true;
        }
    }
    return states;
}

function positionDistance(component, controller, pinId, boardPin, pinPositionFor) {
    const source = pinPositionFor?.(component.id, pinId) ||
        (Number.isFinite(component.x) && Number.isFinite(component.y) ? { x: component.x, y: component.y } : null);
    const target = pinPositionFor?.(controller.id, boardPin) ||
        (Number.isFinite(controller.x) && Number.isFinite(controller.y) ? { x: controller.x, y: controller.y } : null);
    return source && target ? Math.hypot(source.x - target.x, source.y - target.y) : 0;
}

function remainingCapacity(state) {
    const dedicated = [
        ...(state.pins.digital || []), ...(state.pins.pwm || []), ...(state.pins.analog || []),
    ];
    return new Set(dedicated.filter(pin => !state.used.has(pin))).size;
}

function simulateComponentAssignment(component, state, pinPositionFor) {
    const definition = getComponentDef(component.componentId);
    const used = new Set(state.used);
    const assignments = [];
    let distance = 0;
    let i2cUsed = state.i2cUsed || hasI2cRole(component);
    for (const [pinId, type] of Object.entries(definition.autoWire || {})) {
        const sourcePosition = pinPositionFor?.(component.id, pinId) || null;
        const boardPin = boardPinFor(type, used, i2cUsed, definition.avoidPins || [], sourcePosition,
            state.controller.id, pinPositionFor, state.pins);
        if (!boardPin) return null;
        assignments.push({ pinId, type, boardPin });
        if (!pinRoleIsShared(type)) used.add(boardPin);
        if (type === PIN.I2C_SDA || type === PIN.I2C_SCL) i2cUsed = true;
        distance += positionDistance(component, state.controller, pinId, boardPin, pinPositionFor);
    }
    return { assignments, used, i2cUsed, distance };
}

function componentConstraintRank(component) {
    const roles = Object.values(getComponentDef(component.componentId)?.autoWire || {});
    const constrained = roles.filter(type => [PIN.I2C_SDA, PIN.I2C_SCL, PIN.PWM, PIN.ANALOG].includes(type)).length;
    return constrained * 100 + roles.length;
}

function chooseController(component, states, preservedOwner, pinPositionFor) {
    const candidates = preservedOwner ? [states.get(preservedOwner.id)].filter(Boolean) : [...states.values()];
    return candidates
        .map(state => ({ state, plan: simulateComponentAssignment(component, state, pinPositionFor) }))
        .filter(candidate => candidate.plan)
        .sort((a, b) => a.plan.distance - b.plan.distance ||
            remainingCapacity(b.state) - remainingCapacity(a.state) ||
            stableCompare(a.state.controller.id, b.state.controller.id))[0] || null;
}

export function planAutoWire({
    components = [], connections = [], componentIds = null, pinPositionFor = null,
    addLedResistors = true,
} = {}) {
    const sourceComponents = clone(components);
    const sourceConnections = clone(connections);
    let nextComponents = clone(components);
    let nextConnections = clone(connections);
    const diagnostics = [];
    const addedComponents = [];
    const controllerAssignments = {};
    const controllers = nextComponents.filter(controllerDefinition).sort((a, b) => stableCompare(a.id, b.id));
    if (!controllers.length) {
        return { status: 'failure', components: sourceComponents, connections: sourceConnections,
            diagnostics: [{ code: 'NO_ARDUINO' }], addedComponents, controllerAssignments };
    }

    const scope = componentIds ? new Set(componentIds) : null;
    const eligible = nextComponents.filter(component => {
        const definition = getComponentDef(component.componentId);
        return (!scope || scope.has(component.id)) && !component.planningDisabled && definition?.autoWire && !definition.isBoard;
    });
    const eligibleIds = new Set(eligible.map(component => component.id));
    const preservedOwners = new Map(eligible.map(component => [component.id,
        existingControllerOwner(component, controllers, nextComponents, nextConnections)]));

    const generatedIds = new Set(nextComponents
        .filter(component => component.provenance?.kind === 'generated' && eligibleIds.has(component.provenance.ownerId))
        .map(component => component.id));
    nextComponents = nextComponents.filter(component => !generatedIds.has(component.id));
    nextConnections = nextConnections.filter(connection =>
        !generatedIds.has(connection.from.componentId ?? connection.from.instanceId) &&
        !generatedIds.has(connection.to.componentId ?? connection.to.instanceId));
    for (const component of eligible) {
        const definition = getComponentDef(component.componentId);
        nextConnections = nextConnections.filter(connection => !touches(connection, component.id, new Set(Object.keys(definition.autoWire))));
    }

    const states = initialControllerState(controllers, nextConnections);
    const orderedEligible = [...eligible].sort((a, b) =>
        Number(Boolean(preservedOwners.get(b.id))) - Number(Boolean(preservedOwners.get(a.id))) ||
        componentConstraintRank(b) - componentConstraintRank(a) || stableCompare(a.id, b.id));
    const plans = new Map();
    for (const component of orderedEligible) {
        const selected = chooseController(component, states, preservedOwners.get(component.id), pinPositionFor);
        if (!selected) {
            diagnostics.push({
                code: 'NO_COMPATIBLE_CONTROLLER_CAPACITY', componentId: component.id,
                controllerId: preservedOwners.get(component.id)?.id || null,
            });
            continue;
        }
        selected.state.used = selected.plan.used;
        selected.state.i2cUsed = selected.plan.i2cUsed;
        controllerAssignments[component.id] = selected.state.controller.id;
        plans.set(component.id, { controller: selected.state.controller, assignments: selected.plan.assignments });
    }

    if (diagnostics.length) {
        return { status: 'failure', components: sourceComponents, connections: sourceConnections,
            diagnostics, addedComponents: [], controllerAssignments: {} };
    }

    for (const component of eligible) {
        const plannedComponent = nextComponents.find(item => item.id === component.id);
        const plan = plans.get(component.id);
        if (!plannedComponent || !plan) continue;
        plannedComponent.controllerId = plan.controller.id;
        const definition = getComponentDef(component.componentId);
        for (const { pinId, type, boardPin } of plan.assignments) {
            if (addLedResistors && definition.needsResistor && [PIN.DIGITAL, PIN.PWM, PIN.SIGNAL].includes(type)) {
                const resistorId = `generated-resistor:${component.id}`;
                const ledColor = canonicalLedColor(component.properties?.color);
                const supplyVoltage = getComponentDef(plan.controller.componentId)?.autoWirePins?.logicVoltage || 5;
                const resistorValue = recommendedLedResistorOhms(ledColor, supplyVoltage);
                nextComponents.push({
                    id: resistorId, componentId: 'resistor', controllerId: plan.controller.id,
                    x: Number(component.x) || 0, y: Number(component.y) || 0, rotation: 0,
                    properties: { value: resistorValue, recommendedFor: { ledColor, supplyVoltage } },
                    provenance: { kind: 'generated', ownerId: component.id, controllerId: plan.controller.id,
                        ruleId: 'current-limiting-resistor' },
                });
                addedComponents.push(resistorId);
                nextConnections.push(
                    { id: connectionId(component.id, pinId, 'source'), from: endpoint(plan.controller.id, boardPin), to: endpoint(resistorId, '1'), generated: true },
                    { id: connectionId(component.id, pinId, 'load'), from: endpoint(resistorId, '2'), to: endpoint(component.id, pinId), generated: true },
                );
            } else {
                nextConnections.push({
                    id: connectionId(component.id, pinId, 'direct'),
                    from: endpoint(plan.controller.id, boardPin), to: endpoint(component.id, pinId), generated: true,
                });
            }
        }
    }
    return { status: 'success', components: nextComponents, connections: nextConnections,
        diagnostics, addedComponents, controllerAssignments };
}
