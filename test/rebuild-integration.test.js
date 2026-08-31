import test from 'node:test';
import assert from 'node:assert/strict';

test('Layout command plans atomically, prompts for capacity, then keeps logical and physical state separate', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 100, y: 100, rotation: 0 },
        { id: 'led', componentId: 'led', x: 500, y: 200, rotation: 0 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    store.pinInfoMap.clear();

    const before = JSON.stringify({ instances: store.instances, wires: store.wires });
    const prompt = autoWireAll({ placeComponents: true });
    assert.equal(prompt.status, 'needs-resource-action');
    assert.ok(prompt.alternatives.some(alternative => alternative.boardType === 'breadboard-half-400'));
    assert.equal(JSON.stringify({ instances: store.instances, wires: store.wires }), before);

    const accepted = autoWireAll({
        placeComponents: true,
        resourceChoice: prompt.alternatives.find(alternative => alternative.boardType === 'breadboard-half-400'),
    });
    assert.equal(accepted.status, 'success');
    assert.ok(store.physicalPlan);
    assert.equal(store.instances.some(instance => instance.componentId === 'resistor' && instance.provenance?.kind === 'generated'), true);
    assert.equal(store.instances.some(instance => instance.componentId === 'breadboard-half'), true);
    assert.equal(store.wires.some(wire => [wire.from, wire.to].some(endpoint => endpoint.pinName.startsWith('TP') || endpoint.pinName.startsWith('TN'))), false);
    assert.equal(store.getRenderableWires().some(wire => [wire.from, wire.to].some(endpoint => endpoint.pinName.startsWith('TN'))), true);

    const railEndpoints = store.getRenderableWires().flatMap(wire => [wire.from, wire.to])
        .filter(endpoint => endpoint.pinName.startsWith('TN') || endpoint.pinName.startsWith('TP'));
    assert.equal(new Set(railEndpoints.map(endpoint => `${endpoint.instanceId}:${endpoint.pinName}`)).size, railEndpoints.length);
});

test('auto-wire gives distinct signal nets stable colors while sharing colors within one net', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 100, y: 100 },
        { id: 'button', componentId: 'pushbutton', x: 400, y: 100 },
        { id: 'led', componentId: 'led', x: 500, y: 100 },
    ];
    store.wires = [];
    store.physicalPlan = null;

    const result = autoWireAll({ placeComponents: false });
    assert.equal(result.status, 'success');
    const signalWires = store.wires.filter(wire => [wire.from, wire.to].some(endpoint =>
        endpoint.instanceId === 'uno' && /^\d+$/.test(endpoint.pinName)));
    assert.equal(new Set(signalWires.map(wire => wire.logicalNetId)).size, 2);
    assert.equal(new Set(signalWires.map(wire => wire.color)).size, 2);
    const ledSignal = store.wires.filter(wire => wire.logicalNetId === signalWires.find(wire =>
        [wire.from, wire.to].some(endpoint => endpoint.instanceId === 'generated-resistor:led'))?.logicalNetId);
    assert.equal(new Set(ledSignal.map(wire => wire.color)).size, 1);
});

test('auto-layout mounts every supported pushbutton instead of leaving direct external loops', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 200, y: 400 },
        ...Array.from({ length: 3 }, (_, index) => ({ id: `button${index + 1}`, componentId: 'pushbutton', x: 500 + index * 80, y: 100 })),
        { id: 'buzzer', componentId: 'buzzer', x: 700, y: 300 },
    ];
    store.wires = [];
    store.physicalPlan = null;

    const prompt = autoWireAll({ placeComponents: true });
    const accepted = autoWireAll({
        placeComponents: true,
        resourceChoice: prompt.alternatives.find(alternative => alternative.boardType === 'breadboard-half-400'),
    });
    assert.equal(accepted.status, 'success');
    const breadboard = store.instances.find(instance => instance.componentId === 'breadboard-half');
    for (const button of store.instances.filter(instance => instance.componentId === 'pushbutton')) {
        assert.equal(button.mountedOn, breadboard.id);
        assert.equal([90, 270].includes(button.rotation), true);
    }
});

