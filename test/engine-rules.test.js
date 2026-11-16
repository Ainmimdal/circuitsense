import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGoalProject } from '../src/lessons/goal-build.js';
import { ConnectivityResolver } from '../src/physical/connectivity.js';
import { connectionRefKey } from '../src/physical/model.js';
import { validatePhysicalProject } from '../src/physical/validation.js';

// Contract rules that were proven only by the removed schema-v2 engine (GAP-11),
// checked here on circuits the live engine wires by itself.

const scenes = [['distance', 'rgb'], ['knob', 'servo'], ['button', 'screen']].map(([sensor, output]) => buildGoalProject({ sensor, output }).project);

test('AW-08: every wire of one net has one colour, ground is black, power is red, signals differ', () => {
    for (const project of scenes) {
        const resolver = new ConnectivityResolver(project);
        const colours = new Map();
        for (const wire of project.wires) {
            const net = resolver.graph.find(connectionRefKey(wire.from));
            if (!colours.has(net)) colours.set(net, new Set());
            colours.get(net).add(String(wire.color).toLowerCase());
        }
        for (const [net, set] of colours) assert.equal(set.size, 1, `net ${net} has colours ${[...set]}`);
        const pinsOn = net => resolver.netFor(project.wires.find(wire => resolver.graph.find(connectionRefKey(wire.from)) === net).from)
            .filter(ref => ref.type === 'component-pin').map(ref => String(ref.pinId));
        const signals = [];
        for (const [net, [colour]] of [...colours].map(([net, set]) => [net, [...set]])) {
            const pins = pinsOn(net);
            if (pins.some(pin => /^GND/.test(pin))) assert.match(colour, /^#(000000|111111|1f2937|0f172a|000)$/, `ground is ${colour}`);
            else if (pins.includes('5V') || pins.includes('3.3V')) assert.match(colour, /^#(ef4444|dc2626|ff0000|f00|e11d48)$/, `power is ${colour}`);
            else signals.push(colour);
        }
        assert.equal(new Set(signals).size, signals.length, `signal colours repeat: ${signals}`);
    }
});

test('VAL-01: validation reads the project and never changes it', () => {
    for (const project of scenes) {
        const before = JSON.stringify(project);
        const frozen = structuredClone(project);
        validatePhysicalProject(frozen);
        assert.equal(JSON.stringify(frozen), before);
    }
});
