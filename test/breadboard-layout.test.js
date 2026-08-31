import test from 'node:test';
import assert from 'node:assert/strict';
import { breadboardHoles } from '../src/breadboard-model.js';

test('places both visible LED leads exactly on breadboard holes', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { layoutBreadboardPlacements } = await import('../src/services/breadboard-service.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100, rotation: 0 },
        {
            id: 'led', componentId: 'led', x: 0, y: 0, rotation: 0,
            mountedOn: 'bb',
            breadboardPlacement: { breadboardId: 'bb', holes: { A: 'B2', C: 'B1' } },
        },
    ];
    store.pinInfoMap.set('bb', breadboardHoles);
    store.pinInfoMap.set('led', [
        { name: 'A', x: 25, y: 42, signals: [] },
        { name: 'C', x: 15, y: 42, signals: [] },
    ]);

    layoutBreadboardPlacements();

    for (const [pinName, holeName] of Object.entries(store.instances[1].breadboardPlacement.holes)) {
        const pin = store.getPinAbsolutePosition('led', pinName);
        const hole = store.getPinAbsolutePosition('bb', holeName);
        assert.deepEqual(pin, hole);
    }
    assert.equal(store.instances[1].physicalScale.x, 1);
});

test('keeps a rotated LED aligned to breadboard holes throughout a drag preview', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { getBreadboardDragPreview } = await import('../src/services/breadboard-service.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100, rotation: 0 },
        {
            id: 'led', componentId: 'led', x: 125, y: 162, rotation: 180,
            uniformScale: 1,
            mountedOn: 'bb',
            breadboardPlacement: {
                breadboardId: 'bb', anchorHole: 'B2', locked: true,
                holes: { C: 'B2', A: 'B1' },
            },
        },
    ];
    store.wires = [];
    store.physicalPlan = null;
    store.pinInfoMap.clear();
    store.pinInfoMap.set('bb', breadboardHoles);
    store.pinInfoMap.set('led', [
        { name: 'A', x: 25, y: 42, signals: [] },
        { name: 'C', x: 15, y: 42, signals: [] },
    ]);

    const preview = getBreadboardDragPreview('led', 135, 172);
    assert.ok(preview);
    assert.equal(preview.rotation, 180);
    store.getInstance('led').x = preview.x;
    store.getInstance('led').y = preview.y;
    assert.deepEqual(store.getPinAbsolutePosition('led', 'C'), store.getPinAbsolutePosition('bb', preview.holes.C));
    assert.deepEqual(store.getPinAbsolutePosition('led', 'A'), store.getPinAbsolutePosition('bb', preview.holes.A));
});

test('fans all component power through one 5V and one GND rail feeder', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { realizeBreadboard } = await import('../src/services/breadboard-service.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 0, y: 0, rotation: 0 },
        { id: 'bb', componentId: 'breadboard-half', x: 0, y: 240, rotation: 0 },
        { id: 'pot1', componentId: 'potentiometer', x: 400, y: 0, rotation: 0 },
        { id: 'pot2', componentId: 'potentiometer', x: 500, y: 0, rotation: 0 },
    ];
    store.wires = [
        { id: 'w1', from: { instanceId: 'uno', pinName: '5V' }, to: { instanceId: 'pot1', pinName: 'VCC' }, physical: { kind: 'jumper' } },
        { id: 'w2', from: { instanceId: 'uno', pinName: 'GND.1' }, to: { instanceId: 'pot1', pinName: 'GND' }, physical: { kind: 'jumper' } },
        { id: 'w3', from: { instanceId: 'uno', pinName: '5V' }, to: { instanceId: 'pot2', pinName: 'VCC' }, physical: { kind: 'jumper' } },
        { id: 'w4', from: { instanceId: 'uno', pinName: 'GND.2' }, to: { instanceId: 'pot2', pinName: 'GND' }, physical: { kind: 'jumper' } },
    ];
    store.pinInfoMap.clear();

    realizeBreadboard(store.instances[1], { placeComponents: false });

    const boardPowerWires = store.wires.filter(wire => [wire.from, wire.to].some(end =>
        end.instanceId === 'uno' && (end.pinName === '5V' || end.pinName.startsWith('GND'))
    ));
    assert.equal(boardPowerWires.length, 2);
    assert.equal(store.instances[2].mountedOn, undefined);
    assert.equal(store.instances[2].x, 400);
    assert.equal(store.wires.filter(wire => [wire.from, wire.to].some(end => end.instanceId === 'pot1' && end.pinName === 'VCC')).length, 1);
    assert.equal(store.wires.filter(wire => [wire.from, wire.to].some(end => end.instanceId === 'pot2' && end.pinName === 'VCC')).length, 1);
    assert.equal(store.wires.some(wire => [wire.from, wire.to].some(end => end.instanceId === 'bb' && end.pinName.startsWith('TN'))), true);
    const railEndpoints = store.wires.flatMap(wire => [wire.from, wire.to])
        .filter(end => end.instanceId === 'bb' && /^(TP|TN)/.test(end.pinName));
    assert.equal(new Set(railEndpoints.map(end => end.pinName)).size, railEndpoints.length);
});

