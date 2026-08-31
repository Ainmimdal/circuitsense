import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { componentLibrary, getComponentDef } from '../component-library.js';
import { store } from '../store.js';
import { autoWireAll } from '../services/auto-wire-engine.js';
import { faIcon } from '../utils/fa-icons.js';
import {
    getBreadboardDragPreview,
    rotateMountedBreadboardComponent,
    tryManualBreadboardPlacement,
} from '../services/breadboard-service.js';
import { calibratePhysicalPinInfo } from '../core/component-geometry.js';

class PlacedComponent extends LitElement {
    static properties = {
        instanceId: { type: String },
        componentId: { type: String },
        _pinInfo: { state: true },
        _autoWireMsg: { state: true },
        _hoveredPin: { state: true },
    };

    static styles = css`
    :host {
      display: inline-block;
      cursor: grab;
      user-select: none;
      border-radius: 4px;
      padding-bottom: 28px;
    }

    :host(.selected) {
      /* host no longer has outline */
    }

    :host(.dragging) {
      cursor: grabbing;
      z-index: 1000 !important;
      filter: drop-shadow(0 6px 20px rgba(0, 0, 0, 0.5));
    }

    .wrapper {
      position: relative;
      display: flex;
      flex-direction: column;
      margin-bottom: -28px;
    }

    .rotatable-group {
      position: relative;
      transform-origin: center center;
      transition: outline-color 0.2s;
      outline: 2px solid transparent;
      outline-offset: 4px;
      border-radius: 4px;
    }

    :host(.selected) .rotatable-group {
      outline-color: #4FC3F7;
    }

    .wokwi-container {
      pointer-events: none;
    }

    .wokwi-container.breadboard-interactive {
      pointer-events: auto;
    }

    .custom-image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
    }

    /* Pin dots — hidden by default, shown on hover (like Tinkercad) */
    .pin-dot {
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4CAF50;
      border: 1.5px solid rgba(255, 255, 255, 0.85);
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
      cursor: crosshair;
      z-index: 20;
      pointer-events: none;
      transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.15s ease;
    }

    /* Reveal pin dots on component hover or selection */
    :host(:hover) .pin-dot,
    :host(.selected) .pin-dot {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
      pointer-events: all;
    }

    .pin-dot:hover {
      transform: translate(-50%, -50%) scale(1.5);
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.35);
    }

    /* Active pin during wiring — always visible */
    .pin-dot.active {
      background: #FF9800 !important;
      transform: translate(-50%, -50%) scale(1.5);
      opacity: 1;
      pointer-events: all;
      box-shadow: 0 0 12px rgba(255, 152, 0, 0.7);
      animation: pin-pulse 1s infinite;
    }

    .pin-dot.power { background: #F44336; }
    .pin-dot.ground { background: #555; border-color: #aaa; }
    .pin-dot.signal { background: #4CAF50; }

    .breadboard .pin-dot {
      width: 8px;
      height: 8px;
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
      background: transparent;
      border-color: transparent;
      pointer-events: all;
    }

    .breadboard .pin-dot:hover {
      background: #ff9800;
      border-color: white;
    }

    @keyframes pin-pulse {
      0%, 100% { box-shadow: 0 0 6px rgba(255, 152, 0, 0.5); }
      50% { box-shadow: 0 0 14px rgba(255, 152, 0, 0.85); }
    }

    /* Tooltip — JS-driven visibility */
    .pin-tooltip {
      position: absolute;
      transform: translate(-50%, -100%);
      margin-top: -10px;
      background: rgba(39, 39, 42, 0.95); /* Zinc 800 */
      color: #fafafa;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 500;
      white-space: nowrap;
      pointer-events: none;
      z-index: 30;
      opacity: 0;
      transition: opacity 0.12s;
      border: 1px solid rgba(255,255,255,0.1);
      -webkit-font-smoothing: antialiased;
    }

    .pin-tooltip.visible {
      opacity: 1;
    }

    /* Action buttons toolbar — positioned below component bounds */
    .action-bar {
      position: absolute;
      bottom: -26px;
      right: 2px;
      display: none;
      gap: 2px;
      z-index: 30;
      pointer-events: all;
      padding: 2px;
      border-radius: 4px;
      background: rgba(24, 24, 27, 0.85); /* Zinc 900 */
    }

    :host(:hover) .action-bar,
    :host(.selected) .action-bar {
      display: flex;
    }

    .action-btn {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.15);
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      transition: all 0.15s;
      opacity: 0.7;
    }

    .action-btn svg {
      width: 10px;
      height: 10px;
    }

    .action-btn:hover {
      transform: scale(1.15);
      opacity: 1;
    }

    .delete-btn {
      background: rgba(229, 57, 53, 0.75);
      color: white;
      border-color: rgba(198, 40, 40, 0.5);
    }

    .delete-btn:hover {
      background: #FF1744;
    }

    .autowire-btn {
      background: rgba(30, 136, 229, 0.75);
      color: white;
      border-color: rgba(21, 101, 192, 0.5);
    }

    .autowire-btn:hover {
      background: #42A5F5;
    }

    .rotate-btn {
      background: rgba(67, 160, 71, 0.75);
      color: white;
      border-color: rgba(46, 125, 50, 0.5);
    }

    .rotate-btn:hover {
      background: #4CAF50;
    }

    /* Auto-wire toast */
    .autowire-toast {
      position: absolute;
      top: -28px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30, 136, 229, 0.95);
      color: white;
      padding: 5px 14px;
      border-radius: 8px;
      font-size: 10px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 40;
      animation: toast-fade 2s ease forwards;
      -webkit-font-smoothing: antialiased;
    }

    .autowire-toast.error {
      background: rgba(229, 57, 53, 0.95);
    }

    @keyframes toast-fade {
      0% { opacity: 1; transform: translateX(-50%) translateY(0); }
      70% { opacity: 1; }
      100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }

    /* Component name label */
    .component-label {
      position: absolute;
      bottom: -18px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 9px;
      color: #555;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
    }
  `;

