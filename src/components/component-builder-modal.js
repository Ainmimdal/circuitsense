import { LitElement, html, css } from 'lit';
import {
    componentLibrary,
    getComponentVisualOverride,
    PIN,
    registerComponentVisualOverride,
    registerCustomComponent,
    resetComponentVisualOverride,
} from '../component-library.js';
import { getPartDefinition } from '../core/part-registry.js';
import { measureImageContent, normalizeContentBounds } from '../core/image-content-bounds.js';
import { createPartVisualElement } from '../core/visual-adapter.js';
import { faIcon } from '../utils/fa-icons.js';

const PIN_TYPES = [
    PIN.VCC,
    PIN.GND,
    PIN.DIGITAL,
    PIN.ANALOG,
    PIN.PWM,
    PIN.I2C_SDA,
    PIN.I2C_SCL,
    PIN.SIGNAL,
    PIN.DATA,
];

const PIN_GRID_SIZE = 10;

class ComponentBuilderModal extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        componentId: { attribute: false },
        _step: { state: true },
        _name: { state: true },
        _description: { state: true },
        _currentDraw: { state: true },
        _imageUrl: { state: true },
        _imageWidth: { state: true },
        _imageHeight: { state: true },
        _contentBounds: { state: true },
        _pins: { state: true },
        _selectedPinIndex: { state: true },
        _error: { state: true },
        _editingComponentId: { state: true },
    };

    static styles = css`
        :host {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 1200;
            background: rgba(0, 0, 0, 0.68);
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        }

        :host([open]) {
            display: flex;
        }

        .modal {
            width: min(920px, calc(100vw - 32px));
            max-height: min(820px, calc(100vh - 32px));
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 10px;
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
            overflow: hidden;
        }

        .header,
        .footer {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 16px;
            background: #111113;
            border-bottom: 1px solid #27272a;
        }

        .footer {
            border-top: 1px solid #27272a;
            border-bottom: 0;
            justify-content: flex-end;
        }

        .title {
            flex: 1;
            color: #fafafa;
            font-size: 14px;
            font-weight: 600;
        }

        .close-btn,
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            height: 34px;
            padding: 0 12px;
            border-radius: 6px;
            border: 1px solid #3f3f46;
            background: #27272a;
            color: #d4d4d8;
            font: inherit;
            font-size: 12px;
            cursor: pointer;
        }

        .close-btn {
            width: 34px;
            padding: 0;
        }

        .btn:hover,
        .close-btn:hover {
            background: #3f3f46;
            color: #fafafa;
        }

        .btn.primary {
            border-color: var(--primary);
            background: var(--primary);
            color: #fff;
        }

        .btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        .steps {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            border-bottom: 1px solid #27272a;
            background: #18181b;
        }

        .step {
            padding: 10px 14px;
            color: #71717a;
            font-size: 11px;
            border-right: 1px solid #27272a;
        }

        .step:last-child {
            border-right: 0;
        }

        .step.active {
            color: var(--text);
            background: var(--primary);
        }

        .body {
            overflow: auto;
            padding: 16px;
        }

        .layout {
            display: grid;
            grid-template-columns: minmax(280px, 1fr) 320px;
            gap: 16px;
            align-items: start;
        }

        .panel {
            border: 1px solid #27272a;
            border-radius: 8px;
            background: #111113;
            padding: 14px;
        }

        .panel-title {
            margin: 0 0 10px;
            color: #fafafa;
            font-size: 13px;
            font-weight: 600;
        }

        .upload-zone {
            display: grid;
            place-items: center;
            min-height: 240px;
            border: 1px dashed #3f3f46;
            border-radius: 8px;
            background: #0c0c0e;
            color: #71717a;
            text-align: center;
            padding: 18px;
        }

        .upload-zone input {
            margin-top: 12px;
            max-width: 100%;
            color: #a1a1aa;
        }

        .preview-shell {
            display: grid;
            place-items: center;
            min-height: 360px;
            border: 1px solid #27272a;
            border-radius: 8px;
            background-image: radial-gradient(circle, rgba(113, 113, 122, 0.35) 1px, transparent 1px);
            background-size: 18px 18px;
            overflow: hidden;
            padding: 20px;
        }

        .preview {
            position: relative;
            line-height: 0;
            cursor: default;
            touch-action: none;
        }

        .preview img,
        .custom-thumb {
            display: block;
            object-fit: contain;
            user-select: none;
            -webkit-user-drag: none;
        }

        .provider-artwork {
            position: absolute;
            inset: 0 auto auto 0;
            display: flex;
            transform-origin: 0 0;
            pointer-events: none;
        }

        .pin-marker {
            position: absolute;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            border: 2px solid #fff;
            background: #22c55e;
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
            cursor: grab;
            pointer-events: auto;
        }

        .pin-marker:active {
            cursor: grabbing;
        }

        .pin-marker.selected {
            box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary-hover) 34%, transparent);
        }

        .pin-marker.power {
            background: #ef4444;
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.25);
        }

        .pin-marker.ground {
            background: #111827;
            box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.16);
        }

        label {
            display: grid;
            gap: 6px;
            margin-bottom: 10px;
            color: #a1a1aa;
            font-size: 11px;
        }

        input,
        textarea,
        select {
            width: 100%;
            border: 1px solid #3f3f46;
            border-radius: 6px;
            background: #27272a;
            color: #fafafa;
            padding: 8px 9px;
            font: inherit;
            font-size: 12px;
            box-sizing: border-box;
        }

        textarea {
            min-height: 66px;
            resize: vertical;
        }

        .pin-list {
            display: grid;
            gap: 8px;
            margin-top: 10px;
        }

        .pin-row {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 34px;
            grid-template-areas:
                "name name name remove"
                "type x y remove";
            gap: 8px;
            align-items: end;
            box-sizing: border-box;
            width: 100%;
        }

        .pin-row.selected {
            padding: 8px;
            border: 1px solid var(--primary-hover);
            border-radius: 8px;
            background: color-mix(in srgb, var(--primary) 8%, transparent);
        }

        .pin-row label {
            min-width: 0;
            margin-bottom: 0;
        }

        .pin-row .pin-name-field {
            grid-area: name;
        }

        .pin-row .pin-type-field {
            grid-area: type;
        }

        .pin-row .pin-x-field {
            grid-area: x;
        }

        .pin-row .pin-y-field {
            grid-area: y;
        }

        .pin-row button {
            grid-area: remove;
            height: 34px;
            border: 1px solid #3f3f46;
            border-radius: 6px;
            background: #27272a;
            color: #ef4444;
            cursor: pointer;
        }

        .meta {
            color: #71717a;
            font-size: 11px;
            line-height: 1.5;
        }

        .pin-hint {
            margin: 10px 0 0;
            color: #71717a;
            font-size: 11px;
            line-height: 1.5;
        }

        .placement-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 12px;
        }

        .placement-actions .btn {
            height: 32px;
        }

        .error {
            margin-right: auto;
            color: #fca5a5;
            font-size: 12px;
        }

        .editing-note {
            margin: 0 0 12px;
            padding: 9px 10px;
            border-left: 3px solid var(--primary-hover);
            color: var(--text-muted);
            background: color-mix(in srgb, var(--primary) 20%, transparent);
            font-size: 11px;
            line-height: 1.5;
        }

        :host { background: color-mix(in srgb, var(--ink) 72%, transparent); font-family: var(--font-ui, 'Public Sans', sans-serif); }
        .modal, .header, .footer, .steps, .panel, .upload-zone { background: var(--panel); border-color: var(--panel-border); color: var(--text); }
        .modal, .panel, .upload-zone { border-radius: 4px; }
        .title, .panel-title { color: var(--text); }
        .close-btn, .btn, .pin-row button { height: 34px; box-sizing: border-box; padding: 0 14px; border-radius: 4px; border-color: var(--panel-border); background: var(--panel); color: var(--text); }
        .close-btn { width: 34px; padding: 0; }
        .btn:hover, .close-btn:hover, .pin-row button:hover { background: var(--primary-hover); color: var(--text); }
        .btn.primary { border-color: var(--primary); background: var(--primary); color: var(--text); }
        .btn.primary:hover { background: var(--primary-hover); }
        .step { color: var(--text-muted); border-color: var(--panel-border); }
        .step.active { color: var(--text); background: var(--primary); }
        .preview-shell { border-color: var(--panel-border); border-radius: 4px; background-color: var(--ink); background-image: radial-gradient(circle, var(--panel-border) 1px, transparent 1px); }
        .pin-marker.selected { box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary-hover) 52%, transparent); }
        label, .meta, .pin-hint, .upload-zone { color: var(--text-muted); }
        input, textarea, select { border-color: var(--panel-border); border-radius: 4px; background: var(--panel); color: var(--text); }
        input:not([type="file"]), select { height: 34px; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary-hover); }
        .pin-row.selected { border-color: var(--primary-hover); border-radius: 4px; background: color-mix(in srgb, var(--primary) 28%, transparent); }
        .placement-actions .btn { height: 34px; }

        @media (max-width: 760px) {
            .layout {
                grid-template-columns: 1fr;
            }

            .steps {
                grid-template-columns: 1fr;
            }
        }
    `;

    constructor() {
        super();
        this.open = false;
        this.componentId = null;
        this._reset();
    }

    _reset() {
        this._step = 1;
        this._name = '';
        this._description = '';
        this._currentDraw = 0;
        this._imageUrl = '';
        this._imageWidth = 0;
        this._imageHeight = 0;
        this._contentBounds = null;
        this._pins = [];
        this._selectedPinIndex = -1;
        this._error = '';
        this._editingComponentId = null;
        this._sessionComponentId = null;
        this._visualComponent = null;
    }

    updated(changedProperties) {
        if (this.open && (changedProperties.has('open') || changedProperties.has('componentId')) &&
            this._sessionComponentId !== (this.componentId || null)) {
            this._beginSession(this.componentId || null);
            return;
        }
        if (this.open && this._editingComponentId) this._mountProviderArtwork();
    }

    _beginSession(componentId) {
        this._reset();
        this._sessionComponentId = componentId;
        if (!componentId) return;
        const component = componentLibrary[componentId];
        const part = getPartDefinition(componentId);
        const adapterPins = part?.visualAdapter?.nativePins || {};
        const customPins = Object.fromEntries((component?.customPins || []).map(pin => [pin.name, {
            x: Number(pin.x),
            y: Number(pin.y),
        }]));
        const nativePins = Object.keys(adapterPins).length ? adapterPins : customPins;
        const sourceSize = part?.visualAdapter?.sourceSize || component?.size;
        if (!component || !sourceSize?.width || !sourceSize?.height || !Object.keys(nativePins).length) {
            this._error = 'This component does not expose editable visual pin coordinates.';
            return;
        }
        this._editingComponentId = componentId;
        this._visualComponent = component;
        this._imageUrl = component.imageUrl || '';
        this._name = component.name || componentId;
        this._description = component.description || '';
        this._currentDraw = Number(component.currentDraw_mA) || 0;
        this._imageWidth = Number(sourceSize.width);
        this._imageHeight = Number(sourceSize.height);
        this._contentBounds = normalizeContentBounds(component.contentBounds, sourceSize);
        this._pins = Object.entries(nativePins).map(([name, point]) => ({
            name,
            type: component.pinMeta?.[name] || PIN.SIGNAL,
            x: Number(point.x),
            y: Number(point.y),
        }));
        this._selectedPinIndex = this._pins.length ? 0 : -1;
        this._step = 2;
    }

    _close() {
        this.open = false;
        this.dispatchEvent(new CustomEvent('close', {
            bubbles: true,
            composed: true,
        }));
        this._reset();
    }

    async _onFileChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            this._error = 'Please upload a PNG, JPG, or SVG image.';
            return;
        }

        try {
            const imageUrl = await this._readFileAsDataUrl(file);
            const metrics = await measureImageContent(imageUrl);
            this._imageUrl = imageUrl;
            this._imageWidth = metrics.size.width;
            this._imageHeight = metrics.size.height;
            this._contentBounds = metrics.contentBounds;
            this._name = this._name || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
            this._pins = [];
            this._selectedPinIndex = -1;
            this._step = 2;
            this._error = '';
        } catch (err) {
            this._error = 'Could not read that image.';
        }
    }

    _readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    _addPin() {
        if (!this._imageUrl) return;
        const nextIndex = this._pins.length + 1;
        const offset = (nextIndex - 1) * PIN_GRID_SIZE;
        const content = normalizeContentBounds(this._contentBounds, {
            width: this._imageWidth,
            height: this._imageHeight,
        });
        const x = this._clampCoord(this._snapCoord(content.x + content.width / 2 + offset), this._imageWidth);
        const y = this._clampCoord(this._snapCoord(content.y + content.height / 2 + offset), this._imageHeight);
        this._pins = [
            ...this._pins,
            { name: `PIN${nextIndex}`, type: PIN.SIGNAL, x, y },
        ];
        this._selectedPinIndex = this._pins.length - 1;
        this._step = 3;
    }

    _updatePin(index, patch) {
        this._pins = this._pins.map((pin, i) => {
            if (i !== index) return pin;
            const next = { ...pin, ...patch };
            if ('x' in patch) next.x = this._clampCoord(patch.x, this._imageWidth);
            if ('y' in patch) next.y = this._clampCoord(patch.y, this._imageHeight);
            return next;
        });
    }

    _removePin(index) {
        this._pins = this._pins.filter((_, i) => i !== index);
        if (this._selectedPinIndex === index) {
            this._selectedPinIndex = -1;
        } else if (this._selectedPinIndex > index) {
            this._selectedPinIndex--;
        }
    }

    _stopShortcutPropagation(e) {
        e.stopPropagation();
    }

    _selectPin(index) {
        this._selectedPinIndex = index;
        this._step = 3;
    }

    _clampCoord(value, max) {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        return Math.max(0, Math.min(max, Math.round(num * 100) / 100));
    }

    _snapCoord(value) {
        return Math.round(value / PIN_GRID_SIZE) * PIN_GRID_SIZE;
    }

    _pointFromEvent(e, snapToGrid = false) {
        const preview = e.currentTarget.closest?.('.preview') || e.currentTarget;
        const rect = preview.getBoundingClientRect();
        const bounds = this._previewBounds();
        let x = bounds.x + (e.clientX - rect.left) / rect.width * bounds.width;
        let y = bounds.y + (e.clientY - rect.top) / rect.height * bounds.height;
        if (snapToGrid) {
            x = this._snapCoord(x);
            y = this._snapCoord(y);
        }
        return {
            x: this._clampCoord(x, this._imageWidth),
            y: this._clampCoord(y, this._imageHeight),
        };
    }

    _startPinDrag(e, index) {
        e.preventDefault();
        e.stopPropagation();
        this._selectPin(index);

        const marker = e.currentTarget;
        marker.setPointerCapture(e.pointerId);

        const onMove = (moveEvent) => {
            const point = this._pointFromEvent(moveEvent, !this._editingComponentId);
            this._updatePin(index, point);
        };

        const onUp = (upEvent) => {
            marker.releasePointerCapture(upEvent.pointerId);
            marker.removeEventListener('pointermove', onMove);
            marker.removeEventListener('pointerup', onUp);
            marker.removeEventListener('pointercancel', onUp);
        };

        marker.addEventListener('pointermove', onMove);
        marker.addEventListener('pointerup', onUp);
        marker.addEventListener('pointercancel', onUp);
    }

    _pinClass(pin) {
        const normalizedType = String(pin?.type || '').toUpperCase();
        const normalizedName = String(pin?.name || '').toUpperCase();
        const powerNames = new Set([PIN.VCC, 'VDD', 'VIN', 'V+', 'PWR', 'POWER', '5V', '3.3V']);
        const groundNames = new Set([PIN.GND, 'VSS', 'GND2', 'DGND', 'AGND']);

        if (powerNames.has(normalizedType) || powerNames.has(normalizedName)) return 'power';
        if (groundNames.has(normalizedType) || groundNames.has(normalizedName)) return 'ground';
        return 'signal';
    }

    _pinMarkerStyle(pin) {
        const bounds = this._previewBounds();
        const left = (pin.x - bounds.x) / bounds.width * 100;
        const top = (pin.y - bounds.y) / bounds.height * 100;
        const pinClass = this._pinClass(pin);

        if (pinClass === 'power') {
            return `left:${left}%; top:${top}%; background:#ef4444; box-shadow:0 0 0 3px rgba(239, 68, 68, 0.25);`;
        }
        if (pinClass === 'ground') {
            return `left:${left}%; top:${top}%; background:#111827; box-shadow:0 0 0 3px rgba(255, 255, 255, 0.16);`;
        }
        return `left:${left}%; top:${top}%; background:#22c55e; box-shadow:0 0 0 3px rgba(34, 197, 94, 0.25);`;
    }

    _previewScale() {
        if (!(this._imageWidth > 0) || !(this._imageHeight > 0)) return 1;
        const bounds = this._previewBounds();
        const fit = Math.min(520 / bounds.width, 420 / bounds.height);
        if (!this._editingComponentId) return Math.min(1, fit);
        return Math.max(.2, Math.min(8, fit, Math.max(1, 300 / bounds.width)));
    }

    _previewStyle() {
        const scale = this._previewScale();
        const bounds = this._previewBounds();
        return `width:${bounds.width * scale}px; height:${bounds.height * scale}px;`;
    }

    _previewBounds() {
        const content = normalizeContentBounds(this._contentBounds, {
            width: this._imageWidth,
            height: this._imageHeight,
        });
        const xs = [content.x, content.x + content.width, ...this._pins.map(pin => Number(pin.x)).filter(Number.isFinite)];
        const ys = [content.y, content.y + content.height, ...this._pins.map(pin => Number(pin.y)).filter(Number.isFinite)];
        const x = Math.max(0, Math.min(...xs));
        const y = Math.max(0, Math.min(...ys));
        return {
            x,
            y,
            width: Math.max(1, Math.min(this._imageWidth, Math.max(...xs)) - x),
            height: Math.max(1, Math.min(this._imageHeight, Math.max(...ys)) - y),
        };
    }

    _customImageStyle() {
        const scale = this._previewScale();
        const bounds = this._previewBounds();
        return `position:absolute;left:${-bounds.x * scale}px;top:${-bounds.y * scale}px;` +
            `width:${this._imageWidth * scale}px;height:${this._imageHeight * scale}px;max-width:none;max-height:none;`;
    }

    _mountProviderArtwork() {
        const mount = this.renderRoot.querySelector('.provider-artwork-mount');
        if (!mount) return;
        const component = componentLibrary[this._editingComponentId] || this._visualComponent;
        let artwork = mount.firstElementChild;
        if (!artwork || mount.dataset.componentId !== this._editingComponentId) {
            artwork = createPartVisualElement(component);
            if (!artwork) return;
            artwork.classList.add('provider-artwork');
            mount.replaceChildren(artwork);
            mount.dataset.componentId = this._editingComponentId;
        }
        const scale = this._previewScale();
        const bounds = this._previewBounds();
        artwork.style.left = `${-bounds.x * scale}px`;
        artwork.style.top = `${-bounds.y * scale}px`;
        artwork.style.width = `${this._imageWidth}px`;
        artwork.style.height = `${this._imageHeight}px`;
        artwork.style.transform = `scale(${scale})`;
    }

    _slugify(value) {
        return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-component';
    }

    _canSave() {
        const hasArtwork = this._editingComponentId || this._imageUrl;
        return hasArtwork && this._name.trim() && this._pins.length > 0 &&
            this._pins.every(pin => pin.name.trim());
    }

    _save() {
        if (!this._canSave()) {
            this._error = 'Add an image, name the component, and define at least one named pin.';
            return;
        }

        if (this._editingComponentId) {
            const current = componentLibrary[this._editingComponentId];
            if (current?.type === 'custom') {
                const existingPins = new Map((current.customPins || []).map(pin => [pin.name, pin]));
                const customPins = this._pins.map(pin => ({
                    ...(existingPins.get(pin.name) || {}),
                    name: pin.name,
                    type: pin.type,
                    x: Number(pin.x),
                    y: Number(pin.y),
                }));
                const saved = registerCustomComponent({
                    ...current,
                    id: this._editingComponentId,
                    imageUrl: this._imageUrl || current.imageUrl,
                    size: { width: this._imageWidth, height: this._imageHeight },
                    contentBounds: this._contentBounds,
                    customPins,
                });
                if (!saved) {
                    this._error = 'Could not save the custom component pin alignment.';
                    return;
                }
                this.dispatchEvent(new CustomEvent('component-updated', {
                    detail: { componentId: this._editingComponentId, component: saved },
                    bubbles: true,
                    composed: true,
                }));
                this._close();
                return;
            }
            const nativePins = Object.fromEntries(this._pins.map(pin => [pin.name, {
                x: Number(pin.x),
                y: Number(pin.y),
            }]));
            const saved = registerComponentVisualOverride(this._editingComponentId, { nativePins });
            if (!saved) {
                this._error = 'Could not save the visual pin alignment.';
                return;
            }
            this.dispatchEvent(new CustomEvent('component-updated', {
                detail: { componentId: this._editingComponentId, visualOverride: saved },
                bubbles: true,
                composed: true,
            }));
            this._close();
            return;
        }

        const id = `custom-${this._slugify(this._name)}-${Date.now()}`;
        const pinMeta = {};
        const customPins = this._pins.map(pin => {
            const name = pin.name.trim();
            pinMeta[name] = pin.type;
            return {
                name,
                type: pin.type,
                x: pin.x,
                y: pin.y,
            };
        });

        const saved = registerCustomComponent({
            id,
            name: this._name.trim(),
            description: this._description.trim() || 'Custom uploaded component',
            imageUrl: this._imageUrl,
            size: { width: this._imageWidth, height: this._imageHeight },
            contentBounds: this._contentBounds,
            customPins,
            pinMeta,
            currentDraw_mA: Number(this._currentDraw) || 0,
        });

        if (!saved) {
            this._error = 'Could not save this component.';
            return;
        }

        this.dispatchEvent(new CustomEvent('component-created', {
            detail: { component: saved },
            bubbles: true,
            composed: true,
        }));
        this._close();
    }

    _resetVisualOverride() {
        const componentId = this._editingComponentId;
        if (!componentId || !resetComponentVisualOverride(componentId)) return;
        this._beginSession(componentId);
        this._error = '';
    }

    _renderPreview() {
        if (this._editingComponentId) {
            return html`
                <div class="preview-shell">
                    <div class="preview" style=${this._previewStyle()}>
                        <div class="provider-artwork-mount"></div>
                        ${this._renderPinMarkers()}
                    </div>
                </div>
            `;
        }
        if (!this._imageUrl) {
            return html`
                <div class="upload-zone">
                    <div>
                        <div style="font-size:32px; margin-bottom:8px;">${faIcon('upload')}</div>
                        <div>Upload a PNG, JPG, or SVG image.</div>
                        <input type="file" accept="image/png,image/jpeg,image/svg+xml" @change=${this._onFileChange} />
                    </div>
                </div>
            `;
        }

        return html`
            <div class="preview-shell">
                <div class="preview" style=${this._previewStyle()}>
                    <img src=${this._imageUrl} alt="Custom component preview" style=${this._customImageStyle()} />
                    ${this._renderPinMarkers()}
                </div>
            </div>
        `;
    }

    _renderPinMarkers() {
        return this._pins.map((pin, index) => html`
            <span
                class="pin-marker ${this._pinClass(pin)} ${this._selectedPinIndex === index ? 'selected' : ''}"
                style=${this._pinMarkerStyle(pin)}
                title=${pin.name}
                @pointerdown=${e => this._startPinDrag(e, index)}
            ></span>
        `);
    }

    render() {
        if (!this.open) return html``;

        return html`
            <div
                class="modal"
                @keydown=${this._stopShortcutPropagation}
                @keyup=${this._stopShortcutPropagation}
                @keypress=${this._stopShortcutPropagation}
            >
                <div class="header">
                    <div class="title">${this._editingComponentId ? `Edit ${this._name}` : 'Custom Component Builder'}</div>
                    <button class="close-btn" @click=${this._close} title="Close">${faIcon('xmark')}</button>
                </div>

                <div class="steps">
                    <div class="step ${this._step === 1 ? 'active' : ''}">1. ${this._editingComponentId ? 'Existing artwork' : 'Upload image'}</div>
                    <div class="step ${this._step === 2 ? 'active' : ''}">2. Place pins</div>
                    <div class="step ${this._step === 3 ? 'active' : ''}">3. Rules and metadata</div>
                </div>

                <div class="body">
                    <div class="layout">
                        <div class="panel">
                            <h3 class="panel-title">Image and pin placement</h3>
                            ${this._editingComponentId ? html`
                                <p class="editing-note">
                                    Drag the markers onto the real artwork. This changes visual alignment only;
                                    electrical pin names, roles, breadboard spacing, and validation rules stay unchanged.
                                </p>
                            ` : ''}
                            ${this._renderPreview()}
                            ${this._imageUrl || this._editingComponentId ? html`
                                <p class="meta">
                                    Artwork coordinates: ${Math.round(this._imageWidth * 100) / 100} × ${Math.round(this._imageHeight * 100) / 100}.
                                </p>
                                ${this._editingComponentId ? html`
                                    <p class="pin-hint">Drag freely, or enter exact decimal X/Y coordinates in the pin table.</p>
                                ` : html`
                                    <div class="placement-actions">
                                        <button class="btn" @click=${this._addPin}>${faIcon('plus')} Add pin</button>
                                    </div>
                                    <p class="pin-hint">Drag a pin to move it on a ${PIN_GRID_SIZE}px grid, or set exact X/Y coordinates in the pin table.</p>
                                `}
                            ` : ''}
                        </div>

                        <div class="panel">
                            <h3 class="panel-title">Component rules</h3>
                            <label>
                                Name
                                <input .value=${this._name} ?disabled=${Boolean(this._editingComponentId)}
                                    @input=${e => { this._name = e.target.value; }} placeholder="e.g. Soil moisture sensor" />
                            </label>
                            <label>
                                Description
                                <textarea .value=${this._description} ?disabled=${Boolean(this._editingComponentId)}
                                    @input=${e => { this._description = e.target.value; }} placeholder="Short description shown in the sidebar"></textarea>
                            </label>
                            <label>
                                Current draw (mA)
                                <input type="number" min="0" .value=${String(this._currentDraw)} ?disabled=${Boolean(this._editingComponentId)}
                                    @input=${e => { this._currentDraw = e.target.value; }} />
                            </label>

                            <h3 class="panel-title">Pins</h3>
                            ${this._pins.length === 0 ? html`
                                <p class="meta">Use Add pin to create a pin, then drag it or enter exact coordinates.</p>
                            ` : html`
                                <div class="pin-list">
                                    ${this._pins.map((pin, index) => html`
                                        <div class="pin-row ${this._selectedPinIndex === index ? 'selected' : ''}" @click=${() => this._selectPin(index)}>
                                            <label class="pin-name-field">
                                                Pin name
                                                <input
                                                    .value=${pin.name}
                                                    ?disabled=${Boolean(this._editingComponentId)}
                                                    @input=${e => this._updatePin(index, { name: e.target.value })}
                                                />
                                            </label>
                                            <label class="pin-type-field">
                                                Type
                                                <select .value=${pin.type || PIN.SIGNAL} ?disabled=${Boolean(this._editingComponentId)}
                                                    @change=${e => this._updatePin(index, { type: e.target.value })}>
                                                    ${PIN_TYPES.map(type => html`<option value=${type}>${type}</option>`)}
                                                </select>
                                            </label>
                                            <label class="pin-x-field">
                                                X
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max=${this._imageWidth}
                                                    step=${this._editingComponentId ? '0.01' : '1'}
                                                    .value=${String(pin.x)}
                                                    @input=${e => this._updatePin(index, { x: e.target.value })}
                                                />
                                            </label>
                                            <label class="pin-y-field">
                                                Y
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max=${this._imageHeight}
                                                    step=${this._editingComponentId ? '0.01' : '1'}
                                                    .value=${String(pin.y)}
                                                    @input=${e => this._updatePin(index, { y: e.target.value })}
                                                />
                                            </label>
                                            ${this._editingComponentId ? '' : html`
                                                <button @click=${() => this._removePin(index)} title="Remove pin">${faIcon('trash')}</button>
                                            `}
                                        </div>
                                    `)}
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                <div class="footer">
                    ${this._error ? html`<span class="error">${this._error}</span>` : ''}
                    ${this._editingComponentId && getComponentVisualOverride(this._editingComponentId) ? html`
                        <button class="btn" @click=${this._resetVisualOverride}>${faIcon('rotateLeft')} Reset alignment</button>
                    ` : ''}
                    <button class="btn" @click=${this._close}>Cancel</button>
                    <button class="btn primary" @click=${this._save} ?disabled=${!this._canSave()}>
                        ${faIcon('save')} ${this._editingComponentId ? 'Save alignment' : 'Save component'}
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('component-builder-modal', ComponentBuilderModal);
