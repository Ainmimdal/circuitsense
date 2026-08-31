import test from 'node:test';
import assert from 'node:assert/strict';
import { planAutoWire } from '../src/core/auto-wire-planner.js';

test('auto-wire planning is deterministic, shares supply nets and does not duplicate LED helpers', () => {
    const input = {
        components: [
            { id: 'uno', componentId: 'arduino-uno' },
            { id: 'led', componentId: 'led' },
            { id: 'dht', componentId: 'dht22' },
        ],
        connections: [],
    };
    const first = planAutoWire(input);
    const second = planAutoWire({ components: first.components, connections: first.connections });
    assert.equal(first.status, 'success');
    assert.equal(second.components.filter(component => component.componentId === 'resistor').length, 1);
    assert.equal(second.connections.filter(connection => [connection.from, connection.to].some(end => end.componentId === 'uno' && end.pinId === '5V')).length, 1);
    assert.equal(second.connections.filter(connection => [connection.from, connection.to].some(end => end.componentId === 'uno' && end.pinId === 'GND.1')).length, 2);
    assert.equal(JSON.stringify(input.connections), '[]');
});

test('auto-wire restores the pushed router rule of choosing the nearest compatible Arduino header', () => {
    const positions = new Map([
        ['button:1.l', { x: 500, y: 40 }],
        ['button:2.l', { x: 500, y: 60 }],
        ['uno:2', { x: 100, y: 200 }],
        ['uno:3', { x: 490, y: 200 }],
        ['uno:GND.1', { x: 100, y: 300 }],
        ['uno:GND.3', { x: 490, y: 200 }],
    ]);
    const result = planAutoWire({
        components: [
            { id: 'uno', componentId: 'arduino-uno' },
            { id: 'button', componentId: 'pushbutton' },
        ],
        connections: [],
        pinPositionFor: (componentId, pinId) => positions.get(`${componentId}:${pinId}`) || null,
    });
    const arduinoPins = result.connections
        .flatMap(connection => [connection.from, connection.to])
        .filter(endpoint => endpoint.componentId === 'uno')
        .map(endpoint => endpoint.pinId);
    assert.deepEqual(arduinoPins.sort(), ['3', 'GND.3']);
});

test('auto-wire uses an Arduino Nano when it is the available MCU', () => {
    const result = planAutoWire({
        components: [
            { id: 'nano', componentId: 'arduino-nano' },
            { id: 'sensor', componentId: 'dht22' },
        ],
        connections: [],
    });
    const nanoPins = result.connections.flatMap(connection => [connection.from, connection.to])
        .filter(endpoint => endpoint.componentId === 'nano')
        .map(endpoint => endpoint.pinId);

    assert.equal(result.status, 'success');
    assert.deepEqual(nanoPins, ['5V', '2', 'GND.1']);
});

test('auto-wire uses each MCU own voltage and pin names', () => {
    const expected = {
        'arduino-mega': ['5V', '2', 'GND.1'],
        'esp32-devkit-v1': ['3V3', 'D4', 'GND.1'],
        franzininho: ['VCC.1', 'PB0', 'GND.1'],
        'nano-rp2040-connect': ['3.3V', 'D2', 'GND.1'],
    };
    for (const [componentId, pins] of Object.entries(expected)) {
        const result = planAutoWire({
            components: [
                { id: 'mcu', componentId },
                { id: 'sensor', componentId: 'dht22' },
            ],
            connections: [],
        });
        const actual = result.connections.flatMap(connection => [connection.from, connection.to])
            .filter(endpoint => endpoint.componentId === 'mcu')
            .map(endpoint => endpoint.pinId);
        assert.equal(result.status, 'success', componentId);
        assert.deepEqual(actual, pins, componentId);
    }
});

test('MCU profiles reserve shared-function pins when an I2C device is present', () => {
    const result = planAutoWire({
        components: [
            { id: 'mcu', componentId: 'franzininho' },
            { id: 'sensor', componentId: 'dht22' },
            { id: 'imu', componentId: 'mpu6050' },
        ],
        connections: [],
    });
    const pins = result.connections.flatMap(connection => [connection.from, connection.to])
        .filter(endpoint => endpoint.componentId === 'mcu')
        .map(endpoint => endpoint.pinId);
    assert.equal(result.status, 'success');
    assert.equal(pins.filter(pin => pin === 'PB0').length, 1);
    assert.equal(pins.filter(pin => pin === 'PB2').length, 1);
    assert.ok(pins.includes('PB1'));
});

test('multiple controllers receive stable nearest whole-component ownership with independent pin budgets', () => {
    const positions = new Map([
        ['uno', { x: 40, y: 100 }],
        ['mega', { x: 640, y: 100 }],
        ['left-led', { x: 80, y: 30 }],
        ['right-sensor', { x: 600, y: 30 }],
    ]);
    const input = {
        components: [
            { id: 'uno', componentId: 'arduino-uno' },
            { id: 'mega', componentId: 'arduino-mega' },
            { id: 'left-led', componentId: 'led' },
            { id: 'right-sensor', componentId: 'dht22' },
        ],
        connections: [],
        pinPositionFor: componentId => positions.get(componentId) || null,
    };
    const first = planAutoWire(input);
    assert.equal(first.status, 'success');
    assert.equal(first.components.find(component => component.id === 'left-led').controllerId, 'uno');
    assert.equal(first.components.find(component => component.id === 'right-sensor').controllerId, 'mega');
    assert.ok(first.connections.some(connection => [connection.from, connection.to].some(end => end.componentId === 'uno')));
    assert.ok(first.connections.some(connection => [connection.from, connection.to].some(end => end.componentId === 'mega')));

    positions.set('left-led', { x: 620, y: 30 });
    const second = planAutoWire({ ...input, components: first.components, connections: first.connections });
    assert.equal(second.components.find(component => component.id === 'left-led').controllerId, 'uno',
        'moving a component must not silently migrate its controller ownership');
    assert.equal(second.components.find(component => component.id === 'right-sensor').controllerId, 'mega');
});

test('multiple controller supply domains are never joined automatically', () => {
    const result = planAutoWire({
        components: [
            { id: 'uno', componentId: 'arduino-uno' },
            { id: 'esp', componentId: 'esp32-devkit-v1' },
            { id: 'uno-sensor', componentId: 'dht22', controllerId: 'uno' },
            { id: 'esp-sensor', componentId: 'dht22', controllerId: 'esp' },
        ],
        connections: [],
    });
    assert.equal(result.status, 'success');
    const controllerIdsFor = componentId => new Set(result.connections
        .filter(connection => [connection.from, connection.to].some(end => end.componentId === componentId))
        .flatMap(connection => [connection.from.componentId, connection.to.componentId])
        .filter(id => id === 'uno' || id === 'esp'));
    assert.deepEqual([...controllerIdsFor('uno-sensor')], ['uno']);
    assert.deepEqual([...controllerIdsFor('esp-sensor')], ['esp']);
    assert.equal(result.connections.some(connection =>
        new Set([connection.from.componentId, connection.to.componentId]).has('uno') &&
        new Set([connection.from.componentId, connection.to.componentId]).has('esp')), false);
});
