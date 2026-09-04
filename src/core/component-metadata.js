import { WOKWI_ELEMENT_BY_TAG } from '../generated/wokwi-elements-manifest.js';
import { LED_COLOR_PROFILES } from './led-resistor.js';

export const PROPERTY_EFFECTS = Object.freeze([
    'visual',
    'electrical',
    'pin-topology',
    'physical-package',
    'simulation',
]);

// Elera owns meaning and editability. Generated Wokwi metadata only describes
// the installed renderer API and is never allowed to define electrical roles.
const AUTHORED_PROPERTY_OVERRIDES = Object.freeze({
    'wokwi-led': {
        color: {
            label: 'LED color', control: 'select', defaultValue: 'red',
            options: Object.keys(LED_COLOR_PROFILES), editable: true, effect: 'electrical',
        },
        brightness: { label: 'Brightness', control: 'number', min: 0, max: 1, step: 0.05, editable: false, effect: 'simulation' },
        flip: {
            label: 'Flip leads', control: 'checkbox', editable: false, effect: 'physical-package',
            description: 'Requires an explicit package variant so artwork and physical pin identities stay aligned.',
        },
        label: { label: 'Label', control: 'text', editable: false, effect: 'visual' },
    },
    'wokwi-resistor': {
        value: {
            label: 'Resistance', type: 'number', control: 'number', unit: 'Ω',
            unitFamily: 'resistance',
            min: 1, max: 1_000_000_000, step: 1, editable: true, effect: 'electrical',
        },
    },
    'wokwi-7segment': {
        color: { label: 'Color', control: 'color', editable: true, effect: 'visual' },
        digits: { label: 'Digits', control: 'number', editable: false, effect: 'pin-topology' },
        pins: { label: 'Pin layout', control: 'select', editable: false, effect: 'pin-topology' },
    },
    'wokwi-lcd1602': {
        pins: { label: 'Interface', control: 'select', editable: false, effect: 'pin-topology' },
    },
    'wokwi-lcd2004': {
        pins: { label: 'Interface', control: 'select', editable: false, effect: 'pin-topology' },
    },
    'wokwi-neopixel-matrix': {
        rows: { label: 'Rows', control: 'number', editable: false, effect: 'pin-topology' },
        cols: { label: 'Columns', control: 'number', editable: false, effect: 'pin-topology' },
    },
});

function inferredControl(type) {
    if (type === 'boolean') return 'checkbox';
    if (type === 'number') return 'number';
    return 'text';
}

function coerceDefault(value, type) {
    if (value === undefined) return undefined;
    if (type === 'boolean') return value === true || value === 'true' || value === '';
    if (type === 'number') {
        const number = Number(value);
        return Number.isFinite(number) ? number : value;
    }
    return value == null ? value : String(value);
}

function authoredDescriptors(component) {
    const definitions = component.propertyDefinitions || component.propertiesSchema || [];
    return Array.isArray(definitions) ? definitions : Object.entries(definitions).map(([name, value]) => ({ name, ...value }));
}

export function getComponentPropertyDefinitions(component) {
    if (!component) return [];
    const vendor = WOKWI_ELEMENT_BY_TAG[component.tag];
    const overrides = AUTHORED_PROPERTY_OVERRIDES[component.tag] || {};
    const authored = new Map(authoredDescriptors(component).map(item => [item.name, item]));
    const names = new Set([
        ...(vendor?.properties || []).map(property => property.name),
        ...Object.keys(overrides),
        ...authored.keys(),
    ]);

    return [...names].sort().map(name => {
        const generated = vendor?.properties.find(property => property.name === name) || {};
        const override = { ...(overrides[name] || {}), ...(authored.get(name) || {}) };
        const type = override.type || generated.type || 'unknown';
        const attrDefault = component.attrs?.[name];
        const defaultValue = override.defaultValue !== undefined
            ? override.defaultValue
            : coerceDefault(attrDefault !== undefined ? attrDefault : generated.default, type);
        return Object.freeze({
            name,
            label: override.label || name,
            type,
            control: override.control || inferredControl(type),
            effect: PROPERTY_EFFECTS.includes(override.effect) ? override.effect : 'visual',
            editable: override.editable === true,
            source: authored.has(name) ? 'component' : overrides[name] ? 'elera-override' : 'wokwi-generated',
            ...(defaultValue !== undefined ? { defaultValue } : {}),
            ...(override.options ? { options: [...override.options] } : {}),
            ...(['min', 'max', 'step', 'unit', 'unitFamily', 'description'].reduce((result, key) => {
                if (override[key] !== undefined) result[key] = override[key];
                return result;
            }, {})),
        });
    });
}

export function visualPropertyValues(component, instanceProperties = {}) {
    const values = {};
    for (const descriptor of getComponentPropertyDefinitions(component)) {
        const value = Object.prototype.hasOwnProperty.call(instanceProperties, descriptor.name)
            ? instanceProperties[descriptor.name]
            : descriptor.defaultValue;
        if (value !== undefined) values[descriptor.name] = value;
    }
    return values;
}

export function validateComponentPropertyValue(descriptor, value) {
    if (!descriptor) return false;
    if (descriptor.type === 'boolean' && typeof value !== 'boolean') return false;
    if (descriptor.type === 'number' && (!Number.isFinite(value) ||
        (descriptor.min !== undefined && value < descriptor.min) ||
        (descriptor.max !== undefined && value > descriptor.max))) return false;
    if (descriptor.type === 'string' && typeof value !== 'string') return false;
    if (descriptor.options && !descriptor.options.includes(value)) return false;
    return true;
}
