import { LitElement, html, css } from 'lit';
import Konva from 'konva';

import { componentLibrary } from '../component-library.js';
import { calibratePhysicalPinInfo, getComponentGeometry } from '../core/component-geometry.js';
import { physicalCircuitStore } from '../physical/circuit-store.js';
import { InteractionController } from '../editor/interaction-controller.js';
import { addComponentCommand, deleteComponentCommand, deleteSurfaceCommand, deleteWireCommand } from '../physical/commands.js';
import { createComponentInstance, componentPinRef, componentWorldTransform, resolveConnectionWorldPoint, surfaceHoleRef } from '../physical/model.js';
import { calibrateFreeComponentFootprint, defaultFootprintForComponent, getFootprintDefinition, getPhysicalComponentDefinition, projectFootprintPoint } from '../physical/footprints.js';
import { getSurfaceDefinition, holeWorldPosition, holesInElectricalGroup, nearestHole } from '../physical/breadboard.js';
import { applyTransform, screenToWorld } from '../physical/geometry.js';
import { pinExitDirection } from '../physical/routing.js';
import { editableWirePoints, insertWireWaypoint, moveWireRouteEndpoints, moveWireSegment, moveWireWaypoint, removeWireWaypoint } from '../physical/wire-edit.js';
import { inspectWireNet } from '../physical/net-inspector.js';
import { faIcon } from '../utils/fa-icons.js';

const CAMERA = Object.freeze({ pixelsPerMillimetre: 5.2, minZoom: 0.42, maxZoom: 2.5 });
Konva.dragButtons = [0];

function isPrimaryPointer(event) {
    const button = event?.evt?.button;
    return button === undefined || button === 0;
}

class CircuitCanvas extends LitElement {
    static properties = {
        _status: { state: true },
        _zoomLabel: { state: true },
    };

    static styles = css`
        :host {
            display: block;
            position: relative;
            min-width: 0;
            min-height: 0;
            overflow: hidden;
            background: var(--ink);
            user-select: none;
        }

        .workspace,
        .stage-host,
        .component-visual-layer {
            position: absolute;
            inset: 0;
        }

        .workspace { isolation: isolate; }
        .workspace::before {
            content: '';
            position: absolute;
            inset: 6px;
            z-index: 19;
            pointer-events: none;
            border: 1px solid var(--panel-border);
            border-radius: 4px;
            box-shadow: inset 0 0 24px color-mix(in srgb, var(--panel-border) 32%, transparent);
        }
        .stage-host { touch-action: none; }

        .component-visual-layer {
            z-index: 4;
            overflow: hidden;
            pointer-events: none;
        }

        .component-visual {
            position: absolute;
            left: 0;
            top: 0;
            width: 0;
            height: 0;
            transform-origin: 0 0;
            pointer-events: none;
        }

        .component-artwork {
            position: absolute;
            left: 0;
            top: 0;
            display: block;
            transform-origin: 0 0;
            pointer-events: none !important;
            user-select: none;
        }

        .component-visual.selected .component-artwork {
            filter: drop-shadow(0 0 5px var(--primary-hover)) drop-shadow(0 0 1px var(--text));
        }

        .visual-terminal {
            position: absolute;
            left: 0;
            top: 0;
            z-index: 2;
            width: 7px;
            height: 7px;
            border: 1.5px solid var(--primary-hover);
            border-radius: 50%;
            background: var(--text);
            box-shadow: 0 0 0 1px var(--primary);
            transform-origin: center;
            pointer-events: none;
        }

        .dom-dip {
            display: grid;
            place-items: center;
            border: 2px solid var(--panel-border);
            border-radius: 6px;
            background: var(--ink);
            color: var(--text);
            font: 700 13px var(--font-ui, 'Public Sans', sans-serif);
            box-shadow: inset 0 0 0 2px var(--ink);
        }

        .mode-pill,
        .help,
        .zoom-controls,
        .legend,
        .net-inspector {
            position: absolute;
            z-index: 20;
            pointer-events: none;
            color: var(--text);
            background: var(--panel);
            border: 1px solid var(--panel-border);
            border-radius: 4px;
            box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 70%, transparent);
            font-family: var(--font-ui, 'Public Sans', sans-serif);
        }

        .mode-pill {
            top: 14px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 10px;
            font-size: 10px;
            max-width: min(620px, 70%);
            text-align: center;
        }

        .mode-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .help {
            left: 14px;
            bottom: 50px;
            width: min(430px, calc(100% - 28px));
            padding: 10px 12px;
            font-size: 10px;
            line-height: 1.6;
        }

        .legend {
            right: 14px;
            bottom: 50px;
            padding: 9px 11px;
            font-size: 10px;
            line-height: 1.55;
        }

        .legend span { display: inline-flex; align-items: center; gap: 6px; margin-left: 9px; }
        .legend i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .legend .valid-dot { background: var(--accent-sensors); }
        .legend .strip-dot { background: var(--accent-breadboards); }

        .net-inspector {
            right: 14px;
            top: 62px;
            width: min(260px, calc(100% - 28px));
            padding: 10px 11px;
            pointer-events: auto;
            font: 11px/1.4 var(--font-ui, 'Public Sans', sans-serif);
        }

        .net-inspector header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .net-inspector strong { color: var(--text); font: 11px/1 var(--font-tech, '0xProto', monospace); }
        .net-inspector small { color: var(--text-muted); }
        .net-pins { margin-top: 7px; display: grid; gap: 4px; }
        .net-pin { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding-top: 5px; border-top: 1px solid var(--panel-border); }
        .net-part { min-width: 0; display: flex; flex-direction: column; }
        .net-part span { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .net-part small { color: var(--text-muted); font: 8px/1.2 var(--font-tech, '0xProto', monospace); }
        .net-pin code { color: var(--text); font: 10px/1.2 var(--font-tech, '0xProto', monospace); }

        .zoom-controls {
            right: 14px;
            top: 14px;
            padding: 6px;
            display: flex;
            align-items: center;
            gap: 5px;
            pointer-events: auto;
        }

        .zoom-controls button {
            width: 34px;
            height: 34px;
            border: 0;
            border: 1px solid var(--panel-border);
            border-radius: 4px;
            background: var(--panel);
            color: var(--text);
            cursor: pointer;
            font: 600 14px var(--font-ui, 'Public Sans', sans-serif);
        }

        .zoom-controls button:hover { background: var(--primary); border-color: var(--primary-hover); }
        .zoom-controls output { width: 42px; height: 34px; display: grid; place-items: center; text-align: center; color: var(--text-muted); font: 10px/1 var(--font-tech, '0xProto', monospace); }

        .workspace.drag-over::after {
            content: 'Drop to place component';
            position: absolute;
            inset: 10px;
            z-index: 6;
            display: grid;
            place-items: center;
            border: 2px dashed var(--primary-hover);
            color: var(--text);
            background: color-mix(in srgb, var(--primary) 18%, transparent);
            pointer-events: none;
            font: 600 13px var(--font-ui, 'Public Sans', sans-serif);
        }

        @media (max-width: 900px) {
            .mode-pill { top: 10px; max-width: calc(100% - 150px); }
            .zoom-controls { top: 10px; right: 10px; }
            .zoom-controls button { width: 34px; height: 34px; }
            .zoom-controls output { display: none; }
            .net-inspector {
                position: absolute;
                inset: auto 10px 70px 10px;
                width: auto;
                max-height: 34vh;
                overflow: auto;
            }
            .help { display: none; }
            .legend { right: 10px; bottom: 46px; }
        }
    `;

    constructor() {
        super();
        this.store = physicalCircuitStore;
        this.interaction = new InteractionController(this.store);
        this.camera = { pixelsPerMillimetre: CAMERA.pixelsPerMillimetre, zoom: 1, panX: 36, panY: 28 };
        this._zoomLabel = '100%';
        this._status = 'Drag a component onto the canvas to begin';
        this._hoveredHole = null;
        this._hoveredTerminalRef = null;
        this._selectedComponentId = null;
        this._selectedWireId = null;
        this._selectedSurfaceId = null;
        this._lastPointerWorld = { x: 0, y: 0 };
        this._panning = null;
        this._dragOver = false;
        this._pendingPinCalibration = new Set();
        this._storeHandler = event => {
            if (event.detail?.routesOnly) {
                this._renderWires();
                this._renderInteractionLayer();
                return;
            }
            this._renderScene();
        };
        this._interactionHandler = () => this._renderInteractionLayer();
        this._keyHandler = event => this._onKeyDown(event);
        this._physicalAddHandler = event => this._quickAddPhysical(event.detail?.componentId);
        this._physicalSelectHandler = event => {
            const componentId = event.detail?.componentId;
            if (!this.store.project.components.some(component => component.id === componentId)) return;
            this._selectedComponentId = componentId;
            this._deselectWire();
            this._selectedSurfaceId = null;
            this._renderComponents();
        };
    }