test('routes breadboard-internal jumpers locally instead of around the board', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { routeAll } = await import('../src/services/routing-engine.js');
    store.instances = [{ id: 'bb', componentId: 'breadboard-half', x: 100, y: 100, rotation: 0 }];
    store.wires = [{
        id: 'branch',
        from: { instanceId: 'bb', pinName: 'A4' },
        to: { instanceId: 'bb', pinName: 'TP2' },
        physical: { kind: 'jumper', jumperType: 'male-male' },
        waypoints: [],
    }];
    store.pinInfoMap.clear();
    store.pinInfoMap.set('bb', breadboardHoles);

    await routeAll();

    assert.equal(store.wires[0].waypoints.length, 0);
});

test('routes the shortest clear local jumper around mounted component bodies', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { routeAll } = await import('../src/services/routing-engine.js');
    store.physicalPlan = null;
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100, rotation: 0 },
        { id: 'led', componentId: 'led', x: 200, y: 125, rotation: 0, mountedOn: 'bb' },
    ];
    store.wires = [{
        id: 'branch-around-led',
        from: { instanceId: 'bb', pinName: 'A4' },
        to: { instanceId: 'bb', pinName: 'TP20' },
        physical: { kind: 'rail-branch', jumperType: 'male-male' },
        waypoints: [],
    }];
    store.pinInfoMap.clear();
    store.pinInfoMap.set('bb', breadboardHoles);

    await routeAll();

    assert.deepEqual(store.wires[0].waypoints, [{ x: 150, y: 120 }, { x: 330, y: 120 }]);
});

test('fans multiple Arduino header wires into distinct lanes before obstacle routing', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { routeAll } = await import('../src/services/routing-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 100, y: 300, rotation: 0 },
        { id: 'button1', componentId: 'pushbutton', x: 480, y: 80, rotation: 0 },
        { id: 'button2', componentId: 'pushbutton', x: 560, y: 80, rotation: 0 },
    ];
    store.wires = [
        { id: 'signal-1', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'button1', pinName: '1.l' }, waypoints: [] },
        { id: 'signal-2', from: { instanceId: 'uno', pinName: '3' }, to: { instanceId: 'button2', pinName: '1.l' }, waypoints: [] },
    ];
    store.physicalPlan = null;
    store.pinInfoMap.clear();
    store.pinInfoMap.set('uno', [
        { name: '2', x: 200, y: 10 },
        { name: '3', x: 210, y: 10 },
    ]);
    store.pinInfoMap.set('button1', [{ name: '1.l', x: 0, y: 2.2 }]);
    store.pinInfoMap.set('button2', [{ name: '1.l', x: 0, y: 2.2 }]);

    await routeAll();

    const firstTurns = store.wires.map(wire => wire.waypoints[0]);
    assert.equal(firstTurns.every((point, index) => point.x === 300 + index * 10), true);
    assert.equal(new Set(firstTurns.map(point => point.y)).size, 2);
});

test('auto-layout puts a breadboard above Arduino digital headers and moves mounted parts with it', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoLayoutAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 300, y: 400, rotation: 0 },
        { id: 'bb', componentId: 'breadboard-half', x: 300, y: 700, rotation: 0 },
        { id: 'led', componentId: 'led', x: 350, y: 760, rotation: 0, mountedOn: 'bb' },
    ];
    store.wires = [{ id: 'logical', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'led', pinName: 'A' } }];
    store.physicalPlan = {
        resources: [{ id: 'bb', x: 300, y: 700 }],
        placements: [], contacts: [], nets: [], conductors: [],
        renderWires: [{ id: 'signal', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'bb', pinName: 'A6' }, waypoints: [] }],
    };
    store.pinInfoMap.clear();
    store.pinInfoMap.set('uno', [{ name: '2', x: 210, y: 10, signals: [] }]);
    store.pinInfoMap.set('bb', breadboardHoles);
    const originalOffset = store.getInstance('led').y - store.getInstance('bb').y;

    await autoLayoutAll();

    assert.equal(store.getInstance('bb').y < store.getInstance('uno').y, true);
    assert.equal(store.getInstance('led').y - store.getInstance('bb').y, originalOffset);
    assert.equal(
        store.getPinAbsolutePosition('uno', '2').x,
        store.getPinAbsolutePosition('bb', 'A6').x,
        'signal header and destination hole should form a straight vertical fan-out lane'
    );
    store.physicalPlan = null;
});

