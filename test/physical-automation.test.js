import test from 'node:test';
import assert from 'node:assert/strict';

import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';
import { arrangePhysicalStore, autoLayoutPhysicalStore, autoWirePhysicalStore } from '../src/physical/automation.js';
import { addComponentCommand } from '../src/physical/commands.js';
import { createHalfBreadboardSurface, getSurfaceDefinition } from '../src/physical/breadboard.js';
import {
    componentPinRef, createComponentInstance, createPhysicalProject, resolveConnectionWorldPoint, surfaceHoleRef,
} from '../src/physical/model.js';
import { calibrateFreeComponentFootprint, defaultFootprintForComponent } from '../src/physical/footprints.js';
import { componentRoutingObstacles, pinExitDirection, routeAllWires, routeSegments } from '../src/physical/routing.js';

function addArduino(store) {
    const footprint = defaultFootprintForComponent('arduino-uno');
    const arduino = createComponentInstance({
        id: 'arduino-visible', definitionId: 'arduino-uno', footprintId: footprint.id, x: 150, y: 30,
    });
    store.execute(addComponentCommand(arduino));
    return arduino;
}

test('Auto Wire changes the active physical project and creates semantic connections', () => {
    const store = new PhysicalCircuitStore({ load: false });
    addArduino(store);
    const result = autoWirePhysicalStore(store);
    assert.equal(result.status, 'success');
    assert.equal(result.total, 1);
    assert.ok(result.success >= 3, 'LED signal resistor, return, and generated link should be planned');
    assert.ok(store.project.components.some(component => component.properties?.provenance?.kind === 'generated'));
    assert.ok(store.project.wires.some(wire =>
        wire.from?.componentId === 'arduino-visible' || wire.to?.componentId === 'arduino-visible'));
    assert.ok(store.project.wires.every(wire => wire.from?.type && wire.to?.type));
});

test('user-facing Auto Layout keeps the full Auto Wire, arrange, and route workflow', () => {
    const store = new PhysicalCircuitStore({ load: false });
    const arduino = addArduino(store);
    const chip = store.project.components.find(component => component.footprintId === 'dip8-300mil');
    const bindings = structuredClone(chip.placement.bindings);
    const result = autoLayoutPhysicalStore(store);
    assert.equal(result.status, 'success');
    assert.equal(result.wireResult.status, 'success');
    assert.deepEqual(store.project.components.find(component => component.id === chip.id).placement.bindings, bindings);
    assert.ok(store.project.components.some(component => component.properties?.provenance?.kind === 'generated'));
    assert.ok(store.project.wires.some(wire => [wire.from, wire.to].some(ref => ref.componentId === arduino.id)));
    const positionedArduino = store.project.components.find(component => component.id === arduino.id);
    assert.equal(positionedArduino.placement.type, 'free');
    assert.ok(positionedArduino.placement.position.x > store.project.surfaces[0].transform.x);
    assert.ok(store.project.wires.every(wire => wire.route?.mode === 'auto'));
});

test('physical-only arrangement preserves semantic wires and route intent', () => {
    const store = new PhysicalCircuitStore({ load: false });
    addArduino(store);
    const wires = structuredClone(store.project.wires);
    const result = arrangePhysicalStore(store);
    assert.equal(result.status, 'success');
    assert.deepEqual(store.project.wires, wires);
});

function segmentIntersectsRect(segment, rect) {
    if (Math.abs(segment.a.x - segment.b.x) < 1e-6) {
        return segment.a.x > rect.left && segment.a.x < rect.right &&
            Math.max(segment.a.y, segment.b.y) > rect.top && Math.min(segment.a.y, segment.b.y) < rect.bottom;
    }
    return segment.a.y > rect.top && segment.a.y < rect.bottom &&
        Math.max(segment.a.x, segment.b.x) > rect.left && Math.min(segment.a.x, segment.b.x) < rect.right;
}

function collinearOverlap(a, b) {
    const aVertical = Math.abs(a.a.x - a.b.x) < 1e-6;
    const bVertical = Math.abs(b.a.x - b.b.x) < 1e-6;
    if (aVertical !== bVertical) return 0;
    if (aVertical) {
        if (Math.abs(a.a.x - b.a.x) > 1e-6) return 0;
        return Math.max(0, Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) -
            Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)));
    }
    if (Math.abs(a.a.y - b.a.y) > 1e-6) return 0;
    return Math.max(0, Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) -
        Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)));
}

