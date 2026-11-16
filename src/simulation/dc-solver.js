// A small DC circuit solver (nodal analysis). Nodes are any hashable ids.
// `fixed` nodes are held at a voltage (supply rails, pins set as outputs);
// resistors, diodes and sources connect nodes. Diodes are LEDs: nothing flows
// below the forward voltage, then a small series resistance. A source is a
// voltage in series with a resistance, `volts` higher at `a` than at `b`; the
// caller uses one per capacitor to step through time. Voltages are in volts,
// currents in amps.
//
// shortcut: ideal supplies and no current limit on Arduino pins; add a
// pin-current warning when lessons need it.

const OFF_CONDUCTANCE = 1e-9;
const MAX_PASSES = 30;

function eliminate(matrix, rhs) {
    const size = rhs.length;
    for (let column = 0; column < size; column++) {
        let pivot = column;
        for (let row = column + 1; row < size; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
        if (Math.abs(matrix[pivot][column]) < 1e-15) return null;
        [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
        [rhs[column], rhs[pivot]] = [rhs[pivot], rhs[column]];
        for (let row = column + 1; row < size; row++) {
            const factor = matrix[row][column] / matrix[column][column];
            if (!factor) continue;
            for (let k = column; k < size; k++) matrix[row][k] -= factor * matrix[column][k];
            rhs[row] -= factor * rhs[column];
        }
    }
    const solution = new Array(size);
    for (let row = size - 1; row >= 0; row--) {
        let sum = rhs[row];
        for (let k = row + 1; k < size; k++) sum -= matrix[row][k] * solution[k];
        solution[row] = sum / matrix[row][row];
    }
    return solution;
}

/**
 * @param {{ fixed: Map<any, number>, resistors?: {a, b, ohms}[], diodes?: {anode, cathode, forwardVoltage, ohms?}[],
 *   sources?: {a, b, volts, ohms}[] }} circuit
 * @returns {{ voltage: (node) => number|null, diodeCurrents: number[] }}
 *   `voltage` is null for a node with no path to any fixed node (floating).
 */
export function solveDc({ fixed, resistors = [], diodes = [], sources = [] }) {
    // Only nodes with a path to a supply or output pin have a defined voltage.
    const neighbours = new Map();
    const join = (a, b) => {
        for (const [from, to] of [[a, b], [b, a]]) {
            if (!neighbours.has(from)) neighbours.set(from, []);
            neighbours.get(from).push(to);
        }
    };
    for (const resistor of resistors) join(resistor.a, resistor.b);
    for (const diode of diodes) join(diode.anode, diode.cathode);
    for (const source of sources) join(source.a, source.b);
    const index = new Map();
    const queue = [...fixed.keys()];
    const seen = new Set(queue);
    while (queue.length) {
        for (const next of neighbours.get(queue.pop()) || []) {
            if (seen.has(next)) continue;
            seen.add(next);
            index.set(next, index.size);
            queue.push(next);
        }
    }

    const size = index.size;
    const conducting = diodes.map(() => false);
    let solution = [];
    const voltage = node => fixed.has(node) ? fixed.get(node) : index.has(node) ? solution[index.get(node)] : null;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
        const rhs = new Array(size).fill(0);
        // A conductance between two nodes, plus a current pushed from `a` to `b` alongside it.
        const stamp = (a, b, conductance, current = 0) => {
            for (const [node, other, sign] of [[a, b, 1], [b, a, -1]]) {
                if (!index.has(node)) continue;
                const row = index.get(node);
                matrix[row][row] += conductance;
                rhs[row] -= sign * current;
                if (index.has(other)) matrix[row][index.get(other)] -= conductance;
                else if (fixed.has(other)) rhs[row] += conductance * fixed.get(other);
            }
        };
        for (const resistor of resistors) stamp(resistor.a, resistor.b, 1 / Math.max(resistor.ohms, 1e-3));
        for (const source of sources) stamp(source.a, source.b, 1 / source.ohms, -source.volts / source.ohms);
        diodes.forEach((diode, i) => {
            const conductance = 1 / (diode.ohms || 10);
            if (conducting[i]) stamp(diode.anode, diode.cathode, conductance, -conductance * diode.forwardVoltage);
            else stamp(diode.anode, diode.cathode, OFF_CONDUCTANCE);
        });
        solution = size ? eliminate(matrix, rhs) : [];
        if (!solution) return { voltage: node => fixed.has(node) ? fixed.get(node) : null, diodeCurrents: diodes.map(() => 0) };

        let changed = false;
        diodes.forEach((diode, i) => {
            const across = voltage(diode.anode) - voltage(diode.cathode);
            const shouldConduct = across > diode.forwardVoltage;
            if (shouldConduct !== conducting[i]) {
                conducting[i] = shouldConduct;
                changed = true;
            }
        });
        if (!changed) break;
    }

    return {
        voltage,
        diodeCurrents: diodes.map((diode, i) => conducting[i]
            ? Math.max(0, (voltage(diode.anode) - voltage(diode.cathode) - diode.forwardVoltage) / (diode.ohms || 10)) : 0),
    };
}