test('auto-layout realizes LED and resistor as a compact series circuit', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { realizeBreadboard } = await import('../src/services/breadboard-service.js');
    const { validateCircuit } = await import('../src/services/validation-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 100, y: 100, rotation: 0 },
        { id: 'bb', componentId: 'breadboard-half', x: 72, y: 340, rotation: 0 },
        { id: 'led', componentId: 'led', x: 700, y: 80, rotation: 0 },
        { id: 'res', componentId: 'resistor', x: 620, y: 80, rotation: 0 },
    ];
    store.wires = [
        { id: 'signal', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'res', pinName: '2' }, physical: { kind: 'jumper' } },
        { id: 'series', from: { instanceId: 'res', pinName: '1' }, to: { instanceId: 'led', pinName: 'A' }, physical: { kind: 'jumper' } },
        { id: 'ground', from: { instanceId: 'uno', pinName: 'GND.1' }, to: { instanceId: 'led', pinName: 'C' }, physical: { kind: 'jumper' } },
    ];
    store.pinInfoMap.clear();
    store.pinInfoMap.set('uno', [{ name: '2', x: 236.5, y: 9, signals: [] }]);
    store.pinInfoMap.set('bb', breadboardHoles);
    store.pinInfoMap.set('led', [
        { name: 'A', x: 25, y: 42, signals: [] },
        { name: 'C', x: 15, y: 42, signals: [] },
    ]);
    store.pinInfoMap.set('res', [
        { name: '1', x: 0, y: 5.65, signals: [] },
        { name: '2', x: 58.8, y: 5.65, signals: [] },
    ]);

    realizeBreadboard(store.instances[1], { placeComponents: true });

    assert.equal(store.instances[2].mountedOn, 'bb');
    assert.equal(store.instances[3].mountedOn, 'bb');
    assert.equal(store.instances[2].breadboardPlacement.locked, false);
    assert.equal(
        store.getWire('series').physical.kind,
        'internal-strip'
    );
    assert.equal(
        store.getPinAbsolutePosition('led', 'A').x,
        store.getPinAbsolutePosition('res', '1').x
    );
    assert.equal(
        store.getPinAbsolutePosition('led', 'A').y < store.getPinAbsolutePosition('res', '1').y,
        true
    );
    for (const pinName of ['1', '2']) {
        const x = store.getPinAbsolutePosition('res', pinName).x;
        assert.equal(x >= store.instances[1].x && x <= store.instances[1].x + 330, true);
    }
    assert.equal(validateCircuit().all.some(issue => issue.id === 'led-no-resistor'), false);
});

test('auto-layout realigns an existing breadboard beneath the Arduino', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { prepareBreadboard } = await import('../src/services/breadboard-service.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 100, y: 100, rotation: 0 },
        { id: 'bb', componentId: 'breadboard-half', x: 500, y: 700, rotation: 0 },
    ];

    prepareBreadboard({ alignToArduino: true });

    assert.equal(store.instances[1].x, 70);
    assert.equal(store.instances[1].y, 380);
});

test('snaps manually dropped LED leads onto the visible hole matrix', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { tryManualBreadboardPlacement } = await import('../src/services/breadboard-service.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100, rotation: 0 },
        { id: 'led', componentId: 'led', x: 105, y: 128, rotation: 0 },
    ];
    store.wires = [];
    store.pinInfoMap.clear();
    store.pinInfoMap.set('bb', breadboardHoles);
    store.pinInfoMap.set('led', [
        { name: 'A', x: 25, y: 42, signals: [] },
        { name: 'C', x: 15, y: 42, signals: [] },
    ]);

    assert.equal(tryManualBreadboardPlacement('led'), true);
    assert.equal(store.instances[1].mountedOn, 'bb');
    assert.equal(store.instances[1].breadboardPlacement.locked, true);
    assert.deepEqual(store.instances[1].breadboardPlacement.holes, { A: 'B2', C: 'B1' });
    assert.deepEqual(store.getPinAbsolutePosition('led', 'A'), store.getPinAbsolutePosition('bb', 'B2'));
    assert.deepEqual(store.getPinAbsolutePosition('led', 'C'), store.getPinAbsolutePosition('bb', 'B1'));
});