function crowdedParallelOverlap(a, b, clearance = 1.8) {
    const aVertical = Math.abs(a.a.x - a.b.x) < 1e-6;
    const bVertical = Math.abs(b.a.x - b.b.x) < 1e-6;
    if (aVertical !== bVertical) return 0;
    if (aVertical) {
        if (Math.abs(a.a.x - b.a.x) + 1e-6 >= clearance) return 0;
        return Math.max(0, Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) -
            Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)));
    }
    if (Math.abs(a.a.y - b.a.y) + 1e-6 >= clearance) return 0;
    return Math.max(0, Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) -
        Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)));
}

test('physical-only arrangement follows Uno header affinity and routes derived paths in body-clear distinct lanes', () => {
    const surface = createHalfBreadboardSurface();
    const footprint = defaultFootprintForComponent('arduino-uno');
    const uno = createComponentInstance({
        id: 'uno-routing', definitionId: 'arduino-uno', footprintId: footprint.id, x: 180, y: 10,
    });
    const project = createPhysicalProject({
        surfaces: [surface], components: [uno], wires: [
            { id: 'wire-pin-2', from: componentPinRef(uno.id, '2'), to: surfaceHoleRef(surface.id, 'E12'), route: { mode: 'auto', waypoints: [] } },
            { id: 'wire-pin-3', from: componentPinRef(uno.id, '3'), to: surfaceHoleRef(surface.id, 'E14'), route: { mode: 'auto', waypoints: [] } },
            { id: 'wire-ground', from: componentPinRef(uno.id, 'GND.1'), to: surfaceHoleRef(surface.id, 'TN1'), route: { mode: 'auto', waypoints: [] } },
        ],
    });
    const store = new PhysicalCircuitStore({ load: false });
    store.importProject(project);
    arrangePhysicalStore(store);

    const laidOutSurface = store.project.surfaces[0];
    const laidOutUno = store.project.components[0];
    const unoBounds = componentRoutingObstacles(store.project, { margin: 0 }).find(item => item.id === uno.id);
    assert.ok(laidOutUno.placement.position.y > laidOutSurface.transform.y + getSurfaceDefinition(laidOutSurface).height,
        'digital pins exit upward, so the breadboard must be above the Uno');

    const first = store.routes.get('wire-pin-2');
    const second = store.routes.get('wire-pin-3');
    assert.ok(first && second);
    for (const route of [first, second]) {
        const segments = routeSegments(route);
        assert.equal(segments[0].a.x, segments[0].b.x, 'header escape must be perpendicular');
        assert.ok(segments[0].b.y < segments[0].a.y, 'digital header must escape upward');
        assert.ok(segments.slice(1).every(segment => !segmentIntersectsRect(segment, unoBounds)),
            'no routed middle segment may cross the Uno body');
    }
    const overlaps = routeSegments(first).flatMap(a => routeSegments(second).map(b => collinearOverlap(a, b)));
    assert.equal(Math.max(...overlaps), 0, 'adjacent header wires must not share a long parallel lane');

    const groundSegments = routeSegments(store.routes.get('wire-ground'));
    assert.ok(groundSegments[0].b.y > groundSegments[0].a.y, 'bottom header must escape downward before routing around the Uno');
    assert.ok(groundSegments.slice(1).every(segment => !segmentIntersectsRect(segment, unoBounds)),
        'route cleanup must not collapse a downward escape into a body-crossing reversal');
});

