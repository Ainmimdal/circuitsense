import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { componentLibrary, getComponentDef } from '../component-library.js';
import { store } from '../store.js';
import { autoWire } from '../services/auto-wire-engine.js';

class PlacedComponent extends LitElement {
    static properties = {
        instanceId: { type: String },
        componentId: { type: String },
        _pinInfo: { state: true },
        _autoWireMsg: { state: true },
    };

    static styles = css `
    :host {
      display: inline-block;
      cursor: grab;
      user-select: none;
    }

    :host(.dragging) {
      cursor: grabbing;
      z-index: 1000 !important;
      filter: drop-shadow(0 6px 20px rgba(0, 0, 0, 0.5));
    }

    .wrapper {
      position: relative;
      display: inline-block;
    }

    .wokwi-container {
      pointer-events: none;
    }

    /* Pin dots overlaid on component */
    .pin-dot {
      position: absolute;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: #4CAF50;
      border: 2px solid rgba(255, 255, 255, 0.9);
      transform: translate(-50%, -50%);
      cursor: crosshair;
      z-index: 20;
      pointer-events: all;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .pin-dot:hover {
      transform: translate(-50%, -50%) scale(1.6);
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.4);
    }

    .pin-dot.active {
      background: #FF9800 !important;
      transform: translate(-50%, -50%) scale(1.6);
      box-shadow: 0 0 14px rgba(255, 152, 0, 0.8);
      animation: pin-pulse 1s infinite;
    }

    .pin-dot.power {
      background: #F44336;
    }

    .pin-dot.ground {
      background: #555;
      border-color: #aaa;
    }

    .pin-dot.signal {
      background: #4CAF50;
    }

    @keyframes pin-pulse {
      0%, 100% { box-shadow: 0 0 8px rgba(255, 152, 0, 0.6); }
      50% { box-shadow: 0 0 18px rgba(255, 152, 0, 0.9); }
    }

    /* Tooltip shown on pin hover */
    .pin-tooltip {
      position: absolute;
      transform: translate(-50%, -100%);
      margin-top: -8px;
      background: rgba(40, 40, 60, 0.95);
      color: #fff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 30;
    }

    .pin-dot:hover ~ .pin-tooltip[data-for],
    .pin-dot:hover + .pin-tooltip {
      opacity: 1;
    }

    /* Action buttons toolbar */
    .action-bar {
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      gap: 4px;
      z-index: 30;
      pointer-events: all;
    }

    :host(:hover) .action-bar {
      display: flex;
    }

    .action-btn {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: 1px solid #333;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      transition: all 0.15s;
    }

    .action-btn:hover {
      transform: scale(1.15);
    }

    .delete-btn {
      background: #E53935;
      color: white;
      border-color: #C62828;
    }

    .delete-btn:hover {
      background: #FF1744;
    }

    .autowire-btn {
      background: #1E88E5;
      color: white;
      border-color: #1565C0;
    }

    .autowire-btn:hover {
      background: #42A5F5;
    }

    /* Auto-wire toast */
    .autowire-toast {
      position: absolute;
      top: -54px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30, 136, 229, 0.95);
      color: white;
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 10px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 40;
      animation: toast-fade 2s ease forwards;
    }

    .autowire-toast.error {
      background: rgba(229, 57, 53, 0.95);
    }

    @keyframes toast-fade {
      0% { opacity: 1; transform: translateX(-50%) translateY(0); }
      70% { opacity: 1; }
      100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }
  `;

