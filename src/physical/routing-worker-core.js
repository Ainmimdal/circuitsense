import { registerRuntimeRoutingFootprints } from './footprints.js';
import { routeAllWires } from './routing.js';

/** Pure worker job entry point, kept separate so it can be regression-tested. */
export function computeRoutingJob({ project, footprints = [] } = {}) {
    if (!project || !Array.isArray(project.wires)) throw new TypeError('A physical project is required for routing.');
    registerRuntimeRoutingFootprints(footprints);
    return [...routeAllWires(project).entries()];
}
