// Parts that talk to the Arduino through exact timing on ordinary pins.
// Each device is created with the Arduino pin names it is wired to and gets
// the runner once, in attach():
//
//   runner.watch(pin, { edge(high), mode(isOutput) })  the sketch changed the pin
//   runner.drive(pin, high)                             the part sets the pin's level
//   runner.after(micros, callback)                      later, in simulated time
//   runner.outputLevel(pin)                             true, false or null (not an output)
//
// tick(read) runs every frame with `read(index)` returning the part's slider
// or key values; state() returns properties for the artwork.

/** Run [microseconds, callback] steps one after another. */
function sequence(runner, steps) {
    let delay = 0;
    for (const [micros, callback] of steps) {
        delay += micros;
        runner.after(delay, callback);
    }
}

/** DHT22: after the Arduino holds the line LOW and lets go, 40 bits of humidity and temperature. */
function createDht({ data }) {
    let humidity = 50, temperature = 25, lowSince = null, runner;
    const answer = () => {
        const [h, t] = [Math.round(humidity * 10), Math.round(Math.abs(temperature) * 10) | (temperature < 0 ? 0x8000 : 0)];
        const bytes = [h >> 8, h & 255, t >> 8, t & 255];
        bytes.push(bytes.reduce((sum, value) => sum + value, 0) & 255);
        const steps = [[30, () => runner.drive(data, false)], [80, () => runner.drive(data, true)], [80, () => runner.drive(data, false)]];
        for (const byte of bytes) for (let bit = 7; bit >= 0; bit--) {
            // Every bit is 50 us LOW, then HIGH for 26 us (0) or 70 us (1).
            steps.push([50, () => runner.drive(data, true)], [byte >> bit & 1 ? 70 : 26, () => runner.drive(data, false)]);
        }
        steps.push([50, () => runner.drive(data, true)]);
        sequence(runner, steps);
    };
    return {
        attach(target) {
            runner = target;
            runner.drive(data, true);
            runner.watch(data, {
                edge: high => { lowSince = high ? null : runner.micros; },
                mode: isOutput => {
                    if (!isOutput && lowSince != null && runner.micros - lowSince > 500) answer();
                    if (!isOutput) lowSince = null;
                },
            });
        },
        tick(read) {
            temperature = -10 + (read(0) ?? .5) * 60;
            humidity = (read(1) ?? .5) * 100;
        },
    };
}

// Codes for the keys 1 2 3 + 4 5 6 - 7 8 9 0 (the order of the key grid in src/part-guide.js), as Wokwi's remote sends them.
const IR_CODES = [48, 24, 122, 2, 16, 56, 90, 152, 66, 74, 82, 104];

/** IR receiver: a key on the remote arrives as one NEC frame (the output is LOW while it sees light). */
function createIrReceiver({ output }) {
    let held = 0, runner;
    const send = command => {
        const bytes = [0, 0xff, command, ~command & 0xff];
        const steps = [[0, () => runner.drive(output, false)], [9000, () => runner.drive(output, true)], [4500, () => runner.drive(output, false)]];
        for (const byte of bytes) for (let bit = 0; bit < 8; bit++) {
            steps.push([562, () => runner.drive(output, true)], [byte >> bit & 1 ? 1687 : 562, () => runner.drive(output, false)]);
        }
        steps.push([562, () => runner.drive(output, true)]);
        sequence(runner, steps);
    };
    return {
        attach(target) { runner = target; runner.drive(output, true); },
        tick(read) {
            const key = read(0) || 0;
            if (key && key !== held) send(IR_CODES[key - 1]);
            held = key;
        },
    };
}

/** HX711 load cell amplifier: 24 bits, one per clock pulse, then a 25th pulse to finish. */
function createLoadCell({ data, clock }) {
    let value = 0, pulses = 0, runner;
    return {
        attach(target) {
            runner = target;
            runner.drive(data, false);                  // LOW means a reading is ready
            runner.watch(clock, { edge: high => {
                if (!high) return;
                pulses++;
                if (pulses <= 24) runner.drive(data, Boolean(value >> (24 - pulses) & 1));
                else {
                    runner.drive(data, true);
                    pulses = 0;
                    runner.after(1000, () => runner.drive(data, false));
                }
            } });
        },
        // The slider is 0 to 5 kg at about 420 counts per gram, a common calibration.
        tick(read) { if (!pulses) value = Math.round((read(0) ?? 0) * 5000 * 420) & 0xffffff; },
    };
}

/** Stepper motor coils wired to four pins: every change of the pins turns the shaft. */
function createStepper({ coils, degreesPerStep = 1.8, property = 'angle' }) {
    let previous = null, degrees = 0, runner;
    const update = () => {
        const [aMinus, aPlus, bPlus, bMinus] = coils.map(pin => runner.outputLevel(pin) ? 1 : 0);
        const [a, b] = [aPlus - aMinus, bPlus - bMinus];
        if (!a && !b) return;                           // coils off: the shaft stays where it is
        const angle = Math.atan2(b, a);
        if (previous != null) {
            let turn = angle - previous;
            if (turn > Math.PI) turn -= 2 * Math.PI;
            if (turn < -Math.PI) turn += 2 * Math.PI;
            // One trip round the four coil states is four full steps.
            if (Math.abs(turn) < Math.PI - .01) degrees += turn / (Math.PI / 2) * degreesPerStep;
        }
        previous = angle;
    };
    return {
        attach(target) {
            runner = target;
            // The sketch changes the four pins one after another; look once they have all changed.
            const settle = () => runner.after(50, update);
            for (const pin of coils) runner.watch(pin, { edge: settle, mode: settle });
        },
        get degrees() { return degrees; },
        state: () => ({ [property]: Math.round(((degrees % 360) + 360) % 360 * 10) / 10 }),
    };
}

const DEVICES = { dht: createDht, 'ir-receiver': createIrReceiver, 'load-cell': createLoadCell, stepper: createStepper };

export function createPinDevice(kind, options) {
    return DEVICES[kind]?.(options) || null;
}
