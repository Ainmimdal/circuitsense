// Elera compile server: turns an Arduino sketch into a .hex file for the
// in-browser simulator. One file, no dependencies; it shells out to arduino-cli.
// See docs/COMPILE_SERVER.md for hosting.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const ARDUINO_CLI = process.env.ARDUINO_CLI || 'arduino-cli';
const FQBN = 'arduino:avr:uno';
// Comma-separated list of sites allowed to call this server, or * for any.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(item => item.trim()).filter(Boolean);
const MAX_SKETCH_BYTES = 64 * 1024;
const COMPILE_TIMEOUT_MS = 60_000;
const MAX_QUEUE = 20;
const CACHE_SIZE = 200;
const REQUESTS_PER_MINUTE = 20;

const cache = new Map();
const recentByAddress = new Map();
let queue = Promise.resolve();
let waiting = 0;

function run(command, args) {
    return new Promise(resolve => {
        execFile(command, args, { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
            resolve({ ok: !error, stdout, stderr, timedOut: Boolean(error?.killed) });
        });
    });
}

async function compile(sketch) {
    const directory = await mkdtemp(join(tmpdir(), 'elera-'));
    try {
        const sketchDirectory = join(directory, 'sketch');
        await mkdir(sketchDirectory);
        await writeFile(join(sketchDirectory, 'sketch.ino'), sketch);
        const result = await run(ARDUINO_CLI, ['compile', '--fqbn', FQBN, '--output-dir', join(directory, 'out'), sketchDirectory]);
        if (result.timedOut) return { status: 504, body: { error: 'The compiler took too long. Try again.' } };
        if (!result.ok) {
            // Students should see "sketch.ino:5:3", not the server's temporary folder.
            const errors = result.stderr.split(sketchDirectory).join('').replace(/[\\/]sketch\.ino/g, 'sketch.ino');
            return { status: 200, body: { errors } };
        }
        return { status: 200, body: { hex: await readFile(join(directory, 'out', 'sketch.ino.hex'), 'utf8') } };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

// One compile at a time: the free hosting tier has a fraction of a CPU.
function enqueue(sketch) {
    if (waiting >= MAX_QUEUE) return Promise.resolve({ status: 503, body: { error: 'The compile server is busy. Try again in a moment.' } });
    waiting++;
    const job = queue.then(() => compile(sketch)).finally(() => { waiting--; });
    queue = job.catch(() => {});
    return job;
}

function rateLimited(address) {
    const now = Date.now();
    const recent = (recentByAddress.get(address) || []).filter(time => now - time < 60_000);
    recent.push(now);
    recentByAddress.set(address, recent);
    if (recentByAddress.size > 5000) recentByAddress.clear();
    return recent.length > REQUESTS_PER_MINUTE;
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_SKETCH_BYTES * 2) {
                reject(new Error('too large'));
                request.destroy();
            } else chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        request.on('error', reject);
    });
}

const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    const allowed = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS.includes(origin) ? origin : null;
    const send = (status, body) => {
        response.writeHead(status, {
            'Content-Type': 'application/json',
            ...(allowed ? { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {}),
        });
        response.end(JSON.stringify(body));
    };
    try {
        if (request.method === 'OPTIONS') return send(204, {});
        if (request.method === 'GET' && request.url === '/health') return send(200, { ok: true });
        if (request.method !== 'POST' || request.url !== '/compile') return send(404, { error: 'Not found.' });
        if (origin && !allowed) return send(403, { error: 'This site is not allowed to use the compile server.' });
        const address = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress).split(',')[0].trim();
        if (rateLimited(address)) return send(429, { error: 'Too many compiles in a minute. Wait a little and try again.' });

        let sketch;
        try {
            sketch = JSON.parse(await readBody(request)).sketch;
        } catch {
            return send(400, { error: 'Send JSON like {"sketch": "..."} up to 64 KB.' });
        }
        if (typeof sketch !== 'string' || !sketch.trim() || Buffer.byteLength(sketch) > MAX_SKETCH_BYTES) {
            return send(400, { error: 'Send JSON like {"sketch": "..."} up to 64 KB.' });
        }

        const key = createHash('sha256').update(sketch).digest('hex');
        let result = cache.get(key);
        if (!result) {
            result = await enqueue(sketch);
            if (result.status === 200) {
                cache.set(key, result);
                if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
            }
        }
        send(result.status, result.body);
    } catch (error) {
        console.error(error);
        send(500, { error: 'The compile server hit a problem. Try again.' });
    }
});

server.listen(PORT, () => console.log(`Elera compile server listening on ${PORT}`));