    render() {
        const net = this._selectedNetView();
        const showStatus = this.store.project.components.length === 0
            || this.interaction.state?.type !== 'idle'
            || this._dragOver
            || this._selectedComponentId
            || this._selectedWireId
            || this._selectedSurfaceId;
        return html`
            <div class="workspace ${this._dragOver ? 'drag-over' : ''}"
                @dragover=${this._onDragOver}
                @dragleave=${this._onDragLeave}
                @drop=${this._onDrop}>
                <div class="stage-host"></div>
                <div class="component-visual-layer" aria-hidden="true"></div>
                ${showStatus ? html`<div class="mode-pill"><span>${this._status}</span></div>` : ''}
                <div class="zoom-controls" @pointerdown=${event => event.stopPropagation()} aria-label="Canvas zoom controls">
                    <button @click=${() => this._zoomBy(1.2)} title="Zoom in" aria-label="Zoom in">${faIcon('plus')}</button>
                    <output>${this._zoomLabel}</output>
                    <button @click=${() => this._zoomBy(1 / 1.2)} title="Zoom out" aria-label="Zoom out">${faIcon('minus')}</button>
                    <button @click=${this._resetCamera} title="Fit canvas" aria-label="Fit canvas">${faIcon('focus')}</button>
                </div>
                ${net ? html`
                    <section class="net-inspector" aria-label="Selected electrical net">
                        <header>
                            <strong>${net.label}</strong>
                            <small>${net.wireCount} ${net.wireCount === 1 ? 'wire' : 'wires'}</small>
                        </header>
                        <div class="net-pins">
                            ${net.terminals.map(terminal => html`
                                <div class="net-pin">
                                    <div class="net-part" title=${`${terminal.componentName} ${terminal.componentRef}`}>
                                        <span>${terminal.componentName}</span>
                                        <small>${terminal.componentRef}</small>
                                    </div>
                                    <code>${terminal.pinId}</code>
                                </div>
                            `)}
                            ${net.terminals.length ? '' : html`<small>No component pins found on this net.</small>`}
                        </div>
                    </section>
                ` : ''}
                <div class="help">
                    Drag parts onto empty space. Breadboard parts snap to valid holes.<br>
                    To wire, click a pin, add corners in empty space, then click another pin.<br>
                    Press Delete to remove a selection. Use the wheel to zoom.
                </div>
                <div class="legend">
                    <span><i class="valid-dot"></i>Valid connection</span>
                    <span><i class="strip-dot"></i>Connected strip</span>
                </div>
            </div>
        `;
    }

    firstUpdated() {
        const container = this.shadowRoot.querySelector('.stage-host');
        this.visualLayer = this.shadowRoot.querySelector('.component-visual-layer');
        this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
        this.backgroundLayer = new Konva.Layer({ listening: false });
        this.boardLayer = new Konva.Layer();
        this.wireLayer = new Konva.Layer();
        this.componentLayer = new Konva.Layer();
        this.interactionLayer = new Konva.Layer({ listening: false });
        this.stage.add(this.backgroundLayer, this.boardLayer, this.componentLayer, this.wireLayer, this.interactionLayer);
        this._setLayerDepth(this.backgroundLayer, 0);
        this._setLayerDepth(this.boardLayer, 1);
        this._setLayerDepth(this.componentLayer, 3);
        this._setLayerDepth(this.wireLayer, 5);
        this._setLayerDepth(this.interactionLayer, 6);
        Konva.dragDistance = 4;

        this.stage.on('wheel', event => this._onWheel(event));
        this.stage.on('mousemove touchmove', event => this._onStageMove(event));
        this.stage.on('mousedown touchstart', event => this._onStageDown(event));
        this.stage.on('mouseup touchend', () => { this._panning = null; });
        this.stage.on('mouseleave', () => { this._panning = null; });
        this.stage.on('click tap', event => this._onStageClick(event));

        this._resizeObserver = new ResizeObserver(() => this._resizeStage());
        this._resizeObserver.observe(container);
        this.store.addEventListener('change', this._storeHandler);
        this.interaction.addEventListener('change', this._interactionHandler);
        window.addEventListener('keydown', this._keyHandler);
        window.addEventListener('elera-add-physical-component', this._physicalAddHandler);
        window.addEventListener('elera-select-physical-component', this._physicalSelectHandler);
        this._renderScene();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._resizeObserver?.disconnect();
        this.store.removeEventListener('change', this._storeHandler);
        this.interaction.removeEventListener('change', this._interactionHandler);
        window.removeEventListener('keydown', this._keyHandler);
        window.removeEventListener('elera-add-physical-component', this._physicalAddHandler);
        window.removeEventListener('elera-select-physical-component', this._physicalSelectHandler);
        this.stage?.destroy();
    }

    _resizeStage() {
        const container = this.shadowRoot.querySelector('.stage-host');
        if (!container || !this.stage) return;
        this.stage.size({ width: container.clientWidth, height: container.clientHeight });
        this._renderBackground();
    }

    _setLayerDepth(layer, depth) {
        const canvas = layer?.getCanvas?.()?._canvas;
        if (canvas) canvas.style.zIndex = String(depth);
    }

    _applyCamera() {
        const scale = this.camera.pixelsPerMillimetre * this.camera.zoom;
        for (const layer of [this.boardLayer, this.wireLayer, this.componentLayer, this.interactionLayer]) {
            layer.position({ x: this.camera.panX, y: this.camera.panY });
            layer.scale({ x: scale, y: scale });
        }
        this._zoomLabel = `${Math.round(this.camera.zoom * 100)}%`;
        this._renderBackground();
        this._positionComponentVisuals();
        this.requestUpdate();
    }

    _pointerWorld() {
        const pointer = this.stage?.getPointerPosition();
        return pointer ? screenToWorld(pointer, this.camera) : this._lastPointerWorld;
    }

    _themeColor(token) {
        return getComputedStyle(this).getPropertyValue(token).trim();
    }

    _renderScene() {
        if (!this.stage) return;
        this._applyCamera();
        this._renderBoards();
        this._renderWires();
        this._renderComponents();
        this._renderInteractionLayer();
    }

    _renderBackground() {
        if (!this.backgroundLayer || !this.stage) return;
        this.backgroundLayer.destroyChildren();
        const editorStyles = getComputedStyle(this);
        const ink = editorStyles.getPropertyValue('--ink').trim();
        const panelBorder = editorStyles.getPropertyValue('--panel-border').trim();
        this.backgroundLayer.add(new Konva.Rect({
            x: 0, y: 0, width: this.stage.width(), height: this.stage.height(), fill: ink, listening: false,
        }));
        const spacing = 2.54 * this.camera.pixelsPerMillimetre * this.camera.zoom;
        if (spacing >= 6) {
            this.backgroundLayer.add(new Konva.Shape({
                listening: false,
                sceneFunc: (context, shape) => {
                    context.beginPath();
                    const startX = ((this.camera.panX % spacing) + spacing) % spacing;
                    const startY = ((this.camera.panY % spacing) + spacing) % spacing;
                    for (let x = startX; x < this.stage.width(); x += spacing) {
                        for (let y = startY; y < this.stage.height(); y += spacing) {
                            context.moveTo(x + .7, y);
                            context.arc(x, y, .7, 0, Math.PI * 2);
                        }
                    }
                    context.fillStrokeShape(shape);
                },
                fill: panelBorder,
                opacity: .72,
            }));
            const majorSpacing = spacing * 5;
            this.backgroundLayer.add(new Konva.Shape({
                listening: false,
                sceneFunc: (context, shape) => {
                    context.beginPath();
                    const startX = ((this.camera.panX % majorSpacing) + majorSpacing) % majorSpacing;
                    const startY = ((this.camera.panY % majorSpacing) + majorSpacing) % majorSpacing;
                    for (let x = startX; x < this.stage.width(); x += majorSpacing) {
                        for (let y = startY; y < this.stage.height(); y += majorSpacing) {
                            context.moveTo(x + 1.15, y);
                            context.arc(x, y, 1.15, 0, Math.PI * 2);
                        }
                    }
                    context.fillStrokeShape(shape);
                },
                fill: panelBorder,
            }));
        }
        this.backgroundLayer.batchDraw();
    }

