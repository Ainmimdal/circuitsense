function browserWorkerFactory() {
    if (typeof Worker !== 'function' || typeof window === 'undefined') return null;
    return new Worker(new URL('./routing-worker.js', import.meta.url), { type: 'module' });
}

export class RoutingWorkerClient {
    constructor({ workerFactory = browserWorkerFactory } = {}) {
        this.worker = workerFactory();
        this.nextId = 1;
        this.pending = new Map();
        if (!this.worker) return;
        this.worker.addEventListener('message', event => this._receive(event.data));
        this.worker.addEventListener('error', event => this._failAll(event.error || new Error(event.message || 'Routing worker failed.')));
    }

    get available() {
        return Boolean(this.worker);
    }

    route(project, footprints = []) {
        if (!this.worker) return Promise.reject(new Error('Routing worker is unavailable.'));
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, project, footprints });
        });
    }

    _receive(message = {}) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error));
        else request.resolve(new Map(message.routes || []));
    }

    _failAll(error) {
        for (const { reject } of this.pending.values()) reject(error);
        this.pending.clear();
    }

    destroy() {
        this.worker?.terminate();
        this.worker = null;
        this._failAll(new Error('Routing worker was stopped.'));
    }
}

export function createRoutingWorkerClient() {
    try {
        const client = new RoutingWorkerClient();
        return client.available ? client : null;
    } catch (error) {
        console.warn('[Elera] Routing worker could not start; using main-thread routing.', error);
        return null;
    }
}
