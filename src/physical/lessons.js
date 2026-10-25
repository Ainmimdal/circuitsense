import { ConnectivityResolver } from './connectivity.js';
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

// A part counts when it sits in the same breadboard strips as the target,
// so any hole of the right strip is accepted.
function componentDone(target, current, id) {
    const want = target.components.find(item => item.id === id);
    const have = current.components.find(item => item.id === id);
    if (!want || !have || have.definitionId !== want.definitionId) return false;
    if (want.placement?.type !== 'surface') return true;
    if (have.placement?.type !== 'surface' || have.placement.surfaceId !== want.placement.surfaceId) return false;
    return Object.entries(want.placement.bindings || {}).every(([pinId, holeId]) => {
        const wantGroup = holeGroup(target, want.placement.surfaceId, holeId);
        return wantGroup !== null
            && wantGroup === holeGroup(current, have.placement.surfaceId, have.placement.bindings?.[pinId]);
    });
}

export function isLessonStepComplete(step, target, current, resolver = new ConnectivityResolver(current)) {
    if (step.kind === 'surface') return current.surfaces.some(item => item.id === step.id);
    if (step.kind === 'component') return componentDone(target, current, step.id);
    const wire = target.wires.find(item => item.id === step.id);
    return Boolean(wire) && resolver.areConnected(wire.from, wire.to);
}

// Index of the first unfinished step, or steps.length when the build is done.
export function lessonProgress(steps, target, current) {
    const resolver = new ConnectivityResolver(current);
    const index = steps.findIndex(step => !isLessonStepComplete(step, target, current, resolver));
    return index === -1 ? steps.length : index;
}
