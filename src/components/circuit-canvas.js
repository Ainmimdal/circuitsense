import { LitElement, html, css, svg } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { store } from '../store.js';
import { wirePath, WIRE_COLORS } from '../utils/wire-path.js';

class CircuitCanvas extends LitElement {
    static properties = {
        _scale: { state: true },
        _panX: { state: true },
        _panY: { state: true },
    };

    static styles = css`
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      background: #121214; /* Match neutral dark */
    }

    .canvas-area {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-image: 
        linear-gradient(to right, #27272a 1px, transparent 1px),
        linear-gradient(to bottom, #27272a 1px, transparent 1px);
      background-size: 20px 20px;
      /* Optional dot grid instead: 
         background-image: radial-gradient(circle, #3f3f46 1px, transparent 1px);
         background-size: 20px 20px;
      */
    }

    .canvas-world {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      transform-origin: 0 0;
    }

    .wire-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 10000px;
      height: 10000px;
      pointer-events: none;
      z-index: 50;
    }

    .wire {
      pointer-events: stroke;
      cursor: pointer;
      transition: stroke-width 0.15s, opacity 0.15s;
    }

    .wire:hover {
      stroke-width: 4 !important;
      filter: brightness(1.3) drop-shadow(0 0 3px currentColor);
    }

    .wire.selected {
      stroke-width: 4 !important;
      filter: brightness(1.5) drop-shadow(0 0 6px currentColor);
    }

    /* Invisible wider hit area for easier wire clicking */
    .wire-hitarea {
      pointer-events: stroke;
      cursor: pointer;
      fill: none;
      stroke: transparent;
    }

    /* Waypoint handles */
    .waypoint-handle {
      cursor: grab;
      pointer-events: all;
      transition: r 0.15s;
    }

    .waypoint-handle:hover {
      r: 6;
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
      z-index: 1;
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
      z-index: 200;
      pointer-events: none;
      animation: pulse-opacity 1.2s ease-in-out infinite;
    }

    @keyframes pulse-opacity {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* Zoom controls */
    .zoom-controls {
      position: absolute;
      bottom: 48px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 200;
    }

    .zoom-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid #3f3f46; /* Zinc 700 */
      background: rgba(39, 39, 42, 0.9); /* Zinc 800 */
      color: #a1a1aa; /* Zinc 400 */
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      backdrop-filter: blur(8px);
    }

    .zoom-btn:hover {
      background: rgba(63, 63, 70, 0.95); /* Zinc 700 */
      color: #fafafa;
      border-color: #52525b; /* Zinc 600 */
    }

    .zoom-label {
      text-align: center;
      font-size: 10px;
      color: #666;
      padding: 2px 0;
      user-select: none;
    }

    .shortcut-hint {
      position: absolute;
      bottom: 48px;
      left: 16px;
      font-size: 11px;
      color: #71717a; /* Zinc 500 */
      z-index: 200;
      pointer-events: none;
      line-height: 1.6;
    }

    .color-picker-panel {
      position: absolute;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(39, 39, 42, 0.95); /* Zinc 800 */
      padding: 10px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      gap: 6px;
      z-index: 100;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }

    .color-swatch {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      transition: transform 0.1s, border-color 0.1s;
    }

    .color-swatch:hover {
      transform: scale(1.1);
    }
    .color-swatch.active {
      border-color: white;
    }
  `;

    constructor() {
        super();
        this._scale = 1;
        this._panX = 0;
        this._panY = 0;

        // Pan state
        this._isPanning = false;
        this._panStartX = 0;
        this._panStartY = 0;
        this._panStartPanX = 0;
        this._panStartPanY = 0;
        this._spaceDown = false;

        // Event handlers
        this._storeHandler = () => this.requestUpdate();
        this._mouseHandler = () => this.requestUpdate();
        this._keyDownHandler = (e) => this._onKeyDown(e);
        this._keyUpHandler = (e) => this._onKeyUp(e);
    }

