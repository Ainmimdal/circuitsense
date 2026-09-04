import { registerFritzingPart } from './fritzing-part-contract.js';

export const CONVERTED_PART_CATALOG_FORMAT = 'elera-converted-part-catalog-v1';
export const DEFAULT_CONVERTED_PART_CATALOG_URL = '/converted-parts/catalog.json';

/** Load converter output from Elera's served public-part catalog. */
export async function loadConvertedPartCatalog({
    catalogUrl = DEFAULT_CONVERTED_PART_CATALOG_URL,
    fetchImpl = globalThis.fetch,
} = {}) {
    if (typeof fetchImpl !== 'function') return { registered: [], errors: [] };
    const response = await fetchImpl(catalogUrl);
    if (response.status === 404) return { registered: [], errors: [] };
    if (!response.ok) throw new Error(`Converted-part catalog request failed (${response.status})`);
    const catalog = await response.json();
    if (catalog?.format !== CONVERTED_PART_CATALOG_FORMAT || !Array.isArray(catalog.parts)) {
        throw new TypeError('Converted-part catalog has an unsupported format');
    }

    const records = await Promise.all(catalog.parts.map(async partUrl => {
        try {
            const partResponse = await fetchImpl(partUrl);
            if (!partResponse.ok) throw new Error(`request failed (${partResponse.status})`);
            return { partUrl, record: await partResponse.json() };
        } catch (error) {
            return { partUrl, error };
        }
    }));
    const registered = [];
    const errors = [];
    for (const item of records) {
        try {
            if (item.error) throw item.error;
            registered.push(registerFritzingPart(item.record));
        } catch (error) {
            errors.push({ partUrl: item.partUrl, message: error.message });
        }
    }
    return { registered, errors };
}