    constructor() {
        super();
        this._pinInfo = [];
        this._autoWireMsg = null;
        this._storeHandler = () => this.requestUpdate();
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('change', this._storeHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        store.removeEventListener('change', this._storeHandler);
    }

    firstUpdated() {
        this._readPinInfo();
    }

    _readPinInfo(retries = 5) {
        const container = this.shadowRoot && this.shadowRoot.querySelector('.wokwi-container');
        if (!container) return;

        const wokwiEl = container.children[0];
        if (wokwiEl && wokwiEl.pinInfo) {
            this._pinInfo = [...wokwiEl.pinInfo];
            store.registerPinInfo(this.instanceId, this._pinInfo);
            this.requestUpdate();
        } else if (retries > 0) {
            requestAnimationFrame(() => this._readPinInfo(retries - 1));
        }
    }

    render() {
            const def = getComponentDef(this.componentId);
            if (!def) return html `<div style="color:red;">Unknown: ${this.componentId}</div>`;

            const attrs = Object.entries(def.attrs || {})
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ');
            const tagHtml = `<${def.tag} ${attrs}></${def.tag}>`;

            const showAutoWire = !def.isBoard && !def.isPassive && def.autoWire;

            return html `
      <div class="wrapper" @pointerdown=${this._onPointerDown}>
        <div class="action-bar">
          ${showAutoWire ? html`
            <button class="action-btn autowire-btn"
              @click=${this._onAutoWire}
              title="Auto-wire to Arduino">⚡</button>
          ` : ''}
          <button class="action-btn delete-btn"
            @click=${this._onDelete}
            title="Remove component">\u00D7</button>
        </div>

        ${this._autoWireMsg ? html`
          <div class="autowire-toast ${this._autoWireMsg.ok ? '' : 'error'}">
            ${this._autoWireMsg.text}
          </div>
        ` : ''}

        <div class="wokwi-container">
          ${unsafeHTML(tagHtml)}
        </div>
        ${this._pinInfo.map(pin => this._renderPin(pin))}
      </div>
    `;
    }

    _renderPin(pin) {
        const isActive =
            store.wiringState && store.wiringState.instanceId === this.instanceId &&
            store.wiringState && store.wiringState.pinName === pin.name;

        const pinClass = this._getPinClass(pin);

        return html`
      <div
        class="pin-dot ${pinClass} ${isActive ? 'active' : ''}"
        style="left: ${pin.x}px; top: ${pin.y}px;"
        title="${pin.name}"
        @pointerdown=${(e) => e.stopPropagation()}
        @click=${(e) => {
            e.stopPropagation();
            this._onPinClick(pin);
        }}
      ></div>
      <div
        class="pin-tooltip"
        style="left: ${pin.x}px; top: ${pin.y}px;"
      >
        ${pin.name}
      </div>
    `;
    }

    _getPinClass(pin) {
        const sigs = pin.signals || [];
        for (const sig of sigs) {
            if (sig.signal === 'GND') return 'ground';
            if (sig.signal === 'VCC') return 'power';
        }
        return 'signal';
    }

    _onPinClick(pin) {
        if (store.wiringState) {
            store.completeWiring(this.instanceId, pin.name);
        } else {
            store.startWiring(this.instanceId, pin.name);
        }
    }

    _onAutoWire(e) {
        e.stopPropagation();
        const result = autoWire(this.instanceId);

        if (result.success) {
            this._autoWireMsg = { ok: true, text: '\u2713 Wired: ' + result.wired.join(', ') };
        } else if (result.wired.length > 0) {
            this._autoWireMsg = { ok: false, text: 'Partial: ' + result.errors.join('; ') };
        } else {
            this._autoWireMsg = { ok: false, text: result.errors[0] || 'Auto-wire failed' };
        }

        // Clear toast after animation
        setTimeout(() => { this._autoWireMsg = null; }, 2200);
    }

    _onPointerDown(e) {
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

        this._startX = e.clientX;
        this._startY = e.clientY;
        this._origX = inst.x;
        this._origY = inst.y;

        this.classList.add('dragging');
        this.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
            store.moveInstance(
                this.instanceId,
                this._origX + ev.clientX - this._startX,
                this._origY + ev.clientY - this._startY
            );
        };

        const onUp = () => {
            this.classList.remove('dragging');
            this.removeEventListener('pointermove', onMove);
            this.removeEventListener('pointerup', onUp);
        };

        this.addEventListener('pointermove', onMove);
        this.addEventListener('pointerup', onUp);
    }

    _onDelete(e) {
        e.stopPropagation();
        store.removeInstance(this.instanceId);
    }
}

customElements.define('placed-component', PlacedComponent);