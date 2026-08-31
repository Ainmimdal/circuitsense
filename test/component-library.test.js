import test from 'node:test';
import assert from 'node:assert/strict';
import { componentLibrary } from '../src/component-library.js';
import { getComponentGeometry } from '../src/core/component-geometry.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';

const wokwiTags = [
    'wokwi-7segment',
    'wokwi-analog-joystick',
    'wokwi-arduino-mega',
    'wokwi-arduino-nano',
    'wokwi-arduino-uno',
    'wokwi-biaxial-stepper',
    'wokwi-big-sound-sensor',
    'wokwi-buzzer',
    'wokwi-dht22',
    'wokwi-dip-switch-8',
    'wokwi-ds1307',
    'wokwi-esp32-devkit-v1',
    'wokwi-flame-sensor',
    'wokwi-franzininho',
    'wokwi-gas-sensor',
    'wokwi-hc-sr04',
    'wokwi-heart-beat-sensor',
    'wokwi-hx711',
    'wokwi-ili9341',
    'wokwi-ir-receiver',
    'wokwi-ir-remote',
    'wokwi-ks2e-m-dc5',
    'wokwi-ky-040',
    'wokwi-lcd1602',
    'wokwi-lcd2004',
    'wokwi-led',
    'wokwi-led-bar-graph',
    'wokwi-led-ring',
    'wokwi-membrane-keypad',
    'wokwi-microsd-card',
    'wokwi-mpu6050',
    'wokwi-nano-rp2040-connect',
    'wokwi-neopixel',
    'wokwi-neopixel-matrix',
    'wokwi-ntc-temperature-sensor',
    'wokwi-photoresistor-sensor',
    'wokwi-pir-motion-sensor',
    'wokwi-potentiometer',
    'wokwi-pushbutton',
    'wokwi-pushbutton-6mm',
    'wokwi-resistor',
    'wokwi-rgb-led',
    'wokwi-rotary-dialer',
    'wokwi-servo',
    'wokwi-slide-potentiometer',
    'wokwi-slide-switch',
    'wokwi-small-sound-sensor',
    'wokwi-ssd1306',
    'wokwi-stepper-motor',
    'wokwi-tilt-switch',
].sort();

test('component library exposes every public @wokwi/elements 1.9.2 element', () => {
    const actual = Object.values(componentLibrary)
        .map(component => component.tag)
        .filter(tag => tag?.startsWith('wokwi-'))
        .sort();

    assert.deepEqual(actual, wokwiTags);
    for (const component of Object.values(componentLibrary)) {
        assert.ok(component.id);
        assert.ok(component.name);
        assert.ok(component.category);
        assert.ok(component.size?.width > 0);
        assert.ok(component.size?.height > 0);
    }
});

test('every MCU exposes a board-specific smart wiring target', () => {
    const controllerBoards = Object.values(componentLibrary).filter(component => component.isControllerBoard);
    assert.equal(controllerBoards.length, 6);
    assert.deepEqual(
        controllerBoards.filter(component => component.autoWireTarget).map(component => component.id),
        ['arduino-uno', 'arduino-mega', 'arduino-nano', 'esp32-devkit-v1', 'franzininho', 'nano-rp2040-connect'],
    );
    for (const board of controllerBoards) assert.ok(board.autoWirePins);
});

test('every breadboard-mountable component has rigid geometry and every MCU declares its physical interface', () => {
    for (const component of Object.values(componentLibrary)) {
        if (component.isBreadboard) continue;
        assert.equal(typeof component.breadboard?.mountable, 'boolean', component.id);
        if (component.breadboard?.mountable) {
            assert.ok(defaultFootprintForComponent(component.id) || getComponentGeometry(component.id), component.id);
        }
        else assert.ok(component.breadboard.reason, component.id);
    }
    const controllerBoards = Object.values(componentLibrary).filter(component => component.isControllerBoard);
    assert.deepEqual(
        controllerBoards.filter(component => component.breadboard?.mountable).map(component => component.id),
        ['arduino-nano', 'nano-rp2040-connect'],
    );
    for (const board of controllerBoards.filter(component => !component.breadboard?.mountable)) {
        assert.ok(board.breadboard?.reason, board.id);
    }
});