    constructor() {
        super();
        this._pinInfo = [];
        this._autoWireMsg = null;
        this._hoveredPin = null;
        this._dragFrame = null;
        this._pendingDrag = null;
        this._dragSnapshot = null;
        this._storeHandler = () => this.requestUpdate();
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('change', this._storeHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._dragFrame !== null) cancelAnimationFrame(this._dragFrame);
        store.removeEventListener('change', this._storeHandler);
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (store.isInstanceSelected(this.instanceId)) {
            this.classList.add('selected');
        } else {
            this.classList.remove('selected');
        }

        // If the store cleared our pin info (e.g. after loading a project), we must re-register it
        if (!store.pinInfoMap.has(this.instanceId)) {
            this._readPinInfo(50);
        }
    }

    firstUpdated() {
        this._readPinInfo();
    }

    _readPinInfo(retries = 50) {
        const def = getComponentDef(this.componentId);
        if (def?.type === 'custom') {
            this._pinInfo = [...(def.customPins || [])];
            store.registerPinInfo(this.instanceId, this._pinInfo);
            this.requestUpdate();
            return;
        }
        if (def?.pinless) {
            this._pinInfo = [];
            store.registerPinInfo(this.instanceId, this._pinInfo);
            return;
        }

        const container = this.shadowRoot && this.shadowRoot.querySelector('.wokwi-container');
        if (!container) return;

        const wokwiEl = container.children[0];
        if (wokwiEl && wokwiEl.pinInfo) {
            this._pinInfo = calibratePhysicalPinInfo(this.componentId, [...wokwiEl.pinInfo]);
            store.registerPinInfo(this.instanceId, this._pinInfo);
            this.requestUpdate();
        } else if (retries > 0) {
            requestAnimationFrame(() => this._readPinInfo(retries - 1));
        }
    }

