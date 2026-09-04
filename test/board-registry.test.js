import test from 'node:test';
import assert from 'node:assert/strict';
import { BREADBOARD_PITCH, boardRegistry } from '../src/core/board-registry.js';

test('board registry models half and full breadboard capacity and connectivity', () => {
    const half = boardRegistry['breadboard-half-400'];
    const full = boardRegistry['breadboard-full-830'];
    assert.equal(half.holes.length, 400);
    assert.equal(full.holes.length, 830);
    assert.equal(half.getHole('A1').groupId, half.getHole('E1').groupId);
    assert.notEqual(half.getHole('E1').groupId, half.getHole('F1').groupId);
    assert.equal(half.getHole('TP1').groupId, half.getHole('TP25').groupId);
    assert.notEqual(full.getHole('TP1').groupId, full.getHole('TP50').groupId);
    assert.ok(half.physicalWidthMm >= 82 && half.physicalWidthMm <= 85);
    assert.ok(full.physicalWidthMm >= 160 && full.physicalWidthMm <= 170);
});

test('power rail rows use the same 2.54 mm pitch as terminal holes', () => {
    for (const board of Object.values(boardRegistry)) {
        assert.equal(board.getHole('TP1').y - board.getHole('TN1').y, board.pitch, board.id);
        assert.equal(board.getHole('BN1').y - board.getHole('BP1').y, board.pitch, board.id);
    }
});

test('legacy board projection preserves the canonical 7.62 mm DIP trench', () => {
    const board = boardRegistry['breadboard-half-400'];
    assert.ok(Math.abs(board.getHole('F1').y - board.getHole('E1').y - 3 * BREADBOARD_PITCH) < 1e-9);
    assert.equal(board.physicalHeightMm, 56.896);
});