test('dense direct ground jumpers stay separate and local instead of escaping around the whole scene', () => {
    const make = (id, definitionId, x, y) => createComponentInstance({
        id, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x, y,
    });
    const uno = make('uno-dense', 'arduino-uno', 105, 105);
    const pir = make('pir-dense', 'pir-motion', 55, 20);
    const dht = make('dht-dense', 'dht22', 130, 20);
    const receiver = make('ir-dense', 'ir-receiver', 205, 20);
    const rtc = make('rtc-dense', 'ds1307', 135, 215);
    const wire = (id, fromComponent, fromPin, toComponent, toPin) => ({
        id, from: componentPinRef(fromComponent.id, fromPin), to: componentPinRef(toComponent.id, toPin),
        route: { mode: 'auto', waypoints: [] },
    });
    const project = createPhysicalProject({
        components: [uno, pir, dht, receiver, rtc],
        wires: [
            wire('pir-signal', uno, '13', pir, 'OUT'),
            wire('dht-signal', uno, '2', dht, 'SDA'),
            wire('ir-signal', uno, '3', receiver, 'DAT'),
            wire('rtc-sda', uno, 'A4', rtc, 'SDA'),
            wire('rtc-scl', uno, 'A5', rtc, 'SCL'),
            wire('pir-power', uno, '5V', pir, 'VCC'),
            wire('dht-power', uno, '5V', dht, 'VCC'),
            wire('ir-power', uno, '5V', receiver, 'VCC'),
            wire('rtc-power', uno, '5V', rtc, '5V'),
            wire('pir-ground', uno, 'GND.1', pir, 'GND'),
            wire('dht-ground', uno, 'GND.2', dht, 'GND'),
            wire('ir-ground', uno, 'GND.3', receiver, 'GND'),
            wire('rtc-ground', uno, 'GND.1', rtc, 'GND'),
        ],
    });
    const routes = routeAllWires(project);
    const powerIds = ['pir-power', 'dht-power', 'ir-power'];
    const groundIds = ['pir-ground', 'dht-ground', 'ir-ground', 'rtc-ground'];
    const routeLength = points => routeSegments(points)
        .reduce((total, segment) => total + Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y), 0);

    const powerCorridorYs = powerIds.map(id => {
        const segments = routeSegments(routes.get(id));
        assert.ok(segments[0].b.y > segments[0].a.y,
            `${id} must preserve its downward header escape even when its destination is above the Uno`);
        assert.ok(Math.abs(segments[1].a.y - segments[1].b.y) < 1e-6,
            `${id} must turn at the supply bus instead of creating a backtracking stub`);
        const corridor = segments.find(segment =>
            Math.abs(segment.a.y - segment.b.y) < 1e-6 && Math.abs(segment.a.x - segment.b.x) > 5);
        assert.ok(corridor, `${id} must have an outbound horizontal corridor`);
        return corridor.a.y;
    });
    assert.equal(new Set(powerCorridorYs.map(value => value.toFixed(6))).size, 1,
        'shared 5V conductors may reuse one long horizontal bus corridor');

    for (const id of groundIds) {
        const points = routes.get(id);
        const direct = Math.abs(points[0].x - points.at(-1).x) + Math.abs(points[0].y - points.at(-1).y);
        assert.ok(routeLength(points) <= direct * 2 + 45,
            `${id} must take a local point-to-point route instead of a scene-sized perimeter detour`);
        const endpointBounds = {
            left: Math.min(points[0].x, points.at(-1).x) - 45,
            right: Math.max(points[0].x, points.at(-1).x) + 45,
            top: Math.min(points[0].y, points.at(-1).y) - 45,
            bottom: Math.max(points[0].y, points.at(-1).y) + 45,
        };
        assert.ok(points.every(point => point.x >= endpointBounds.left && point.x <= endpointBounds.right &&
            point.y >= endpointBounds.top && point.y <= endpointBounds.bottom),
        `${id} must stay inside a local corridor around its two physical endpoints`);
    }
    assert.equal(new Set(groundIds.map(id => routes.get(id))).size, groundIds.length,
        'ground connections remain separate physical jumper routes');
});

test('unused breadboard does not replace old-Elera direct layout and multiple controllers form separate clusters', () => {
    const surface = createHalfBreadboardSurface();
    const make = (id, definitionId, x, y, controllerId = null) => createComponentInstance({
        id, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x, y,
        properties: controllerId ? { controllerId } : {},
    });
    const uno = make('uno-cluster', 'arduino-uno', 20, 90);
    const mega = make('mega-cluster', 'arduino-mega', 520, 90);
    const left = make('left-sensor', 'dht22', 40, 20, uno.id);
    const right = make('right-sensor', 'dht22', 540, 20, mega.id);
    const project = createPhysicalProject({
        surfaces: [surface], components: [uno, mega, left, right], wires: [
            { id: 'left-signal', from: componentPinRef(uno.id, '2'), to: componentPinRef(left.id, 'SDA'), route: { mode: 'auto', waypoints: [] } },
            { id: 'right-signal', from: componentPinRef(mega.id, '22'), to: componentPinRef(right.id, 'SDA'), route: { mode: 'auto', waypoints: [] } },
        ],
    });
    const store = new PhysicalCircuitStore({ load: false });
    store.importProject(project);
    arrangePhysicalStore(store);

    const laidOut = Object.fromEntries(store.project.components.map(component => [component.id, component]));
    const unoBounds = componentRoutingObstacles(store.project, { margin: 0 }).find(item => item.id === uno.id);
    const megaBounds = componentRoutingObstacles(store.project, { margin: 0 }).find(item => item.id === mega.id);
    assert.ok(unoBounds.right < megaBounds.left || megaBounds.right < unoBounds.left,
        'controller clusters must not overlap');
    assert.ok(Math.abs(laidOut[left.id].placement.position.x - laidOut[uno.id].placement.position.x) < 180,
        'the Uno-owned component must stay in the Uno cluster');
    assert.ok(Math.abs(laidOut[right.id].placement.position.x - laidOut[mega.id].placement.position.x) < 180,
        'the Mega-owned component must stay in the Mega cluster');
    assert.deepEqual(store.project.surfaces[0].transform, surface.transform,
        'an unused breadboard is not a reason to replace the direct layout branch');
});

