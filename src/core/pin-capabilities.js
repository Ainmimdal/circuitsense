import { getComponentDef, PIN } from '../component-library.js';

export const PIN_CAPABILITY = Object.freeze({
    DIGITAL: PIN.DIGITAL,
    DIGITAL_INPUT: 'DIGITAL_INPUT',
    DIGITAL_OUTPUT: 'DIGITAL_OUTPUT',
    ANALOG: PIN.ANALOG,
    PWM: PIN.PWM,
    I2C_SDA: PIN.I2C_SDA,
    I2C_SCL: PIN.I2C_SCL,
    UART_RX: 'UART_RX',
    UART_TX: 'UART_TX',
    VCC: PIN.VCC,
    GND: PIN.GND,
});

export const PIN_CAPABILITY_VALUES = Object.freeze(Object.values(PIN_CAPABILITY));

function unique(values) {
    return [...new Set(values.filter(Boolean).map(String))];
}

function listed(catalog, group, pinId) {
    return (catalog?.[group] || []).map(String).includes(String(pinId));
}

function constraintsFor(catalog, pinId) {
    return (catalog?.constraints?.[pinId] || []).map(constraint => ({
        type: String(constraint.type),
        severity: constraint.severity === 'error' ? 'error' : 'warning',
    }));
}

/**
 * Build structured controller-pin records from the component definition's
 * existing Auto Wire inventory. The arrays remain authoritative for both
 * deterministic Auto Wire and AI queries; constraints only annotate them.
 */
export function controllerPinMetadata(definitionOrId) {
    const definition = typeof definitionOrId === 'string'
        ? getComponentDef(definitionOrId)
        : definitionOrId;
    const catalog = definition?.autoWirePins;
    if (!catalog) return [];
    const orderedIds = unique([
        ...(catalog.digital || []), ...(catalog.pwm || []), ...(catalog.analog || []),
        catalog.i2c?.sda, catalog.i2c?.scl,
        ...(catalog.uart?.rx || []), ...(catalog.uart?.tx || []),
        ...(catalog.power || []), ...(catalog.ground || []), ...(catalog.serial || []),
    ]);
    return orderedIds.map(pinId => {
        const capabilities = new Set();
        if (listed(catalog, 'digital', pinId) || listed(catalog, 'serial', pinId) ||
            listed(catalog.uart, 'rx', pinId) || listed(catalog.uart, 'tx', pinId)) {
            capabilities.add(PIN_CAPABILITY.DIGITAL);
            capabilities.add(PIN_CAPABILITY.DIGITAL_INPUT);
            capabilities.add(PIN_CAPABILITY.DIGITAL_OUTPUT);
        }
        if (listed(catalog, 'pwm', pinId)) capabilities.add(PIN_CAPABILITY.PWM);
        if (listed(catalog, 'analog', pinId)) capabilities.add(PIN_CAPABILITY.ANALOG);
        if (String(catalog.i2c?.sda) === pinId) capabilities.add(PIN_CAPABILITY.I2C_SDA);
        if (String(catalog.i2c?.scl) === pinId) capabilities.add(PIN_CAPABILITY.I2C_SCL);
        if (listed(catalog.uart, 'rx', pinId)) capabilities.add(PIN_CAPABILITY.UART_RX);
        if (listed(catalog.uart, 'tx', pinId)) capabilities.add(PIN_CAPABILITY.UART_TX);
        if (listed(catalog, 'power', pinId)) capabilities.add(PIN_CAPABILITY.VCC);
        if (listed(catalog, 'ground', pinId)) capabilities.add(PIN_CAPABILITY.GND);
        const constraints = constraintsFor(catalog, pinId);
        if (constraints.some(constraint => constraint.type === 'input_only')) {
            capabilities.add(PIN_CAPABILITY.DIGITAL);
            capabilities.add(PIN_CAPABILITY.DIGITAL_INPUT);
            capabilities.delete(PIN_CAPABILITY.DIGITAL_OUTPUT);
            capabilities.delete(PIN_CAPABILITY.PWM);
        }
        return { pinId, capabilities: [...capabilities], constraints };
    });
}

export function controllerPinInfo(component, pinId) {
    return controllerPinMetadata(getComponentDef(component?.definitionId))
        .find(pin => pin.pinId === String(pinId)) || null;
}

export function componentPinRole(component, pinId) {
    const definition = getComponentDef(component?.definitionId);
    return definition?.autoWire?.[pinId] || definition?.pinMeta?.[pinId] || null;
}

export function requiredControllerCapabilities(component, pinId) {
    const definition = getComponentDef(component?.definitionId);
    const role = componentPinRole(component, pinId);
    if (role === PIN.PWM) return [PIN_CAPABILITY.PWM, PIN_CAPABILITY.DIGITAL_OUTPUT];
    if (role === PIN.ANALOG) return [PIN_CAPABILITY.ANALOG];
    if (role === PIN.I2C_SDA) return [PIN_CAPABILITY.I2C_SDA];
    if (role === PIN.I2C_SCL) return [PIN_CAPABILITY.I2C_SCL];
    if (role === PIN.VCC) return [PIN_CAPABILITY.VCC];
    if (role === PIN.GND) return [PIN_CAPABILITY.GND];
    if (role !== PIN.DIGITAL) return [];

    const electricalRole = definition?.pinMeta?.[pinId];
    if (electricalRole === PIN.TRIGGER || ['output', 'actuator'].includes(definition?.category)) {
        return [PIN_CAPABILITY.DIGITAL_OUTPUT];
    }
    if (electricalRole === PIN.ECHO || ['input', 'sensor'].includes(definition?.category)) {
        return [PIN_CAPABILITY.DIGITAL_INPUT];
    }
    return [PIN_CAPABILITY.DIGITAL];
}

export function pinCompatibility(controller, controllerPinId, endpoint, endpointPinId) {
    const pin = controllerPinInfo(controller, controllerPinId);
    if (!pin) return {
        compatible: false,
        requiredCapabilities: requiredControllerCapabilities(endpoint, endpointPinId),
        missingCapabilities: [],
        warnings: [],
        reason: `Pin ${controllerPinId} is not in the controller's authoritative pin inventory.`,
    };
    const requiredCapabilities = requiredControllerCapabilities(endpoint, endpointPinId);
    const missingCapabilities = requiredCapabilities.filter(capability => !pin.capabilities.includes(capability));
    const warnings = pin.constraints.filter(constraint => constraint.severity === 'warning');
    return {
        compatible: missingCapabilities.length === 0,
        requiredCapabilities,
        missingCapabilities,
        warnings,
        reason: missingCapabilities.length
            ? `Pin ${controllerPinId} lacks required ${missingCapabilities.join(', ')} capability.`
            : null,
    };
}

export function controllerPinUsage(project, controllerId) {
    const usage = new Map();
    for (const wire of project?.wires || []) {
        const pairs = [[wire.from, wire.to], [wire.to, wire.from]];
        for (const [controllerRef, otherRef] of pairs) {
            if (controllerRef?.type !== 'component-pin' || controllerRef.componentId !== controllerId) continue;
            if (!usage.has(controllerRef.pinId)) usage.set(controllerRef.pinId, []);
            usage.get(controllerRef.pinId).push({
                instanceId: otherRef?.componentId || otherRef?.surfaceId || 'unknown',
                pinId: otherRef?.pinId || otherRef?.holeId || 'unknown',
            });
        }
    }
    return usage;
}