test('rebuilding after a manual breadboard edit preserves every mounted footprint', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 200, y: 400 },
        { id: 'button1', componentId: 'pushbutton', x: 500, y: 100 },
        { id: 'button2', componentId: 'pushbutton', x: 600, y: 100 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    const prompt = autoWireAll({ placeComponents: true });
    const accepted = autoWireAll({
        placeComponents: true,
        resourceChoice: prompt.alternatives.find(alternative => alternative.boardType === 'breadboard-half-400'),
    });
    assert.equal(accepted.status, 'success');
    const before = new Map(store.instances
        .filter(instance => instance.mountedOn)
        .map(instance => [instance.id, JSON.stringify({
            x: instance.x,
            y: instance.y,
            rotation: instance.rotation,
            holes: instance.breadboardPlacement.holes,
        })]));

    const rebuilt = autoWireAll({ placeComponents: true, preserveMountedPlacements: true });
    assert.equal(rebuilt.status, 'success');
    for (const [id, placement] of before) {
        const instance = store.getInstance(id);
        assert.equal(JSON.stringify({
            x: instance.x,
            y: instance.y,
            rotation: instance.rotation,
            holes: instance.breadboardPlacement.holes,
        }), placement);
    }
});

test('Wire updates connectivity without dismantling an existing breadboard layout', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 200, y: 400 },
        { id: 'button', componentId: 'pushbutton', x: 500, y: 100 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    const prompt = autoWireAll({ placeComponents: true });
    autoWireAll({
        placeComponents: true,
        resourceChoice: prompt.alternatives.find(alternative => alternative.boardType === 'breadboard-half-400'),
    });
    const before = store.getInstance('button');
    const footprint = JSON.stringify({
        mountedOn: before.mountedOn,
        holes: before.breadboardPlacement.holes,
        x: before.x,
        y: before.y,
        rotation: before.rotation,
    });

    const result = autoWireAll({ placeComponents: false });
    const after = store.getInstance('button');
    assert.equal(result.status, 'success');
    assert.ok(store.physicalPlan);
    assert.equal(JSON.stringify({
        mountedOn: after.mountedOn,
        holes: after.breadboardPlacement.holes,
        x: after.x,
        y: after.y,
        rotation: after.rotation,
    }), footprint);
});

test('Nano can own Auto Wire and mount across a breadboard trench', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'nano', componentId: 'arduino-nano', x: 200, y: 400, rotation: 0 },
        { id: 'sensor', componentId: 'dht22', x: 500, y: 100, rotation: 0 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    store.pinInfoMap.clear();

    const prompt = autoWireAll({ placeComponents: true });
    assert.equal(prompt.status, 'needs-resource-action');
    const result = autoWireAll({
        placeComponents: true,
        resourceChoice: prompt.alternatives.find(alternative => alternative.boardType === 'breadboard-half-400'),
    });

    assert.equal(result.status, 'success');
    const nano = store.getInstance('nano');
    assert.equal(nano.mountedOn, store.instances.find(instance => instance.componentId === 'breadboard-half').id);
    assert.equal(Object.keys(nano.breadboardPlacement.holes).length, 30);
    assert.match(nano.breadboardPlacement.holes['12'], /^A\d+$/);
    assert.equal(nano.breadboardPlacement.holes['13'], `F${nano.breadboardPlacement.holes['12'].slice(1)}`);
    assert.equal(store.wires.some(wire => [wire.from, wire.to].some(endpoint => endpoint.instanceId === 'nano')), true);
    assert.equal(store.instances.some(instance => instance.componentId === 'arduino-uno'), false);
});