test('user-facing Auto Layout composes Auto Wire, arrangement, and routing in one history step', () => {
    const store = new PhysicalCircuitStore({ load: false });
    addArduino(store);
    const before = store.historyIndex;
    const result = autoLayoutPhysicalStore(store);
    assert.equal(result.status, 'success');
    assert.equal(result.wireResult.status, 'success');
    assert.equal(store.historyIndex, before + 1);
    assert.ok(store.project.components.some(component => component.properties?.provenance?.kind === 'generated'));
    assert.ok(store.project.wires.every(wire => wire.route?.mode === 'auto'));
});

test('direct Auto Layout assigns bottom components to one bottom-header ground bus', () => {
    calibrateFreeComponentFootprint('arduino-uno', [
        { pinId: '2', x: 10, y: 0 },
        { pinId: 'A0', x: 34, y: 39 },
        { pinId: 'A4', x: 42, y: 39 },
        { pinId: 'A5', x: 46, y: 39 },
        { pinId: '5V', x: 30, y: 39 },
        { pinId: 'GND.1', x: 18, y: 39 },
        { pinId: 'GND.2', x: 22, y: 39 },
        { pinId: 'GND.3', x: 18, y: 0 },
    ]);
    calibrateFreeComponentFootprint('big-sound-sensor', [
        { pinId: 'AOUT', x: 2, y: 14 },
        { pinId: 'GND', x: 6, y: 14 },
        { pinId: 'VCC', x: 10, y: 14 },
        { pinId: 'DOUT', x: 14, y: 14 },
    ]);
    calibrateFreeComponentFootprint('ds1307', [
        { pinId: 'GND', x: 2, y: 0 },
        { pinId: '5V', x: 6, y: 0 },
        { pinId: 'SDA', x: 10, y: 0 },
        { pinId: 'SCL', x: 14, y: 0 },
    ]);

    const make = (id, definitionId, x, y) => createComponentInstance({
        id, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x, y,
    });
    const uno = make('uno-ground-affinity', 'arduino-uno', 100, 100);
    // Deliberately start on the opposite sides from their final header-affinity rows.
    const sound = make('sound-ground-affinity', 'big-sound-sensor', 100, 260);
    const rtc = make('rtc-ground-affinity', 'ds1307', 100, -80);
    const store = new PhysicalCircuitStore({ load: false });
    store.importProject(createPhysicalProject({ components: [uno, sound, rtc] }));

    const result = autoLayoutPhysicalStore(store);
    assert.equal(result.status, 'success');

    const controllerGroundPins = [];
    for (const component of [sound, rtc]) {
        const groundWire = store.project.wires.find(wire => [wire.from, wire.to].some(ref =>
            ref.componentId === component.id && ref.pinId === 'GND'));
        const controllerRef = [groundWire.from, groundWire.to].find(ref => ref.componentId === uno.id);
        controllerGroundPins.push(controllerRef.pinId);
        assert.equal(pinExitDirection(store.project, controllerRef), 'down',
            `${component.id} must use a ground pin on the bottom controller header`);
    }
    assert.equal(new Set(controllerGroundPins).size, 1,
        'all generated ground branches must enter one physical GND bus source');
});

