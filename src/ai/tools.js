import { getComponentDef } from '../component-library.js';
import { listPartDefinitions } from '../core/part-registry.js';
import {
    componentPinRole,
    controllerPinMetadata,
    controllerPinUsage,
    PIN_CAPABILITY_VALUES,
    pinCompatibility,
} from '../core/pin-capabilities.js';
import { arrangePhysicalStore, autoWirePhysicalStore, routePhysicalStore } from '../physical/automation.js';
import { getSurfaceDefinition, holeWorldPosition } from '../physical/breadboard.js';
import { defaultFootprintForComponent, getFootprintDefinition } from '../physical/footprints.js';
import { createComponentInstance } from '../physical/model.js';
import { BreadboardSnapSolver } from '../physical/placement.js';
import { validatePhysicalProject } from '../physical/validation.js';

const MAX_COMPONENTS_PER_CALL = 24;
const MAX_WIRES_PER_CALL = 32;
const SIGNAL_COLORS = ['#22d3ee', '#a78bfa', '#f59e0b', '#10b981', '#f472b6', '#60a5fa'];

function objectArgs(value, toolName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${toolName} expects a JSON object.`);
    }
    return value;
}

function stringArray(value, name, { allowEmpty = false } = {}) {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some(item => typeof item !== 'string' || !item.trim())) {
        throw new TypeError(`${name} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings.`);
    }
    return value.map(item => item.trim());
}

function componentCatalog() {
    return listPartDefinitions()
        .filter(definition => definition.category !== 'internal')
        .filter(definition => defaultFootprintForComponent(definition.id))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function compactDefinition(definition) {
    const footprint = defaultFootprintForComponent(definition.id);
    const autoWire = Object.fromEntries(definition.pins
        .filter(pin => pin.autoWireRequirement)
        .map(pin => [pin.id, pin.autoWireRequirement]));
    return {
        componentId: definition.id,
        name: definition.name,
        category: definition.category,
        description: definition.description,
        pins: (footprint?.pins || []).map(pin => pin.pinId),
        autoWire: Object.keys(autoWire).length ? autoWire : null,
        controller: Boolean(definition.controller),
        breadboardMountable: footprint?.placementMode === 'breadboard-rigid',
    };
}

function searchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[Ωω]/g, ' ohm ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function compactProject(project) {
    return {
        schemaVersion: project.schemaVersion,
        title: project.properties?.title || '',
        surfaces: (project.surfaces || []).map(surface => ({
            id: surface.id,
            type: surface.type,
            transform: surface.transform,
        })),
        components: (project.components || []).map(component => ({
            instanceId: component.id,
            componentId: component.definitionId,
            name: getComponentDef(component.definitionId)?.name || component.definitionId,
            placement: component.placement,
            generated: component.properties?.provenance?.kind === 'generated',
        })),
        wires: (project.wires || []).map(wire => ({
            wireId: wire.id,
            from: wire.from,
            to: wire.to,
            generated: Boolean(wire.properties?.generated),
        })),
    };
}

function summarizeValidation(project) {
    const result = validatePhysicalProject(project);
    return {
        valid: result.errors.length === 0,
        counts: {
            errors: result.errors.length,
            warnings: result.warnings.length,
            info: result.info.length,
        },
        issues: result.all.map(item => ({
            id: item.id,
            severity: item.severity,
            message: item.message,
            instanceId: item.instanceId || undefined,
        })),
    };
}

function fallbackPosition(project, index) {
    const board = (project.surfaces || []).find(surface => getSurfaceDefinition(surface));
    const definition = board && getSurfaceDefinition(board);
    const column = index % 3;
    const row = Math.floor(index / 3);
    return board && definition
        ? { x: board.transform.x + definition.width + 18 + column * 32, y: board.transform.y + 8 + row * 28 }
        : { x: 25 + column * 42, y: 25 + row * 32 };
}

function tryMountOnBreadboard(project, component) {
    const footprint = getFootprintDefinition(component.footprintId);
    if (footprint?.placementMode !== 'breadboard-rigid') return false;
    const solver = new BreadboardSnapSolver();
    for (const surface of project.surfaces || []) {
        const definition = getSurfaceDefinition(surface);
        if (!definition) continue;
        for (const hole of definition.holes) {
            if (hole.zone !== 'terminal') continue;
            const candidate = solver.solve({
                project,
                component,
                surfaceId: surface.id,
                pointerWorld: holeWorldPosition(surface, hole.id),
                preferredRotation: component.placement.rotation,
            });
            if (!candidate) continue;
            component.placement = {
                type: 'surface',
                surfaceId: candidate.surfaceId,
                rotation: candidate.rotation,
                bindings: structuredClone(candidate.bindings),
            };
            return true;
        }
    }
    return false;
}

function requireKnownInstance(project, instanceId) {
    const component = project.components.find(item => item.id === instanceId);
    if (!component) throw new TypeError(`Unknown component instance "${instanceId}".`);
    return component;
}

function requireKnownPin(project, instanceId, pinId) {
    const component = requireKnownInstance(project, instanceId);
    const footprint = getFootprintDefinition(component.footprintId);
    if (!footprint?.pins.some(pin => pin.pinId === pinId)) {
        throw new TypeError(`Unknown pin "${pinId}" on ${instanceId}.`);
    }
    return { type: 'component-pin', componentId: instanceId, pinId };
}

function sameRef(a, b) {
    return a?.type === b?.type && a?.componentId === b?.componentId && a?.pinId === b?.pinId;
}

function hasEquivalentWire(project, from, to) {
    return project.wires.some(wire =>
        (sameRef(wire.from, from) && sameRef(wire.to, to)) ||
        (sameRef(wire.from, to) && sameRef(wire.to, from)));
}

function nextWireColor(project, requested) {
    if (/^#[0-9a-f]{6}$/i.test(String(requested || ''))) return requested;
    return SIGNAL_COLORS[(project.wires?.length || 0) % SIGNAL_COLORS.length];
}

function newErrorsIntroduced(before, after) {
    const existing = new Set(validatePhysicalProject(before).errors.map(issue => issue.id));
    return validatePhysicalProject(after).errors.filter(issue => !existing.has(issue.id));
}

function isController(component) {
    return Boolean(getComponentDef(component?.definitionId)?.autoWirePins);
}

function connectionCompatibility(project, from, to) {
    const fromComponent = requireKnownInstance(project, from.componentId);
    const toComponent = requireKnownInstance(project, to.componentId);
    const checks = [];
    if (isController(fromComponent) && !isController(toComponent)) {
        checks.push({ controller: fromComponent, controllerPinId: from.pinId, endpoint: toComponent, endpointPinId: to.pinId });
    }
    if (isController(toComponent) && !isController(fromComponent)) {
        checks.push({ controller: toComponent, controllerPinId: to.pinId, endpoint: fromComponent, endpointPinId: from.pinId });
    }
    const warnings = [];
    for (const check of checks) {
        const result = pinCompatibility(check.controller, check.controllerPinId, check.endpoint, check.endpointPinId);
        if (!result.compatible) {
            throw new Error(`Connection rejected: ${check.controller.id}.${check.controllerPinId} → ` +
                `${check.endpoint.id}.${check.endpointPinId}: ${result.reason}`);
        }
        warnings.push(...result.warnings.map(constraint => ({
            instanceId: check.controller.id,
            pinId: check.controllerPinId,
            type: constraint.type,
            severity: constraint.severity,
        })));
    }

    const fromRole = componentPinRole(fromComponent, from.pinId);
    const toRole = componentPinRole(toComponent, to.pinId);
    const supplies = new Set(['VCC', 'GND']);
    if (supplies.has(fromRole) && supplies.has(toRole) && fromRole !== toRole) {
        throw new Error(`Connection rejected: ${fromComponent.id}.${from.pinId} (${fromRole}) is incompatible with ` +
            `${toComponent.id}.${to.pinId} (${toRole}).`);
    }
    return warnings;
}

function compactPin(pin, usage = []) {
    const result = { pinId: pin.pinId, capabilities: pin.capabilities };
    if (usage.length) result.usage = usage;
    if (pin.constraints.length) result.constraints = pin.constraints;
    return result;
}

function tool(name, description, parameters, { mutating = false, alwaysConfirm = false, execute }) {
    return { name, description, parameters, mutating, alwaysConfirm, execute };
}

export function createEleraToolRegistry(store) {
    if (!store?.project || typeof store.transaction !== 'function') {
        throw new TypeError('The Elera AI tools require a physical circuit store.');
    }

    const tools = [
        tool('list_available_components',
            'Resolve all required component types against Elera’s real library in one batched call. Reuse returned IDs and do not repeat resolved queries.', {
                type: 'object',
                properties: {
                    queries: {
                        type: 'array', minItems: 1, maxItems: 24, uniqueItems: true,
                        items: { type: 'string' },
                        description: 'All component names, categories, descriptions, or IDs needed for the task. Batch them into this one array.',
                    },
                    query: { type: 'string', description: 'Legacy single search. Prefer the batched queries array.' },
                },
                additionalProperties: false,
            }, {
                execute(args) {
                    const input = objectArgs(args, 'list_available_components');
                    const requested = Array.isArray(input.queries)
                        ? input.queries
                        : [input.query ?? ''];
                    if (requested.length < 1 || requested.length > 24
                        || requested.some(query => typeof query !== 'string')) {
                        throw new TypeError('queries must contain 1-24 strings.');
                    }
                    const queries = [...new Map(requested.map(query => {
                        const trimmed = query.trim();
                        return [trimmed.toLowerCase(), trimmed];
                    })).values()];
                    const catalog = componentCatalog();
                    const components = new Map();
                    const results = queries.map(query => {
                        const terms = searchText(query).split(/\s+/).filter(Boolean);
                        const matches = catalog.filter(definition => {
                            if (!terms.length) return true;
                            const searchable = searchText([
                                definition.id, definition.name, definition.category, definition.description,
                                ...(definition.keywords || []),
                            ].join(' '));
                            return terms.every(term => searchable.includes(term));
                        });
                        for (const definition of matches) components.set(definition.id, definition);
                        return {
                            query,
                            count: matches.length,
                            componentIds: matches.slice(0, 60).map(definition => definition.id),
                        };
                    });
                    return {
                        queries: results,
                        count: components.size,
                        components: [...components.values()].slice(0, 60).map(compactDefinition),
                    };
                },
            }),
        tool('inspect_circuit',
            'Read the current semantic circuit, including exact component instance IDs, placements, wires, and validation summary.', {
                type: 'object', properties: {}, additionalProperties: false,
            }, {
                execute(args) {
                    objectArgs(args, 'inspect_circuit');
                    return { circuit: compactProject(store.project), validation: summarizeValidation(store.project) };
                },
            }),
        tool('find_compatible_pins',
            'Find authoritative candidate pins on one controller for multiple named requirements. This does not allocate or connect pins; choose exact pins and commit them with connect_pins.', {
                type: 'object',
                properties: {
                    instance_id: { type: 'string', description: 'Exact controller component instance ID.' },
                    requirements: {
                        type: 'array', minItems: 1, maxItems: 24,
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Caller-defined requirement name returned as the result key.' },
                                capabilities: {
                                    type: 'array', minItems: 1, uniqueItems: true,
                                    items: { type: 'string', enum: PIN_CAPABILITY_VALUES },
                                },
                            },
                            required: ['id', 'capabilities'], additionalProperties: false,
                        },
                    },
                    exclude_in_use: { type: 'boolean', description: 'Exclude pins with current connections. Defaults to true.' },
                },
                required: ['instance_id', 'requirements'], additionalProperties: false,
            }, {
                execute(args) {
                    const input = objectArgs(args, 'find_compatible_pins');
                    const component = requireKnownInstance(store.project, String(input.instance_id || ''));
                    const pins = controllerPinMetadata(getComponentDef(component.definitionId));
                    if (!pins.length) throw new TypeError(`${component.id} is not a programmable controller.`);
                    if (!Array.isArray(input.requirements) || input.requirements.length < 1 || input.requirements.length > 24) {
                        throw new TypeError('requirements must contain 1-24 items.');
                    }
                    const usage = controllerPinUsage(store.project, component.id);
                    const candidates = {};
                    for (const [index, requirement] of input.requirements.entries()) {
                        if (!requirement || typeof requirement !== 'object') throw new TypeError(`requirements[${index}] must be an object.`);
                        const id = String(requirement.id || '').trim();
                        if (!id || Object.hasOwn(candidates, id)) throw new TypeError('Requirement IDs must be non-empty and unique.');
                        const capabilities = stringArray(requirement.capabilities, `requirements[${index}].capabilities`);
                        const unknown = capabilities.filter(capability => !PIN_CAPABILITY_VALUES.includes(capability));
                        if (unknown.length) throw new TypeError(`Unknown pin capabilities: ${unknown.join(', ')}.`);
                        candidates[id] = pins
                            .filter(pin => capabilities.every(capability => pin.capabilities.includes(capability)))
                            .filter(pin => input.exclude_in_use === false || !(usage.get(pin.pinId)?.length))
                            .map(pin => compactPin(pin));
                    }
                    return { instanceId: component.id, candidates };
                },
            }),
        tool('inspect_pin_usage',
            'Inspect one controller pin budget, including capabilities, current connections, and important constraints.', {
                type: 'object',
                properties: { instance_id: { type: 'string', description: 'Exact controller component instance ID.' } },
                required: ['instance_id'], additionalProperties: false,
            }, {
                execute(args) {
                    const input = objectArgs(args, 'inspect_pin_usage');
                    const component = requireKnownInstance(store.project, String(input.instance_id || ''));
                    const pins = controllerPinMetadata(getComponentDef(component.definitionId));
                    if (!pins.length) throw new TypeError(`${component.id} is not a programmable controller.`);
                    const usage = controllerPinUsage(store.project, component.id);
                    return {
                        instanceId: component.id,
                        componentId: component.definitionId,
                        pins: pins.map(pin => ({ ...compactPin(pin, usage.get(pin.pinId) || []),
                            status: usage.get(pin.pinId)?.length ? 'in_use' : 'free' })),
                    };
                },
            }),
        tool('place_components',
            'Place all required components from the Elera library atomically in one call. Use exact component IDs returned by the earlier batched list_available_components result. Returns instance IDs needed by other tools.', {
                type: 'object',
                properties: {
                    components: {
                        type: 'array', minItems: 1, maxItems: MAX_COMPONENTS_PER_CALL,
                        items: {
                            type: 'object',
                            properties: {
                                component_id: { type: 'string' },
                                x: { type: 'number', description: 'Optional world X position in millimetres.' },
                                y: { type: 'number', description: 'Optional world Y position in millimetres.' },
                                rotation: { type: 'number', description: 'Optional rotation in degrees.' },
                            },
                            required: ['component_id'], additionalProperties: false,
                        },
                    },
                    mount_on_breadboard: { type: 'boolean', description: 'Try legal rigid breadboard placement for mountable parts. Defaults to true.' },
                },
                required: ['components'], additionalProperties: false,
            }, {
                mutating: true,
                execute(args) {
                    const input = objectArgs(args, 'place_components');
                    if (!Array.isArray(input.components) || input.components.length < 1 || input.components.length > MAX_COMPONENTS_PER_CALL) {
                        throw new TypeError(`components must contain 1-${MAX_COMPONENTS_PER_CALL} items.`);
                    }
                    const prepared = input.components.map((item, index) => {
                        if (!item || typeof item !== 'object') throw new TypeError(`components[${index}] must be an object.`);
                        const componentId = String(item.component_id || '').trim();
                        const definition = getComponentDef(componentId);
                        const footprint = defaultFootprintForComponent(componentId);
                        if (!definition || !footprint) throw new TypeError(`Unknown or unplaceable component ID "${componentId}".`);
                        const fallback = fallbackPosition(store.project, store.project.components.length + index);
                        return createComponentInstance({
                            id: store.newComponentId(),
                            definitionId: componentId,
                            footprintId: footprint.id,
                            x: Number.isFinite(item.x) ? item.x : fallback.x,
                            y: Number.isFinite(item.y) ? item.y : fallback.y,
                            rotation: Number.isFinite(item.rotation) ? item.rotation : 0,
                            properties: { provenance: { kind: 'ai-placed' } },
                        });
                    });
                    const placements = [];
                    store.transaction('ai-place-components', project => {
                        for (const component of prepared) {
                            project.components.push(component);
                            const mounted = input.mount_on_breadboard !== false && tryMountOnBreadboard(project, component);
                            placements.push({
                                instanceId: component.id,
                                componentId: component.definitionId,
                                mounted,
                            });
                        }
                    });
                    return { status: 'success', placed: placements };
                },
            }),
        tool('delete_components',
            'Delete specific component instances and their connected wires. Use exact instance IDs from inspect_circuit.', {
                type: 'object',
                properties: { instance_ids: { type: 'array', items: { type: 'string' }, minItems: 1 } },
                required: ['instance_ids'], additionalProperties: false,
            }, {
                mutating: true,
                execute(args) {
                    const ids = stringArray(objectArgs(args, 'delete_components').instance_ids, 'instance_ids');
                    const unique = [...new Set(ids)];
                    for (const id of unique) requireKnownInstance(store.project, id);
                    store.transaction('ai-delete-components', project => {
                        const removed = new Set(unique);
                        project.components = project.components.filter(component => !removed.has(component.id));
                        project.wires = project.wires.filter(wire => ![wire.from, wire.to].some(ref =>
                            ref?.type === 'component-pin' && removed.has(ref.componentId)));
                    });
                    return { status: 'success', deletedInstanceIds: unique };
                },
            }),
        tool('connect_pins',
            'Create explicit semantic wires between exact existing component pins. Elera validates controller capabilities and constraints but never chooses a pin automatically.', {
                type: 'object',
                properties: {
                    connections: {
                        type: 'array', minItems: 1, maxItems: MAX_WIRES_PER_CALL,
                        items: {
                            type: 'object',
                            properties: {
                                from_instance_id: { type: 'string' }, from_pin: { type: 'string' },
                                to_instance_id: { type: 'string' }, to_pin: { type: 'string' },
                                color: { type: 'string', description: 'Optional #RRGGBB wire color.' },
                            },
                            required: ['from_instance_id', 'from_pin', 'to_instance_id', 'to_pin'],
                            additionalProperties: false,
                        },
                    },
                },
                required: ['connections'], additionalProperties: false,
            }, {
                mutating: true,
                execute(args) {
                    const input = objectArgs(args, 'connect_pins');
                    if (!Array.isArray(input.connections) || input.connections.length < 1 || input.connections.length > MAX_WIRES_PER_CALL) {
                        throw new TypeError(`connections must contain 1-${MAX_WIRES_PER_CALL} items.`);
                    }
                    const draft = structuredClone(store.project);
                    const pending = [];
                    const warnings = [];
                    for (const [index, item] of input.connections.entries()) {
                        const from = requireKnownPin(draft, String(item.from_instance_id || ''), String(item.from_pin || ''));
                        const to = requireKnownPin(draft, String(item.to_instance_id || ''), String(item.to_pin || ''));
                        if (sameRef(from, to)) throw new TypeError('A wire cannot connect a pin to itself.');
                        if (hasEquivalentWire(draft, from, to)) continue;
                        warnings.push(...connectionCompatibility(draft, from, to));
                        const wire = {
                            id: `__ai-pending-wire-${index}`, from, to,
                            route: { mode: 'auto', waypoints: [] },
                            color: nextWireColor(draft, item.color),
                            properties: { generated: false, provenance: { kind: 'ai-connected' } },
                        };
                        draft.wires.push(wire);
                        pending.push(wire);
                    }
                    const introduced = newErrorsIntroduced(store.project, draft);
                    if (introduced.length) throw new Error(`Connection rejected: ${introduced.map(issue => issue.message).join(' ')}`);
                    const added = pending.map(wire => {
                        const id = store.newWireId();
                        wire.id = id;
                        return id;
                    });
                    store.transaction('ai-connect-pins', project => { project.wires = draft.wires; });
                    return { status: 'success', addedWireIds: added,
                        skippedDuplicates: input.connections.length - added.length, warnings };
                },
            }),
        tool('auto_wire',
            'Run Elera’s deterministic metadata-driven Auto Wire engine. This assigns compatible controller pins, creates required helpers, and is atomic on failure.', {
                type: 'object',
                properties: {
                    instance_ids: { type: 'array', items: { type: 'string' }, description: 'Optional target instance IDs. Omit to wire all eligible components.' },
                },
                additionalProperties: false,
            }, {
                mutating: true,
                async execute(args) {
                    const input = objectArgs(args, 'auto_wire');
                    const ids = input.instance_ids === undefined ? null : stringArray(input.instance_ids, 'instance_ids', { allowEmpty: false });
                    if (ids) for (const id of ids) requireKnownInstance(store.project, id);
                    const result = autoWirePhysicalStore(store, { componentIds: ids });
                    if (result.status === 'success') await store.whenRoutesSettled();
                    return result;
                },
            }),
        tool('arrange_components',
            'Arrange component and board positions without creating, removing, or changing semantic connections.', {
                type: 'object', properties: {}, additionalProperties: false,
            }, {
                mutating: true,
                async execute(args) {
                    objectArgs(args, 'arrange_components');
                    const result = arrangePhysicalStore(store);
                    if (result.status === 'success') await store.whenRoutesSettled();
                    return result;
                },
            }),
        tool('route_wires',
            'Route the existing semantic connections without changing endpoints, nets, components, or placements.', {
                type: 'object', properties: {}, additionalProperties: false,
            }, {
                mutating: true,
                async execute(args) {
                    objectArgs(args, 'route_wires');
                    const result = routePhysicalStore(store);
                    await store.whenRoutesSettled();
                    return result;
                },
            }),
        tool('validate_circuit',
            'Run Elera’s deterministic physical validation rules and return all actionable findings.', {
                type: 'object', properties: {}, additionalProperties: false,
            }, {
                execute(args) {
                    objectArgs(args, 'validate_circuit');
                    return summarizeValidation(store.project);
                },
            }),
        tool('undo_last_change',
            'Undo the most recent circuit mutation.', {
                type: 'object', properties: {}, additionalProperties: false,
            }, {
                mutating: true,
                execute(args) {
                    objectArgs(args, 'undo_last_change');
                    return { status: store.undo() ? 'success' : 'nothing-to-undo' };
                },
            }),
        tool('clear_circuit',
            'Remove every component and wire while retaining placement surfaces. Call only when the user explicitly asks to start over or replace the entire circuit.', {
                type: 'object', properties: {}, additionalProperties: false,
            }, {
                mutating: true,
                alwaysConfirm: true,
                execute(args) {
                    objectArgs(args, 'clear_circuit');
                    const counts = { components: store.project.components.length, wires: store.project.wires.length };
                    store.transaction('ai-clear-circuit', project => {
                        project.components = [];
                        project.wires = [];
                    });
                    return { status: 'success', removed: counts };
                },
            }),
    ];

    return new Map(tools.map(entry => [entry.name, entry]));
}

export function toolDefinitions(registry) {
    return [...registry.values()].map(entry => ({
        type: 'function',
        function: {
            name: entry.name,
            description: entry.description,
            parameters: entry.parameters,
        },
    }));
}

export function publicComponentCatalog() {
    return componentCatalog().map(compactDefinition);
}
