// Compiles every lesson's starter sketch and stores the result in
// src/simulation/prebuilt-sketches.json, so starter code runs instantly and
// without the compile server. Run after editing a lesson's code:
//
//   node scripts/compile-lesson-sketches.mjs http://localhost:8787
//
// The argument is a running compile server (see docs/COMPILE_SERVER.md).

import { writeFileSync } from 'node:fs';
import { listLessons } from '../src/lessons/catalog.js';
import { DEFAULT_SKETCH } from '../src/simulation/compile.js';

const server = (process.argv[2] || process.env.VITE_COMPILE_URL || '').replace(/\/$/, '');
if (!server) {
    console.error('Usage: node scripts/compile-lesson-sketches.mjs <compile server URL>');
    process.exit(1);
}

const prebuilt = [];
for (const code of [DEFAULT_SKETCH, ...listLessons().map(lesson => lesson.code)]) {
    const response = await fetch(`${server}/compile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sketch: code }),
    });
    const result = await response.json();
    if (!result.hex) {
        console.error(`Could not compile:\n${code}\n\n${result.errors || result.error}`);
        process.exit(1);
    }
    prebuilt.push({ code, hex: result.hex.replace(/\r\n/g, '\n') });
}
writeFileSync(new URL('../src/simulation/prebuilt-sketches.json', import.meta.url), `${JSON.stringify(prebuilt, null, 1)}\n`);
console.log(`Wrote ${prebuilt.length} prebuilt sketches.`);