test('Clean preserves fanout lanes for two ultrasonic sensors on opposite sides of one Uno', () => {
    calibrateFreeComponentFootprint('arduino-uno', [
        { pinId: '13', x: 21, y: 0 },
        { pinId: '12', x: 25, y: 0 },
        { pinId: '3', x: 45, y: 0 },
        // Render calibration can place the end pin on a footprint corner. The
        // Uno metadata still owns the header's outward direction in that tie.
        { pinId: '2', x: 54, y: 0 },
    ]);
    calibrateFreeComponentFootprint('hc-sr04', [
        { pinId: 'VCC', x: 2, y: 20 },
        { pinId: 'TRIG', x: 6, y: 20 },
        { pinId: 'ECHO', x: 10, y: 20 },
        { pinId: 'GND', x: 14, y: 20 },
    ]);
    const make = (id, definitionId, x, y) => createComponentInstance({
        id, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x, y,
    });
    const uno = make('uno-ultrasonic-fanout', 'arduino-uno', 15, 80);
    const left = make('ultrasonic-left', 'hc-sr04', 30, 15);
    const right = make('ultrasonic-right', 'hc-sr04', 220, 17);
    const wire = (id, pinId, component, componentPinId) => ({
        id, from: componentPinRef(uno.id, pinId), to: componentPinRef(component.id, componentPinId),
        route: { mode: 'auto', waypoints: [] },
    });
    const project = createPhysicalProject({
        components: [uno, left, right],
        wires: [
            wire('left-trigger', '13', left, 'TRIG'),
            wire('left-echo', '12', left, 'ECHO'),
            wire('right-trigger', '3', right, 'TRIG'),
            wire('right-echo', '2', right, 'ECHO'),
        ],
    });

    const routes = routeAllWires(project);
    const routeIds = project.wires.map(wire => wire.id);
    for (const routeId of routeIds) {
        const segments = routeSegments(routes.get(routeId));
        const first = segments[0];
        const last = segments.at(-1);
        assert.equal(first.a.x, first.b.x, `${routeId} must leave its Uno digital header vertically`);
        assert.ok(first.b.y < first.a.y, `${routeId} must honor the Uno's upward digital-header exit`);
        assert.equal(last.a.x, last.b.x, `${routeId} must approach the ultrasonic header vertically`);
        assert.ok(last.b.y < last.a.y, `${routeId} must enter the ultrasonic pin from below`);
    }
    for (const routeId of ['left-trigger', 'left-echo']) {
        assert.ok(routeSegments(routes.get(routeId)).every(segment => Math.abs(segment.a.x - segment.b.x) < 1e-6),
            `${routeId} must stay straight when the Uno and ultrasonic pins are already aligned`);
    }
    for (let firstIndex = 0; firstIndex < routeIds.length; firstIndex++) {
        for (let secondIndex = firstIndex + 1; secondIndex < routeIds.length; secondIndex++) {
            const first = routeSegments(routes.get(routeIds[firstIndex]));
            const second = routeSegments(routes.get(routeIds[secondIndex]));
            const overlap = first.flatMap(a => second.map(b => crowdedParallelOverlap(a, b)));
            assert.ok(Math.max(0, ...overlap) <= 1.8 + 1e-6,
                `${routeIds[firstIndex]} and ${routeIds[secondIndex]} must not collapse onto one corridor`);
        }
    }
});

test('Arduino ground exits follow the physical header row instead of unstable GND numbering', () => {
    calibrateFreeComponentFootprint('arduino-uno', [
        { pinId: '13', x: 20, y: 0 },
        { pinId: '5V', x: 30, y: 39 },
        { pinId: 'GND.3', x: 18, y: 39 },
    ]);
    const uno = createComponentInstance({
        id: 'uno-physical-ground-exit', definitionId: 'arduino-uno',
        footprintId: defaultFootprintForComponent('arduino-uno').id, x: 20, y: 20,
    });
    const project = createPhysicalProject({ components: [uno] });

    assert.equal(pinExitDirection(project, componentPinRef(uno.id, 'GND.3')), 'down');
});

test('fanout escape lanes stop before passing a nearby destination', () => {
    calibrateFreeComponentFootprint('arduino-uno', [
        { pinId: '5V', x: 30, y: 39 },
    ]);
    calibrateFreeComponentFootprint('ds1307', [
        { pinId: 'GND', x: 2, y: 0 },
        { pinId: '5V', x: 6, y: 0 },
        { pinId: 'SDA', x: 10, y: 0 },
        { pinId: 'SCL', x: 14, y: 0 },
    ]);
    const uno = createComponentInstance({
        id: 'uno-bounded-fanout', definitionId: 'arduino-uno',
        footprintId: defaultFootprintForComponent('arduino-uno').id, x: 0, y: 0,
    });
    const targets = Array.from({ length: 4 }, (_, index) => createComponentInstance({
        id: `nearby-power-${index + 1}`, definitionId: 'ds1307',
        footprintId: defaultFootprintForComponent('ds1307').id, x: 70 + index * 30, y: 45,
    }));
    const project = createPhysicalProject({
        components: [uno, ...targets],
        wires: targets.map((target, index) => ({
            id: `nearby-power-wire-${index + 1}`,
            from: componentPinRef(uno.id, '5V'),
            to: componentPinRef(target.id, '5V'),
            route: { mode: 'auto', waypoints: [] },
        })),
    });
    const routes = routeAllWires(project);

    for (const wire of project.wires) {
        const destination = resolveConnectionWorldPoint(project, wire.to);
        const first = routeSegments(routes.get(wire.id))[0];
        assert.ok(first.b.y <= destination.y + 1e-6,
            `${wire.id} must not fan out below its destination and reverse direction`);
    }
});
