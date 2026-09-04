import test from 'node:test';
import assert from 'node:assert/strict';

import {
    componentLibrary,
    getComponentVisualOverride,
    registerComponentVisualOverride,
    registerCustomComponent,
    resetComponentVisualOverride,
} from '../src/component-library.js';
import { getComponentPropertyDefinitions, visualPropertyValues } from '../src/core/component-metadata.js';
import { createFritzingPartDefinition, FRITZING_INTERMEDIATE_FORMAT, registerFritzingPart } from '../src/core/fritzing-part-contract.js';
import { getCalibratedPackageDefinitions, getPartDefinition } from '../src/core/part-registry.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';
import { setComponentPropertyCommand } from '../src/physical/commands.js';
import { canonicalLedColor, recommendedLedResistorOhms } from '../src/core/led-resistor.js';
import { loadEditorPreferences, saveEditorPreferences } from '../src/core/editor-preferences.js';
import { resolveVisualAdapter } from '../src/core/visual-adapter.js';
import { WOKWI_ELEMENTS_MANIFEST } from '../src/generated/wokwi-elements-manifest.js';
import { findAlphaContentBounds, normalizeContentBounds } from '../src/core/image-content-bounds.js';

test('generated Wokwi metadata matches the installed public element catalog', () => {
    const manifestTags = WOKWI_ELEMENTS_MANIFEST.elements.map(element => element.tag).sort();
    const catalogTags = Object.values(componentLibrary)
        .map(component => component.tag)
        .filter(tag => tag?.startsWith('wokwi-'))
        .sort();
    assert.equal(WOKWI_ELEMENTS_MANIFEST.package, '@wokwi/elements');
    assert.equal(WOKWI_ELEMENTS_MANIFEST.version, '1.9.2');
    assert.equal(manifestTags.length, 50);
    assert.deepEqual(catalogTags, manifestTags);
});

test('authored property effects refine generated renderer properties without exposing project metadata', () => {
    const led = componentLibrary.led;
    const descriptors = getComponentPropertyDefinitions(led);
    assert.equal(descriptors.find(item => item.name === 'color').editable, true);
    assert.equal(descriptors.find(item => item.name === 'flip').effect, 'physical-package');
    assert.equal(getComponentPropertyDefinitions(componentLibrary.resistor)
        .find(item => item.name === 'value').effect, 'electrical');
    assert.deepEqual(visualPropertyValues(led, { color: 'green', provenance: { kind: 'generated' } }).color, 'green');
    assert.equal(Object.hasOwn(visualPropertyValues(led, { provenance: true }), 'provenance'), false);
    const resistance = getComponentPropertyDefinitions(componentLibrary.resistor).find(item => item.name === 'value');
    assert.equal(resistance.type, 'number');
    assert.equal(resistance.defaultValue, 220);
    assert.equal(resistance.unit, 'Ω');
});

test('component property changes are project data and support undoable command execution', () => {
    const project = { components: [
        { id: 'uno', definitionId: 'arduino-uno', properties: {} },
        { id: 'led-1', definitionId: 'led', properties: { controllerId: 'uno', provenance: { kind: 'user' } } },
        { id: 'helper', definitionId: 'resistor', properties: {
            value: 330,
            provenance: { kind: 'generated', ownerId: 'led-1', controllerId: 'uno' },
        } },
    ] };
    const command = setComponentPropertyCommand('led-1', 'color', '#00ff00');
    assert.deepEqual(command.wireIds, []);
    command.apply(project);
    assert.equal(project.components[1].properties.color, 'green');
    assert.deepEqual(project.components[1].properties.provenance, { kind: 'user' });
    assert.equal(project.components[2].properties.value, 330);
    setComponentPropertyCommand('led-1', 'color', 'blue').apply(project);
    assert.equal(project.components[2].properties.value, 220);
});

test('LED colors are realistic choices with conservative standard resistor recommendations', () => {
    const color = getComponentPropertyDefinitions(componentLibrary.led).find(item => item.name === 'color');
    assert.deepEqual(color.options, ['red', 'orange', 'yellow', 'green', 'blue', 'white', 'purple']);
    assert.equal(getComponentPropertyDefinitions(componentLibrary.led).find(item => item.name === 'brightness').editable, false);
    assert.equal(canonicalLedColor('#00ff00'), 'green');
    assert.equal(recommendedLedResistorOhms('red', 5), 330);
    assert.equal(recommendedLedResistorOhms('blue', 5), 220);
    assert.equal(recommendedLedResistorOhms('green', 3.3), 120);
});

test('editor preferences persist optional Auto Wire LED helpers', () => {
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
    };
    assert.equal(loadEditorPreferences(storage).autoWireLedResistors, true);
    saveEditorPreferences({ autoWireLedResistors: false }, storage);
    assert.equal(loadEditorPreferences(storage).autoWireLedResistors, false);
});