    render() {
        const inst = store.getInstance(this.instanceId);
        const def = getComponentDef(this.componentId);
        if (!def) return html`<div style="color:red;">Unknown: ${this.componentId}</div>`;

        const rot = inst?.rotation || 0;
        const scaleX = inst?.uniformScale || inst?.physicalScale?.x || 1;
        const scaleY = inst?.uniformScale || inst?.physicalScale?.y || 1;
        const width = def.size?.width || 80;
        const height = def.size?.height || 60;

        const attrs = Object.entries(def.attrs || {})
            .map(([k, v]) => `${k}="${v}"`)
            .join(' ');
        const tagHtml = `<${def.tag} ${attrs}></${def.tag}>`;
        const isBreadboard = Boolean(def.isBreadboard);

        const showAutoWire = !def.isBoard && !def.isPassive && def.autoWire;

        return html`
      <div class="wrapper"
        @pointerdown=${this._onPointerDown}
        @click=${this._onClick}
      >
        <div class="action-bar">
          ${showAutoWire ? html`
            <button class="action-btn autowire-btn"
              @click=${this._onAutoWire}
              title="Auto-wire to Arduino">${faIcon('bolt')}</button>
          ` : ''}
          <button class="action-btn rotate-btn"
            @click=${this._onRotate}
            title="Rotate (R)">${faIcon('rotateRight')}</button>
          <button class="action-btn delete-btn"
            @click=${this._onDelete}
            title="Remove component (Del)">${faIcon('xmark')}</button>
        </div>

        ${this._autoWireMsg ? html`
          <div class="autowire-toast ${this._autoWireMsg.ok ? '' : 'error'}">
            ${this._autoWireMsg.text}
          </div>
        ` : ''}

        <div class="rotatable-group ${def.isBreadboard ? 'breadboard' : ''}" style="width: ${width}px; height: ${height}px; transform: rotate(${rot}deg) scale(${scaleX}, ${scaleY});">
          ${def.type === 'custom' ? html`
            <img class="custom-image" src=${def.imageUrl} alt=${def.name} />
          ` : html`
            <div
              class="wokwi-container ${isBreadboard ? 'breadboard-interactive' : ''}"
              style="position: absolute; left: 0; top: 0; width: 100%; height: 100%;"
              @pointerdown=${isBreadboard ? this._onBreadboardPinPointerDown : null}
              @click=${isBreadboard ? this._onBreadboardPinClick : null}
            >
              ${unsafeHTML(tagHtml)}
            </div>
          `}
          ${isBreadboard ? '' : this._pinInfo.map(pin => this._renderPin(pin))}
        </div>

        ${this._renderHoveredPinTooltip(inst, def)}

        <div class="component-label">${def.name}</div>
      </div>
    `;
    }

    _renderPin(pin) {
        const isActive =
            store.wiringState && store.wiringState.instanceId === this.instanceId &&
            store.wiringState.pinName === pin.name;

        const pinClass = this._getPinClass(pin);
        return html`
      <div
        class="pin-dot ${pinClass} ${isActive ? 'active' : ''}"
        style="left: ${pin.x}px; top: ${pin.y}px;"
        @mouseenter=${() => { this._hoveredPin = pin.name; }}
        @mouseleave=${() => { this._hoveredPin = null; }}
        @pointerdown=${(e) => e.stopPropagation()}
        @click=${(e) => {
            e.stopPropagation();
            this._onPinClick(pin);
        }}
      ></div>
    `;
    }

    _renderHoveredPinTooltip(inst, def) {
        const pin = this._pinInfo.find(item => item.name === this._hoveredPin);
        if (!pin || !inst) return '';
        const width = def.size?.width || 80;
        const height = def.size?.height || 60;
        const cx = width / 2;
        const cy = height / 2;
        const scaleX = inst.uniformScale || inst.physicalScale?.x || 1;
        const scaleY = inst.uniformScale || inst.physicalScale?.y || 1;
        const dx = (pin.x - cx) * scaleX;
        const dy = (pin.y - cy) * scaleY;
        const radians = (inst.rotation || 0) * Math.PI / 180;
        const x = cx + dx * Math.cos(radians) - dy * Math.sin(radians);
        const y = cy + dx * Math.sin(radians) + dy * Math.cos(radians);
        return html`<div class="pin-tooltip visible" style="left:${x}px;top:${y}px">${pin.name}</div>`;
    }

