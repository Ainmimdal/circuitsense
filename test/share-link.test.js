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

test('a short link to a published circuit gives its id, and nothing else does', async () => {
    const { publishedProjectId } = await import('../src/persistence/share-link.js');
    assert.equal(publishedProjectId('#s=0123456789abcdef'), '0123456789abcdef');
    assert.equal(publishedProjectId('#s=../../etc'), null);
    assert.equal(publishedProjectId('#p=abc'), null);
});

test('publishing stores a copy under a new id and opening reads it back by that id', async () => {
    const { createSharedProjects } = await import('../src/persistence/cloud.js');
    const rows = new Map();
    const client = {
        from: table => ({ insert: async row => { assert.equal(table, 'shared_projects'); rows.set(row.id, row); return { error: null }; } }),
        rpc: async (name, { project_id }) => ({ data: rows.has(project_id) ? [rows.get(project_id)] : [], error: null }),
    };
    const shared = createSharedProjects(client);
    const id = await shared.publish('', { components: [1] });
    assert.match(id, /^[a-z0-9]{16}$/);
    assert.deepEqual((await shared.open(id)).data, { components: [1] });
    assert.equal((await shared.open(id)).name, 'Untitled circuit');
    assert.equal(await shared.open('missing0000'), null);
});
