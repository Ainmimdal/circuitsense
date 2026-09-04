import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';

import { convertFritzingArchive } from '../scripts/convert-fritzing-part.mjs';
import { componentLibrary } from '../src/component-library.js';
import { loadConvertedPartCatalog } from '../src/core/converted-part-loader.js';
import { defaultFootprintForComponent } from '../src/physical/footprints.js';

function archiveFor({ pinSpacing = '100 mil', connectorCount = 2 } = {}) {
    const connectors = Array.from({ length: connectorCount }, (_, index) => `
        <connector type="male" id="connector${index}" name="Pin ${index}">
            <description>Pin ${index}</description>
            <views><breadboardView><p svgId="connector${index}pin" layer="breadboard"/></breadboardView></views>
        </connector>`).join('');
    const svgPins = Array.from({ length: connectorCount }, (_, index) =>
        `<rect id="connector${index}pin" x="${1 + index * 10}" y="4" width="2" height="2" fill="none"/>`).join('');
    const fzp = `<?xml version="1.0" encoding="UTF-8"?>
        <module moduleId="SampleModule">
            <title>Sample resistor</title>
            <description>&lt;html&gt;&lt;head&gt;&lt;style&gt;p { color: red; }&lt;/style&gt;&lt;/head&gt;&lt;body&gt;Test resistor&lt;/body&gt;&lt;/html&gt;</description>
            <tags><tag>resistor</tag></tags>
            <properties>
                <property name="family">resistor</property>
                <property name="Resistance">4.7k</property>
                ${pinSpacing ? `<property name="Pin Spacing">${pinSpacing}</property>` : ''}
            </properties>
            <taxonomy>discreteParts.resistor</taxonomy>
            <views><breadboardView><layers image="breadboard/sample.svg"><layer layerId="breadboard"/></layers></breadboardView></views>
            <connectors>${connectors}</connectors>
        </module>`;
    const svg = `<?xml version="1.0"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="10mm" viewBox="0 0 30 10" onload="alert(1)">
            <defs><linearGradient id="paint"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
            <script>alert(1)</script>
            <image href="https://example.com/tracker.png" width="1" height="1"/>
            <rect id="body" x="0" y="0" width="20" height="10" style="fill:url(#paint)"/>
            ${svgPins}
        </svg>`;
    return zipSync({
        'part.sample.fzp': strToU8(fzp),
        'svg.breadboard.sample.svg': strToU8(svg),
    });
}

test('Fritzing converter emits a validated Elera record and sanitized namespaced SVG', () => {
    const result = convertFritzingArchive(archiveFor());

    assert.equal(result.record.id, 'fritzing-sample-module');
    assert.equal(result.record.name, 'Sample resistor');
    assert.equal(result.record.description, 'Test resistor');
    assert.equal(result.record.category, 'passive');
    assert.deepEqual(result.record.library, {
        source: 'fritzing',
        family: 'resistor',
        taxonomy: 'discreteParts.resistor',
        tags: ['resistor'],
    });
    assert.deepEqual(result.record.artwork.sourceSize, { width: 30, height: 10 });
    assert.deepEqual(result.record.artwork.physicalSizeMm, { width: 30, height: 10 });
    assert.deepEqual(result.record.pins.map(pin => ({ id: pin.id, x: pin.artwork.x, y: pin.artwork.y })), [
        { id: '1', x: 2, y: 5 },
        { id: '2', x: 12, y: 5 },
    ]);
    assert.equal(result.record.packages.length, 1);
    assert.equal(result.record.packages[0].pins[1].x, 2.54);
    assert.equal(result.record.propertyDefinitions[0].defaultValue, 4700);
    assert.doesNotMatch(result.svg, /<script|onload=|https:\/\/example\.com/);
    assert.match(result.svg, /id="elera-fritzing-sample-module-paint"/);
    assert.match(result.svg, /fill:url\(#elera-fritzing-sample-module-paint\)/);
});

test('Fritzing converter leaves uncertain footprints free-mounted', () => {
    const result = convertFritzingArchive(archiveFor({ pinSpacing: '', connectorCount: 3 }));

    assert.deepEqual(result.record.packages, []);
    assert.match(result.diagnostics.join(' '), /No trustworthy pin spacing/);
});

test('converted-part catalog loader registers validated converter records', async () => {
    const converted = convertFritzingArchive(archiveFor());
    const responses = new Map([
        ['/converted-parts/catalog.json', {
            format: 'elera-converted-part-catalog-v1',
            parts: ['/converted-parts/fritzing-sample-module/part.json'],
        }],
        ['/converted-parts/fritzing-sample-module/part.json', converted.record],
    ]);
    const fetchImpl = async url => responses.has(url)
        ? { ok: true, status: 200, json: async () => structuredClone(responses.get(url)) }
        : { ok: false, status: 404, json: async () => null };
    try {
        const result = await loadConvertedPartCatalog({ fetchImpl });
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.registered.map(part => part.id), ['fritzing-sample-module']);
        assert.equal(componentLibrary['fritzing-sample-module'].visualAdapter.provider, 'fritzing-svg');
    } finally {
        delete componentLibrary['fritzing-sample-module'];
    }
});

test('served converted-part catalog contains loadable records for every imported archive family', async () => {
    const publicRoot = new URL('../public/', import.meta.url);
    const fetchImpl = async url => {
        try {
            const fileUrl = new URL(String(url).replace(/^\/+/, ''), publicRoot);
            const value = JSON.parse(await readFile(fileUrl, 'utf8'));
            return { ok: true, status: 200, json: async () => structuredClone(value) };
        } catch {
            return { ok: false, status: 404, json: async () => null };
        }
    };
    const catalog = JSON.parse(await readFile(new URL('converted-parts/catalog.json', publicRoot), 'utf8'));
    const registeredIds = [];
    try {
        const result = await loadConvertedPartCatalog({ fetchImpl });
        registeredIds.push(...result.registered.map(part => part.id));
        assert.deepEqual(result.errors, []);
        assert.equal(catalog.parts.length, 12);
        assert.equal(result.registered.length, catalog.parts.length);
        assert.ok(result.registered.some(part => part.id === 'fritzing-upright-resistor-module-id'));
        assert.ok(result.registered.some(part => part.category === 'board'));
        for (const part of result.registered) {
            assert.ok(part.physicalSizeMm?.width > 0 && part.physicalSizeMm?.height > 0, part.id);
            if (part.breadboard?.mountable) continue;
            const footprint = defaultFootprintForComponent(part.id);
            assert.equal(footprint.routingBounds.width, part.physicalSizeMm.width, `${part.id} width`);
            assert.equal(footprint.routingBounds.height, part.physicalSizeMm.height, `${part.id} height`);
        }
    } finally {
        for (const id of registeredIds) delete componentLibrary[id];
    }
});
