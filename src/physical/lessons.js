import { ConnectivityResolver } from './connectivity.js';
import { componentPinRef, surfaceHoleRef } from './model.js';
import { getSurfaceDefinition } from './breadboard.js';
import { getComponentDef } from '../component-library.js';

// Step-by-step build guide generated from a finished schema-4 project:
// breadboards, then boards, then parts, then power, ground and signal wires.

const WIRE_ORDER = { power: 0, ground: 1, signal: 2 };

function partName(project, componentId) {
    const component = project.components.find(item => item.id === componentId);
    return getComponentDef(component?.definitionId)?.name || componentId;
}

function refLabel(project, ref) {
    if (ref?.type === 'surface-hole') return `breadboard hole ${ref.holeId}`;
    return `${partName(project, ref?.componentId)} pin ${ref?.pinId}`;
}

function wireKind(resolver, wire) {
    const pins = resolver.netFor(wire.from)
        .filter(ref => ref.type === 'component-pin')
        .map(ref => String(ref.pinId).toUpperCase());
    if (pins.some(pin => /(^|[._-])(GND|VSS|DGND|AGND)($|[._-])/.test(pin))) return 'ground';
    if (pins.some(pin => /(^|[._-])(5V|3V3|3\.3V|VCC|VIN)($|[._-])/.test(pin))) return 'power';
    return 'signal';
}

export function buildLessonSteps(project) {
    const resolver = new ConnectivityResolver(project);
    const surfaces = (project.surfaces || []).map(surface => ({
        kind: 'surface', id: surface.id, title: 'Place the breadboard',
    }));
    const components = (project.components || []).map(component => ({
        kind: 'component',
        id: component.id,
        isBoard: Boolean(getComponentDef(component.definitionId)?.isBoard),
        title: `Place the ${partName(project, component.id)}`,
    }));
    const wires = (project.wires || []).map((wire, index) => ({
        kind: 'wire',
        id: wire.id,
        wireKind: wireKind(resolver, wire),
        index,
        title: `Connect ${refLabel(project, wire.from)} to ${refLabel(project, wire.to)}`,
    }));
    components.sort((a, b) => Number(b.isBoard) - Number(a.isBoard));
    wires.sort((a, b) => WIRE_ORDER[a.wireKind] - WIRE_ORDER[b.wireKind] || a.index - b.index);
    return [...surfaces, ...components, ...wires].map(({ index, ...step }) => step);
}

function holeGroup(project, surfaceId, holeId) {
    const surface = project.surfaces.find(item => item.id === surfaceId);
    return getSurfaceDefinition(surface)?.getHole(holeId)?.electricalGroup ?? null;
}

// Pair each target item with an unclaimed current item of the same definition,
// first among those that pass `prefer`, so ids never need to match.
function pairByDefinition(wanted, available, prefer) {
    const pairs = new Map(), claimed = new Set();
    for (const strict of [true, false]) {
        for (const want of wanted) {
            if (pairs.has(want.id)) continue;
            const have = available.find(item => !claimed.has(item.id)
                && item.definitionId === want.definitionId && (!strict || prefer(want, item)));
            if (!have) continue;
            pairs.set(want.id, have);
            claimed.add(have.id);
        }
    }
    return pairs;
}

// A part counts when it sits in the same breadboard strips as the target,
// so any hole of the right strip is accepted.
function inRightStrips(target, current, surfaces, want, have) {
    if (want.placement?.type !== 'surface') return true;
    const surface = surfaces.get(want.placement.surfaceId);
    if (!surface || have.placement?.type !== 'surface' || have.placement.surfaceId !== surface.id) return false;
    return Object.entries(want.placement.bindings || {}).every(([pinId, holeId]) => {
        const wantGroup = holeGroup(target, want.placement.surfaceId, holeId);
        return wantGroup !== null && wantGroup === holeGroup(current, surface.id, have.placement.bindings?.[pinId]);
    });
}

// Works on any build: the student's parts and breadboards are matched to the
// target by definition, not by id.
export function matchLessonBuild(target, current) {
    const surfaces = pairByDefinition(target.surfaces || [], current.surfaces || [], () => true);
    const components = pairByDefinition(target.components || [], current.components || [],
        (want, have) => inRightStrips(target, current, surfaces, want, have));
    return { surfaces, components, resolver: new ConnectivityResolver(current) };
}

function translateRef(ref, match) {
    if (ref?.type === 'surface-hole') {
        const surface = match.surfaces.get(ref.surfaceId);
        return surface ? surfaceHoleRef(surface.id, ref.holeId) : null;
    }
    const component = match.components.get(ref?.componentId);
    return component ? componentPinRef(component.id, ref.pinId) : null;
}

export function isLessonStepComplete(step, target, current, match = matchLessonBuild(target, current)) {
    if (step.kind === 'surface') return match.surfaces.has(step.id);
    if (step.kind === 'component') {
        const want = target.components.find(item => item.id === step.id);
        const have = match.components.get(step.id);
        return Boolean(want && have) && inRightStrips(target, current, match.surfaces, want, have);
    }
    const wire = target.wires.find(item => item.id === step.id);
    const from = translateRef(wire?.from, match), to = translateRef(wire?.to, match);
    return Boolean(from && to) && match.resolver.areConnected(from, to);
}

// Index of the first unfinished step, or steps.length when the build is done.
export function lessonProgress(steps, target, current) {
    const match = matchLessonBuild(target, current);
    const index = steps.findIndex(step => !isLessonStepComplete(step, target, current, match));
    return index === -1 ? steps.length : index;
}
