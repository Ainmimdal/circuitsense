import { LitElement, html, css, svg } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { store } from '../store.js';
import { wirePath, getWireColor } from '../utils/wire-path.js';

class CircuitCanvas extends LitElement {
    static styles = css `
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      background: #12121f;
      background-image: radial-gradient(circle, #1a1a30 1px, transparent 1px);
      background-size: 20px 20px;
    }

    .canvas-area {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .wire-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 5;
    }

    .wire {
      pointer-events: stroke;
      cursor: pointer;
      transition: stroke-width 0.15s;
    }

    .wire:hover {
      stroke-width: 4.5 !important;
      filter: brightness(1.4) drop-shadow(0 0 4px currentColor);
    }

    .temp-wire {
      stroke-dasharray: 8 4;
      animation: dash 0.5s linear infinite;
    }

    @keyframes dash {
      to { stroke-dashoffset: -12; }
    }

    .drop-hint {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #2a2a40;
      font-size: 16px;
      pointer-events: none;
      text-align: center;
    }

    .drop-hint .icon {
      font-size: 48px;
      display: block;
      margin-bottom: 12px;
    }

    .wiring-indicator {
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(255, 152, 0, 0.9);
      color: #000;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      z-index: 50;
      pointer-events: none;
      animation: pulse-opacity 1.2s ease-in-out infinite;
    }

    @keyframes pulse-opacity {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
  `;

    constructor() {
        super();
        this._storeHandler = () => this.requestUpdate();
        this._mouseHandler = () => this.requestUpdate();
        this._keyHandler = (e) => {
            if (e.key === 'Escape' && store.wiringState) {
                store.cancelWiring();
            }
        };
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('change', this._storeHandler);
        store.addEventListener('mousemove', this._mouseHandler);
        window.addEventListener('keydown', this._keyHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        store.removeEventListener('change', this._storeHandler);
        store.removeEventListener('mousemove', this._mouseHandler);
        window.removeEventListener('keydown', this._keyHandler);
    }

    render() {
            const isEmpty = store.instances.length === 0;

            return html `
      <div
        class="canvas-area"
        @dragover=${this._onDragOver}
        @drop=${this._onDrop}
        @pointermove=${this._onPointerMove}
        @click=${this._onCanvasClick}
      >
        ${isEmpty ? html`
          <div class="drop-hint">
            <span class="icon">⚡</span>
            Drag components from the sidebar to get started
          </div>
        ` : ''}

        ${store.wiringState ? html`
          <div class="wiring-indicator">
            🔌 Click another pin to connect · ESC to cancel
          </div>
        ` : ''}

        ${repeat(store.instances, i => i.id, i => html`
          <placed-component
            .instanceId=${i.id}
            .componentId=${i.componentId}
            style="position: absolute; left: ${i.x}px; top: ${i.y}px; z-index: 10;"
          ></placed-component>
        `)}

        <svg class="wire-layer" width="100%" height="100%">
          ${this._renderWires()}
          ${this._renderTempWire()}
        </svg>
      </div>
    `;
  }

  _renderWires() {
    return store.wires.map(wire => {
      const from = store.getPinAbsolutePosition(wire.from.instanceId, wire.from.pinName);
      const to = store.getPinAbsolutePosition(wire.to.instanceId, wire.to.pinName);
      if (!from || !to) return svg``;

      const path = wirePath(from.x, from.y, to.x, to.y);
      const signals = store.getPinSignals(wire.from.instanceId, wire.from.pinName);
      const color = getWireColor(signals);

      return svg`
        <path
          class="wire"
          d="${path}"
          stroke="${color}"
          stroke-width="2.5"
          fill="none"
          stroke-linecap="round"
          @click=${(e) => { e.stopPropagation(); store.removeWire(wire.id); }}
        />
      `;
    });
  }

  _renderTempWire() {
    if (!store.wiringState) return svg``;

    const from = store.getPinAbsolutePosition(
      store.wiringState.instanceId,
      store.wiringState.pinName
    );
    if (!from) return svg``;

    const path = wirePath(from.x, from.y, store.mousePos.x, store.mousePos.y);

    return svg`
      <path
        class="temp-wire"
        d="${path}"
        stroke="#4FC3F7"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
        opacity="0.7"
      />
    `;
  }

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  _onDrop(e) {
    e.preventDefault();
    const componentId = e.dataTransfer.getData('text/plain');
    if (!componentId) return;

    const rect = this.shadowRoot.querySelector('.canvas-area').getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    store.addInstance(componentId, x, y);
  }

  _onPointerMove(e) {
    if (store.wiringState) {
      const rect = this.shadowRoot.querySelector('.canvas-area').getBoundingClientRect();
      store.updateMousePos(e.clientX - rect.left, e.clientY - rect.top);
    }
  }

  _onCanvasClick(e) {
    // Cancel wiring if clicking empty canvas
    if (store.wiringState) {
      const target = e.composedPath()[0];
      const isPin = target?.classList?.contains('pin-dot');
      if (!isPin) {
        store.cancelWiring();
      }
    }
  }
}

customElements.define('circuit-canvas', CircuitCanvas);