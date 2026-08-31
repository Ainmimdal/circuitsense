import { store } from '../store.js';
import { getComponentDef, PIN } from '../component-library.js';
import {
    BREADBOARD,
    breadboardHoles,
    decideBreadboard,
    findBreadboardCapacity,
    getBreadboardGroup,
    getBreadboardHole,
    inferJumperType,
    occupiedBreadboardHoles,
} from '../breadboard-model.js';
import {
    createRigidPlacementTransform,
    deriveFootprintHoles,
    footprintIsBreadboardLegal,
    getComponentGeometry,
    getFootprint,
} from '../core/component-geometry.js';
import { getBoardDefinition, boardTypeForComponentId } from '../core/board-registry.js';

function touches(end, instanceId, pinName) {
    return end.instanceId === instanceId && end.pinName === pinName;
}

function footprintFor(inst, def, pins) {
    const pinInfo = store.pinInfoMap.get(inst.id) || [];
    const points = pins.map((name, index) => {
        const resolved = store.resolvePinName(pinInfo, name);
        const pin = pinInfo.find(item => item.name === resolved);
        return { name, x: pin?.x ?? index * BREADBOARD.pitch, y: pin?.y ?? 0 };
    });
    if (!pinInfo.length && pins.length === 2 && def.breadboard?.footprint?.pinSpan) {
        points[1].x = def.breadboard.footprint.pinSpan * BREADBOARD.pitch;
    }
    const minX = Math.min(...points.map(pin => pin.x));
    const minY = Math.min(...points.map(pin => pin.y));
    const grid = points.map(pin => ({
        ...pin,
        gridX: Math.round((pin.x - minX) / BREADBOARD.pitch),
        gridY: Math.round((pin.y - minY) / BREADBOARD.pitch),
    }));
    const maxGridY = Math.max(...grid.map(pin => pin.gridY));
    const maxX = Math.max(...points.map(pin => pin.x));
    const rowStart = Math.max(0, Math.floor((5 - (maxGridY + 1)) / 2));
    return {
        pins: grid.map(pin => ({ ...pin, row: ['A', 'B', 'C', 'D', 'E'][rowStart + pin.gridY] })),
        width: Math.max(...grid.map(pin => pin.gridX)) + 1,
        leftClearance: Math.ceil(minX / BREADBOARD.pitch),
        rightClearance: Math.ceil(Math.max(0, (def.size?.width || maxX) - maxX) / BREADBOARD.pitch),
    };
}

function pinType(def, pinName) {
    if (def.autoWire?.[pinName]) return def.autoWire[pinName];
    if (def.pinMeta?.[pinName]) return def.pinMeta[pinName];
    const canonical = Object.keys(def.pinMeta || {}).find(name => name === pinName);
    return canonical ? def.pinMeta[canonical] : null;
}

function terminalMate(holeName, occupied) {
    const hole = getBreadboardHole(holeName);
    if (!hole || hole.kind !== 'terminal') return null;
    return breadboardHoles.find(candidate =>
        candidate.group === hole.group && candidate.name !== holeName && !occupied.has(candidate.name)
    )?.name || null;
}

function groupOccupied(holeName, occupied) {
    const group = getBreadboardGroup(holeName);
    return [...occupied.keys()].some(name => getBreadboardGroup(name) === group);
}

function jumperTypeFor(from, to) {
    const connector = end => getComponentDef(store.getInstance(end.instanceId)?.componentId)?.connectorType || 'male';
    return inferJumperType(connector(from), connector(to));
}

