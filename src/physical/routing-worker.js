import { computeRoutingJob } from './routing-worker-core.js';

self.addEventListener('message', event => {
    const { id, project, footprints } = event.data || {};
    try {
        self.postMessage({ id, routes: computeRoutingJob({ project, footprints }) });
    } catch (error) {
        self.postMessage({
            id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
