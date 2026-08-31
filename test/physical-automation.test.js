import test from 'node:test';
import assert from 'node:assert/strict';

import { PhysicalCircuitStore } from '../src/physical/circuit-store.js';
import { autoLayoutPhysicalStore, autoWirePhysicalStore } from '../src/physical/automation.js';
import { addComponentCommand } from '../src/physical/commands.js';
import { createHalfBreadboardSurface, getSurfaceDefinition } from '../src/physical/breadboard.js';
import { componentPinRef, createComponentInstance, createPhysicalProject, surfaceHoleRef } from '../src/physical/model.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';
import { componentRoutingObstacles, routeAllWires, routeSegments } from '../src/physical/routing.js';

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

test('Auto Layout operates on the same project, keeps mounted bindings, and positions Arduino freely', () => {
    const store = new PhysicalCircuitStore({ load: false });
    const arduino = addArduino(store);
    const chip = store.project.components.find(component => component.footprintId === 'dip8-300mil');
    const bindings = structuredClone(chip.placement.bindings);
    const result = autoLayoutPhysicalStore(store);
    assert.equal(result.status, 'success');
    assert.deepEqual(store.project.components.find(component => component.id === chip.id).placement.bindings, bindings);
    const positionedArduino = store.project.components.find(component => component.id === arduino.id);
    assert.equal(positionedArduino.placement.type, 'free');
    assert.ok(positionedArduino.placement.position.x > store.project.surfaces[0].transform.x);
    assert.ok(store.project.wires.every(wire => wire.route?.mode === 'auto'));
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

test('physical Auto Layout follows Uno header affinity and routes adjacent pins in body-clear distinct lanes', () => {
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
    autoLayoutPhysicalStore(store, { wire: false });

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
    const groundIds = ['pir-ground', 'dht-ground', 'ir-ground', 'rtc-ground'];
    const routeLength = points => routeSegments(points)
        .reduce((total, segment) => total + Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y), 0);

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
    autoLayoutPhysicalStore(store, { wire: false });

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

test('Auto Layout with Auto Wire commits one history step', () => {
    const store = new PhysicalCircuitStore({ load: false });
    addArduino(store);
    const before = store.historyIndex;
    const result = autoLayoutPhysicalStore(store);
    assert.equal(result.status, 'success');
    assert.equal(store.historyIndex, before + 1);
});