    _getPinClass(pin) {
        const normalizedType = String(pin?.type || '').toUpperCase();
        const normalizedName = String(pin?.name || '').toUpperCase();
        const powerNames = new Set(['VCC', 'VDD', 'VIN', 'V+', 'PWR', 'POWER', '5V', '3.3V']);
        const groundNames = new Set(['GND', 'VSS', 'GND2', 'DGND', 'AGND']);

        if (powerNames.has(normalizedType) || powerNames.has(normalizedName)) return 'power';
        if (groundNames.has(normalizedType) || groundNames.has(normalizedName)) return 'ground';

        const sigs = pin.signals || [];
        for (const sig of sigs) {
            if (sig.signal === 'GND') return 'ground';
            if (sig.signal === 'VCC') return 'power';
        }
        return 'signal';
    }

    _onPinClick(pin) {
        let ok;
        if (store.wiringState) {
            ok = store.completeWiring(this.instanceId, pin.name);
        } else {
            ok = store.startWiring(this.instanceId, pin.name);
        }
        if (ok === false) {
            this._autoWireMsg = { ok: false, text: 'That breadboard hole is already occupied' };
            setTimeout(() => { this._autoWireMsg = null; }, 2800);
        }
    }

    _breadboardPinFromEvent(event) {
        const target = event.composedPath().find(element => element?.dataset?.pin);
        return target ? this._pinInfo.find(pin => pin.name === target.dataset.pin) : null;
    }

    _onBreadboardPinPointerDown(event) {
        if (this._breadboardPinFromEvent(event)) event.stopPropagation();
    }

    _onBreadboardPinClick(event) {
        const pin = this._breadboardPinFromEvent(event);
        if (!pin) return;
        event.stopPropagation();
        this._onPinClick(pin);
    }

    _onClick(e) {
        const path = e.composedPath();
        const isPin = path.some(el => el.classList && el.classList.contains('pin-dot'));
        const isBtn = path.some(el => el.classList && el.classList.contains('action-btn'));
        if (!isPin && !isBtn) {
            store.selectInstance(this.instanceId, e.ctrlKey || e.metaKey);
        }
    }

    _onAutoWire(e) {
        e.stopPropagation();
        const result = autoWireAll({ placeComponents: false, componentIds: [this.instanceId] });

        // Commit auto-wire batch to history
        if (result.status === 'success') {
            let text = `Wired ${result.success} connection${result.success === 1 ? '' : 's'}`;
            this._autoWireMsg = { ok: true, text };
        } else if (result.success > 0) {
            this._autoWireMsg = { ok: false, text: 'Partial: ' + result.errors.join('; ') };
        } else {
            this._autoWireMsg = { ok: false, text: result.errors[0] || 'Auto-wire failed' };
        }

        // Clear toast after animation
        setTimeout(() => { this._autoWireMsg = null; }, 2800);
    }

    _onPointerDown(e) {
        if (e.button !== 0) return; // Only allow left-clicks to drag/select

        const target = e.composedPath()[0];
        if (
            (target && target.classList && target.classList.contains('pin-dot')) ||
            (target && target.classList && target.classList.contains('action-btn')) ||
            (target && target.classList && target.classList.contains('delete-btn')) ||
            (target && target.classList && target.classList.contains('autowire-btn'))
        ) {
            return;
        }

        const inst = store.getInstance(this.instanceId);
        if (!inst) return;

        // Select on mousedown
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl || !store.isInstanceSelected(this.instanceId)) {
            store.selectInstance(this.instanceId, isCtrl);
        }

        this._startX = e.clientX;
        this._startY = e.clientY;
        this._origX = inst.x;
        this._origY = inst.y;

        this.setPointerCapture(e.pointerId);
        this._didDrag = false;

        const scale = store.viewport.scale || 1;

