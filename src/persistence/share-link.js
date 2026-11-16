// Share links carry the whole circuit in the address (after #p=), compressed.
// The site is static, so there is nothing to upload and nothing to host; the
// person who opens the link gets their own copy.
// shortcut: no live or read-only shared projects, needs a backend table when that is wanted.

const PREFIX = '#p=';
// Browsers and chat apps start cutting links somewhere above this.
export const MAX_SHARE_LINK_LENGTH = 16000;

async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Project JSON text to the part of the address after the page URL. */
export async function encodeShareHash(projectJson) {
    const compact = JSON.stringify(JSON.parse(projectJson));
    const packed = await pipe(new TextEncoder().encode(compact), new CompressionStream('deflate-raw'));
    let binary = '';
    for (const byte of packed) binary += String.fromCharCode(byte);
    return PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The reverse; resolves to project JSON text, or null when the hash is not a share link. Rejects on a damaged link. */
export async function decodeShareHash(hash) {
    if (!String(hash || '').startsWith(PREFIX)) return null;
    const binary = atob(hash.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/'));
    const packed = Uint8Array.from(binary, char => char.charCodeAt(0));
    const text = new TextDecoder().decode(await pipe(packed, new DecompressionStream('deflate-raw')));
    JSON.parse(text);
    return text;
}
