import { ConnectivityResolver } from './connectivity.js';
import { componentPinRef, componentWorldTransform, resolveConnectionWorldPoint, surfaceHoleRef } from './model.js';
import { getSurfaceDefinition } from './breadboard.js';
import { getFootprintDefinition } from './footprints.js';
import { applyTransform } from './geometry.js';
import { getComponentDef } from '../component-library.js';

// Step-by-step build guide generated from a finished schema-4 project:
// breadboards, then boards, then parts, then power, ground and signal wires.

const WIRE_ORDER = { power: 0, ground: 1, signal: 2 };
const RAILS = { TP: 'top + rail', TN: 'top − rail', BP: 'bottom + rail', BN: 'bottom − rail' };
const PIN_NAMES = {
    led: { A: 'long leg', C: 'short leg' },
    'rgb-led': { COM: 'longest leg (common −)', R: 'red leg', G: 'green leg', B: 'blue leg' },
    buzzer: { 1: '+ leg', 2: '− leg' },
    potentiometer: { GND: 'left leg', SIG: 'middle leg', VCC: 'right leg' },
};

function componentById(project, componentId) {
    return project.components.find(item => item.id === componentId);
}

function partName(project, componentId) {
    const component = componentById(project, componentId);
    const definition = getComponentDef(component?.definitionId);
    const name = definition?.isBoard ? definition.name : String(definition?.name || componentId).split(' ')
        .map(word => (/^[A-Z0-9-]+$/.test(word) ? word : word.toLowerCase())).join(' ');
    const color = component?.definitionId === 'led' ? component.properties?.color : null;
    return color ? `${color} ${name}` : name;
}

function pinName(project, componentId, pinId) {
    const component = componentById(project, componentId);
    return PIN_NAMES[component?.definitionId]?.[pinId] || null;
}

function holeLabel(project, ref) {
    const prefix = String(ref.holeId).replace(/\d+$/, '');
    if (RAILS[prefix]) return `the ${RAILS[prefix]}`;
    const column = String(ref.holeId).replace(/^\D+/, '');
    const surface = project.surfaces.find(item => item.id === ref.surfaceId);
    const group = getSurfaceDefinition(surface)?.getHole(ref.holeId)?.electricalGroup;
    const occupant = project.components.find(component => component.placement?.type === 'surface'
        && component.placement.surfaceId === ref.surfaceId
        && Object.values(component.placement.bindings || {}).some(holeId =>
            getSurfaceDefinition(surface)?.getHole(holeId)?.electricalGroup === group));
    if (!occupant) return `column ${column}`;
    const occupantPin = Object.entries(occupant.placement.bindings)
        .find(([, holeId]) => getSurfaceDefinition(surface).getHole(holeId).electricalGroup === group)[0];
    const leg = pinName(project, occupant.id, occupantPin);
    return `column ${column} (the ${partName(project, occupant.id)}${leg ? `'s ${leg}` : ''})`;
}

