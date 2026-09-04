import { visualPropertyValues } from './component-metadata.js';

export const VISUAL_PROVIDERS = Object.freeze(['wokwi', 'native', 'image', 'fritzing-svg']);

export function resolveVisualAdapter(component, { sourceSize, nativePins } = {}) {
    if (!component) return null;
    const explicit = component.visualAdapter || {};
    const provider = explicit.provider || (component.type === 'custom'
        ? 'image'
        : component.tag?.startsWith('wokwi-') ? 'wokwi' : 'native');
    if (!VISUAL_PROVIDERS.includes(provider)) {
        throw new TypeError(`Unsupported visual provider: ${provider}`);
    }
    return Object.freeze({
        provider,
        tag: explicit.tag || component.tag || null,
        assetUrl: explicit.assetUrl || component.imageUrl || null,
        attrs: Object.freeze({ ...(component.attrs || {}), ...(explicit.attrs || {}) }),
        sourceSize: Object.freeze({ ...(sourceSize || explicit.sourceSize || component.size || {}) }),
        nativePins: Object.freeze({ ...(nativePins || explicit.nativePins || {}) }),
    });
}

export function applyVisualProperties(element, component, instanceProperties = {}) {
    if (!element || !component) return element;
    for (const [name, value] of Object.entries(visualPropertyValues(component, instanceProperties))) {
        try {
            element[name] = value;
        } catch {
            if (value !== false && value != null) element.setAttribute(name, String(value));
        }
    }
    return element;
}

export function createPartVisualElement(component, { instanceProperties = {}, sourceSize, nativePins } = {}) {
    if (!component || typeof document === 'undefined') return null;
    const adapter = resolveVisualAdapter(component, { sourceSize, nativePins });
    let element;
    if (adapter.provider === 'image' || adapter.provider === 'fritzing-svg') {
        element = document.createElement('img');
        element.src = adapter.assetUrl || '';
        element.alt = component.name || component.id || '';
        element.draggable = false;
    } else if (!adapter.tag || adapter.tag === 'div') {
        element = document.createElement('div');
        element.classList.add('dom-dip');
        element.textContent = component.name || component.id || '';
    } else {
        element = document.createElement(adapter.tag);
    }
    for (const [name, value] of Object.entries(adapter.attrs)) {
        if (value !== false && value != null) element.setAttribute(name, String(value));
    }
    applyVisualProperties(element, component, instanceProperties);
    return element;
}