test('snaps and uniformly scales every Arduino Nano header pin onto a breadboard', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { tryManualBreadboardPlacement } = await import('../src/services/breadboard-service.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100, rotation: 0 },
        { id: 'nano', componentId: 'arduino-nano', x: 140, y: 155, rotation: 0 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    store.pinInfoMap.clear();
    store.pinInfoMap.set('bb', breadboardHoles);
    store.pinInfoMap.set('nano', [
        ...['12','11','10','9','8','7','6','5','4','3','2','GND.2','RESET.2','0','1']
            .map((name, index) => ({ name, x: 19.7 + index * 9.6, y: 4.8 })),
        ...['13','3.3V','AREF','A0','A1','A2','A3','A4','A5','A6','A7','5V','RESET','GND.1','VIN']
            .map((name, index) => ({ name, x: 19.7 + index * 9.6, y: 62.4 })),
    ]);

    assert.equal(tryManualBreadboardPlacement('nano'), true);
    const nano = store.getInstance('nano');
    assert.equal(nano.mountedOn, 'bb');
    assert.ok(Math.abs(nano.uniformScale - 10 / 9.6) < 1e-9);
    for (const [pinName, holeName] of Object.entries(nano.breadboardPlacement.holes)) {
        const pin = store.getPinAbsolutePosition('nano', pinName);
        const hole = store.getPinAbsolutePosition('bb', holeName);
        assert.ok(Math.hypot(pin.x - hole.x, pin.y - hole.y) < 1e-9, `${pinName} must align with ${holeName}`);
    }
});

test('calibrates and snaps every Nano RP2040 header pin onto a breadboard', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { tryManualBreadboardPlacement } = await import('../src/services/breadboard-service.js');
    const { calibratePhysicalPinInfo } = await import('../src/core/component-geometry.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100, rotation: 0 },
        { id: 'rp2040', componentId: 'nano-rp2040-connect', x: 140, y: 155, rotation: 0 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    store.pinInfoMap.clear();
    store.pinInfoMap.set('bb', breadboardHoles);
    const top = ['D12','D11','D10','D9','D8','D7','D6','D5','D4','D3','D2','GND.1','RESET','TX','RX'];
    const bottom = ['D13','3.3V','AREF','A0','A1','A2','A3','A4','A5','A6','A7','5V','RESET.2','GND.2','VIN'];
    const runtime = [
        ...top.map((name, index) => ({ name, x: 20.1 + index * 9.6, y: 1 })),
        ...bottom.map((name, index) => ({ name, x: 20.1 + index * 9.6, y: 67.5 })),
    ];
    store.pinInfoMap.set('rp2040', calibratePhysicalPinInfo('nano-rp2040-connect', runtime));

    assert.equal(tryManualBreadboardPlacement('rp2040'), true);
    const rp2040 = store.getInstance('rp2040');
    assert.equal(Object.keys(rp2040.breadboardPlacement.holes).length, 30);
    for (const [pinName, holeName] of Object.entries(rp2040.breadboardPlacement.holes)) {
        const pin = store.getPinAbsolutePosition('rp2040', pinName);
        const hole = breadboardHoles.find(item => item.name === holeName);
        assert.ok(Math.hypot(pin.x - (100 + hole.x), pin.y - (100 + hole.y)) < 1e-6, pinName);
    }
});

test('rejects manual jumpers on holes occupied by component leads', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 0, y: 0 },
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100 },
        { id: 'led', componentId: 'led', mountedOn: 'bb', breadboardPlacement: { holes: { A: 'B2', C: 'B1' } } },
    ];
    store.wires = [];
    store.wiringState = null;

    assert.equal(store.startWiring('bb', 'B2'), false);
    assert.equal(store.wiringState, null);
    assert.equal(store.startWiring('uno', '2'), true);
    assert.equal(store.completeWiring('bb', 'B1'), false);
    assert.equal(store.wiringState.instanceId, 'uno');
    store.cancelWiring();
});