    _renderBoards() {
        this.boardLayer.destroyChildren();
        for (const surface of this.store.project.surfaces) {
            const definition = getSurfaceDefinition(surface);
            if (!definition) continue;
            const group = new Konva.Group({
                id: `surface:${surface.id}`,
                name: 'placement-surface',
                x: surface.transform.x,
                y: surface.transform.y,
                rotation: surface.transform.rotation || 0,
                draggable: true,
            });
            group.setAttr('surfaceId', surface.id);
            const rowA = definition.getHole('A1').y;
            const rowE = definition.getHole('E1').y;
            const rowF = definition.getHole('F1').y;
            const rowJ = definition.getHole('J1').y;
            const trenchTop = rowE + 1.25;
            const trenchBottom = rowF - 1.25;
            group.add(new Konva.Rect({
                name: 'board-body', x: 0, y: 0, width: definition.width, height: definition.height,
                cornerRadius: 2.2, fill: '#e4e4e7',
                stroke: surface.id === this._selectedSurfaceId ? this._themeColor('--primary-hover') : '#a1a1aa',
                strokeWidth: surface.id === this._selectedSurfaceId ? .8 : .35,
                shadowColor: '#000', shadowBlur: 2.2, shadowOffsetY: 1.1, shadowOpacity: .34,
            }));
            group.add(new Konva.Rect({ x: 2.8, y: rowA - 2.3, width: definition.width - 5.6, height: rowJ - rowA + 4.6, fill: '#f4f4f5', cornerRadius: 1.2, listening: false }));
            group.add(new Konva.Rect({ x: 2.8, y: trenchTop, width: definition.width - 5.6, height: trenchBottom - trenchTop, fill: '#d4d4d8', listening: false }));
            group.add(new Konva.Line({ points: [5, definition.getHole('TP1').y, definition.width - 5, definition.getHole('TP1').y], stroke: '#ef4444', strokeWidth: .28, listening: false }));
            group.add(new Konva.Line({ points: [5, definition.getHole('TN1').y, definition.width - 5, definition.getHole('TN1').y], stroke: this._themeColor('--accent-breadboards'), strokeWidth: .28, listening: false }));
            group.add(new Konva.Line({ points: [5, definition.getHole('BP1').y, definition.width - 5, definition.getHole('BP1').y], stroke: '#ef4444', strokeWidth: .28, listening: false }));
            group.add(new Konva.Line({ points: [5, definition.getHole('BN1').y, definition.width - 5, definition.getHole('BN1').y], stroke: this._themeColor('--accent-breadboards'), strokeWidth: .28, listening: false }));
            group.add(new Konva.Shape({
                listening: false,
                sceneFunc: (context, shape) => {
                    for (const hole of definition.holes) {
                        context.beginPath();
                        context.arc(hole.x, hole.y, .58, 0, Math.PI * 2);
                        context.fillStrokeShape(shape);
                    }
                },
                fill: '#27272a', stroke: '#71717a', strokeWidth: .16,
            }));
            for (const column of [1, 5, 10, 15, 20, 25, 30]) {
                const hole = definition.getHole(`A${column}`);
                group.add(new Konva.Text({ x: hole.x - 1.8, y: rowA - 3.2, width: 3.6, text: String(column), align: 'center', fontSize: 1.45, fill: '#52525b', listening: false }));
                group.add(new Konva.Text({ x: hole.x - 1.8, y: rowJ + 1.25, width: 3.6, text: String(column), align: 'center', fontSize: 1.45, fill: '#52525b', listening: false }));
            }
            group.add(new Konva.Text({ x: 3.2, y: (trenchTop + trenchBottom) / 2 - .8, text: 'ELERA  •  2.54 mm physical pitch', fontSize: 1.6, fill: '#71717a', listening: false }));

            let origin = null;
            group.on('dragstart', () => {
                origin = { x: group.x(), y: group.y() };
                this._status = 'Move the breadboard; attached parts will move with it.';
                this.requestUpdate();
            });
            group.on('dragmove', () => {
                if (!origin) return;
                const dx = group.x() - origin.x;
                const dy = group.y() - origin.y;
                for (const node of this.componentLayer.find(node => node.getAttr('surfaceId') === surface.id)) {
                    node.position({ x: node.getAttr('baseX') + dx, y: node.getAttr('baseY') + dy });
                    this._positionComponentVisual(node.getAttr('componentId'), {
                        x: node.x(), y: node.y(), rotation: node.rotation(),
                    });
                }
                this.componentLayer.batchDraw();
            });
            group.on('dragend', () => {
                this.interaction.moveSurface(surface.id, { x: group.x(), y: group.y(), rotation: surface.transform.rotation || 0 });
                this._status = 'Breadboard moved. Attached parts and connections were kept.';
                this.requestUpdate();
            });
            group.on('click tap', event => {
                if (!isPrimaryPointer(event)) return;
                event.cancelBubble = true;
                this._selectedSurfaceId = surface.id;
                this._selectedComponentId = null;
                this._deselectWire();
                this._status = 'Breadboard selected. Press Delete to remove it; mounted parts will remain free.';
                this._renderBoards();
                this.requestUpdate();
            });
            this.boardLayer.add(group);
        }
        this.boardLayer.batchDraw();
    }

    _renderWires() {
        this.wireLayer.destroyChildren();
        for (const wire of this.store.project.wires) {
            const route = this.store.routes.get(wire.id);
            if (!route || route.length < 2) continue;
            const color = wire.color || this._themeColor('--accent-sensors');
            const line = new Konva.Line({
                id: `wire:${wire.id}`,
                points: route.flatMap(point => [point.x, point.y]),
                stroke: color,
                strokeWidth: .72,
                lineCap: 'round',
                lineJoin: 'round',
                shadowColor: '#000',
                shadowBlur: .55,
                shadowOffsetY: .28,
                shadowOpacity: .7,
        hitStrokeWidth: 'auto',
            });
            line.on('mouseenter', () => { this.stage.container().style.cursor = 'pointer'; });
            line.on('mouseleave', () => { this.stage.container().style.cursor = ''; });
            line.on('click tap', event => {
                if (!isPrimaryPointer(event)) return;
                event.cancelBubble = true;
                this._selectWire(wire.id);
            });
            line.on('dblclick dbltap', event => {
                event.cancelBubble = true;
                const point = this._pointerWorld();
                const waypoints = insertWireWaypoint(wire, route, point, {
                    snap: this.store.manualWireSnap,
                    gridSize: 2.54,
                });
                this._selectedWireId = wire.id;
                this.store.setManualRoute(wire.id, waypoints);
                this._status = 'Wire point added. Drag it to reshape the route.';
                this.requestUpdate();
            });
            this.wireLayer.add(line);
        }
        this._refreshWireSelectionVisuals();
        this.wireLayer.batchDraw();
    }

    _selectWire(wireId) {
        if (!this.store.project.wires.some(wire => wire.id === wireId)) return false;
        this._selectedWireId = wireId;
        this._selectedComponentId = null;
        this._selectedSurfaceId = null;
        this._status = this.store.manualWireMode === 'orthogonal'
            ? 'Wire selected. Drag a straight section or corner. Double-click the wire to add a corner.'
            : 'Wire selected. Drag a point to reshape it. Double-click the wire to add a point.';
        this._refreshWireSelectionVisuals();
        this._syncComponentVisualSelection();
        this.requestUpdate();
        return true;
    }

    _clearWireSelectionVisuals() {
        if (!this.wireLayer) return;
        for (const name of ['wire-selection-overlay', 'wire-segment-handle', 'wire-waypoint-handle', 'wire-alignment-guide']) {
            for (const node of this.wireLayer.find(`.${name}`)) node.destroy();
        }
    }

    _refreshWireSelectionVisuals() {
        if (!this.wireLayer) return;
        this._clearWireSelectionVisuals();
        const wire = this.store.project.wires.find(item => item.id === this._selectedWireId);
        const route = wire ? this.store.routes.get(wire.id) : null;
        const line = wire ? this.wireLayer.findOne(node => node.id?.() === `wire:${wire.id}`) : null;
        if (!wire || !route || route.length < 2 || !line) {
            this.wireLayer.batchDraw();
            return;
        }
        const color = wire.color || this._themeColor('--accent-sensors');
        this.wireLayer.add(new Konva.Line({
            id: `wire-selection:${wire.id}`,
            name: 'wire-selection-overlay',
            points: route.flatMap(point => [point.x, point.y]),
            stroke: color,
            strokeWidth: .72,
            lineCap: 'round',
            lineJoin: 'round',
            shadowColor: this._themeColor('--primary-hover'),
            shadowBlur: 2.2,
            shadowOpacity: 1,
            listening: false,
        }));
        if (this.store.manualWireMode === 'orthogonal') this._addWireSegmentHandles(wire, route, line);
        this._addWireWaypointHandles(wire, route, line);
        this.wireLayer.batchDraw();
    }