function refLabel(project, ref) {
    if (ref?.type === 'surface-hole') return holeLabel(project, ref);
    const component = componentById(project, ref?.componentId);
    const pin = String(ref?.pinId).replace(/\.\d+$/, '');
    if (getComponentDef(component?.definitionId)?.isBoard) return `Arduino ${/^\d+$|^A\d$/.test(pin) ? 'pin ' : ''}${pin}`;
    const leg = pinName(project, ref?.componentId, ref?.pinId);
    return `the ${partName(project, ref?.componentId)}'s ${leg || `${pin} pin`}`;
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
        color: wire.color,
        title: `Wire ${refLabel(project, wire.from)} to ${refLabel(project, wire.to)}`,
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

const DEFAULT_NOTES = {
    surface: 'The breadboard holds your parts. Each column of five holes is one connected strip.',
    board: 'The Arduino runs your code and powers the circuit.',
    power: 'Power wires carry 5 V. Red is the usual colour for them.',
    ground: 'Ground is the return path every circuit needs. Black is the usual colour.',
    signal: 'Signal wires carry information between the Arduino and a part.',
};

// One-line explanation of why the step matters.
export function lessonStepNote(step, target, notes = {}) {
    if (notes[step.id]) return notes[step.id];
    if (step.kind === 'surface') return DEFAULT_NOTES.surface;
    if (step.kind === 'wire') return DEFAULT_NOTES[step.wireKind];
    if (step.isBoard) return DEFAULT_NOTES.board;
    const component = componentById(target, step.id);
    return getComponentDef(component?.definitionId)?.description || 'Place this part where the outline shows.';
}

function describeHole(holeId) {
    const prefix = String(holeId).replace(/\d+$/, '');
    if (RAILS[prefix]) return `on the ${RAILS[prefix]}`;
    const half = 'ABCDE'.includes(prefix) ? 'A to E' : 'F to J';
    return `in column ${String(holeId).replace(/^\D+/, '')} (any row ${half})`;
}

// A gentle nudge once the student has tried something, or null when the
// glowing outline already says everything.
export function lessonStepHint(step, target, current, match = matchLessonBuild(target, current)) {
    if (step.kind === 'component') {
        const want = componentById(target, step.id);
        const have = match.components.get(step.id);
        if (!want || !have || want.placement?.type !== 'surface') return null;
        if (have.placement?.type !== 'surface') {
            return `Drag the ${partName(target, step.id)} onto the breadboard so it snaps into the holes.`;
        }
        const surface = match.surfaces.get(want.placement.surfaceId);
        const wrongPin = Object.entries(want.placement.bindings).find(([pinId, holeId]) =>
            holeGroup(target, want.placement.surfaceId, holeId)
                !== holeGroup(current, surface?.id, have.placement.bindings?.[pinId]));
        if (!wrongPin) return null;
        const leg = pinName(target, step.id, wrongPin[0]) || `pin ${wrongPin[0]}`;
        return `Close! The ${leg} belongs ${describeHole(wrongPin[1])}. Rotate the part if it is the wrong way round.`;
    }
    if (step.kind === 'wire') return 'Click one end, then the other. A wire can land in any hole of the right strip.';
    return null;
}

function ghostPoint(ref, target, current, match) {
    const translated = translateRef(ref, match);
    return (translated && resolveConnectionWorldPoint(current, translated)) || resolveConnectionWorldPoint(target, ref);
}

// What the canvas should draw for this step, in the student's coordinates.
export function lessonStepGhost(step, target, current, match = matchLessonBuild(target, current)) {
    if (step.kind === 'surface') {
        const surface = target.surfaces.find(item => item.id === step.id);
        return surface ? { kind: 'surface', surface: structuredClone(surface) } : null;
    }
    if (step.kind === 'component') {
        const want = componentById(target, step.id);
        if (!want) return null;
        const component = structuredClone(want);
        component.id = `lesson-ghost:${want.id}`;
        const surface = want.placement?.type === 'surface' ? match.surfaces.get(want.placement.surfaceId) : null;
        if (surface) {
            component.placement.surfaceId = surface.id;
        } else if (want.placement?.type === 'surface') {
            const transform = componentWorldTransform(target, want);
            component.placement = { type: 'free', position: { x: transform.x, y: transform.y }, rotation: transform.rotation };
        }
        const holes = surface
            ? Object.values(want.placement.bindings || {}).map(holeId => ({ surfaceId: surface.id, holeId }))
            : [];
        return { kind: 'component', component, holes };
    }
    const wire = target.wires.find(item => item.id === step.id);
    if (!wire) return null;
    const from = ghostPoint(wire.from, target, current, match);
    const to = ghostPoint(wire.to, target, current, match);
    return from && to ? { kind: 'wire', from, to, color: wire.color || '#22d3ee' } : null;
}

// World rectangle around the finished circuit, so the camera can frame it.
export function lessonBounds(target, padding = 14) {
    const points = [];
    for (const surface of target.surfaces || []) {
        const definition = getSurfaceDefinition(surface);
        points.push(surface.transform, {
            x: surface.transform.x + (definition?.width || 0), y: surface.transform.y + (definition?.height || 0),
        });
    }
    for (const component of target.components || []) {
        const bounds = getFootprintDefinition(component.footprintId)?.routingBounds;
        if (!bounds) continue;
        const transform = componentWorldTransform(target, component);
        for (const corner of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            points.push(applyTransform({ x: bounds.x + corner[0] * bounds.width, y: bounds.y + corner[1] * bounds.height }, transform));
        }
    }
    if (!points.length) return null;
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const x = Math.min(...xs) - padding, y = Math.min(...ys) - padding;
    return { x, y, width: Math.max(...xs) + padding - x, height: Math.max(...ys) + padding - y };
}

// "Show me": a mutation that completes the step in the student's project.
// `ids` hands out fresh ids so the result matches a hand-built circuit.
export function lessonStepMutation(step, target, current, ids, match = matchLessonBuild(target, current)) {
    if (step.kind === 'surface') {
        const surface = target.surfaces.find(item => item.id === step.id);
        return project => { project.surfaces.push({ ...structuredClone(surface), id: ids.surface() }); };
    }
    if (step.kind === 'component') {
        const want = componentById(target, step.id);
        const existing = match.components.get(step.id);
        const placement = structuredClone(want.placement);
        if (placement.type === 'surface') {
            const surface = match.surfaces.get(want.placement.surfaceId);
            if (!surface) return null;
            placement.surfaceId = surface.id;
        }
        return project => {
            const component = existing && project.components.find(item => item.id === existing.id);
            if (component) {
                component.footprintId = want.footprintId;
                component.placement = placement;
            } else {
                project.components.push({ ...structuredClone(want), id: ids.component(), placement });
            }
        };
    }
    const wire = target.wires.find(item => item.id === step.id);
    const from = translateRef(wire?.from, match), to = translateRef(wire?.to, match);
    if (!from || !to) return null;
    return project => {
        project.wires.push({ ...structuredClone(wire), id: ids.wire(), from, to, route: { mode: 'auto', waypoints: [] } });
    };
}

// A flat drawing of a finished circuit for thumbnails: board holes, parts as
// lines through their pins, off-board parts as boxes and wires as straight lines.
// Every item keeps the id of the step that builds it.
export function lessonMap(target) {
    const bounds = lessonBounds(target, 4);
    if (!bounds) return null;
    const surfaces = (target.surfaces || []).map(surface => {
        const definition = getSurfaceDefinition(surface);
        const holes = (definition?.holes || []).map(hole => applyTransform(hole, surface.transform));
        return { id: surface.id, x: surface.transform.x, y: surface.transform.y, width: definition?.width || 0, height: definition?.height || 0, holes };
    });
    const parts = [], boxes = [];
    for (const component of target.components || []) {
        if (component.placement?.type === 'surface') {
            const points = Object.keys(component.placement.bindings || {})
                .map(pinId => resolveConnectionWorldPoint(target, componentPinRef(component.id, pinId)))
                .filter(Boolean);
            parts.push({ id: component.id, kind: component.definitionId, color: component.properties?.color, points });
            continue;
        }
        const box = getFootprintDefinition(component.footprintId)?.routingBounds;
        if (!box) continue;
        const transform = componentWorldTransform(target, component);
        const corners = [[0, 0], [1, 1]].map(([u, v]) => applyTransform({ x: box.x + u * box.width, y: box.y + v * box.height }, transform));
        boxes.push({
            id: component.id,
            label: getComponentDef(component.definitionId)?.name || component.definitionId,
            x: Math.min(corners[0].x, corners[1].x), y: Math.min(corners[0].y, corners[1].y),
            width: Math.abs(corners[1].x - corners[0].x), height: Math.abs(corners[1].y - corners[0].y),
        });
    }
    const wires = (target.wires || []).map(wire => ({
        id: wire.id, color: wire.color,
        from: resolveConnectionWorldPoint(target, wire.from), to: resolveConnectionWorldPoint(target, wire.to),
    })).filter(wire => wire.from && wire.to);
    // Label the off-board pins that wires land on ("13", "GND", "5V").
    for (const box of boxes) {
        box.pins = [];
        for (const wire of target.wires || []) {
            for (const end of [wire.from, wire.to]) {
                if (end.type !== 'component-pin' || end.componentId !== box.id) continue;
                const point = resolveConnectionWorldPoint(target, end);
                if (point) box.pins.push({ ...point, label: String(end.pinId).replace(/\.\d+$/, '') });
            }
        }
    }
    return { bounds, surfaces, parts, boxes, wires };
}
