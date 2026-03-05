/**
 * CircuitSense Store — Reactive state management for the circuit editor.
 * Uses EventTarget for change notifications so Lit components can subscribe.
 */
class CircuitStore extends EventTarget {
    constructor() {
        super();
        /** @type {Array<{id: string, componentId: string, x: number, y: number}>} */
        this.instances = [];
        /** @type {Array<{id: string, from: {instanceId: string, pinName: string}, to: {instanceId: string, pinName: string}}>} */
        this.wires = [];
        /** @type {Map<string, Array<{name: string, x: number, y: number, signals: Array}>>} */
        this.pinInfoMap = new Map();
        /** @type {null | {instanceId: string, pinName: string}} */
        this.wiringState = null;
        /** @type {{x: number, y: number}} */
        this.mousePos = { x: 0, y: 0 };
        this._nextId = 1;
    }

    // ——— Instance Management ———————————————————————————
    addInstance(componentId, x, y) {
        const instance = {
            id: `inst_${this._nextId++}`,
            componentId,
            x,
            y,
        };
        this.instances = [...this.instances, instance];
        this._notify();
        return instance;
    }

    moveInstance(id, x, y) {
        const inst = this.instances.find(i => i.id === id);
        if (inst) {
            inst.x = x;
            inst.y = y;
            this._notify();
        }
    }

    removeInstance(id) {
        this.instances = this.instances.filter(i => i.id !== id);
        this.wires = this.wires.filter(
            w => w.from.instanceId !== id && w.to.instanceId !== id
        );
        this.pinInfoMap.delete(id);
        this._notify();
    }

    getInstance(id) {
        return this.instances.find(i => i.id === id);
    }

    // ——— Pin Info ——————————————————————————————————————
    registerPinInfo(instanceId, pinInfo) {
        this.pinInfoMap.set(instanceId, pinInfo);
    }

    getPinAbsolutePosition(instanceId, pinName) {
        const inst = this.getInstance(instanceId);
        if (!inst) return null;
        const pinInfo = this.pinInfoMap.get(instanceId);
        if (!pinInfo) return null;
        const pin = pinInfo.find(p => p.name === pinName);
        if (!pin) return null;
        return {
            x: inst.x + pin.x,
            y: inst.y + pin.y,
        };
    }

    getPinSignals(instanceId, pinName) {
        const pinInfo = this.pinInfoMap.get(instanceId);
        if (!pinInfo) return [];
        const pin = pinInfo.find(p => p.name === pinName);
        return (pin && pin.signals) || [];
    }

    // ——— Wiring ———————————————————————————————————————
    startWiring(instanceId, pinName) {
        this.wiringState = { instanceId, pinName };
        this._notify();
    }

    completeWiring(instanceId, pinName) {
        if (!this.wiringState) return;
        // Clicking same pin cancels
        if (this.wiringState.instanceId === instanceId && this.wiringState.pinName === pinName) {
            this.cancelWiring();
            return;
        }
        const wire = {
            id: `wire_${this._nextId++}`,
            from: {...this.wiringState },
            to: { instanceId, pinName },
        };
        this.wires = [...this.wires, wire];
        this.wiringState = null;
        this._notify();
    }

    /**
     * Directly create a wire between two pins (used by auto-wire engine).
     * No wiring state needed.
     */
    completeWiringDirect(fromInstanceId, fromPinName, toInstanceId, toPinName) {
        // Don't duplicate an existing wire
        const exists = this.wires.some(
            w => (w.from.instanceId === fromInstanceId && w.from.pinName === fromPinName &&
                w.to.instanceId === toInstanceId && w.to.pinName === toPinName) ||
            (w.from.instanceId === toInstanceId && w.from.pinName === toPinName &&
                w.to.instanceId === fromInstanceId && w.to.pinName === fromPinName)
        );
        if (exists) return;

        const wire = {
            id: `wire_${this._nextId++}`,
            from: { instanceId: fromInstanceId, pinName: fromPinName },
            to: { instanceId: toInstanceId, pinName: toPinName },
        };
        this.wires = [...this.wires, wire];
        this._notify();
    }

    cancelWiring() {
        this.wiringState = null;
        this._notify();
    }

    removeWire(id) {
        this.wires = this.wires.filter(w => w.id !== id);
        this._notify();
    }

    // ——— Mouse —————————————————————————————————————————
    updateMousePos(x, y) {
        this.mousePos = { x, y };
        this.dispatchEvent(new CustomEvent('mousemove'));
    }

    // ——— Internal ——————————————————————————————————————
    _notify() {
        this.dispatchEvent(new CustomEvent('change'));
    }
}

export const store = new CircuitStore();