    _syncComponentVisualSelection() {
        for (const wrapper of this.visualLayer?.children || []) {
            wrapper.classList.toggle('selected', wrapper.dataset.componentId === this._selectedComponentId);
        }
    }

    _addWireSegmentHandles(wire, route, line) {
        const points = editableWirePoints(wire, route);
        for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
            const a = points[segmentIndex], b = points[segmentIndex + 1];
            const horizontal = Math.abs(a.y - b.y) < 1e-6;
            const vertical = Math.abs(a.x - b.x) < 1e-6;
            const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
            if ((!horizontal && !vertical) || length < 3) continue;
            const handle = new Konva.Rect({
                name: 'wire-segment-handle',
                x: (a.x + b.x) / 2,
                y: (a.y + b.y) / 2,
                width: (horizontal ? 4.2 : 1.7) / this.camera.zoom,
                height: (horizontal ? 1.7 : 4.2) / this.camera.zoom,
                offsetX: (horizontal ? 2.1 : .85) / this.camera.zoom,
                offsetY: (horizontal ? .85 : 2.1) / this.camera.zoom,
                cornerRadius: .45 / this.camera.zoom,
                fill: this._themeColor('--primary-hover'),
                stroke: this._themeColor('--text'),
                strokeWidth: .3 / this.camera.zoom,
                draggable: true,
                hitStrokeWidth: 2.2 / this.camera.zoom,
            });
            handle.setAttrs({ wireId: wire.id, segmentIndex });
            handle.on('mouseenter', () => {
                this.stage.container().style.cursor = horizontal ? 'ns-resize' : 'ew-resize';
            });
            handle.on('mouseleave', () => { this.stage.container().style.cursor = ''; });
            handle.on('click tap', event => { event.cancelBubble = true; });
            handle.on('dragmove', event => {
                event.cancelBubble = true;
                const target = this._snapWireEditorPoint(handle.position(), route, { pitch: false });
                const waypoints = moveWireSegment(wire, route, segmentIndex, target, {
                    snap: false, gridSize: 2.54,
                });
                this._syncWireEditorPreview(wire.id, line, route, waypoints);
            });
            handle.on('dragend', event => {
                event.cancelBubble = true;
                const target = this._snapWireEditorPoint(handle.position(), route, { pitch: true });
                this._clearWireAlignmentGuides();
                const waypoints = moveWireSegment(wire, route, segmentIndex, target, {
                    snap: false, gridSize: 2.54,
                });
                this.store.setManualRoute(wire.id, waypoints);
                this._status = 'Wire route saved. Drag another section to keep adjusting it.';
                this.requestUpdate();
            });
            this.wireLayer.add(handle);
        }
    }

    _addWireWaypointHandles(wire, route, line) {
        const points = editableWirePoints(wire, route);
        for (let waypointIndex = 0; waypointIndex < points.length - 2; waypointIndex++) {
            const point = points[waypointIndex + 1];
            const handle = new Konva.Circle({
                name: 'wire-waypoint-handle',
                x: point.x,
                y: point.y,
                radius: 1.15 / this.camera.zoom,
                fill: this._themeColor('--primary-hover'),
                stroke: this._themeColor('--text'),
                strokeWidth: .42 / this.camera.zoom,
                shadowColor: '#000',
                shadowBlur: .7,
                shadowOpacity: .75,
                draggable: true,
                hitStrokeWidth: 2.3 / this.camera.zoom,
            });
            handle.setAttrs({ wireId: wire.id, waypointIndex });
            handle.on('mouseenter', () => { this.stage.container().style.cursor = 'move'; });
            handle.on('mouseleave', () => { this.stage.container().style.cursor = ''; });
            handle.on('click tap', event => { event.cancelBubble = true; });
            handle.on('dragmove', event => {
                event.cancelBubble = true;
                const target = this._snapWireEditorPoint(handle.position(), route, { pitch: false });
                const waypoints = moveWireWaypoint(wire, route, waypointIndex, target, {
                    mode: this.store.manualWireMode,
                    snap: false,
                    gridSize: 2.54,
                });
                this._syncWireEditorPreview(wire.id, line, route, waypoints);
            });
            handle.on('dragend', event => {
                event.cancelBubble = true;
                const target = this._snapWireEditorPoint(handle.position(), route, { pitch: true });
                this._clearWireAlignmentGuides();
                const waypoints = moveWireWaypoint(wire, route, waypointIndex, target, {
                    mode: this.store.manualWireMode,
                    snap: false,
                    gridSize: 2.54,
                });
                this.store.setManualRoute(wire.id, waypoints);
                this._status = 'Wire route saved. Use Reset Wires to route it automatically again.';
                this.requestUpdate();
            });
            handle.on('dblclick dbltap', event => {
                event.cancelBubble = true;
                this.store.setManualRoute(wire.id, removeWireWaypoint(wire, route, waypointIndex));
                this._status = 'Wire point removed.';
                this.requestUpdate();
            });
            handle.on('contextmenu', event => {
                event.evt?.preventDefault?.();
                event.cancelBubble = true;
                this.store.setManualRoute(wire.id, removeWireWaypoint(wire, route, waypointIndex));
                this._status = 'Wire point removed.';
                this.requestUpdate();
            });
            this.wireLayer.add(handle);
        }
    }

    _snapWireEditorPoint(point, route, { pitch = false } = {}) {
        if (!this.store.manualWireSnap) return { x: point.x, y: point.y };
        const origin = route[0] || { x: 0, y: 0 };
        const fallback = pitch ? {
            x: origin.x + Math.round((point.x - origin.x) / 2.54) * 2.54,
            y: origin.y + Math.round((point.y - origin.y) / 2.54) * 2.54,
        } : { x: point.x, y: point.y };
        const tolerance = Math.min(1.27, 8 / (this.camera.pixelsPerMillimetre * this.camera.zoom));
        let bestX = null, bestY = null;
        const consider = (reference, priority) => {
            const dx = Math.abs(point.x - reference.x), dy = Math.abs(point.y - reference.y);
            if (dx <= tolerance && (!bestX || priority < bestX.priority ||
                (priority === bestX.priority && dx < bestX.distance))) {
                bestX = { value: reference.x, distance: dx, priority, reference };
            }
            if (dy <= tolerance && (!bestY || priority < bestY.priority ||
                (priority === bestY.priority && dy < bestY.distance))) {
                bestY = { value: reference.y, distance: dy, priority, reference };
            }
        };
        for (const routePoint of route) consider(routePoint, 0);
        for (const component of this.store.project.components) {
            const footprint = getFootprintDefinition(component.footprintId);
            for (const pin of footprint?.pins || []) {
                const pinPoint = resolveConnectionWorldPoint(this.store.project, componentPinRef(component.id, pin.pinId));
                if (!pinPoint) continue;
                consider(pinPoint, 1);
            }
        }
        const snapped = { x: bestX?.value ?? fallback.x, y: bestY?.value ?? fallback.y };
        this._renderWireAlignmentGuides(snapped, { x: bestX?.reference, y: bestY?.reference });
        return snapped;
    }

    _renderWireAlignmentGuides(target, references) {
        this._clearWireAlignmentGuides();
        const color = this._themeColor('--primary-hover');
        const addRuler = (a, b, vertical) => {
            if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) < .2) return;
            this.wireLayer.add(new Konva.Line({
                name: 'wire-alignment-guide',
                points: [a.x, a.y, b.x, b.y],
                stroke: color, strokeWidth: .24 / this.camera.zoom, dash: [1, .7], opacity: .92,
                listening: false,
            }));
            const tick = 1.15 / this.camera.zoom;
            for (const point of [a, b]) {
                this.wireLayer.add(new Konva.Line({
                    name: 'wire-alignment-guide',
                    points: vertical
                        ? [point.x - tick, point.y, point.x + tick, point.y]
                        : [point.x, point.y - tick, point.x, point.y + tick],
                    stroke: color, strokeWidth: .32 / this.camera.zoom, listening: false,
                }));
            }
        };
        if (references.x) addRuler(references.x, { x: target.x, y: target.y }, true);
        if (references.y) addRuler(references.y, { x: target.x, y: target.y }, false);
        this.wireLayer.batchDraw();
    }

    _clearWireAlignmentGuides() {
        if (!this.wireLayer) return;
        for (const guide of this.wireLayer.find('.wire-alignment-guide')) guide.destroy();
    }

    _syncWireEditorPreview(wireId, line, route, waypoints) {
        const preview = [route[0], ...waypoints, route.at(-1)];
        const points = preview.flatMap(point => [point.x, point.y]);
        line.points(points);
        const overlay = this.wireLayer.findOne(node => node.id?.() === `wire-selection:${wireId}`);
        overlay?.points(points);

        for (const handle of this.wireLayer.find('.wire-waypoint-handle')) {
            if (handle.getAttr('wireId') !== wireId) continue;
            const point = preview[handle.getAttr('waypointIndex') + 1];
            handle.visible(Boolean(point));
            if (point) handle.position(point);
        }

        for (const handle of this.wireLayer.find('.wire-segment-handle')) {
            if (handle.getAttr('wireId') !== wireId) continue;
            const index = handle.getAttr('segmentIndex');
            const a = preview[index], b = preview[index + 1];
            if (!a || !b) {
                handle.visible(false);
                continue;
            }
            const horizontal = Math.abs(a.y - b.y) < 1e-6;
            const vertical = Math.abs(a.x - b.x) < 1e-6;
            const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
            const visible = (horizontal || vertical) && length >= 3;
            handle.visible(visible);
            if (!visible) continue;
            handle.position({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            handle.size({
                width: (horizontal ? 4.2 : 1.7) / this.camera.zoom,
                height: (horizontal ? 1.7 : 4.2) / this.camera.zoom,
            });
            handle.offset({
                x: (horizontal ? 2.1 : .85) / this.camera.zoom,
                y: (horizontal ? .85 : 2.1) / this.camera.zoom,
            });
        }
        this.wireLayer.batchDraw();
    }

    _renderComponents() {
        this.componentLayer.destroyChildren();
        for (const component of this.store.project.components) {
            const footprint = getFootprintDefinition(component.footprintId);
            if (!footprint) continue;
            const transform = componentWorldTransform(this.store.project, component);
            const group = new Konva.Group({
                id: `component:${component.id}`,
                name: 'physical-component',
                x: transform.x,
                y: transform.y,
                rotation: transform.rotation,
                draggable: true,
            });
            group.setAttrs({
                componentId: component.id,
                surfaceId: component.placement.type === 'surface' ? component.placement.surfaceId : null,
                baseX: transform.x,
                baseY: transform.y,
            });
            if (footprint.packageType === 'dip') this._drawDipPackage(group, component, footprint);
            else if (component.definitionId === 'led') this._drawLed(group, component);
            else this._drawGenericComponent(group, component, footprint);
            this._drawComponentPins(group, component, footprint);
            this._installComponentInteraction(group, component);
            this.componentLayer.add(group);
        }
        this.componentLayer.batchDraw();
        this._renderComponentVisuals();
    }

    _createComponentArtwork(component) {
        const definition = componentLibrary[component.definitionId];
        let artwork;
        if (definition?.type === 'custom' && definition.imageUrl) {
            artwork = document.createElement('img');
            artwork.src = definition.imageUrl;
            artwork.alt = definition.name || component.definitionId;
        } else if (!definition?.tag || definition.tag === 'div') {
            artwork = document.createElement('div');
            artwork.classList.add('dom-dip');
            artwork.textContent = definition?.name || component.definitionId;
        } else {
            artwork = document.createElement(definition.tag);
            for (const [name, value] of Object.entries(definition.attrs || {})) {
                if (value !== false && value != null) artwork.setAttribute(name, String(value));
            }
        }
        artwork.classList.add('component-artwork');
        const nativeSize = getComponentGeometry(component.definitionId)?.native?.size;
        const sourceWidth = Math.max(1, Number(nativeSize?.width || definition?.size?.width || 120));
        const sourceHeight = Math.max(1, Number(nativeSize?.height || definition?.size?.height || 80));
        artwork.style.width = `${sourceWidth}px`;
        artwork.style.height = `${sourceHeight}px`;
        artwork.dataset.sourceWidth = String(sourceWidth);
        artwork.dataset.sourceHeight = String(sourceHeight);
        return artwork;
    }

    _renderComponentVisuals() {
        if (!this.visualLayer) return;
        this.visualLayer.replaceChildren();
        for (const component of this.store.project.components) {
            const footprint = getFootprintDefinition(component.footprintId);
            if (!footprint || footprint.packageType === 'dip') continue;
            const wrapper = document.createElement('div');
            wrapper.className = `component-visual${component.id === this._selectedComponentId ? ' selected' : ''}`;
            wrapper.dataset.componentId = component.id;
            wrapper.append(this._createComponentArtwork(component));
            for (const pin of footprint.pins) {
                const projected = projectFootprintPoint(footprint, pin);
                const terminal = document.createElement('span');
                terminal.className = 'visual-terminal';
                terminal.dataset.pinX = String(projected.x);
                terminal.dataset.pinY = String(projected.y);
                wrapper.append(terminal);
            }
            this.visualLayer.append(wrapper);
            this._positionComponentVisual(component.id);
            this._queueArtworkPinCalibration(component.id);
        }
    }

    _fitArtworkPlacement(footprint, sourceWidth, sourceHeight) {
        const bounds = footprint.routingBounds || { x: 0, y: 0, width: 24, height: 14 };
        const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
        return {
            x: bounds.x + (bounds.width - sourceWidth * scale) / 2,
            y: bounds.y + (bounds.height - sourceHeight * scale) / 2,
            scale,
            rotation: 0,
        };
    }

    _artworkPlacement(component, footprint, sourceWidth, sourceHeight) {
        const geometry = getComponentGeometry(component.definitionId);
        const nativePins = geometry?.native?.pins;
        if (footprint.placementMode !== 'breadboard-rigid' || !nativePins) {
            return this._fitArtworkPlacement(footprint, sourceWidth, sourceHeight);
        }
        const matches = footprint.pins
            .filter(pin => nativePins[pin.pinId])
            .map(pin => ({ native: nativePins[pin.pinId], target: projectFootprintPoint(footprint, pin) }));
        const first = matches[0];
        const second = matches.find(match =>
            Math.hypot(match.native.x - first?.native.x, match.native.y - first?.native.y) > .001);
        if (!first || !second) return this._fitArtworkPlacement(footprint, sourceWidth, sourceHeight);
        const nativeAngle = Math.atan2(second.native.y - first.native.y, second.native.x - first.native.x);
        const targetAngle = Math.atan2(second.target.y - first.target.y, second.target.x - first.target.x);
        const rotation = (targetAngle - nativeAngle) * 180 / Math.PI;
        const nativeDistance = Math.hypot(second.native.x - first.native.x, second.native.y - first.native.y);
        const targetDistance = Math.hypot(second.target.x - first.target.x, second.target.y - first.target.y);
        const scale = targetDistance / nativeDistance;
        const radians = rotation * Math.PI / 180;
        const rotatedX = (first.native.x * Math.cos(radians) - first.native.y * Math.sin(radians)) * scale;
        const rotatedY = (first.native.x * Math.sin(radians) + first.native.y * Math.cos(radians)) * scale;
        return { x: first.target.x - rotatedX, y: first.target.y - rotatedY, scale, rotation };
    }

    _queueArtworkPinCalibration(componentId, retries = 40) {
        if (this._pendingPinCalibration.has(componentId)) return;
        const component = this.store.project.components.find(item => item.id === componentId);
        const footprint = getFootprintDefinition(component?.footprintId);
        if (!component || footprint?.placementMode !== 'free') return;
        this._pendingPinCalibration.add(componentId);
        const inspect = remaining => requestAnimationFrame(() => {
            const wrapper = [...(this.visualLayer?.children || [])].find(node => node.dataset.componentId === componentId);
            const artwork = wrapper?.querySelector('.component-artwork');
            const current = this.store.project.components.find(item => item.id === componentId);
            const currentFootprint = getFootprintDefinition(current?.footprintId);
            if (!artwork || !current || !currentFootprint) {
                this._pendingPinCalibration.delete(componentId);
                return;
            }
            const definition = componentLibrary[current.definitionId];
            const rawPins = definition?.type === 'custom' ? definition.customPins : artwork.pinInfo;
            if ((!rawPins || !rawPins.length) && remaining > 0) {
                inspect(remaining - 1);
                return;
            }
            this._pendingPinCalibration.delete(componentId);
            if (!rawPins?.length) return;
            const pins = calibratePhysicalPinInfo(current.definitionId, [...rawPins]);
            const sourceWidth = Number(artwork.dataset.sourceWidth || 120);
            const sourceHeight = Number(artwork.dataset.sourceHeight || 80);
            const placement = this._fitArtworkPlacement(currentFootprint, sourceWidth, sourceHeight);
            const calibrated = pins.map(pin => ({
                pinId: pin.name,
                x: placement.x + Number(pin.x) * placement.scale,
                y: placement.y + Number(pin.y) * placement.scale,
            }));
            if (calibrateFreeComponentFootprint(current.definitionId, calibrated)) {
                this.store.recomputeRoutes();
            }
        });
        inspect(retries);
    }

    _positionComponentVisual(componentId, overrideTransform = null) {
        if (!this.visualLayer) return;
        const wrapper = [...this.visualLayer.children].find(node => node.dataset.componentId === componentId);
        const component = this.store.project.components.find(item => item.id === componentId);
        const footprint = getFootprintDefinition(component?.footprintId);
        const artwork = wrapper?.querySelector('.component-artwork');
        if (!wrapper || !component || !footprint || !artwork) return;
        const transform = overrideTransform || componentWorldTransform(this.store.project, component);
        const scale = this.camera.pixelsPerMillimetre * this.camera.zoom;
        const sourceWidth = Number(artwork.dataset.sourceWidth || 120);
        const sourceHeight = Number(artwork.dataset.sourceHeight || 80);
        const placement = this._artworkPlacement(component, footprint, sourceWidth, sourceHeight);
        wrapper.style.transform = `translate(${this.camera.panX + transform.x * scale}px, ${this.camera.panY + transform.y * scale}px) rotate(${transform.rotation || 0}deg)`;
        artwork.style.transform = `translate(${placement.x * scale}px, ${placement.y * scale}px) rotate(${placement.rotation}deg) scale(${placement.scale * scale})`;
        for (const terminal of wrapper.querySelectorAll('.visual-terminal')) {
            terminal.style.transform = `translate(${Number(terminal.dataset.pinX) * scale - 3.5}px, ${Number(terminal.dataset.pinY) * scale - 3.5}px)`;
        }
    }

    _positionComponentVisuals() {
        if (!this.visualLayer) return;
        for (const component of this.store.project.components) this._positionComponentVisual(component.id);
    }

    _drawDipPackage(group, component, footprint) {
        const selected = component.id === this._selectedComponentId;
        const pins = footprint.pins.map(pin => ({ ...pin, ...projectFootprintPoint(footprint, pin) }));
        const xs = pins.map(pin => pin.x);
        const ys = pins.map(pin => pin.y);
        const left = Math.min(...xs) - footprint.pitch / 2;
        const right = Math.max(...xs) + footprint.pitch / 2;
        const topPins = Math.min(...ys);
        const bottomPins = Math.max(...ys);
        const bodyTop = topPins + Math.min(1.15, footprint.rowSpacing * .2);
        const bodyBottom = bottomPins - Math.min(1.15, footprint.rowSpacing * .2);
        for (const pin of pins) {
            const bodyY = Math.abs(pin.y - topPins) < .001 ? bodyTop : bodyBottom;
            group.add(new Konva.Line({
                points: [pin.x, pin.y, pin.x, bodyY], stroke: '#d4d4d8', strokeWidth: .55, listening: false,
            }));
        }
        group.add(new Konva.Rect({
            x: left, y: bodyTop, width: right - left, height: bodyBottom - bodyTop, cornerRadius: .7,
            fill: '#18181b', stroke: selected ? this._themeColor('--primary-hover') : '#52525b', strokeWidth: selected ? .65 : .3,
            name: 'component-body', shadowColor: '#000', shadowBlur: 1.2, shadowOpacity: .5,
        }));
        const pin1 = pins.find(pin => pin.pinId === '1');
        const lastPin = pins.find(pin => pin.pinId === String(footprint.pinCount));
        const notchX = (pin1.x + lastPin.x) / 2;
        const notchY = (pin1.y + lastPin.y) / 2;
        group.add(new Konva.Arc({
            x: notchX, y: notchY, innerRadius: .72, outerRadius: .8, angle: 180,
            rotation: pin1.x <= left + footprint.pitch ? 90 : 270,
            fill: '#a1a1aa', listening: false,
        }));
        group.add(new Konva.Circle({
            x: pin1.x + .55, y: pin1.y < 0 ? bodyTop + .7 : bodyBottom - .7,
            radius: .38, fill: '#a1a1aa', listening: false,
        }));
        const label = getPhysicalComponentDefinition(component.definitionId)?.visual?.label || `DIP-${footprint.pinCount}`;
        group.add(new Konva.Text({
            x: left + .5, y: (bodyTop + bodyBottom) / 2 - .85, width: right - left - 1,
            text: label, align: 'center', fontSize: 1.55, fill: '#d4d4d8', listening: false,
        }));
    }

    _drawLed(group, component) {
        const selected = component.id === this._selectedComponentId;
        group.add(new Konva.Line({ points: [0, 0, .15, -3.1], stroke: '#d4d4d8', strokeWidth: .45, listening: false }));
        group.add(new Konva.Line({ points: [2.54, 0, 2.38, -3.1], stroke: '#d4d4d8', strokeWidth: .45, listening: false }));
        group.add(new Konva.Circle({
            x: 1.27, y: -4.15, radius: 2.45, fill: '#ef4444', opacity: .9,
            stroke: selected ? this._themeColor('--primary-hover') : '#fecaca', strokeWidth: selected ? .65 : .28,
            name: 'component-body', shadowColor: '#ef4444', shadowBlur: 1.5, shadowOpacity: .45,
        }));
        group.add(new Konva.Line({ points: [-.75, -2.85, 3.3, -2.85], stroke: '#fecaca', strokeWidth: .28, listening: false }));
    }

    _drawGenericComponent(group, component, footprint) {
        const definition = componentLibrary[component.definitionId];
        const nativeSize = getComponentGeometry(component.definitionId)?.native?.size;
        const sourceWidth = Math.max(1, Number(nativeSize?.width || definition?.size?.width || 120));
        const sourceHeight = Math.max(1, Number(nativeSize?.height || definition?.size?.height || 80));
        const placement = this._artworkPlacement(component, footprint, sourceWidth, sourceHeight);
        const radians = placement.rotation * Math.PI / 180;
        const cos = Math.cos(radians) * placement.scale;
        const sin = Math.sin(radians) * placement.scale;
        const corners = [
            { x: 0, y: 0 },
            { x: sourceWidth, y: 0 },
            { x: 0, y: sourceHeight },
            { x: sourceWidth, y: sourceHeight },
        ].map(point => ({
            x: placement.x + point.x * cos - point.y * sin,
            y: placement.y + point.x * sin + point.y * cos,
        }));
        const left = Math.min(...corners.map(point => point.x));
        const right = Math.max(...corners.map(point => point.x));
        const top = Math.min(...corners.map(point => point.y));
        const bottom = Math.max(...corners.map(point => point.y));
        // Interaction-only hit region. The DOM/Wokwi/custom artwork above it is
        // the visual. Match its transformed bounds exactly: no placeholder and
        // no selectable empty margin around the real component.
        group.add(new Konva.Rect({
            name: 'component-body', x: left, y: top, width: right - left, height: bottom - top,
            fill: 'rgba(0, 0, 0, 0.001)',
            strokeEnabled: false,
        }));
    }

    _drawComponentPins(group, component, footprint) {
        for (const pin of footprint.pins) {
            const projected = projectFootprintPoint(footprint, pin);
            const circle = new Konva.Circle({
                name: 'semantic-terminal', x: projected.x, y: projected.y, radius: .82,
                fill: this._themeColor('--text'), stroke: this._themeColor('--primary-hover'), strokeWidth: .3, opacity: .94,
            });
            circle.setAttr('connectionRef', componentPinRef(component.id, pin.pinId));
            circle.on('mouseenter', () => {
                this._hoveredTerminalRef = circle.getAttr('connectionRef');
                this.stage.container().style.cursor = 'crosshair';
                if (this.interaction.state.type === 'drawing-wire') this._renderInteractionLayer();
            });
            circle.on('mouseleave', () => {
                this._hoveredTerminalRef = null;
                this.stage.container().style.cursor = '';
                if (this.interaction.state.type === 'drawing-wire') this._renderInteractionLayer();
            });
            circle.on('click tap', event => {
                if (!isPrimaryPointer(event)) return;
                event.cancelBubble = true;
                this._activateTerminal(circle.getAttr('connectionRef'));
            });
            group.add(circle);
        }
    }

    _installComponentInteraction(group, component) {
        let grabOffset = { x: 0, y: 0 };
        group.on('mouseenter', () => { this.stage.container().style.cursor = 'move'; });
        group.on('mouseleave', () => { this.stage.container().style.cursor = ''; });
        group.on('dragstart', () => {
            const pointer = this._pointerWorld();
            grabOffset = { x: pointer.x - group.x(), y: pointer.y - group.y() };
            this.interaction.beginComponentDrag(component.id);
            this._selectedComponentId = component.id;
            this._deselectWire();
            this._selectedSurfaceId = null;
            const footprint = getFootprintDefinition(component.footprintId);
            this._status = footprint?.placementMode === 'breadboard-rigid'
                ? 'Move over the breadboard to find a valid set of holes.'
                : 'Release to place the component.';
            this.requestUpdate();
        });
        group.on('dragmove', () => {
            const pointer = this._pointerWorld();
            const anchor = { x: pointer.x - grabOffset.x, y: pointer.y - grabOffset.y };
            const candidate = this.interaction.updateComponentDrag(anchor);
            if (candidate) {
                const preview = structuredClone(component);
                preview.placement = { type: 'surface', surfaceId: candidate.surfaceId, rotation: candidate.rotation, bindings: candidate.bindings };
                const transform = componentWorldTransform(this.store.project, preview);
                group.position({ x: transform.x, y: transform.y });
                group.rotation(transform.rotation);
                this._status = `${Object.keys(candidate.bindings).length} holes aligned. Release to place the component.`;
            } else {
                group.position(anchor);
                this._status = component.placement.type === 'surface'
                    ? 'Move over valid breadboard holes, or release to place it freely.'
                    : 'Release to place the component here.';
            }
            this._positionComponentVisual(component.id, { x: group.x(), y: group.y(), rotation: group.rotation() });
            this._previewConnectedWires(component, { x: group.x(), y: group.y(), rotation: group.rotation() });
            this.componentLayer.batchDraw();
            this.requestUpdate();
        });
        group.on('dragend', () => {
            const pointer = this._pointerWorld();
            const anchor = { x: pointer.x - grabOffset.x, y: pointer.y - grabOffset.y };
            const committed = this.interaction.commitComponentDrag(anchor);
            this._status = committed
                ? (getFootprintDefinition(component.footprintId)?.placementMode === 'breadboard-rigid'
                    ? (this.store.project.components.find(item => item.id === component.id)?.placement.type === 'surface'
                        ? 'Placement snapped to breadboard holes.'
                        : 'Component detached and placed freely.')
                    : 'Component moved.')
                : 'Component position was unchanged.';
            this._renderScene();
            this.requestUpdate();
        });
        group.on('click tap', event => {
            if (!isPrimaryPointer(event)) return;
            event.cancelBubble = true;
            this._selectedComponentId = component.id;
            this._deselectWire();
            this._selectedSurfaceId = null;
            this._status = `Drag ${getPhysicalComponentDefinition(component.definitionId)?.name || component.definitionId} to move it, or press Delete to remove it.`;
            this._renderComponents();
            this.requestUpdate();
        });
    }

    _previewConnectedWires(component, transform) {
        const footprint = getFootprintDefinition(component.footprintId);
        if (!footprint) return;
        const previewPoint = ref => {
            if (ref?.type !== 'component-pin' || ref.componentId !== component.id) return null;
            const pin = footprint.pins.find(item => item.pinId === ref.pinId);
            return pin ? applyTransform(projectFootprintPoint(footprint, pin), transform) : null;
        };
        for (const wire of this.store.project.wires) {
            const from = previewPoint(wire.from), to = previewPoint(wire.to);
            if (!from && !to) continue;
            const line = this.wireLayer.findOne(node => node.id?.() === `wire:${wire.id}`);
            if (!line) continue;
            const route = this.store.routes.get(wire.id);
            const points = moveWireRouteEndpoints(route, {
                from,
                to,
                fromDirection: from ? pinExitDirection(this.store.project, wire.from) : null,
                toDirection: to ? pinExitDirection(this.store.project, wire.to) : null,
            });
            line.points(points.flatMap(point => [point.x, point.y]));
        }
        this.wireLayer.batchDraw();
    }

    _renderInteractionLayer() {
        if (!this.interactionLayer) return;
        this.interactionLayer.destroyChildren();
        if (this._hoveredHole) {
            const surface = this.store.project.surfaces.find(item => item.id === this._hoveredHole.surfaceId);
            for (const holeId of holesInElectricalGroup(surface, this._hoveredHole.holeId)) {
                const point = holeWorldPosition(surface, holeId);
                this.interactionLayer.add(new Konva.Circle({ x: point.x, y: point.y, radius: 1.05, fill: this._themeColor('--primary'), opacity: .38, listening: false }));
            }
            const point = holeWorldPosition(surface, this._hoveredHole.holeId);
            this.interactionLayer.add(new Konva.Circle({ x: point.x, y: point.y, radius: 1.13, stroke: this._themeColor('--primary-hover'), strokeWidth: .34, listening: false }));
        }

        const state = this.interaction.state;
        if (state.type === 'dragging-component') {
            if (state.candidate) {
                const surface = this.store.project.surfaces.find(item => item.id === state.candidate.surfaceId);
                for (const holeId of Object.values(state.candidate.bindings)) {
                    const point = holeWorldPosition(surface, holeId);
                    this.interactionLayer.add(new Konva.Circle({
                        x: point.x, y: point.y, radius: 1.16, fill: this._themeColor('--primary'), opacity: .48,
                        stroke: this._themeColor('--text'), strokeWidth: .34, listening: false,
                    }));
                }
            }
        }

        if (state.type === 'drawing-wire') {
            const hoveredRef = this._hoveredTerminalRef || (this._hoveredHole
                ? surfaceHoleRef(this._hoveredHole.surfaceId, this._hoveredHole.holeId)
                : null);
            const hoveredPoint = hoveredRef ? resolveConnectionWorldPoint(this.store.project, hoveredRef) : null;
            const points = this.interaction.previewWire(hoveredPoint || this._lastPointerWorld, {
                targetRef: hoveredRef,
                snap: hoveredRef ? false : this.store.manualWireSnap,
                gridSize: 2.54,
            });
            if (points.length > 1) {
                this.interactionLayer.add(new Konva.Line({
                    points: points.flatMap(point => [point.x, point.y]),
                    stroke: this._themeColor('--primary-hover'), strokeWidth: .52, dash: [1.2, .8], lineJoin: 'round', listening: false,
                }));
                const target = points.at(-1);
                this.interactionLayer.add(new Konva.Circle({
                    x: target.x, y: target.y, radius: .7, fill: this._themeColor('--primary'), stroke: this._themeColor('--text'),
                    strokeWidth: .22, listening: false,
                }));
            }
        }
        this.interactionLayer.batchDraw();
    }

    _onStageMove() {
        const pointer = this.stage.getPointerPosition();
        if (!pointer) return;
        if (this._panning) {
            this.camera.panX = this._panning.panX + pointer.x - this._panning.x;
            this.camera.panY = this._panning.panY + pointer.y - this._panning.y;
            this._applyCamera();
            return;
        }
        this._lastPointerWorld = this._pointerWorld();
        let nextHover = null;
        for (const surface of this.store.project.surfaces) {
            const nearest = nearestHole(surface, this._lastPointerWorld, { maxDistance: 1.18 });
            if (nearest) {
                nextHover = { surfaceId: surface.id, holeId: nearest.hole.id };
                break;
            }
        }
        const changed = JSON.stringify(nextHover) !== JSON.stringify(this._hoveredHole);
        this._hoveredHole = nextHover;
        if (changed || this.interaction.state.type === 'drawing-wire') this._renderInteractionLayer();
        this.stage.container().style.cursor = nextHover ? 'crosshair' : '';
    }

    _onStageDown(event) {
        const button = event.evt?.button;
        if (button === 1) {
            event.evt.preventDefault();
            const pointer = this.stage.getPointerPosition();
            this._panning = { x: pointer.x, y: pointer.y, panX: this.camera.panX, panY: this.camera.panY };
        }
    }

    _onStageClick(event) {
        if (!isPrimaryPointer(event)) return;
        if (event.target?.hasName?.('semantic-terminal')) return;
        if (this._hoveredHole) {
            this._activateTerminal(surfaceHoleRef(this._hoveredHole.surfaceId, this._hoveredHole.holeId));
            return;
        }
        if (event.target === this.stage) {
            if (this.interaction.state.type === 'drawing-wire') {
                this.interaction.addWireWaypoint(this._lastPointerWorld, {
                    snap: this.store.manualWireSnap,
                    gridSize: 2.54,
                });
                this._status = 'Wire point added. Keep clicking to shape the wire, then click a pin to finish.';
                this.requestUpdate();
                return;
            }
            this._selectedComponentId = null;
            this._deselectWire();
            this._selectedSurfaceId = null;
            this._status = 'Click a component pin or breadboard hole to start a wire.';
            this._renderComponents();
            this.requestUpdate();
        }
    }

    _activateTerminal(ref) {
        this._deselectWire();
        const result = this.interaction.activateTerminal(ref);
            this._status = result === 'started'
                ? 'Click empty space to add corners, then click another pin to finish. Press Esc to cancel.'
                : result === 'completed'
                    ? 'Wire added. Drag a segment to adjust it, or use Clean to route it automatically.'
                    : 'Click a pin to start another wire.';
        this.requestUpdate();
    }

    _deselectWire() {
        if (!this._selectedWireId) return false;
        this._selectedWireId = null;
        this._clearWireSelectionVisuals();
        this.wireLayer?.batchDraw();
        this.requestUpdate();
        return true;
    }

    _selectedNetView() {
        if (!this._selectedWireId) return null;
        const net = inspectWireNet(this.store.project, this._selectedWireId);
        if (!net) return null;
        const components = new Map(this.store.project.components.map(component => [component.id, component]));
        const terminals = net.terminals.map(terminal => {
            const component = components.get(terminal.componentId);
            const definition = getPhysicalComponentDefinition(terminal.definitionId) || componentLibrary[terminal.definitionId];
            return {
                ...terminal,
                componentName: definition?.name || terminal.definitionId,
                componentRef: component?.id || terminal.componentId,
            };
        }).sort((a, b) => a.componentName.localeCompare(b.componentName)
            || a.componentRef.localeCompare(b.componentRef)
            || String(a.pinId).localeCompare(String(b.pinId), undefined, { numeric: true }));
        return { label: net.label, wireCount: net.wireIds.length, terminals };
    }

    _onWheel(event) {
        event.evt.preventDefault();
        const pointer = this.stage.getPointerPosition();
        const worldBefore = screenToWorld(pointer, this.camera);
        const direction = event.evt.deltaY > 0 ? 1 / 1.12 : 1.12;
        this.camera.zoom = Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, this.camera.zoom * direction));
        const scale = this.camera.pixelsPerMillimetre * this.camera.zoom;
        this.camera.panX = pointer.x - worldBefore.x * scale;
        this.camera.panY = pointer.y - worldBefore.y * scale;
        this._applyCamera();
    }

    _zoomBy(factor) {
        const center = { x: this.stage.width() / 2, y: this.stage.height() / 2 };
        const worldBefore = screenToWorld(center, this.camera);
        this.camera.zoom = Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, this.camera.zoom * factor));
        const scale = this.camera.pixelsPerMillimetre * this.camera.zoom;
        this.camera.panX = center.x - worldBefore.x * scale;
        this.camera.panY = center.y - worldBefore.y * scale;
        this._applyCamera();
    }

    _resetCamera = () => {
        this.camera.zoom = 1;
        this.camera.panX = 36;
        this.camera.panY = 28;
        this._applyCamera();
    };

    _onDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!this._dragOver) { this._dragOver = true; this.requestUpdate(); }
    }

    _onDragLeave(event) {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        this._dragOver = false;
        this.requestUpdate();
    }

    _onDrop(event) {
        event.preventDefault();
        this._dragOver = false;
        const definitionId = event.dataTransfer.getData('text/plain');
        const footprint = defaultFootprintForComponent(definitionId);
        if (!footprint) {
            this._status = 'Move this item by dragging the breadboard itself.';
            this.requestUpdate();
            return;
        }
        const rect = this.stage.container().getBoundingClientRect();
        const world = screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, this.camera);
        const component = createComponentInstance({
            id: this.store.newComponentId(), definitionId, footprintId: footprint.id, x: world.x, y: world.y,
        });
        this.store.execute(addComponentCommand(component));
        if (footprint.placementMode === 'breadboard-rigid') {
            this.interaction.beginComponentDrag(component.id);
            this.interaction.updateComponentDrag(world);
            this.interaction.commitComponentDrag(world);
        }
        const mounted = this.store.project.components.find(item => item.id === component.id)?.placement.type === 'surface';
        this._selectedComponentId = component.id;
        this._deselectWire();
        this._selectedSurfaceId = null;
            this._status = mounted
                ? `${getPhysicalComponentDefinition(definitionId).name} snapped into ${footprint.pins.length} valid breadboard holes.`
                : `Drag ${getPhysicalComponentDefinition(definitionId).name} to move it, or place it over a breadboard to snap it in.`;
        this._renderComponentVisuals();
        this.requestUpdate();
    }

    _quickAddPhysical(definitionId) {
        const footprint = defaultFootprintForComponent(definitionId);
        if (!footprint) {
            this._status = 'That library item cannot be placed as a movable component.';
            this.requestUpdate();
            return;
        }
        const board = this.store.project.surfaces.find(surface => getSurfaceDefinition(surface));
        const offset = this.store.project.components.filter(item => item.placement?.type === 'free').length * 5;
        const fallback = board
            ? { x: board.transform.x + getSurfaceDefinition(board).width + 10 + offset, y: board.transform.y + 12 + offset }
            : { x: 35, y: 25 };
        const component = createComponentInstance({
            id: this.store.newComponentId(), definitionId, footprintId: footprint.id, x: fallback.x, y: fallback.y,
        });
        this.store.execute(addComponentCommand(component));
        if (footprint.placementMode !== 'breadboard-rigid') {
            this._selectedComponentId = component.id;
            this._deselectWire();
            this._selectedSurfaceId = null;
                this._status = `${getPhysicalComponentDefinition(definitionId).name} added. Drag it to move, or click a pin to start wiring.`;
            this._renderComponentVisuals();
            this.requestUpdate();
            return;
        }
        this.interaction.beginComponentDrag(component.id);

        let pointer = fallback;
        if (board) {
            const holes = getSurfaceDefinition(board).holes.filter(hole => hole.zone === 'terminal');
            for (const hole of holes) {
                pointer = holeWorldPosition(board, hole.id);
                if (this.interaction.updateComponentDrag(pointer)) break;
            }
        }
        this.interaction.commitComponentDrag(pointer);
        const mounted = this.store.project.components.find(item => item.id === component.id)?.placement.type === 'surface';
        this._selectedComponentId = component.id;
        this._deselectWire();
        this._selectedSurfaceId = null;
            this._status = mounted
                ? `${getPhysicalComponentDefinition(definitionId).name} snapped into the next available breadboard position.`
                : `No valid breadboard space was available. Move ${getPhysicalComponentDefinition(definitionId).name} beside the board or make room.`;
        this._renderComponentVisuals();
        this.requestUpdate();
    }

    _onKeyDown(event) {
        const target = event.composedPath?.()[0] || event.target;
        if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
        const modifier = event.ctrlKey || event.metaKey;
        if (modifier && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            event.shiftKey ? this.store.redo() : this.store.undo();
        } else if (modifier && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            this.store.redo();
        } else if (event.key === 'Escape') {
            this.interaction.cancel();
            this._status = 'Interaction cancelled.';
            this.requestUpdate();
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && (this._selectedComponentId || this._selectedWireId || this._selectedSurfaceId)) {
            event.preventDefault();
            this._deleteSelected();
        }
    }

    _deleteSelected = () => {
        if (this._selectedWireId) {
            this.store.execute(deleteWireCommand(this._selectedWireId));
            this._selectedWireId = null;
            this.interaction.cancel();
            this._status = 'Wire deleted.';
            this.requestUpdate();
            return;
        }
        if (this._selectedSurfaceId) {
            const surfaceId = this._selectedSurfaceId;
            this.store.execute(deleteSurfaceCommand(surfaceId));
            this._selectedSurfaceId = null;
            this._status = 'Breadboard removed. Mounted components were detached into free space; board-hole wires were removed.';
            this.requestUpdate();
            return;
        }
        if (!this._selectedComponentId) return;
        const component = this.store.project.components.find(item => item.id === this._selectedComponentId);
        if (!component) return;
        const name = getPhysicalComponentDefinition(component.definitionId)?.name || component.definitionId;
        this.store.execute(deleteComponentCommand(component.id));
        this._selectedComponentId = null;
        this.interaction.cancel();
        this._status = `${name} deleted. Connected wires were removed too.`;
        this.requestUpdate();
    };
}

customElements.define('circuit-canvas', CircuitCanvas);
