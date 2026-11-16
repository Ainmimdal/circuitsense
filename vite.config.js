import { defineConfig } from 'vite';

// The big libraries get their own files, so a change to Elera's own code does
// not make returning students download them again.
const VENDOR_CHUNKS = { konva: 'konva', '@wokwi/elements': 'wokwi-elements', avr8js: 'avr8js', '@supabase': 'supabase' };

export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    const normalized = id.split('\\').join('/');
                    for (const [name, chunk] of Object.entries(VENDOR_CHUNKS)) {
                        if (normalized.includes(`/node_modules/${name}`)) return chunk;
                    }
                },
            },
        },
    },
});