        const onMove = (ev) => {
            if (!this._didDrag && Math.hypot(ev.clientX - this._startX, ev.clientY - this._startY) < 4) return;
            if (!this._didDrag) {
                this._didDrag = true;
                this._dragSnapshot = this._snapshotCircuitState();
                this.classList.add('dragging');
            }
            const dx = (ev.clientX - this._startX) / scale;
            const dy = (ev.clientY - this._startY) / scale;
            this._pendingDrag = { x: this._origX + dx, y: this._origY + dy };
            if (this._dragFrame !== null) return;
            this._dragFrame = requestAnimationFrame(() => {
                this._dragFrame = null;
                const point = this._pendingDrag;
                this._pendingDrag = null;
                if (point) this._moveDragPreview(point);
            });
        };

        const onUp = () => {
            if (this._didDrag) {
                if (this._dragFrame !== null) cancelAnimationFrame(this._dragFrame);
                this._dragFrame = null;
                const point = this._pendingDrag;
                this._pendingDrag = null;
                if (point) this._moveDragPreview(point);
                const wasMounted = Boolean(this._dragSnapshot?.instances
                    .find(instance => instance.id === this.instanceId)?.mountedOn);
                if (tryManualBreadboardPlacement(this.instanceId)) {
                    this._rebuildBreadboardPlan(this._dragSnapshot);
                } else if (wasMounted) {
                    this._restoreCircuitState(this._dragSnapshot);
                    this._autoWireMsg = { ok: false, text: 'Mounted part must stay on a valid breadboard footprint' };
                    setTimeout(() => { this._autoWireMsg = null; }, 2800);
                } else {
                    store.moveInstanceDone(this.instanceId);
                }
            }
            this._dragSnapshot = null;
            this.classList.remove('dragging');
            this.removeEventListener('pointermove', onMove);
            this.removeEventListener('pointerup', onUp);
        };

        this.addEventListener('pointermove', onMove);
        this.addEventListener('pointerup', onUp);
    }

    _moveDragPreview(point) {
        const preview = getBreadboardDragPreview(this.instanceId, point.x, point.y);
        if (!preview) {
            store.moveInstance(this.instanceId, point.x, point.y);
            return;
        }
        const inst = store.getInstance(this.instanceId);
        if (!inst) return;
        inst.rotation = preview.rotation;
        inst.uniformScale = preview.uniformScale;
        delete inst.physicalScale;
        store.moveInstance(this.instanceId, preview.x, preview.y, { snap: false });
    }

    _onDelete(e) {
        e.stopPropagation();
        store.removeInstance(this.instanceId);
    }

    _onRotate(e) {
        e.stopPropagation();
        const instance = store.getInstance(this.instanceId);
        if (!instance?.mountedOn) {
            store.rotateInstance(this.instanceId);
            return;
        }
        const snapshot = this._snapshotCircuitState();
        if (!rotateMountedBreadboardComponent(this.instanceId)) {
            this._autoWireMsg = { ok: false, text: 'No valid rotated footprint fits here' };
            setTimeout(() => { this._autoWireMsg = null; }, 2800);
            return;
        }
        this._rebuildBreadboardPlan(snapshot);
    }

    _snapshotCircuitState() {
        return structuredClone({
            instances: store.instances,
            wires: store.wires,
            physicalPlan: store.physicalPlan,
        });
    }

    _restoreCircuitState(snapshot) {
        if (!snapshot) return;
        store.instances = snapshot.instances;
        store.wires = snapshot.wires;
        store.physicalPlan = snapshot.physicalPlan;
        store._notifyStructural();
    }

    async _rebuildBreadboardPlan(rollbackSnapshot = null) {
        const historyBatch = store.beginHistoryBatch();
        const result = autoWireAll({ placeComponents: true, preserveMountedPlacements: true });
        if (result.status === 'success') {
            await store.cleanupWires();
            store.squashHistorySince(historyBatch);
            return true;
        }
        this._restoreCircuitState(rollbackSnapshot);
        this._autoWireMsg = { ok: false, text: 'Could not route that placement; previous layout restored' };
        setTimeout(() => { this._autoWireMsg = null; }, 2800);
        return false;
    }
}

customElements.define('placed-component', PlacedComponent);
