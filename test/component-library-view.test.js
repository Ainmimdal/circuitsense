import test from 'node:test';
import assert from 'node:assert/strict';

import {
    compareLibraryComponents,
    componentLibraryMetadata,
    componentMatchesLibraryFilter,
    componentMatchesLibrarySearch,
    groupLibraryComponentFamilies,
} from '../src/core/component-library-view.js';

const builtInResistor = {
    id: 'resistor', name: 'Resistor', category: 'passive', tag: 'wokwi-resistor',
    breadboard: { mountable: true },
};
const importedResistor = {
    id: 'fritzing-upright-resistor', name: 'Resistor upright', category: 'passive',
    source: { provider: 'fritzing' },
    library: {
        source: 'fritzing', family: 'resistor', variant: 'upright_resistor',
        technology: 'THT', tags: ['100 mil'],
    },
    breadboard: { mountable: true },
};
const customPart = {
    id: 'custom-light', name: 'My Light', category: 'custom', type: 'custom',
    breadboard: { mountable: false },
};

test('library view derives source, family, mounting, and readable variant metadata', () => {
    assert.deepEqual(componentLibraryMetadata(importedResistor), {
        source: 'fritzing',
        family: 'resistor',
        familyLabel: 'Resistor',
        variant: 'Upright Resistor',
        technology: 'THT',
        taxonomy: '',
        tags: ['100 mil'],
        mounting: 'breadboard',
    });
});

test('library filters expose breadboard-ready, imported, and personal parts', () => {
    assert.equal(componentMatchesLibraryFilter(builtInResistor, 'breadboard'), true);
    assert.equal(componentMatchesLibraryFilter(importedResistor, 'imported'), true);
    assert.equal(componentMatchesLibraryFilter(customPart, 'custom'), true);
    assert.equal(componentMatchesLibraryFilter(customPart, 'breadboard'), false);
});

test('library search includes converter metadata and source', () => {
    assert.equal(componentMatchesLibrarySearch(importedResistor, 'upright'), true);
    assert.equal(componentMatchesLibrarySearch(importedResistor, '100 mil'), true);
    assert.equal(componentMatchesLibrarySearch(importedResistor, 'fritzing'), true);
    assert.equal(componentMatchesLibrarySearch(builtInResistor, 'fritzing'), false);
});

test('family grouping keeps variants together and sorts built-ins first', () => {
    const groups = groupLibraryComponentFamilies([customPart, importedResistor, builtInResistor]);
    assert.equal(groups[0].id, 'resistor');
    assert.deepEqual(groups[0].components.map(component => component.id), [
        'resistor', 'fritzing-upright-resistor',
    ]);
    assert.equal(groups[1].label, '');
    assert.equal(groups[1].components[0], customPart);
    assert.ok(compareLibraryComponents(builtInResistor, importedResistor) < 0);
});
