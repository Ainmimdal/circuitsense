import { getComponentDef } from '../component-library.js';
import { autoLayoutPhysicalStore } from '../physical/automation.js';
import { createHalfBreadboardSurface } from '../physical/breadboard.js';
import { PhysicalCircuitStore } from '../physical/circuit-store.js';
import { defaultFootprintForComponent } from '../physical/footprints.js';
import { createComponentInstance, createPhysicalProject } from '../physical/model.js';
import { firstIsolatedMount } from '../physical/placement.js';
import { writeSketch } from '../simulation/sketch-writer.js';

// "When this happens, do that": a finished, wired circuit with matching code
// for a goal the student picks. Parts are placed and wired by the same Auto
// Layout the toolbar uses, and the code comes from the sketch writer.
//
// shortcut: one sensor and one output from the lists below, add a second
// output list when students ask to drive two things at once.

export const GOAL_SENSORS = [
    { id: 'none', label: 'the Arduino is switched on', definitionId: null },
    { id: 'button', label: 'I press a button', definitionId: 'pushbutton' },
    { id: 'knob', label: 'I turn a knob', definitionId: 'potentiometer' },
    { id: 'light', label: 'the light changes', definitionId: 'photoresistor-sensor' },
    { id: 'distance', label: 'something comes close', definitionId: 'hc-sr04' },
    { id: 'motion', label: 'something moves', definitionId: 'pir-motion' },
    { id: 'temperature', label: 'the temperature changes', definitionId: 'ntc-temperature-sensor' },
];

export const GOAL_OUTPUTS = [
    { id: 'led', label: 'light an LED', definitionId: 'led' },
    { id: 'rgb', label: 'change a colour light', definitionId: 'rgb-led' },
    { id: 'buzzer', label: 'make a sound', definitionId: 'buzzer' },
    { id: 'servo', label: 'move a servo arm', definitionId: 'servo' },
    { id: 'screen', label: 'show it on a screen', definitionId: 'lcd1602' },
    { id: 'pixel', label: 'light a colour pixel', definitionId: 'neopixel' },
];

/** `{ project, name }` for the picked ids, or `{ error }` when the circuit could not be wired. */
export function buildGoalProject({ sensor, output }) {
    const when = GOAL_SENSORS.find(item => item.id === sensor), then = GOAL_OUTPUTS.find(item => item.id === output);
    if (!when || !then) return { error: 'Pick what should happen first.' };
    const project = createPhysicalProject({ surfaces: [createHalfBreadboardSurface()], components: [] });
    ['arduino-uno', when.definitionId, then.definitionId].filter(Boolean).forEach((definitionId, index) => {
        const component = createComponentInstance({
            id: `goal-${index}`, definitionId, footprintId: defaultFootprintForComponent(definitionId).id, x: 140 + index * 40, y: 20,
        });
        project.components.push(component);
        // Small parts start in the breadboard, on strips nothing else uses.
        const mount = getComponentDef(definitionId).breadboard?.mountable && firstIsolatedMount(project, component, project.surfaces[0]);
        if (mount) {
            component.placement = { type: 'surface', surfaceId: mount.surfaceId, rotation: mount.rotation, bindings: mount.bindings };
            component.footprintId = mount.footprintId || component.footprintId;
        }
    });
    const store = new PhysicalCircuitStore({ load: false, routingWorker: null });
    store.importProject(project);
    const layout = autoLayoutPhysicalStore(store);
    const written = writeSketch(store.project);
    if (layout.status !== 'success' || written.error) return { error: 'That circuit could not be wired automatically. Try another pair.' };
    store.setSketch(written.code);
    return { project: structuredClone(store.project), name: `When ${when.label}, ${then.label}` };
}
