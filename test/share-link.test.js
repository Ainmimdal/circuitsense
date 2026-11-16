import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeShareHash, encodeShareHash, MAX_SHARE_LINK_LENGTH } from '../src/persistence/share-link.js';
import { listLessons, getLesson } from '../src/lessons/catalog.js';

test('share links round-trip every lesson circuit and stay short enough to paste', async () => {
    for (const { id } of listLessons()) {
        const json = JSON.stringify(getLesson(id).build(), null, 2);
        const hash = await encodeShareHash(json);
        assert.match(hash, /^#p=[\w-]+$/);
        assert.ok(hash.length < MAX_SHARE_LINK_LENGTH / 2, `${id}: ${hash.length}`);
        assert.deepEqual(JSON.parse(await decodeShareHash(hash)), JSON.parse(json));
    }
});

test('other hashes are ignored and damaged links are rejected', async () => {
    assert.equal(await decodeShareHash(''), null);
    assert.equal(await decodeShareHash('#section'), null);
    await assert.rejects(decodeShareHash('#p=AAAA'));
});