test('keeps manual breadboard jumpers visible beside a generated physical plan', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100 },
        { id: 'led', componentId: 'led', x: 500, y: 100 },
    ];
    store.wires = [];
    store.wiringState = null;
    store.physicalPlan = { renderWires: [{ id: 'generated', from: { instanceId: 'bb', pinName: 'A5' }, to: { instanceId: 'bb', pinName: 'F5' } }] };
    store.pinInfoMap.clear();
    store.pinInfoMap.set('bb', breadboardHoles);
    store.pinInfoMap.set('led', [{ name: 'A', x: 25, y: 42, signals: [] }]);

    assert.equal(store.startWiring('bb', 'A1'), true);
    assert.equal(store.completeWiring('led', 'A'), true);
    assert.equal(store.wires[0].physical.manualBreadboard, true);
    assert.deepEqual(store.getRenderableWires().map(wire => wire.id), ['generated', store.wires[0].id]);

    assert.equal(store.startWiring('bb', 'A2'), true);
    assert.equal(store.completeWiring('bb', 'F2'), true);
    assert.equal(store.getRenderableWires().length, 3);
});

test('anti-overlap does not eject a mountable Nano from a breadboard while snapping', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100 },
        { id: 'nano', componentId: 'arduino-nano', x: 140, y: 155 },
    ];
    assert.deepEqual(store.resolveOverlap('nano', 140, 155), { x: 140, y: 155 });
});

test('rotates a mounted pushbutton to the next legal rigid footprint', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { rotateMountedBreadboardComponent, tryManualBreadboardPlacement } = await import('../src/services/breadboard-service.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100, rotation: 0 },
        { id: 'button', componentId: 'pushbutton', x: 160, y: 197.8, rotation: 0 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    store.pinInfoMap.clear();
    store.pinInfoMap.set('bb', breadboardHoles);
    store.pinInfoMap.set('button', [
        { name: '1.l', x: 0, y: 2.2 }, { name: '2.l', x: 0, y: 21 },
        { name: '1.r', x: 28, y: 2.2 }, { name: '2.r', x: 28, y: 21 },
    ]);

    assert.equal(tryManualBreadboardPlacement('button'), true);
    assert.deepEqual(store.getInstance('button').breadboardPlacement.holes,
        { '1.l': 'E5', '1.r': 'G5', '2.l': 'E3', '2.r': 'G3' });
    assert.equal(rotateMountedBreadboardComponent('button'), true);
    assert.equal(store.getInstance('button').rotation, 270);
    assert.deepEqual(store.getInstance('button').breadboardPlacement.holes,
        { '1.l': 'F5', '1.r': 'D5', '2.l': 'F7', '2.r': 'D7' });
});

test('selection and pin registration do not move parts, while dragging a breadboard carries its mounted circuit', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    store.instances = [
        { id: 'bb', componentId: 'breadboard-half', x: 100, y: 100 },
        { id: 'led', componentId: 'led', x: 140, y: 150, mountedOn: 'bb', breadboardPlacement: { holes: { C: 'B3', A: 'B4' } } },
    ];
    store.physicalPlan = {
        resources: [{ id: 'bb', x: 100, y: 100 }],
        placements: [{
            boardId: 'bb',
            transform: { anchorWorld: { x: 140, y: 170 } },
            rect: { left: 135, right: 175, top: 140, bottom: 180 },
        }],
        renderWires: [
            { id: 'local', from: { instanceId: 'bb', pinName: 'A1' }, to: { instanceId: 'bb', pinName: 'TP1' }, waypoints: [{ x: 150, y: 140 }] },
            { id: 'external', from: { instanceId: 'uno', pinName: '2' }, to: { instanceId: 'bb', pinName: 'A1' }, waypoints: [{ x: 300, y: 80 }] },
        ],
    };
    const before = JSON.stringify(store.instances);
    store.selectInstance('led');
    store.registerPinInfo('led', [{ name: 'C', x: 15, y: 42 }]);
    assert.equal(JSON.stringify(store.instances), before);

    store.moveInstance('bb', 120, 130);
    assert.deepEqual({ x: store.getInstance('bb').x, y: store.getInstance('bb').y }, { x: 120, y: 130 });
    assert.deepEqual({ x: store.getInstance('led').x, y: store.getInstance('led').y }, { x: 160, y: 180 });
    assert.deepEqual(store.physicalPlan.resources[0], { id: 'bb', x: 120, y: 130 });
    assert.deepEqual(store.physicalPlan.renderWires[0].waypoints, [{ x: 170, y: 170 }]);
    assert.deepEqual(store.physicalPlan.renderWires[1].waypoints, []);
});