test('Nano RP2040 mounts and repeated Auto Layout is idempotent', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll, autoLayoutAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'rp2040', componentId: 'nano-rp2040-connect', x: 200, y: 400, rotation: 0 },
        { id: 'sensor', componentId: 'dht22', x: 500, y: 100, rotation: 0 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    store.pinInfoMap.clear();

    const prompt = autoWireAll({ placeComponents: true });
    const choice = prompt.alternatives.find(alternative => alternative.boardType === 'breadboard-half-400');
    assert.equal(autoWireAll({ placeComponents: true, resourceChoice: choice }).status, 'success');
    await autoLayoutAll();
    const first = JSON.stringify(store.instances.map(({ id, x, y, rotation, mountedOn, breadboardPlacement }) =>
        ({ id, x, y, rotation, mountedOn, holes: breadboardPlacement?.holes })));

    assert.equal(autoWireAll({ placeComponents: true }).status, 'success');
    await autoLayoutAll();
    const second = JSON.stringify(store.instances.map(({ id, x, y, rotation, mountedOn, breadboardPlacement }) =>
        ({ id, x, y, rotation, mountedOn, holes: breadboardPlacement?.holes })));

    assert.equal(second, first);
    assert.equal(store.getInstance('rp2040').mountedOn,
        store.instances.find(instance => instance.componentId === 'breadboard-half').id);
    assert.equal(Object.keys(store.getInstance('rp2040').breadboardPlacement.holes).length, 30);
});

test('direct Auto Layout runs without breadboard resources and is idempotent', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll, autoLayoutAll } = await import('../src/services/auto-wire-engine.js');
    store.instances = [
        { id: 'uno', componentId: 'arduino-uno', x: 300, y: 300, rotation: 0 },
        { id: 'servo', componentId: 'servo', x: 900, y: 900, rotation: 0 },
    ];
    store.wires = [];
    store.physicalPlan = null;
    store.pinInfoMap.clear();

    assert.equal(autoWireAll({ placeComponents: true }).status, 'success');
    assert.equal(store.physicalPlan.resources.length, 0);
    await autoLayoutAll();
    const first = JSON.stringify(store.instances.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })));
    assert.notEqual(store.getInstance('servo').y, 900);

    assert.equal(autoWireAll({ placeComponents: true }).status, 'success');
    await autoLayoutAll();
    const second = JSON.stringify(store.instances.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })));
    assert.equal(second, first);
});

test('every MCU completes board-aware Auto Wire and stable Auto Layout', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    const { store } = await import('../src/store.js');
    const { autoWireAll, autoLayoutAll } = await import('../src/services/auto-wire-engine.js');
    const boards = ['arduino-uno', 'arduino-mega', 'arduino-nano', 'esp32-devkit-v1', 'franzininho', 'nano-rp2040-connect'];
    for (const componentId of boards) {
        store.instances = [
            { id: 'mcu', componentId, x: 200, y: 400, rotation: 0 },
            { id: 'sensor', componentId: 'dht22', x: 500, y: 100, rotation: 0 },
        ];
        store.wires = [];
        store.physicalPlan = null;
        store.pinInfoMap.clear();

        let result = autoWireAll({ placeComponents: true });
        if (result.status === 'needs-resource-action') {
            result = autoWireAll({
                placeComponents: true,
                resourceChoice: result.alternatives.find(alternative => alternative.boardType === 'breadboard-half-400'),
            });
        }
        assert.equal(result.status, 'success', componentId);
        assert.equal(store.wires.some(wire => [wire.from, wire.to].some(endpoint => endpoint.instanceId === 'mcu')), true, componentId);
        await autoLayoutAll();
        const first = JSON.stringify(store.instances.map(({ id, x, y, rotation, mountedOn, breadboardPlacement }) =>
            ({ id, x, y, rotation, mountedOn, holes: breadboardPlacement?.holes })));

        assert.equal(autoWireAll({ placeComponents: true }).status, 'success', componentId);
        await autoLayoutAll();
        const second = JSON.stringify(store.instances.map(({ id, x, y, rotation, mountedOn, breadboardPlacement }) =>
            ({ id, x, y, rotation, mountedOn, holes: breadboardPlacement?.holes })));
        assert.equal(second, first, componentId);
    }
});
