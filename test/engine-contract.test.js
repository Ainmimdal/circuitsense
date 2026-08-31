import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = resolve(root, 'docs/ENGINE_CONTRACT.md');
const contract = readFileSync(contractPath, 'utf8');
const flowPath = resolve(root, 'docs/SELF_HEALING_ENGINE.md');
const flow = readFileSync(flowPath, 'utf8');

function registryRows() {
    const block = contract.match(/<!-- engine-contract:start -->([\s\S]*?)<!-- engine-contract:end -->/);
    assert.ok(block, 'engine contract registry markers must remain intact');
    return block[1].split(/\r?\n/)
        .filter(line => /^\|\s*`[A-Z]+-\d+`\s*\|/.test(line))
        .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
}

test('engine contract keeps unique rule IDs and live implementation/test references', () => {
    const rows = registryRows();
    assert.ok(rows.length >= 20, 'registry must retain meaningful cross-engine coverage');

    const ids = rows.map(cells => cells[0].replaceAll('`', ''));
    assert.equal(new Set(ids).size, ids.length, 'registry rule IDs must be unique');

    const prefixes = new Set(ids.map(id => id.split('-')[0]));
    for (const required of ['CORE', 'AW', 'AL', 'BB', 'CAP', 'CL', 'VAL', 'INT']) {
        assert.equal(prefixes.has(required), true, `registry must cover ${required} rules`);
    }

    for (const [ruleCell, , implementationCell, evidenceCell] of rows) {
        const id = ruleCell.replaceAll('`', '');
        assert.match(contract, new RegExp(`\\*\\*${id}\\s+—`), `${id} must have a normative definition`);

        const implementationPaths = [...implementationCell.matchAll(/`(src\/[^`]+\.js)`/g)].map(match => match[1]);
        const testPaths = [...evidenceCell.matchAll(/`(test\/[^`]+\.test\.js)`/g)].map(match => match[1]);
        assert.ok(implementationPaths.length > 0, `${id} must reference its implementation`);
        assert.ok(testPaths.length > 0, `${id} must reference regression evidence`);
        for (const relativePath of [...implementationPaths, ...testPaths]) {
            assert.equal(existsSync(resolve(root, relativePath)), true, `${id} references missing ${relativePath}`);
        }
    }
});

test('engine contract keeps stable ordered drift IDs and stays synchronized with project status', () => {
    const gaps = [...contract.matchAll(/\|\s*`GAP-(\d+)`\s*\|/g)].map(match => Number(match[1]));
    assert.ok(gaps.length > 0, 'known drift must stay explicit until all gaps are closed');
    assert.deepEqual(gaps, [...new Set(gaps)].sort((a, b) => a - b), 'closed gap IDs must not be reused or renumbered');

    const status = readFileSync(resolve(root, 'docs/PROJECT_STATUS.md'), 'utf8');
    assert.match(status, /^Snapshot date:\s*\d{4}-\d{2}-\d{2}/m);
    assert.match(status, /^## Handoff\s*$/m);
    for (const gap of gaps) {
        assert.match(status, new RegExp(`GAP-0?${gap}\\b`), `project status must account for GAP-${String(gap).padStart(2, '0')}`);
    }

    const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/ENGINE_CONTRACT\.md/);
    assert.match(readme, /docs\/PROJECT_STATUS\.md/);
    assert.match(readme, /docs\/SELF_HEALING_ENGINE\.md/);
});

test('self-healing flow is synchronized from the engine contract', () => {
    for (const heading of ['Auto Wire', 'Auto Layout', 'Breadboard physical realization', 'Clean', 'Validation']) {
        assert.match(flow, new RegExp(`^### ${heading}$`, 'm'), `flow must document ${heading}`);
    }
    assert.match(flow, /Unsplit half board and one rail has capacity/);
    assert.match(flow, /no top-to-bottom `rail-link`/);

    const block = flow.match(/<!-- engine-doc-sync:start -->([\s\S]*?)<!-- engine-doc-sync:end -->/);
    assert.ok(block, 'self-healing synchronization markers must remain intact');
    const fingerprint = createHash('sha256').update(contract).digest('hex').slice(0, 12);
    assert.ok(block[1].includes(`Contract fingerprint: \`${fingerprint}\``));

    const ruleLines = contract.split(/\r?\n/).filter(line => /^- \*\*[A-Z]+-\d+\b/.test(line));
    assert.ok(ruleLines.length >= 40, 'generated catalog must retain the complete contract rule set');
    for (const rule of ruleLines) assert.ok(block[1].includes(rule), `generated flow is missing ${rule.slice(0, 15)}`);
    for (const row of registryRows().map(cells => `| ${cells.join(' | ')} |`)) {
        assert.ok(block[1].includes(row), `generated flow is missing registry row ${row.slice(0, 20)}`);
    }
});
