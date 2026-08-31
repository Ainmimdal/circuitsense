import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = resolve(root, 'docs/ENGINE_CONTRACT.md');
const flowPath = resolve(root, 'docs/SELF_HEALING_ENGINE.md');
const start = '<!-- engine-doc-sync:start -->';
const end = '<!-- engine-doc-sync:end -->';

const labels = {
    CORE: 'Core invariants',
    AW: 'Auto Wire',
    AL: 'Auto Layout',
    BB: 'Breadboard',
    CAP: 'Capacity',
    CL: 'Clean',
    VAL: 'Validation',
    INT: 'Interaction recovery',
};

function requiredMatch(text, pattern, name) {
    const match = text.match(pattern);
    if (!match) throw new Error(`ENGINE_CONTRACT.md is missing ${name}`);
    return match[1].trim();
}

function generatedSection(contract) {
    const pipelineSection = requiredMatch(
        contract,
        /^## Guarded command pipeline\s*$([\s\S]*?)(?=^## )/m,
        'the guarded command pipeline',
    );
    const pipeline = requiredMatch(pipelineSection, /(```mermaid[\s\S]*?```)/, 'the pipeline Mermaid diagram');
    const registry = requiredMatch(
        contract,
        /<!-- engine-contract:start -->([\s\S]*?)<!-- engine-contract:end -->/,
        'the traceability registry',
    );
    const rules = contract.split(/\r?\n/).filter(line => /^- \*\*[A-Z]+-\d+\b/.test(line));
    if (!rules.length) throw new Error('ENGINE_CONTRACT.md has no engine rules');

    const groups = new Map();
    for (const rule of rules) {
        const id = rule.match(/^- \*\*([A-Z]+-\d+)\b/)[1];
        const prefix = id.split('-')[0];
        if (!groups.has(prefix)) groups.set(prefix, []);
        groups.get(prefix).push({ id, rule });
    }

    const knownOrder = Object.keys(labels);
    const prefixes = [...groups.keys()].sort((a, b) => {
        const ai = knownOrder.indexOf(a);
        const bi = knownOrder.indexOf(b);
        return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.localeCompare(b);
    });
    const nodes = prefixes.map(prefix => {
        const ids = groups.get(prefix).map(rule => rule.id).join('<br/>');
        return `    ${prefix}["${labels[prefix] || `${prefix} rules`}<br/>${ids}"]`;
    });
    const desiredEdges = [
        ['CORE', 'AW'], ['CORE', 'AL'], ['CORE', 'VAL'], ['CORE', 'INT'],
        ['AW', 'BB'], ['AL', 'BB'], ['BB', 'CAP'], ['BB', 'CL'],
    ];
    const edges = desiredEdges
        .filter(([from, to]) => groups.has(from) && groups.has(to))
        .map(([from, to]) => `    ${from} --> ${to}`);
    for (const prefix of prefixes.filter(prefix => !knownOrder.includes(prefix))) {
        if (groups.has('CORE')) edges.push(`    CORE --> ${prefix}`);
    }

    const catalog = prefixes.flatMap(prefix => [
        `### ${labels[prefix] || `${prefix} rules`}`,
        '',
        ...groups.get(prefix).map(rule => rule.rule),
        '',
    ]).join('\n').trimEnd();
    const fingerprint = createHash('sha256').update(contract).digest('hex').slice(0, 12);

    return [
        start,
        '> Generated from `ENGINE_CONTRACT.md` by `npm run docs:sync`. Do not edit this block.',
        `> Contract fingerprint: \`${fingerprint}\``,
        '',
        '## Contract-synchronized command pipeline',
        '',
        pipeline,
        '',
        '## Contract-synchronized rule ownership',
        '',
        '```mermaid',
        'flowchart LR',
        ...nodes,
        ...edges,
        '```',
        '',
        '## Contract-synchronized rule catalog',
        '',
        catalog,
        '',
        '## Contract-synchronized traceability registry',
        '',
        registry,
        end,
    ].join('\n');
}

const contract = readFileSync(contractPath, 'utf8');
const flow = readFileSync(flowPath, 'utf8');
const markerPattern = new RegExp(`${start}[\\s\\S]*?${end}`);
if (!markerPattern.test(flow)) throw new Error('SELF_HEALING_ENGINE.md is missing sync markers');
const updated = flow.replace(markerPattern, generatedSection(contract));
if (updated !== flow) {
    writeFileSync(flowPath, updated, 'utf8');
    process.stdout.write('Updated docs/SELF_HEALING_ENGINE.md from ENGINE_CONTRACT.md\n');
} else {
    process.stdout.write('Engine flow documentation is already synchronized\n');
}