function ledResistorPlans(candidates, breadboard, arduino) {
    const plans = new Map();
    const reservedColumns = new Set();
    for (const led of candidates.filter(inst => getComponentDef(inst.componentId)?.id === 'led')) {
        const seriesWire = store.wires.find(wire => {
            const ledEnd = wire.from.instanceId === led.id ? wire.from : wire.to.instanceId === led.id ? wire.to : null;
            if (!ledEnd || ledEnd.pinName !== 'A') return false;
            const other = wire.from.instanceId === led.id ? wire.to : wire.from;
            return getComponentDef(store.getInstance(other.instanceId)?.componentId)?.id === 'resistor';
        });
        if (!seriesWire) continue;
        const resistorEnd = seriesWire.from.instanceId === led.id ? seriesWire.to : seriesWire.from;
        const resistor = store.getInstance(resistorEnd.instanceId);
        if (!resistor || resistor.breadboardPlacement?.locked) continue;
        const resistorPins = ['1', '2'];
        const outputPin = resistorEnd.pinName;
        const inputPin = resistorPins.find(name => name !== outputPin);
        // Keep Wokwi's physical pin order: pin 1 is left and pin 2 is right.
        // The electrical direction of the resistor does not determine its visual direction.
        const outputOffset = Number(outputPin) > Number(inputPin) ? 6 : -6;

        let outputColumn = Number(led.breadboardPlacement?.holes?.A?.match(/\d+$/)?.[0]);
        let inputColumn;
        if (Number.isFinite(outputColumn)) {
            inputColumn = outputColumn - outputOffset;
        } else {
            const boardWire = store.wires.find(wire =>
                (wire.from.instanceId === resistor.id && wire.to.instanceId === arduino?.id) ||
                (wire.to.instanceId === resistor.id && wire.from.instanceId === arduino?.id)
            );
            const boardEnd = boardWire && (boardWire.from.instanceId === arduino.id ? boardWire.from : boardWire.to);
            const boardPosition = boardEnd && store.getPinAbsolutePosition(arduino.id, boardEnd.pinName);
            const preferred = boardPosition
                ? Math.round((boardPosition.x - breadboard.x - 20) / BREADBOARD.pitch) + 1
                : 8;
            const choices = Array.from({ length: 28 }, (_, index) => index + 2)
                .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
            inputColumn = choices.find(column =>
                column + outputOffset >= 2 && column + outputOffset <= 30 &&
                Array.from({ length: Math.abs(outputOffset) + 4 }, (_, index) =>
                    Math.min(column, column + outputOffset) - 1 + index)
                    .every(bodyColumn => !reservedColumns.has(bodyColumn))
            );
            outputColumn = inputColumn + outputOffset;
        }
        if (!inputColumn || inputColumn < 1 || inputColumn > 30 || outputColumn < 2 || outputColumn > 30) continue;
        for (let column = Math.min(inputColumn, outputColumn) - 1; column <= Math.max(inputColumn, outputColumn) + 2; column++) {
            reservedColumns.add(column);
        }
        plans.set(resistor.id, {
            [inputPin]: `E${inputColumn}`,
            [outputPin]: `E${outputColumn}`,
        });
        if (!led.breadboardPlacement?.locked) {
            plans.set(led.id, { A: `B${outputColumn}`, C: `B${outputColumn - 1}` });
        }
    }
    return plans;
}

function removeComponentLeads(instanceId) {
    store.wires = store.wires.filter(wire => !(
        wire.physical?.kind === 'component-lead' &&
        (wire.from.instanceId === instanceId || wire.to.instanceId === instanceId)
    ));
}

export function unmountBreadboardComponent(instanceId) {
    clearBreadboardRealization(instanceId, { preserveLocked: false });
    removeComponentLeads(instanceId);
    const inst = store.getInstance(instanceId);
    if (!inst) return;
    delete inst.mountedOn;
    delete inst.breadboardPlacement;
    delete inst.physicalScale;
    delete inst.uniformScale;
    store.physicalPlan = null;
}

