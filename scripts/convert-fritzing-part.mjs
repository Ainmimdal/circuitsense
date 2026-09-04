#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { strFromU8, unzipSync } from 'fflate';
import { CONVERTED_PART_CATALOG_FORMAT } from '../src/core/converted-part-loader.js';
import { createFritzingPartDefinition } from '../src/core/fritzing-part-contract.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_OUTPUT_ROOT = path.join(PROJECT_ROOT, 'public', 'converted-parts');
const BREADBOARD_PITCH_MM = 2.54;
const VALID_CATEGORIES = new Set(['board', 'sensor', 'input', 'output', 'actuator', 'passive', 'custom']);
const UNSAFE_SVG_ELEMENTS = new Set([
    'script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video',
    'canvas', 'animate', 'animatemotion', 'animatetransform', 'set', 'metadata',
]);

function usage() {
    return `Usage:
  npm run parts:convert-fritzing -- <part.fzpz> [options]

Options:
  --out <directory>          Output root (default: public/converted-parts)
  --asset-base <URL path>    Public URL root (default: /converted-parts)
  --id <component-id>        Override the stable generated component ID
  --category <category>      Override the inferred Elera category
  --pin-spacing-mm <number>  Calibrate a two-pin linear package explicitly
  --no-package               Never infer a rigid breadboard package
  --force                    Replace existing generated files
  --help                     Show this help
`;
}

function parseArguments(argv) {
    const options = {
        outputRoot: DEFAULT_OUTPUT_ROOT,
        assetBase: '/converted-parts',
        force: false,
        noPackage: false,
    };
    const positional = [];
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        const takeValue = name => {
            const value = argv[++index];
            if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
            return value;
        };
        if (argument === '--help' || argument === '-h') options.help = true;
        else if (argument === '--force') options.force = true;
        else if (argument === '--no-package') options.noPackage = true;
        else if (argument === '--out') options.outputRoot = path.resolve(takeValue('--out'));
        else if (argument === '--asset-base') options.assetBase = takeValue('--asset-base');
        else if (argument === '--id') options.id = takeValue('--id');
        else if (argument === '--category') options.category = takeValue('--category');
        else if (argument === '--pin-spacing-mm') options.pinSpacingMm = Number(takeValue('--pin-spacing-mm'));
        else if (argument.startsWith('--')) throw new TypeError(`Unknown option: ${argument}`);
        else positional.push(argument);
    }
    if (options.category && !VALID_CATEGORIES.has(options.category)) {
        throw new TypeError(`Unsupported category: ${options.category}`);
    }
    if (options.pinSpacingMm !== undefined && !(options.pinSpacingMm > 0)) {
        throw new TypeError('--pin-spacing-mm must be a positive number');
    }
    if (positional.length > 1) throw new TypeError('Pass exactly one .fzpz file');
    options.inputPath = positional[0] ? path.resolve(positional[0]) : null;
    return options;
}

function parseXml(xml, label) {
    const failures = [];
    const document = new DOMParser({
        onError: (level, message) => {
            if (level !== 'warning') failures.push(message);
        },
    }).parseFromString(xml, 'application/xml');
    if (!document?.documentElement || failures.length) {
        throw new TypeError(`Cannot parse ${label}: ${failures.join('; ') || 'missing document element'}`);
    }
    return document;
}

function elements(node, tagName = null) {
    const result = [];
    for (let index = 0; index < (node?.childNodes?.length || 0); index++) {
        const child = node.childNodes.item(index);
        if (child?.nodeType === 1 && (!tagName || child.tagName === tagName)) result.push(child);
    }
    return result;
}

function child(node, tagName) {
    return elements(node, tagName)[0] || null;
}

function descendants(node) {
    const result = [];
    const visit = current => {
        for (const item of elements(current)) {
            result.push(item);
            visit(item);
        }
    };
    visit(node);
    return result;
}

