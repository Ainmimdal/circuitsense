import test from 'node:test';
import assert from 'node:assert/strict';

test('I2C validation follows the active MCU profile instead of Uno A4/A5 globally', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { validateCircuit } = await import('../src/services/validation-engine.js');
    const cases = [
        ['nano-rp2040-connect', 'A4', 'A5', '3.3V', 'GND.1'],
        ['esp32-devkit-v1', 'D21', 'D22', '3V3', 'GND.1'],
        ['arduino-mega', 'SDA', 'SCL', '5V', 'GND.1'],
        ['franzininho', 'PB0', 'PB2', 'VCC.1', 'GND.1'],
    ];
    for (const [componentId, sda, scl, power, ground] of cases) {
        store.instances = [
            { id: 'mcu', componentId, x: 0, y: 0 },
            { id: 'imu', componentId: 'mpu6050', x: 200, y: 0 },
        ];
        store.wires = [
            { id: 'sda', from: { instanceId: 'mcu', pinName: sda }, to: { instanceId: 'imu', pinName: 'SDA' } },
            { id: 'scl', from: { instanceId: 'mcu', pinName: scl }, to: { instanceId: 'imu', pinName: 'SCL' } },
            { id: 'vcc', from: { instanceId: 'mcu', pinName: power }, to: { instanceId: 'imu', pinName: 'VCC' } },
            { id: 'gnd', from: { instanceId: 'mcu', pinName: ground }, to: { instanceId: 'imu', pinName: 'GND' } },
        ];
        store.physicalPlan = null;
        const result = validateCircuit();
        assert.equal(result.errors.some(item => item.id.startsWith('i2c-wrong')), false, componentId);
    }
});