function pinPositionAt(inst, def, pin, x, y) {
    const width = def.size?.width || 80;
    const height = def.size?.height || 60;
    const cx = width / 2;
    const cy = height / 2;
    const scaleX = inst.uniformScale || inst.physicalScale?.x || 1;
    const scaleY = inst.uniformScale || inst.physicalScale?.y || 1;
    const radians = (inst.rotation || 0) * Math.PI / 180;
    const dx = (pin.x - cx) * scaleX;
    const dy = (pin.y - cy) * scaleY;
    return {
        x: x + cx + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: y + cy + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
}

function positionForRigidTransform(def, geometry, transform) {
    const cx = (def.size?.width || geometry.native.size.width) / 2;
    const cy = (def.size?.height || geometry.native.size.height) / 2;
    const dx = (transform.anchorNative.x - cx) * transform.scale;
    const dy = (transform.anchorNative.y - cy) * transform.scale;
    const radians = transform.rotation * Math.PI / 180;
    const rx = dx * Math.cos(radians) - dy * Math.sin(radians);
    const ry = dx * Math.sin(radians) + dy * Math.cos(radians);
    return {
        x: transform.anchorWorld.x - cx - rx,
        y: transform.anchorWorld.y - cy - ry,
    };
}

/**
 * Return an exact hole-aligned visual transform for an in-progress drag.
 * This is deliberately non-committing: mountedOn, occupied holes, wires and
 * history remain unchanged until pointer-up validates the final placement.
 */
export function getBreadboardDragPreview(instanceId, desiredX, desiredY) {
    const inst = store.getInstance(instanceId);
    const def = getComponentDef(inst?.componentId);
    const geometry = getComponentGeometry(inst?.componentId);
    const footprint = getFootprint(inst?.componentId, def?.breadboard?.footprintId);
    if (!inst || !def?.breadboard?.mountable || !geometry || !footprint ||
        !Number.isFinite(desiredX) || !Number.isFinite(desiredY)) return null;

    const center = {
        x: desiredX + (def.size?.width || geometry.native.size.width) / 2,
        y: desiredY + (def.size?.height || geometry.native.size.height) / 2,
    };
    const breadboard = store.instances.find(item => {
        const boardDef = getComponentDef(item.componentId);
        return boardDef?.isBreadboard && center.x >= item.x && center.x <= item.x + boardDef.size.width &&
            center.y >= item.y && center.y <= item.y + boardDef.size.height;
    });
    if (!breadboard) return null;

    const boardDefinition = getBoardDefinition(boardTypeForComponentId(breadboard.componentId));
    const pinInfo = store.pinInfoMap.get(instanceId) || [];
    const resolvedAnchor = store.resolvePinName(pinInfo, footprint.anchorPin);
    const anchorPin = pinInfo.find(pin => pin.name === resolvedAnchor);
    if (!boardDefinition || !anchorPin) return null;

    const desiredAnchor = pinPositionAt(inst, def, anchorPin, desiredX, desiredY);
    const occupied = new Set(store.instances
        .filter(other => other.id !== instanceId && other.mountedOn === breadboard.id)
        .flatMap(other => Object.values(other.breadboardPlacement?.holes || {})));
    const currentRotation = ((Number(inst.rotation) % 360) + 360) % 360;
    const rotations = footprint.rotations.includes(currentRotation)
        ? [currentRotation]
        : footprint.rotations;
    const candidates = [];

    for (const rotation of rotations) {
        for (const anchor of boardDefinition.holes.filter(hole => hole.zone === 'terminal')) {
            const holes = deriveFootprintHoles(inst.componentId, {
                anchorHole: anchor.id,
                footprintId: footprint.id,
                rotation,
                columns: boardDefinition.columns,
            });
            if (!holes || Object.values(holes).some(hole => occupied.has(hole))) continue;
            if (!footprintIsBreadboardLegal(inst.componentId, holes,
                holeId => boardDefinition.getHole(holeId), footprint.id)) continue;
            const anchorWorld = { x: breadboard.x + anchor.x, y: breadboard.y + anchor.y };
            const transform = createRigidPlacementTransform(inst.componentId, {
                anchorWorld,
                footprintId: footprint.id,
                rotation,
                pitch: boardDefinition.pitch,
            });
            candidates.push({
                anchor,
                holes,
                transform,
                distance: Math.hypot(anchorWorld.x - desiredAnchor.x, anchorWorld.y - desiredAnchor.y),
            });
        }
    }

    candidates.sort((a, b) => a.distance - b.distance ||
        a.anchor.id.localeCompare(b.anchor.id, undefined, { numeric: true }));
    const chosen = candidates[0];
    const snapTolerance = Number(def.breadboard.snapTolerance) || boardDefinition.pitch * 1.5;
    if (!chosen || chosen.distance > snapTolerance) return null;
    const position = positionForRigidTransform(def, geometry, chosen.transform);
    return {
        ...position,
        rotation: chosen.transform.rotation,
        uniformScale: chosen.transform.scale,
        breadboardId: breadboard.id,
        anchorHole: chosen.anchor.id,
        holes: chosen.holes,
    };
}

export function tryManualBreadboardPlacement(instanceId) {
    const inst = store.getInstance(instanceId);
    const def = getComponentDef(inst?.componentId);
    const geometry = getComponentGeometry(inst?.componentId);
    const footprint = getFootprint(inst?.componentId, def?.breadboard?.footprintId);
    if (!inst || !def?.breadboard?.mountable || !geometry || !footprint) return false;

    const width = (def.size?.width || 80) * (inst.physicalScale?.x || 1);
    const height = (def.size?.height || 60) * (inst.physicalScale?.y || 1);
    const center = { x: inst.x + width / 2, y: inst.y + height / 2 };
    const breadboard = store.instances.find(item => {
        const boardDef = getComponentDef(item.componentId);
        return boardDef?.isBreadboard && center.x >= item.x && center.x <= item.x + boardDef.size.width &&
            center.y >= item.y && center.y <= item.y + boardDef.size.height;
    });
    if (!breadboard) {
        if (inst.mountedOn) unmountBreadboardComponent(instanceId);
        return false;
    }

    const boardDefinition = getBoardDefinition(boardTypeForComponentId(breadboard.componentId));
    if (!boardDefinition) return false;
    const occupied = new Set(store.instances
        .filter(other => other.id !== instanceId && other.mountedOn === breadboard.id)
        .flatMap(other => Object.values(other.breadboardPlacement?.holes || {})));
    const anchorPin = footprint.anchorPin;
    const pinInfo = store.pinInfoMap.get(instanceId) || [];
    const resolvedAnchor = store.resolvePinName(pinInfo, anchorPin);
    const currentAnchor = store.getPinAbsolutePosition(instanceId, resolvedAnchor);
    if (!currentAnchor) return false;

    const candidates = [];
    for (const rotation of footprint.rotations) {
        for (const anchor of boardDefinition.holes.filter(hole => hole.zone === 'terminal')) {
            const holes = deriveFootprintHoles(inst.componentId, {
                anchorHole: anchor.id,
                footprintId: footprint.id,
                rotation,
                columns: boardDefinition.columns,
            });
            if (!holes || Object.values(holes).some(hole => occupied.has(hole))) continue;
            if (!footprintIsBreadboardLegal(inst.componentId, holes,
                holeId => boardDefinition.getHole(holeId), footprint.id)) continue;
            const anchorWorld = { x: breadboard.x + anchor.x, y: breadboard.y + anchor.y };
            const transform = createRigidPlacementTransform(inst.componentId, {
                anchorWorld,
                footprintId: footprint.id,
                rotation,
                pitch: boardDefinition.pitch,
            });
            candidates.push({ holes, anchor, transform, rotation, distance: Math.hypot(anchorWorld.x - currentAnchor.x, anchorWorld.y - currentAnchor.y) });
        }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const chosen = candidates[0];
    const snapTolerance = Number(def.breadboard.snapTolerance) || boardDefinition.pitch * 1.5;
    if (!chosen || chosen.distance > snapTolerance) return false;

    applyRigidPlacement(inst, def, geometry, breadboard, footprint, chosen, true);
    return true;
}

function applyRigidPlacement(inst, def, geometry, breadboard, footprint, chosen, locked) {
    removeComponentLeads(inst.id);
    const position = positionForRigidTransform(def, geometry, chosen.transform);
    inst.x = position.x;
    inst.y = position.y;
    inst.rotation = chosen.rotation;
    inst.uniformScale = chosen.transform.scale;
    delete inst.physicalScale;
    inst.mountedOn = breadboard.id;
    inst.breadboardPlacement = { breadboardId: breadboard.id, footprintId: footprint.id, anchorHole: chosen.anchor.id, holes: chosen.holes, locked };
    store.physicalPlan = null;
}

export function rotateMountedBreadboardComponent(instanceId) {
    const inst = store.getInstance(instanceId);
    const def = getComponentDef(inst?.componentId);
    const geometry = getComponentGeometry(inst?.componentId);
    const footprint = getFootprint(inst?.componentId, inst?.breadboardPlacement?.footprintId || def?.breadboard?.footprintId);
    const breadboard = store.getInstance(inst?.mountedOn);
    const boardDefinition = getBoardDefinition(boardTypeForComponentId(breadboard?.componentId));
    if (!inst || !def || !geometry || !footprint || !breadboard || !boardDefinition) return false;

    const rotationIndex = footprint.rotations.indexOf(inst.rotation || 0);
    const targetRotation = footprint.rotations[(rotationIndex + 1 + footprint.rotations.length) % footprint.rotations.length];
    const currentAnchor = boardDefinition.getHole(inst.breadboardPlacement?.anchorHole);
    const occupied = new Set(store.instances
        .filter(other => other.id !== instanceId && other.mountedOn === breadboard.id)
        .flatMap(other => Object.values(other.breadboardPlacement?.holes || {})));
    const candidates = [];

    for (const anchor of boardDefinition.holes.filter(hole => hole.zone === 'terminal')) {
        const holes = deriveFootprintHoles(inst.componentId, {
            anchorHole: anchor.id,
            footprintId: footprint.id,
            rotation: targetRotation,
            columns: boardDefinition.columns,
        });
        if (!holes || Object.values(holes).some(hole => occupied.has(hole))) continue;
        if (!footprintIsBreadboardLegal(inst.componentId, holes,
            holeId => boardDefinition.getHole(holeId), footprint.id)) continue;
        const anchorWorld = { x: breadboard.x + anchor.x, y: breadboard.y + anchor.y };
        const transform = createRigidPlacementTransform(inst.componentId, {
            anchorWorld,
            footprintId: footprint.id,
            rotation: targetRotation,
            pitch: boardDefinition.pitch,
        });
        const distance = currentAnchor
            ? Math.hypot(anchor.x - currentAnchor.x, anchor.y - currentAnchor.y)
            : 0;
        candidates.push({ holes, anchor, transform, rotation: targetRotation, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.anchor.id.localeCompare(b.anchor.id, undefined, { numeric: true }));
    if (!candidates.length) return false;

    applyRigidPlacement(inst, def, geometry, breadboard, footprint, candidates[0], true);
    return true;
}

export function layoutBreadboardPlacements() {
    for (const inst of store.instances.filter(item => item.mountedOn && item.breadboardPlacement)) {
        const breadboard = store.getInstance(inst.mountedOn);
        const pinInfo = store.pinInfoMap.get(inst.id) || [];
        const entries = Object.entries(inst.breadboardPlacement.holes).map(([name, holeName]) => ({
            pin: pinInfo.find(item => item.name === store.resolvePinName(pinInfo, name)),
            hole: getBreadboardHole(holeName),
        })).filter(item => item.pin && item.hole);
        if (!breadboard || !entries.length) continue;

        const pinSpanX = Math.max(...entries.map(item => item.pin.x)) - Math.min(...entries.map(item => item.pin.x));
        const pinSpanY = Math.max(...entries.map(item => item.pin.y)) - Math.min(...entries.map(item => item.pin.y));
        const holeSpanX = Math.max(...entries.map(item => item.hole.x)) - Math.min(...entries.map(item => item.hole.x));
        const holeSpanY = Math.max(...entries.map(item => item.hole.y)) - Math.min(...entries.map(item => item.hole.y));
        const scaleX = pinSpanX > 0 && holeSpanX > 0 ? holeSpanX / pinSpanX : 1;
        const scaleY = pinSpanY > 0 && holeSpanY > 0 ? holeSpanY / pinSpanY : 1;
        inst.physicalScale = { x: scaleX, y: scaleY };

        const anchor = entries[0];
        const def = getComponentDef(inst.componentId);
        const cx = (def?.size?.width || 80) / 2;
        const cy = (def?.size?.height || 60) / 2;
        const scaledPinX = cx + (anchor.pin.x - cx) * scaleX;
        const scaledPinY = cy + (anchor.pin.y - cy) * scaleY;
        inst.x = breadboard.x + anchor.hole.x - scaledPinX;
        inst.y = breadboard.y + anchor.hole.y - scaledPinY;
    }
}

export function prepareBreadboard({ alignToArduino = false } = {}) {
    const defs = store.instances
        .map(inst => getComponentDef(inst.componentId))
        .filter(def => def && !def.isBoard && !def.isBreadboard);
    let breadboard = store.instances.find(inst => getComponentDef(inst.componentId)?.isBreadboard);
    const decision = decideBreadboard(defs, Boolean(breadboard));

    if (decision.shouldAdd) {
        const arduino = store.instances.find(inst => getComponentDef(inst.componentId)?.isBoard);
        breadboard = store.addInstance('breadboard-half', (arduino?.x || 300) - 28, (arduino?.y || 300) + 280);
        store.registerPinInfo(breadboard.id, breadboardHoles);
    }
    if (alignToArduino && breadboard) {
        const arduino = store.instances.find(inst => getComponentDef(inst.componentId)?.isBoard);
        const arduinoDef = getComponentDef(arduino?.componentId);
        const breadboardDef = getComponentDef(breadboard.componentId);
        if (arduino && arduinoDef && breadboardDef) {
            breadboard.x = store.snapToGrid(arduino.x + (arduinoDef.size.width - breadboardDef.size.width) / 2);
            breadboard.y = store.snapToGrid(arduino.y + arduinoDef.size.height + 80);
        }
    }
    return { breadboard, decision };
}

export function clearBreadboardRealization(instanceId = null, { preserveLocked = true } = {}) {
    const kept = [];
    for (const wire of store.wires) {
        const auto = wire.physical?.autoBreadboard;
        const affectsInstance = !instanceId || auto?.instanceId === instanceId || auto?.instanceIds?.includes(instanceId);
        if (!auto || !affectsInstance) {
            kept.push(wire);
            continue;
        }
        if (auto.originalFrom && auto.originalTo) {
            wire.from = auto.originalFrom;
            wire.to = auto.originalTo;
            wire.physical = auto.previousPhysical;
            kept.push(wire);
        }
    }
    store.wires = kept;
    for (const inst of store.instances) {
        if (!instanceId || inst.id === instanceId) {
            if (preserveLocked && inst.breadboardPlacement?.locked) continue;
            delete inst.breadboardPlacement;
            delete inst.mountedOn;
            delete inst.physicalScale;
        }
    }
}

export function realizeBreadboard(breadboard, { placeComponents = true } = {}) {
    if (!breadboard) return { mounted: 0, errors: [], capacity: null };
    store.registerPinInfo(breadboard.id, breadboardHoles);

    const candidates = store.instances.filter(inst => {
        const def = getComponentDef(inst.componentId);
        const lockedHere = inst.mountedOn === breadboard.id && inst.breadboardPlacement?.locked;
        return inst.id !== breadboard.id && def?.breadboard?.mountable && (placeComponents || lockedHere);
    }).sort((a, b) => Number(Boolean(b.breadboardPlacement?.locked)) - Number(Boolean(a.breadboardPlacement?.locked)));
    const arduino = store.instances.find(inst => getComponentDef(inst.componentId)?.isBoard);
    const plannedHoles = ledResistorPlans(candidates, breadboard, arduino);
    const preferredColumn = (inst, footprint) => {
        if (!arduino) return 1;
        const visited = new Set();
        const queue = [inst.id];
        let boardPin = null;
        while (queue.length && !boardPin) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);
            for (const wire of store.wires.filter(item => item.from.instanceId === current || item.to.instanceId === current)) {
                const other = wire.from.instanceId === current ? wire.to : wire.from;
                if (other.instanceId === arduino.id && !/(5V|3\.3V|GND|VIN)/i.test(other.pinName)) {
                    boardPin = other.pinName;
                    break;
                }
                if (!visited.has(other.instanceId)) queue.push(other.instanceId);
            }
        }
        const position = boardPin && store.getPinAbsolutePosition(arduino.id, boardPin);
        if (!position) return 1;
        return Math.max(1, Math.min(31 - footprint.width,
            Math.round((position.x - breadboard.x) / BREADBOARD.pitch - footprint.width / 2)
        ));
    };
    const requiredTerminals = candidates.reduce((sum, inst) => sum + Object.keys(getComponentDef(inst.componentId)?.pinMeta || {}).length * 2, 0);
    const occupied = occupiedBreadboardHoles(store.wires, breadboard.id);
    const capacity = findBreadboardCapacity(occupied, requiredTerminals, candidates.length * 2);
    if (!capacity.fits) {
        return { mounted: 0, capacity, errors: ['Breadboard capacity is insufficient. Add another or use a larger breadboard.'] };
    }

    let mounted = 0;
    const errors = [];
    const placements = new Map();
    const reservedColumns = new Set();
    const reserved = occupiedBreadboardHoles(store.wires.filter(wire => !(
        wire.physical?.kind === 'component-lead' && wire.physical?.autoBreadboard
    )), breadboard.id);

    for (const inst of candidates) {
        const def = getComponentDef(inst.componentId);
        const pins = Object.keys(def.pinMeta || {}).filter(name => name !== 'NC');
        const footprint = footprintFor(inst, def, pins);
        const locked = inst.mountedOn === breadboard.id && inst.breadboardPlacement?.locked;
        let holes = locked ? { ...inst.breadboardPlacement.holes } : plannedHoles.get(inst.id) || null;
        let column = 1;
        if (!locked && !holes) {
            const preferred = preferredColumn(inst, footprint);
            const firstColumn = 1 + footprint.leftClearance;
            const lastColumn = 31 - footprint.width - footprint.rightClearance;
            const columns = Array.from({ length: Math.max(0, lastColumn - firstColumn + 1) }, (_, index) => firstColumn + index)
                .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
            column = 31;
            for (const candidateColumn of columns) {
                const bodyStart = candidateColumn - footprint.leftClearance;
                const bodyEnd = candidateColumn + footprint.width - 1 + footprint.rightClearance;
                const fits = footprint.pins.every(pin => {
                    const lead = `${pin.row}${candidateColumn + pin.gridX}`;
                    return !reserved.has(lead) && !groupOccupied(lead, reserved) && Boolean(terminalMate(lead, reserved));
                }) && !Array.from({ length: bodyEnd - bodyStart + 1 }, (_, index) => bodyStart + index)
                    .some(bodyColumn => reservedColumns.has(bodyColumn));
                if (fits) {
                    column = candidateColumn;
                    break;
                }
            }
        }
        if (!holes && column + footprint.width - 1 > 30) {
            errors.push(`${def.name} (${inst.id}) does not fit: add another breadboard.`);
            continue;
        }

        holes ||= {};
        const connections = {};
        for (const footprintPin of footprint.pins) {
            const pinName = footprintPin.name;
            const leadHole = holes[pinName] || `${footprintPin.row}${column + footprintPin.gridX}`;
            const jumperHole = terminalMate(leadHole, reserved);
            if (!jumperHole) continue;
            holes[pinName] = leadHole;
            connections[pinName] = jumperHole;
            reserved.set(leadHole, [inst.id]);
            reserved.set(jumperHole, [inst.id]);

            store.completeWiringDirect(
                inst.id, pinName, breadboard.id, leadHole, def.pinMeta[pinName],
                { physical: { kind: 'component-lead', autoBreadboard: { instanceId: inst.id } } }
            );
        }

        if (!locked) {
            inst.mountedOn = breadboard.id;
            inst.breadboardPlacement = { breadboardId: breadboard.id, holes, locked: false };
        }
        placements.set(inst.id, { holes, connections });
        const pinColumns = Object.values(holes).map(name => Number(name.match(/\d+$/)?.[0])).filter(Number.isFinite);
        if (pinColumns.length) {
            const bodyStart = Math.min(...pinColumns) - footprint.leftClearance;
            const bodyEnd = Math.max(...pinColumns) + footprint.rightClearance;
            for (let bodyColumn = bodyStart; bodyColumn <= bodyEnd; bodyColumn++) reservedColumns.add(bodyColumn);
        }
        mounted++;
    }

    const feeder = new Set();
    const railIndex = { TP: 2, TN: 2 };
    const originals = store.wires.filter(wire => !wire.physical?.autoBreadboard && wire.physical?.kind !== 'component-lead');
    for (const wire of originals) {
        const originalFrom = { ...wire.from };
        const originalTo = { ...wire.to };
        const previousPhysical = wire.physical;
        let transformed = false;
        for (const side of ['from', 'to']) {
            const end = side === 'from' ? originalFrom : originalTo;
            const inst = store.getInstance(end.instanceId);
            const def = getComponentDef(inst?.componentId);
            if (!inst || !def || def.isBoard || def.isBreadboard) continue;
            const type = pinType(def, end.pinName);
            const placement = placements.get(inst.id);

            if (type === PIN.VCC || type === PIN.GND) {
                const rail = type === PIN.VCC ? 'TP' : 'TN';
                if (!feeder.has(rail)) {
                    wire[side] = { instanceId: breadboard.id, pinName: `${rail}1` };
                    feeder.add(rail);
                    transformed = true;
                    const branchHole = `${rail}${Math.min(railIndex[rail]++, 25)}`;
                    const branchFrom = placement?.connections[end.pinName];
                    store.completeWiringDirect(
                        branchFrom ? breadboard.id : inst.id,
                        branchFrom || end.pinName,
                        breadboard.id,
                        branchHole,
                        type,
                        { physical: {
                            kind: 'jumper',
                            jumperType: branchFrom ? 'male-male' : 'female-male',
                            autoBreadboard: { instanceId: inst.id },
                        } }
                    );
                } else {
                    const otherSide = side === 'from' ? 'to' : 'from';
                    const otherEnd = otherSide === 'from' ? originalFrom : originalTo;
                    const otherDef = getComponentDef(store.getInstance(otherEnd.instanceId)?.componentId);
                    const branchHole = `${rail}${Math.min(railIndex[rail]++, 25)}`;
                    if (otherDef?.isBoard) {
                        wire[otherSide] = { instanceId: breadboard.id, pinName: branchHole };
                        if (placement?.connections[end.pinName]) {
                            wire[side] = { instanceId: breadboard.id, pinName: placement.connections[end.pinName] };
                        }
                        transformed = true;
                    }
                }
            } else if (placement?.connections[end.pinName]) {
                wire[side] = { instanceId: breadboard.id, pinName: placement.connections[end.pinName] };
                transformed = true;
            }
        }
        if (transformed) {
            const instanceIds = [originalFrom.instanceId, originalTo.instanceId].filter(id => {
                const def = getComponentDef(store.getInstance(id)?.componentId);
                return def && !def.isBoard && !def.isBreadboard;
            });
            const sameInternalStrip = wire.from.instanceId === breadboard.id && wire.to.instanceId === breadboard.id &&
                getBreadboardGroup(wire.from.pinName) === getBreadboardGroup(wire.to.pinName);
            wire.physical = {
                kind: sameInternalStrip ? 'internal-strip' : 'jumper',
                jumperType: jumperTypeFor(wire.from, wire.to),
                autoBreadboard: { instanceIds, originalFrom, originalTo, previousPhysical },
            };
        }
    }

    layoutBreadboardPlacements();

    return { mounted, errors, capacity };
}