function normalizedText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function cleanDescription(value) {
    return String(value || '')
        .replace(/<!DOCTYPE[\s\S]*?>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function slug(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'part';
}

function round(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizedArchiveName(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function resolveArchiveEntry(entryNames, fritzingImagePath) {
    const normalizedImage = normalizedArchiveName(fritzingImagePath);
    const basename = path.posix.basename(normalizedImage).toLowerCase();
    const exact = new Map(entryNames.map(name => [normalizedArchiveName(name).toLowerCase(), name]));
    const candidates = [
        normalizedImage,
        `svg.${normalizedImage.replaceAll('/', '.')}`,
        basename,
    ];
    for (const candidate of candidates) {
        const match = exact.get(candidate.toLowerCase());
        if (match) return match;
    }
    const basenameMatches = entryNames.filter(name =>
        path.posix.basename(normalizedArchiveName(name)).toLowerCase() === basename);
    if (basenameMatches.length === 1) return basenameMatches[0];
    const breadboardMatch = entryNames.find(name => {
        const normalized = normalizedArchiveName(name).toLowerCase();
        return normalized.endsWith(basename) && (normalized.includes('breadboard') || normalized.startsWith('svg.breadboard.'));
    });
    return breadboardMatch || null;
}

function parseViewBox(svgRoot) {
    const values = String(svgRoot.getAttribute('viewBox') || '')
        .trim().split(/[\s,]+/).map(Number);
    if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
        return { x: values[0], y: values[1], width: values[2], height: values[3] };
    }
    const width = Number.parseFloat(svgRoot.getAttribute('width'));
    const height = Number.parseFloat(svgRoot.getAttribute('height'));
    if (width > 0 && height > 0) return { x: 0, y: 0, width, height };
    throw new TypeError('Breadboard SVG needs a valid viewBox or numeric width/height');
}

function parseSvgLengthMillimetres(value) {
    const absolute = parseLengthMillimetres(value);
    if (absolute) return absolute;
    const match = String(value || '').trim().match(/^([-+]?(?:\d*\.\d+|\d+\.?))\s*(px|pt|pc)?$/i);
    if (!match) return null;
    const number = Number(match[1]);
    if (!(number > 0)) return null;
    const unit = String(match[2] || 'px').toLowerCase();
    if (unit === 'pt') return number * 25.4 / 72;
    if (unit === 'pc') return number * 25.4 / 6;
    return number * 25.4 / 96;
}

function svgPhysicalSizeMillimetres(svgRoot, viewBox) {
    const width = parseSvgLengthMillimetres(svgRoot.getAttribute('width'));
    const height = parseSvgLengthMillimetres(svgRoot.getAttribute('height'));
    if (width && height) return { width: round(width), height: round(height) };
    if (width) return { width: round(width), height: round(width * viewBox.height / viewBox.width) };
    if (height) return { width: round(height * viewBox.width / viewBox.height), height: round(height) };
    // Unitless SVG dimensions are CSS pixels by specification. This fallback
    // is deterministic, but Fritzing archives should normally carry in/mm.
    return {
        width: round(viewBox.width * 25.4 / 96),
        height: round(viewBox.height * 25.4 / 96),
    };
}

const IDENTITY_MATRIX = Object.freeze([1, 0, 0, 1, 0, 0]);

function multiplyMatrices(left, right) {
    const [a, b, c, d, e, f] = left;
    const [g, h, i, j, k, l] = right;
    return [
        a * g + c * h,
        b * g + d * h,
        a * i + c * j,
        b * i + d * j,
        a * k + c * l + e,
        b * k + d * l + f,
    ];
}

function applyMatrix(matrix, point) {
    return {
        x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
        y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
    };
}

function parseTransform(value) {
    let matrix = [...IDENTITY_MATRIX];
    const pattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
    for (const match of String(value || '').matchAll(pattern)) {
        const name = match[1].toLowerCase();
        const numbers = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
        if (!numbers.every(Number.isFinite)) continue;
        let next = [...IDENTITY_MATRIX];
        if (name === 'matrix' && numbers.length >= 6) next = numbers.slice(0, 6);
        else if (name === 'translate') next = [1, 0, 0, 1, numbers[0] || 0, numbers[1] || 0];
        else if (name === 'scale') next = [numbers[0] ?? 1, 0, 0, numbers[1] ?? numbers[0] ?? 1, 0, 0];
        else if (name === 'rotate') {
            const radians = (numbers[0] || 0) * Math.PI / 180;
            const rotation = [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
            if (numbers.length >= 3) {
                const toOrigin = [1, 0, 0, 1, -numbers[1], -numbers[2]];
                const back = [1, 0, 0, 1, numbers[1], numbers[2]];
                next = multiplyMatrices(back, multiplyMatrices(rotation, toOrigin));
            } else next = rotation;
        } else if (name === 'skewx') {
            next = [1, 0, Math.tan((numbers[0] || 0) * Math.PI / 180), 1, 0, 0];
        } else if (name === 'skewy') {
            next = [1, Math.tan((numbers[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
        }
        matrix = multiplyMatrices(matrix, next);
    }
    return matrix;
}

function numericAttribute(element, name, fallback = 0) {
    const value = Number.parseFloat(element.getAttribute(name));
    return Number.isFinite(value) ? value : fallback;
}

function localShapePoints(element) {
    const tagName = String(element.tagName || '').toLowerCase().replace(/^.*:/, '');
    if (tagName === 'rect' || tagName === 'image' || tagName === 'use') {
        const x = numericAttribute(element, 'x');
        const y = numericAttribute(element, 'y');
        const width = numericAttribute(element, 'width');
        const height = numericAttribute(element, 'height');
        return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
    }
    if (tagName === 'circle' || tagName === 'ellipse') {
        const cx = numericAttribute(element, 'cx');
        const cy = numericAttribute(element, 'cy');
        const rx = tagName === 'circle' ? numericAttribute(element, 'r') : numericAttribute(element, 'rx');
        const ry = tagName === 'circle' ? rx : numericAttribute(element, 'ry');
        return [{ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy - ry },
            { x: cx + rx, y: cy + ry }, { x: cx - rx, y: cy + ry }];
    }
    if (tagName === 'line') {
        return [
            { x: numericAttribute(element, 'x1'), y: numericAttribute(element, 'y1') },
            { x: numericAttribute(element, 'x2'), y: numericAttribute(element, 'y2') },
        ];
    }
    if (tagName === 'polygon' || tagName === 'polyline') {
        const numbers = String(element.getAttribute('points') || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)?.map(Number) || [];
        const points = [];
        for (let index = 0; index + 1 < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] });
        return points;
    }
    if (tagName === 'path') {
        // Connector paths are uncommon. This fallback gives a conservative
        // coordinate envelope; complex path commands should be manually checked.
        const numbers = String(element.getAttribute('d') || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)?.map(Number) || [];
        const points = [];
        for (let index = 0; index + 1 < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] });
        return points;
    }
    return [];
}

function boundsForElement(element, parentMatrix = IDENTITY_MATRIX) {
    const matrix = multiplyMatrices(parentMatrix, parseTransform(element.getAttribute('transform')));
    const points = localShapePoints(element).map(point => applyMatrix(matrix, point));
    const childBounds = elements(element).map(item => boundsForElement(item, matrix)).filter(Boolean);
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    for (const bounds of childBounds) {
        xs.push(bounds.x, bounds.x + bounds.width);
        ys.push(bounds.y, bounds.y + bounds.height);
    }
    if (!xs.length || !ys.length) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function parentWorldMatrix(element, svgRoot) {
    const ancestors = [];
    let current = element.parentNode;
    while (current?.nodeType === 1) {
        ancestors.push(current);
        if (current === svgRoot) break;
        current = current.parentNode;
    }
    let matrix = [...IDENTITY_MATRIX];
    for (const ancestor of ancestors.reverse()) {
        matrix = multiplyMatrices(matrix, parseTransform(ancestor.getAttribute('transform')));
    }
    return matrix;
}

function findElementById(svgRoot, id) {
    if (!id) return null;
    return [svgRoot, ...descendants(svgRoot)].find(element => element.getAttribute('id') === id) || null;
}

function connectorArtworkPoint(svgRoot, connector) {
    const target = findElementById(svgRoot, connector.svgId) || findElementById(svgRoot, connector.legId);
    if (!target) throw new TypeError(`SVG element ${connector.svgId || connector.legId || '(missing ID)'} was not found for ${connector.id}`);
    const bounds = boundsForElement(target, parentWorldMatrix(target, svgRoot));
    if (!bounds) throw new TypeError(`SVG element ${target.getAttribute('id')} has no measurable geometry`);
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function safeSvgReference(value) {
    const normalized = String(value || '').trim();
    return normalized.startsWith('#') || /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(normalized);
}

function unsafeStyle(value) {
    const style = String(value || '');
    if (/javascript\s*:|expression\s*\(|@import/i.test(style)) return true;
    for (const match of style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
        if (!safeSvgReference(match[2])) return true;
    }
    return false;
}

function sanitizeSvgDocument(sourceDocument, idPrefix) {
    const serialized = new XMLSerializer().serializeToString(sourceDocument);
    const document = parseXml(serialized, 'breadboard SVG copy');
    const root = document.documentElement;
    if (String(root.tagName).toLowerCase().replace(/^.*:/, '') !== 'svg') {
        throw new TypeError('Breadboard artwork root must be an SVG element');
    }

    const sanitizeElement = element => {
        for (const item of [...elements(element)]) {
            const tagName = String(item.tagName || '').toLowerCase().replace(/^.*:/, '');
            if (UNSAFE_SVG_ELEMENTS.has(tagName)) element.removeChild(item);
            else sanitizeElement(item);
        }
        for (let index = element.attributes.length - 1; index >= 0; index--) {
            const attribute = element.attributes.item(index);
            const name = String(attribute.name || '').toLowerCase();
            const localName = name.replace(/^.*:/, '');
            const value = String(attribute.value || '').trim();
            const eventHandler = localName.startsWith('on');
            const href = localName === 'href' || localName === 'src';
            const unsafeValue = /^javascript\s*:|^data\s*:\s*text\/html/i.test(value);
            if (eventHandler || name === 'xml:base' || unsafeValue ||
                (href && !safeSvgReference(value)) || (localName === 'style' && unsafeStyle(value))) {
                element.removeAttribute(attribute.name);
            }
        }
    };
    sanitizeElement(root);

    const idMap = new Map();
    const usedIds = new Set();
    for (const element of [root, ...descendants(root)]) {
        const oldId = element.getAttribute('id');
        if (!oldId) continue;
        const baseId = `${idPrefix}-${slug(oldId)}`;
        let newId = baseId;
        let suffix = 2;
        while (usedIds.has(newId)) newId = `${baseId}-${suffix++}`;
        usedIds.add(newId);
        if (!idMap.has(oldId)) idMap.set(oldId, newId);
        element.setAttribute('id', newId);
    }
    for (const element of [root, ...descendants(root)]) {
        for (let index = 0; index < element.attributes.length; index++) {
            const attribute = element.attributes.item(index);
            let value = attribute.value;
            for (const [oldId, newId] of idMap) {
                const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                value = value.replace(new RegExp(`url\\(\\s*(['"]?)#${escaped}\\1\\s*\\)`, 'g'), `url(#${newId})`);
                if (value === `#${oldId}`) value = `#${newId}`;
            }
            if (value !== attribute.value) element.setAttribute(attribute.name, value);
        }
    }
    return new XMLSerializer().serializeToString(document);
}

function inferCategory(metadata) {
    const text = [metadata.title, metadata.taxonomy, metadata.family, ...metadata.tags].join(' ').toLowerCase();
    if (/arduino|microcontroller|development board|\bmcu\b|\besp(?:32|8266)\b|rekabit/.test(text)) return 'board';
    if (/sensor|thermistor|photoresistor|accelerometer|gyroscope/.test(text)) return 'sensor';
    // Driver modules often mention switches/inputs in their descriptions. Their
    // primary library role is still driving a load, so classify them first.
    if (/motor|servo|relay|solenoid|actuator/.test(text)) return 'actuator';
    if (/switch|button|keypad|joystick|encoder|potentiometer/.test(text)) return 'input';
    if (/\bled\b|display|lcd|oled|buzzer|speaker/.test(text)) return 'output';
    if (/resistor|capacitor|inductor|diode|crystal|fuse|transformer/.test(text)) return 'passive';
    return 'custom';
}

function genericConnectorNumber(connector) {
    if (!/^pin\s*\d+$/i.test(connector.name || '') && !/^pin\s*\d+$/i.test(connector.description || '')) return null;
    const match = String(connector.id || '').match(/connector(\d+)$/i);
    return match ? String(Number(match[1]) + 1) : null;
}

function pinBaseId(connector, index) {
    const generic = genericConnectorNumber(connector);
    if (generic) return generic;
    const source = connector.name || connector.description || connector.id || `pin-${index + 1}`;
    const upper = String(source).trim().toUpperCase();
    const aliases = new Map([
        ['GROUND', 'GND'], ['VSS', 'GND'], ['POWER', 'VCC'], ['VDD', 'VCC'],
        ['DATA OUT', 'DOUT'], ['DATA IN', 'DIN'], ['CLOCK', 'CLK'],
    ]);
    return (aliases.get(upper) || upper)
        .replace(/[^A-Z0-9.+-]+/g, '_')
        .replace(/^_+|_+$/g, '') || String(index + 1);
}

function uniquePinId(base, used) {
    if (!used.has(base)) {
        used.add(base);
        return base;
    }
    let suffix = 2;
    while (used.has(`${base}.${suffix}`)) suffix++;
    const result = `${base}.${suffix}`;
    used.add(result);
    return result;
}

function inferElectricalRole(connector, pinId) {
    const text = `${pinId} ${connector.name || ''} ${connector.description || ''}`.toUpperCase();
    if (/\b(GND|GROUND|VSS|AGND|DGND|0V)\b/.test(text)) return 'GND';
    if (/\b(VCC|VDD|VIN|POWER|PWR|3V3|3\.3V|5V|V\+)\b/.test(text)) return 'VCC';
    if (/\b(SDA|I2C[_ -]?SDA)\b/.test(text)) return 'I2C_SDA';
    if (/\b(SCL|I2C[_ -]?SCL)\b/.test(text)) return 'I2C_SCL';
    if (/\b(TRIG|TRIGGER)\b/.test(text)) return 'TRIGGER';
    if (/\bECHO\b/.test(text)) return 'ECHO';
    if (/\bPWM\b/.test(text)) return 'PWM';
    if (/\b(ANALOG|AOUT|AIN|ADC)\b/.test(text) || /^A\d+$/.test(pinId)) return 'ANALOG';
    if (/\b(DIGITAL|GPIO)\b/.test(text) || /^D\d+$/.test(pinId)) return 'DIGITAL';
    if (/\b(DATA|DAT|DIN|DOUT|SIG|SIGNAL|OUT)\b/.test(text)) return 'DATA';
    return 'SIGNAL';
}

function autoWireRequirement(role) {
    if (role === 'TRIGGER' || role === 'ECHO' || role === 'DATA') return 'DIGITAL';
    return role === 'SIGNAL' ? null : role;
}

function capabilitiesForRole(role) {
    const capability = {
        VCC: 'power', GND: 'ground', DIGITAL: 'digital', ANALOG: 'analog', PWM: 'pwm',
        I2C_SDA: 'i2c-sda', I2C_SCL: 'i2c-scl', TRIGGER: 'digital', ECHO: 'digital', DATA: 'digital',
    }[role];
    return capability ? [capability] : [];
}

function parseLengthMillimetres(value) {
    const match = String(value || '').match(/([-+]?(?:\d*\.\d+|\d+\.?))\s*(mil|mm|cm|in(?:ch(?:es)?)?|")/i);
    if (!match) return null;
    const number = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!(number > 0)) return null;
    if (unit === 'mil') return number * 0.0254;
    if (unit === 'mm') return number;
    if (unit === 'cm') return number * 10;
    return number * 25.4;
}

function parseResistanceOhms(value) {
    const normalized = String(value || '').trim().replace(/Ω|ohms?/gi, '');
    const match = normalized.match(/^([-+]?(?:\d*\.\d+|\d+\.?))\s*([kKmMgG])?/);
    if (!match) return null;
    const multiplier = { k: 1e3, m: 1e6, g: 1e9 }[String(match[2] || '').toLowerCase()] || 1;
    const result = Number(match[1]) * multiplier;
    return result > 0 && Number.isFinite(result) ? result : null;
}

function propertyDefinitions(properties, family) {
    const resistanceEntry = [...properties.entries()].find(([name]) => name.toLowerCase() === 'resistance');
    const resistance = parseResistanceOhms(resistanceEntry?.[1]);
    if (String(family || '').toLowerCase() !== 'resistor' && resistance === null) return [];
    return [{
        name: 'resistance',
        label: 'Resistance',
        type: 'number',
        control: 'number',
        defaultValue: resistance || 100,
        min: 1,
        max: 1_000_000_000,
        step: 1,
        unit: 'Ω',
        unitFamily: 'resistance',
        effect: 'electrical',
        editable: true,
    }];
}

function inferLinearPackage(componentId, pins, pinSpacingMm, viewBox, diagnostics) {
    if (!(pinSpacingMm > 0)) {
        diagnostics.push('No trustworthy pin spacing was found; imported as a free-mounted part.');
        return [];
    }
    if (pins.length !== 2) {
        diagnostics.push(`Automatic rigid-package inference currently supports two-pin parts; found ${pins.length}.`);
        return [];
    }
    const gridSteps = Math.round(pinSpacingMm / BREADBOARD_PITCH_MM);
    const snappedSpacing = gridSteps * BREADBOARD_PITCH_MM;
    if (gridSteps < 1 || Math.abs(pinSpacingMm - snappedSpacing) > 0.05) {
        diagnostics.push(`Pin spacing ${round(pinSpacingMm)} mm is not on Elera's 2.54 mm breadboard grid.`);
        return [];
    }
    const horizontal = Math.abs(pins[1].artwork.x - pins[0].artwork.x) >=
        Math.abs(pins[1].artwork.y - pins[0].artwork.y);
    const ordered = [...pins].sort((left, right) => horizontal
        ? left.artwork.x - right.artwork.x
        : left.artwork.y - right.artwork.y);
    const nativeDistance = Math.hypot(
        ordered[1].artwork.x - ordered[0].artwork.x,
        ordered[1].artwork.y - ordered[0].artwork.y,
    );
    if (!(nativeDistance > 0)) {
        diagnostics.push('The two SVG connector positions overlap; no rigid package was generated.');
        return [];
    }
    const scale = snappedSpacing / nativeDistance;
    const anchor = ordered[0];
    return [{
        id: `${componentId}-linear-${gridSteps}`,
        placementMode: 'breadboard-rigid',
        anchorPinId: anchor.id,
        validRotations: [0, 90, 180, 270],
        requiresTrench: false,
        pins: ordered.map((pin, index) => ({
            pinId: pin.id,
            x: horizontal ? round(index * snappedSpacing) : 0,
            y: horizontal ? 0 : round(index * snappedSpacing),
            mount: 'breadboard-hole',
        })),
        internalNets: [],
        routingBounds: {
            x: round(-anchor.artwork.x * scale),
            y: round(-anchor.artwork.y * scale),
            width: round(viewBox.width * scale),
            height: round(viewBox.height * scale),
        },
    }];
}

function extractFritzingMetadata(fzpDocument) {
    const module = fzpDocument.documentElement;
    if (String(module.tagName).toLowerCase() !== 'module') throw new TypeError('The .fzp root element must be <module>');
    const properties = new Map(elements(child(module, 'properties'), 'property').map(property => [
        property.getAttribute('name') || '', normalizedText(property),
    ]));
    const views = child(module, 'views');
    const breadboardLayers = child(child(views, 'breadboardView'), 'layers');
    const imagePath = breadboardLayers?.getAttribute('image');
    if (!imagePath) throw new TypeError('The .fzp file does not define a breadboard SVG view');
    const connectorsRoot = child(module, 'connectors');
    const connectors = elements(connectorsRoot, 'connector').map(connector => {
        const connectorViews = child(connector, 'views');
        const breadboardView = child(connectorViews, 'breadboardView');
        const binding = child(breadboardView, 'p');
        return {
            id: connector.getAttribute('id'),
            type: connector.getAttribute('type') || 'male',
            name: connector.getAttribute('name') || '',
            description: normalizedText(child(connector, 'description')),
            svgId: binding?.getAttribute('svgId') || null,
            legId: binding?.getAttribute('legId') || null,
        };
    });
    if (!connectors.length) throw new TypeError('The .fzp file contains no connectors');
    for (const connector of connectors) {
        if (!connector.id) throw new TypeError('Every Fritzing connector needs an id');
        if (!connector.svgId && !connector.legId) throw new TypeError(`${connector.id} has no breadboard SVG binding`);
    }
    return {
        moduleId: module.getAttribute('moduleId') || '',
        title: normalizedText(child(module, 'title')) || 'Imported Fritzing Part',
        description: cleanDescription(normalizedText(child(module, 'description'))),
        taxonomy: normalizedText(child(module, 'taxonomy')),
        family: properties.get('family') || '',
        tags: elements(child(module, 'tags'), 'tag').map(normalizedText).filter(Boolean),
        properties,
        imagePath,
        connectors,
    };
}

export function convertFritzingArchive(archiveBytes, options = {}) {
    let entries;
    try {
        entries = unzipSync(archiveBytes instanceof Uint8Array ? archiveBytes : new Uint8Array(archiveBytes));
    } catch (error) {
        throw new TypeError(`Cannot unzip Fritzing archive: ${error.message}`);
    }
    const entryNames = Object.keys(entries).filter(name => !name.endsWith('/'));
    const fzpEntries = entryNames.filter(name => /\.fzp$/i.test(name));
    if (fzpEntries.length !== 1) {
        throw new TypeError(`Expected exactly one .fzp file, found ${fzpEntries.length}`);
    }
    const sourcePart = fzpEntries[0];
    const fzpDocument = parseXml(strFromU8(entries[sourcePart]), sourcePart);
    const metadata = extractFritzingMetadata(fzpDocument);
    const svgEntry = resolveArchiveEntry(entryNames, metadata.imagePath);
    if (!svgEntry) throw new TypeError(`Cannot find breadboard SVG ${metadata.imagePath} in the archive`);
    const svgDocument = parseXml(strFromU8(entries[svgEntry]), svgEntry);
    const svgRoot = svgDocument.documentElement;
    const viewBox = parseViewBox(svgRoot);
    const physicalSizeMm = svgPhysicalSizeMillimetres(svgRoot, viewBox);
    const componentId = slug(options.id || `fritzing-${metadata.moduleId || metadata.title}`);
    const usedPinIds = new Set();
    const pins = metadata.connectors.map((connector, index) => {
        const point = connectorArtworkPoint(svgRoot, connector);
        const id = uniquePinId(pinBaseId(connector, index), usedPinIds);
        const electricalRole = inferElectricalRole(connector, id);
        const requirement = autoWireRequirement(electricalRole);
        return {
            id,
            label: connector.name || connector.description || id,
            connector: connector.type === 'female' ? 'female' : 'male',
            electricalRole,
            ...(requirement ? { autoWireRequirement: requirement } : {}),
            capabilities: capabilitiesForRole(electricalRole),
            artwork: {
                x: round(point.x - viewBox.x),
                y: round(point.y - viewBox.y),
            },
            fritzingConnectorId: connector.id,
        };
    });
    const diagnostics = [];
    const spacingProperty = [...metadata.properties.entries()]
        .find(([name]) => /pin\s*spacing/i.test(name))?.[1];
    const inferredSpacing = options.pinSpacingMm || parseLengthMillimetres(spacingProperty);
    const packages = options.noPackage
        ? []
        : inferLinearPackage(componentId, pins, inferredSpacing, viewBox, diagnostics);
    if (options.noPackage) diagnostics.push('Rigid package generation was disabled by --no-package.');
    const category = options.category || inferCategory(metadata);
    const assetBase = `/${String(options.assetBase || '/converted-parts').replace(/^\/+|\/+$/g, '')}`;
    const variant = metadata.properties.get('variant') || '';
    const technology = metadata.properties.get('package') || '';
    const record = {
        format: 'elera-fritzing-part-v1',
        id: componentId,
        name: metadata.title,
        description: metadata.description || `Imported Fritzing part: ${metadata.title}`,
        category,
        sourcePart,
        library: {
            source: 'fritzing',
            family: slug(metadata.family || metadata.title),
            ...(variant ? { variant } : {}),
            ...(technology ? { technology } : {}),
            ...(metadata.taxonomy ? { taxonomy: metadata.taxonomy } : {}),
            tags: metadata.tags,
        },
        artwork: {
            svgUrl: `${assetBase}/${componentId}/breadboard.svg`,
            sourceSize: { width: round(viewBox.width), height: round(viewBox.height) },
            physicalSizeMm,
        },
        pins,
        packages,
        propertyDefinitions: propertyDefinitions(metadata.properties, metadata.family),
        connectorType: pins.every(pin => pin.connector === 'female') ? 'female' : 'male',
        currentDraw_mA: 0,
        breadboardRequired: false,
        pinless: false,
    };
    createFritzingPartDefinition(record);
    const svg = sanitizeSvgDocument(svgDocument, `elera-${componentId}`);
    return {
        record,
        svg,
        diagnostics,
        source: { fzpEntry: sourcePart, svgEntry },
    };
}

async function pathExists(target) {
    try {
        await access(target);
        return true;
    } catch {
        return false;
    }
}

async function updatedCatalog(catalogPath, partUrl) {
    let current = { format: CONVERTED_PART_CATALOG_FORMAT, parts: [] };
    if (await pathExists(catalogPath)) {
        try {
            current = JSON.parse(await readFile(catalogPath, 'utf8'));
        } catch (error) {
            throw new TypeError(`Cannot read existing converted-part catalog: ${error.message}`);
        }
        if (current?.format !== CONVERTED_PART_CATALOG_FORMAT || !Array.isArray(current.parts)) {
            throw new TypeError(`Unsupported converted-part catalog at ${catalogPath}`);
        }
    }
    return {
        format: CONVERTED_PART_CATALOG_FORMAT,
        parts: [...new Set([...current.parts, partUrl])].sort(),
    };
}

export async function convertFritzingPartFile(inputPath, options = {}) {
    const bytes = new Uint8Array(await readFile(inputPath));
    const converted = convertFritzingArchive(bytes, options);
    const outputRoot = path.resolve(options.outputRoot || DEFAULT_OUTPUT_ROOT);
    const partDirectory = path.join(outputRoot, converted.record.id);
    const recordPath = path.join(partDirectory, 'part.json');
    const svgPath = path.join(partDirectory, 'breadboard.svg');
    const catalogPath = path.join(outputRoot, 'catalog.json');
    if (!options.force && (await pathExists(recordPath) || await pathExists(svgPath))) {
        throw new Error(`Output already exists at ${partDirectory}; pass --force to replace generated files`);
    }
    const partUrl = converted.record.artwork.svgUrl.replace(/\/breadboard\.svg$/, '/part.json');
    const catalog = await updatedCatalog(catalogPath, partUrl);
    await mkdir(partDirectory, { recursive: true });
    await Promise.all([
        writeFile(recordPath, `${JSON.stringify(converted.record, null, 2)}\n`, 'utf8'),
        writeFile(svgPath, `${converted.svg.trim()}\n`, 'utf8'),
        writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8'),
    ]);
    return { ...converted, output: { partDirectory, recordPath, svgPath, catalogPath } };
}

async function main() {
    let options;
    try {
        options = parseArguments(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        console.error(usage());
        process.exitCode = 1;
        return;
    }
    if (options.help) {
        console.log(usage());
        return;
    }
    if (!options.inputPath) {
        console.error('A .fzpz input file is required.');
        console.error(usage());
        process.exitCode = 1;
        return;
    }
    try {
        const result = await convertFritzingPartFile(options.inputPath, options);
        console.log(`Converted ${result.record.name} (${result.record.id})`);
        console.log(`  definition: ${result.output.recordPath}`);
        console.log(`  artwork:    ${result.output.svgPath}`);
        console.log(`  catalog:    ${result.output.catalogPath}`);
        console.log(`  pins:       ${result.record.pins.length}`);
        console.log(`  packages:   ${result.record.packages.length}`);
        for (const diagnostic of result.diagnostics) console.warn(`  warning:    ${diagnostic}`);
    } catch (error) {
        console.error(`Conversion failed: ${error.message}`);
        process.exitCode = 1;
    }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) await main();