test('built-in visual pin overrides persist separately from electrical component metadata', () => {
    const originalStorage = globalThis.localStorage;
    const values = new Map();
    globalThis.localStorage = {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
    };
    try {
        const originalPinRole = componentLibrary.resistor.pinMeta['1'];
        const saved = registerComponentVisualOverride('resistor', {
            nativePins: { '1': { x: 2.25, y: 5.4 }, '2': { x: 57.1, y: 5.4 } },
        });
        assert.deepEqual(saved.nativePins['1'], { x: 2.25, y: 5.4 });
        assert.deepEqual(getComponentVisualOverride('resistor')?.nativePins['2'], { x: 57.1, y: 5.4 });
        assert.equal(getPartDefinition('resistor').visualAdapter.nativePins['1'].x, 2.25);
        assert.equal(componentLibrary.resistor.pinMeta['1'], originalPinRole);
        assert.match(values.get('elera_component_visual_overrides_v1'), /"resistor"/);
        assert.equal(resetComponentVisualOverride('resistor'), true);
        assert.equal(getComponentVisualOverride('resistor'), null);
        assert.equal(getPartDefinition('resistor').visualAdapter.nativePins['1'].x, 0);
    } finally {
        resetComponentVisualOverride('resistor', { persist: false });
        if (originalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = originalStorage;
    }
});

test('custom image footprints use visible alpha bounds instead of transparent canvas padding', () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    pixels[(1 * 4 + 1) * 4 + 3] = 255;
    pixels[(2 * 4 + 2) * 4 + 3] = 255;
    assert.deepEqual(findAlphaContentBounds(pixels, 4, 3), { x: 1, y: 1, width: 2, height: 2 });
    assert.deepEqual(normalizeContentBounds({ x: 73, y: 73, width: 202, height: 201 }, { width: 708, height: 352 }),
        { x: 73, y: 73, width: 202, height: 201 });

    const id = 'custom-transparent-padding-test';
    registerCustomComponent({
        id,
        name: 'Transparent padding test',
        imageUrl: 'data:image/png;base64,test',
        size: { width: 708, height: 352 },
        contentBounds: { x: 73, y: 73, width: 202, height: 201 },
        customPins: [{ name: 'TX', type: 'DATA', x: 90, y: 170 }],
    }, { persist: false });
    try {
        assert.deepEqual(componentLibrary[id].contentBounds,
            { x: 73, y: 73, width: 202, height: 201 });
        assert.ok(defaultFootprintForComponent(id));
    } finally {
        delete componentLibrary[id];
    }
});

test('Fritzing intermediate records keep artwork pixels separate from physical millimetres', () => {
    const record = {
        format: FRITZING_INTERMEDIATE_FORMAT,
        id: 'test-fritzing-led',
        name: 'Converted LED',
        artwork: { svgUrl: '/parts/test-led.svg', sourceSize: { width: 40, height: 50 } },
        pins: [
            { id: 'A', label: 'Anode', electricalRole: 'SIGNAL', autoWireRequirement: 'DIGITAL', artwork: { x: 25, y: 42 } },
            { id: 'C', label: 'Cathode', electricalRole: 'GND', autoWireRequirement: 'GND', artwork: { x: 15, y: 42 } },
        ],
        packages: [{
            id: 'test-fritzing-led-2.54',
            anchorPinId: 'C',
            pins: [{ pinId: 'C', x: 0, y: 0 }, { pinId: 'A', x: 2.54, y: 0 }],
            routingBounds: { x: -1.8, y: -4.8, width: 6.14, height: 6.6 },
        }],
        propertyDefinitions: [{ name: 'color', type: 'string', effect: 'visual', editable: true }],
    };

    const converted = createFritzingPartDefinition(record);
    assert.equal(converted.visualAdapter.nativePins.A.x, 25);
    assert.equal(converted.packageDefinitions[0].pins[1].x, 2.54);
    const registered = registerFritzingPart(record, { notify: false });
    try {
        assert.equal(registered.id, record.id);
        const part = getPartDefinition(record.id);
        assert.equal(part.visualAdapter.provider, 'fritzing-svg');
        assert.equal(part.pins.find(pin => pin.id === 'A').autoWireRequirement, 'DIGITAL');
        assert.equal(part.packageIds[0], 'test-fritzing-led-2.54');
        assert.equal(getCalibratedPackageDefinitions(record.id)[0].pins[1].x, 2.54);
        assert.equal(defaultFootprintForComponent(record.id).id, 'test-fritzing-led-2.54');
        assert.equal(resolveVisualAdapter(registered).assetUrl, '/parts/test-led.svg');
    } finally {
        delete componentLibrary[record.id];
    }
});

test('Fritzing conversion rejects packages that refer to unknown connectors', () => {
    assert.throws(() => createFritzingPartDefinition({
        format: FRITZING_INTERMEDIATE_FORMAT,
        id: 'broken',
        name: 'Broken',
        artwork: { svgUrl: '/broken.svg', sourceSize: { width: 10, height: 10 } },
        pins: [{ id: '1', artwork: { x: 1, y: 1 } }],
        packages: [{ id: 'broken-package', pins: [{ pinId: '2', x: 0, y: 0 }] }],
    }), /unknown pin 2/);
});