    connectedCallback() {
        super.connectedCallback();
        store.addEventListener('change', this._storeHandler);
        store.addEventListener('mousemove', this._mouseHandler);
        window.addEventListener('keydown', this._keyDownHandler);
        window.addEventListener('keyup', this._keyUpHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        store.removeEventListener('change', this._storeHandler);
        store.removeEventListener('mousemove', this._mouseHandler);
        window.removeEventListener('keydown', this._keyDownHandler);
        window.removeEventListener('keyup', this._keyUpHandler);
    }

    get _canvasRect() {
        const el = this.shadowRoot && this.shadowRoot.querySelector('.canvas-area');
        return el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    }

    _screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this._panX) / this._scale,
            y: (screenY - this._panY) / this._scale,
        };
    }

    render() {
        const isEmpty = store.instances.length === 0;
        const zoomPct = Math.round(this._scale * 100);

        // Sync viewport to store so other components can convert coords
        store.updateViewport(this._scale, this._panX, this._panY);

        return html`
      <div
        class="canvas-area"
        @dragover=${this._onDragOver}
        @drop=${this._onDrop}
        @pointermove=${this._onPointerMove}
        @pointerdown=${this._onPointerDown}
        @pointerup=${this._onPointerUp}
        @wheel=${this._onWheel}
        @click=${this._onCanvasClick}
        @contextmenu=${(e) => e.preventDefault()}
      >
        <div
          class="canvas-world"
          style="transform: translate(${this._panX}px, ${this._panY}px) scale(${this._scale})"
        >
          ${repeat(store.instances, i => i.id, i => html`
            <placed-component
              .instanceId=${i.id}
              .componentId=${i.componentId}
              style="position: absolute; left: ${i.x}px; top: ${i.y}px; z-index: 10;"
            ></placed-component>
          `)}

          <svg class="wire-layer" width="10000" height="10000">
            ${this._renderWires()}
            ${this._renderTempWire()}
          </svg>
        </div>

        ${isEmpty && this._scale === 1 && this._panX === 0 ? html`
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

        <div class="zoom-controls">
          <button class="zoom-btn" @click=${() => this._zoomTo(this._scale * 1.2)} title="Zoom in">+</button>
          <div class="zoom-label">${zoomPct}%</div>
          <button class="zoom-btn" @click=${() => this._zoomTo(this._scale / 1.2)} title="Zoom out">−</button>
          <button class="zoom-btn" @click=${this._resetView} title="Reset view" style="margin-top: 4px; font-size: 12px;">⌂</button>
        </div>

        <div class="shortcut-hint">
          Scroll to zoom · Middle-drag to pan · Click wire = select · Double-click wire = add bend · Delete = remove
        </div>

        ${store.selectedWireId ? this._renderColorPicker() : ''}
      </div>
    `;
    }

    _renderColorPicker() {
        const wire = store.getWire(store.selectedWireId);
        if (!wire) return svg``;

        return html`
      <div class="color-picker-panel">
        ${WIRE_COLORS.map(color => html`
          <div class="color-swatch ${wire.color === color ? 'active' : ''}"
               style="background-color: ${color}"
               @click=${(e) => { e.stopPropagation(); store.changeWireColor(wire.id, color); }}
               title="Change to ${color}"
          ></div>
        `)}
      </div>
    `;
    }

    // ——— Wire Rendering ————————————————————————————————
    _renderWires() {
        return store.wires.map((wire, index) => {
            const from = store.getPinAbsolutePosition(wire.from.instanceId, wire.from.pinName);
            const to = store.getPinAbsolutePosition(wire.to.instanceId, wire.to.pinName);
            if (!from || !to) return svg``;

            // Get pin exit directions for smart routing
            const exitDir1 = store.getPinExitDirection(wire.from.instanceId, wire.from.pinName);
            const exitDir2 = store.getPinExitDirection(wire.to.instanceId, wire.to.pinName);

            const path = wirePath(from.x, from.y, to.x, to.y, {
                index,
                waypoints: wire.waypoints || [],
                exitDir1,
                exitDir2,
            });
            const color = wire.color || '#4CAF50';
            const isSelected = store.selectedWireId === wire.id;

            return svg`
        <path
          class="wire-hitarea"
          d="${path}"
          stroke-width="${14 / this._scale}"
          @click=${(e) => { e.stopPropagation(); store.selectWire(wire.id); }}
          @dblclick=${(e) => {
            e.stopPropagation();
            const el = this.shadowRoot.querySelector('.canvas-area');
            const rect = el.getBoundingClientRect();
            const world = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            store.addWireWaypoint(wire.id, world.x, world.y);
          }}
        />
        <path
          class="wire ${isSelected ? 'selected' : ''}"
          d="${path}"
          stroke="${color}"
          stroke-width="${2.5 / this._scale}"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          @click=${(e) => { e.stopPropagation(); store.selectWire(wire.id); }}
          @dblclick=${(e) => {
            e.stopPropagation();
            const el = this.shadowRoot.querySelector('.canvas-area');
            const rect = el.getBoundingClientRect();
            const world = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            store.addWireWaypoint(wire.id, world.x, world.y);
          }}
        />
        ${isSelected ? this._renderWaypointHandles(wire, color) : svg``}
      `;
        });
    }

    _renderWaypointHandles(wire, color) {
        const wps = wire.waypoints || [];
        if (wps.length === 0) return svg``;

        return wps.map((wp, i) => svg`
      <circle
        class="waypoint-handle"
        cx="${wp.x}"
        cy="${wp.y}"
        r="${5 / this._scale}"
        fill="${color}"
        stroke="#fff"
        stroke-width="${2 / this._scale}"
        opacity="0.9"
        @pointerdown=${(e) => {
          e.stopPropagation();
          this._startWaypointDrag(e, wire.id, i);
        }}
        @contextmenu=${(e) => {
          e.preventDefault();
          e.stopPropagation();
          store.deleteWireWaypoint(wire.id, i);
        }}
      />
    `);
    }

    _startWaypointDrag(e, wireId, wpIndex) {
        e.preventDefault();
        const el = this.shadowRoot.querySelector('.canvas-area');
        el.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
            const rect = el.getBoundingClientRect();
            const world = this._screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
            store.moveWireWaypoint(wireId, wpIndex, world.x, world.y);
        };

        const onUp = () => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            store.moveWireWaypointDone();
        };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
    }

    _renderTempWire() {
        if (!store.wiringState) return svg``;

        const from = store.getPinAbsolutePosition(
            store.wiringState.instanceId,
            store.wiringState.pinName
        );
        if (!from) return svg``;

        const path = wirePath(from.x, from.y, store.mousePos.x, store.mousePos.y, { style: 'smooth' });

        return svg`
      <path
        class="temp-wire"
        d="${path}"
        stroke="#4FC3F7"
        stroke-width="${2 / this._scale}"
        fill="none"
        stroke-linecap="round"
        opacity="0.7"
      />
    `;
    }

    // ——— Zoom ——————————————————————————————————————————
    _onWheel(e) {
        e.preventDefault();
        const rect = this._canvasRect;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // World position under mouse before zoom
        const worldX = (mouseX - this._panX) / this._scale;
        const worldY = (mouseY - this._panY) / this._scale;

        // Determine zoom direction
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.15, Math.min(4, this._scale * factor));

        // Adjust pan so world position stays under mouse
        this._panX = mouseX - worldX * newScale;
        this._panY = mouseY - worldY * newScale;
        this._scale = newScale;
    }

    _zoomTo(newScale) {
        const rect = this._canvasRect;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const worldX = (centerX - this._panX) / this._scale;
        const worldY = (centerY - this._panY) / this._scale;

        const clamped = Math.max(0.15, Math.min(4, newScale));
        this._panX = centerX - worldX * clamped;
        this._panY = centerY - worldY * clamped;
        this._scale = clamped;
    }

    _resetView() {
        this._scale = 1;
        this._panX = 0;
        this._panY = 0;
    }

    // ——— Pan ———————————————————————————————————————————
    _onPointerDown(e) {
        // Middle mouse button or Space + left click → pan
        if (e.button === 1 || (this._spaceDown && e.button === 0)) {
            e.preventDefault();
            this._isPanning = true;
            this._panStartX = e.clientX;
            this._panStartY = e.clientY;
            this._panStartPanX = this._panX;
            this._panStartPanY = this._panY;

            const el = this.shadowRoot.querySelector('.canvas-area');
            el.setPointerCapture(e.pointerId);
            el.style.cursor = 'grabbing';
        }
    }

    _onPointerMove(e) {
        if (this._isPanning) {
            this._panX = this._panStartPanX + (e.clientX - this._panStartX);
            this._panY = this._panStartPanY + (e.clientY - this._panStartY);
            this.requestUpdate();
            return;
        }

        // Update mouse position for temp wire (convert to world coords)
        if (store.wiringState) {
            const rect = this._canvasRect;
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const world = this._screenToWorld(screenX, screenY);
            store.updateMousePos(world.x, world.y);
        }
    }

    _onPointerUp(e) {
        if (this._isPanning) {
            this._isPanning = false;
            const el = this.shadowRoot.querySelector('.canvas-area');
            el.releasePointerCapture(e.pointerId);
            el.style.cursor = '';
        }
    }

    // ——— Drag & Drop from sidebar ———————————————————————
    _onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }

    _onDrop(e) {
        e.preventDefault();
        const componentId = e.dataTransfer.getData('text/plain');
        if (!componentId) return;

        const rect = this._canvasRect;
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this._screenToWorld(screenX, screenY);

        store.addInstance(componentId, world.x, world.y);
    }

    // ——— Canvas Click ——————————————————————————————————
    _onCanvasClick(e) {
        // Cancel wiring if clicking empty canvas
        if (store.wiringState) {
            const path = e.composedPath();
            const isPin = path.some(el => el.classList && el.classList.contains('pin-dot'));
            if (!isPin) {
                store.cancelWiring();
            }
        } else {
            // Clicking empty canvas clears selection
            const path = e.composedPath();
            const isComponent = path.some(el => el.tagName && el.tagName.toLowerCase() === 'placed-component');
            const isWire = path.some(el => el.classList && (el.classList.contains('wire') || el.classList.contains('wire-hitarea')));
            if (!isComponent && !isWire) {
                store.clearSelection();
            }
        }
    }

    // ——— Keyboard ——————————————————————————————————————
    _onKeyDown(e) {
        // Don't capture when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Escape' && store.wiringState) {
            store.cancelWiring();
            e.preventDefault();
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && (store.selectedInstanceId || store.selectedWireId)) {
            store.deleteSelected();
            e.preventDefault();
        }

        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            store.undo();
            e.preventDefault();
        }

        if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
            (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
            store.redo();
            e.preventDefault();
        }

        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            store._saveToStorage();
            e.preventDefault();
        }

        if (e.key === ' ') {
            this._spaceDown = true;
            e.preventDefault();
        }
    }

    _onKeyUp(e) {
        if (e.key === ' ') {
            this._spaceDown = false;
        }
    }
}

customElements.define('circuit-canvas', CircuitCanvas);