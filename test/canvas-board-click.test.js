import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const canvasPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/components/circuit-canvas.js');

// shortcut: the canvas needs a DOM and Konva, so this guards the handler's source; replace with a browser test once the repo has one.
test('clicking a breadboard hole lets the stage start a wire instead of selecting the board', () => {
    const source = readFileSync(canvasPath, 'utf8');
    const handler = source.match(/group\.on\('click tap', event => \{([\s\S]*?)this\._selectedSurfaceId = surface\.id;/);
    assert.ok(handler, 'breadboard click handler should exist');
    const [guard] = handler[1].split('event.cancelBubble = true;');
    assert.match(guard, /this\._hoveredHole\) return;/, 'a hovered hole must return before the click is swallowed');
    assert.match(source, /_onStageClick\(event\) \{[\s\S]*?if \(this\._hoveredHole\) \{\s*this\._activateTerminal\(surfaceHoleRef/);
});
