const SOURCE_RANK = Object.freeze({ elera: 0, wokwi: 0, fritzing: 1, custom: 2 });

export const PART_LIBRARY_FILTERS = Object.freeze([
    { id: 'all', label: 'All' },
    { id: 'breadboard', label: 'Breadboard' },
    { id: 'imported', label: 'Imported' },
    { id: 'custom', label: 'My parts' },
]);

function cleanValues(values) {
    return [...new Set(values.filter(value => value !== undefined && value !== null && value !== '')
        .map(value => String(value).trim()).filter(Boolean))];
}

export function humanizePartLabel(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, character => character.toUpperCase());
}

export function componentLibrarySource(component) {
    const authored = String(component?.library?.source || component?.source?.provider || '').toLowerCase();
    if (authored === 'fritzing') return 'fritzing';
    if (component?.type === 'custom' || authored === 'custom') return 'custom';
    if (authored === 'wokwi' || component?.tag?.startsWith('wokwi-')) return 'wokwi';
    return 'elera';
}

export function componentLibraryMetadata(component) {
    const library = component?.library || {};
    const source = componentLibrarySource(component);
    const family = String(library.family || component?.id || 'part').toLowerCase();
    const tags = cleanValues([
        ...(library.tags || []),
        ...(component?.keywords || []),
    ]);
    return Object.freeze({
        source,
        family,
        familyLabel: library.familyLabel || humanizePartLabel(family),
        variant: library.variant ? humanizePartLabel(library.variant) : '',
        technology: library.technology ? String(library.technology) : '',
        taxonomy: library.taxonomy ? String(library.taxonomy) : '',
        tags,
        mounting: component?.isBreadboard
            ? 'surface'
            : component?.breadboard?.mountable === true ? 'breadboard' : 'external',
    });
}

export function componentMatchesLibraryFilter(component, filterId = 'all') {
    const metadata = componentLibraryMetadata(component);
    if (filterId === 'breadboard') return metadata.mounting === 'breadboard' || metadata.mounting === 'surface';
    if (filterId === 'imported') return metadata.source === 'fritzing';
    if (filterId === 'custom') return metadata.source === 'custom';
    return true;
}

export function componentMatchesLibrarySearch(component, query, category = null) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    if (!normalizedQuery) return true;
    const metadata = componentLibraryMetadata(component);
    return cleanValues([
        component?.id,
        component?.name,
        component?.description,
        component?.category,
        category?.label,
        category?.descriptor,
        metadata.source,
        metadata.family,
        metadata.familyLabel,
        metadata.variant,
        metadata.technology,
        metadata.taxonomy,
        ...metadata.tags,
    ]).some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

export function compareLibraryComponents(left, right) {
    const leftMetadata = componentLibraryMetadata(left);
    const rightMetadata = componentLibraryMetadata(right);
    const sourceDifference = (SOURCE_RANK[leftMetadata.source] ?? 3) - (SOURCE_RANK[rightMetadata.source] ?? 3);
    if (sourceDifference) return sourceDifference;
    return String(left?.name || left?.id || '').localeCompare(String(right?.name || right?.id || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}

/**
 * Repeated families receive a visible variant group. Singletons stay together
 * in one unlabeled grid so sparse categories do not become visually noisy.
 */
export function groupLibraryComponentFamilies(components) {
    const families = new Map();
    for (const component of [...components].sort(compareLibraryComponents)) {
        const metadata = componentLibraryMetadata(component);
        if (!families.has(metadata.family)) {
            families.set(metadata.family, {
                id: metadata.family,
                label: metadata.familyLabel,
                components: [],
            });
        }
        families.get(metadata.family).components.push(component);
    }
    const repeated = [...families.values()]
        .filter(group => group.components.length > 1)
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
    const singletons = [...families.values()]
        .filter(group => group.components.length === 1)
        .flatMap(group => group.components)
        .sort(compareLibraryComponents);
    if (singletons.length) repeated.push({ id: 'other', label: '', components: singletons });
    return repeated;
}
