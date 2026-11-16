import {
    AVRADC, AVRIOPort, AVRTimer, AVRTWI, AVRUSART, CPU, PinState, adcConfig, avrInstruction,
    portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, twiConfig, usart0Config,
} from 'avr8js';

// Runs a compiled sketch on a simulated ATmega328P (Arduino Uno and Nano).
// It knows nothing about the circuit: it reports what each pin is doing and
// accepts the voltage on each pin from the outside.

export const CPU_HZ = 16_000_000;
const FLASH_BYTES = 0x8000;

// Arduino pin name -> [port, bit].
const PIN_MAP = Object.freeze({
    ...Object.fromEntries(Array.from({ length: 8 }, (_, bit) => [String(bit), ['D', bit]])),
    ...Object.fromEntries(Array.from({ length: 6 }, (_, bit) => [String(bit + 8), ['B', bit]])),
    ...Object.fromEntries(Array.from({ length: 6 }, (_, bit) => [`A${bit}`, ['C', bit]])),
});
export const SIMULATED_PINS = Object.freeze(Object.keys(PIN_MAP));

/** Intel HEX text (what the Arduino compiler produces) to flash bytes. */
export function parseIntelHex(text, size = FLASH_BYTES) {
    const flash = new Uint8Array(size);
    for (const line of String(text).split(/\r?\n/)) {
        if (!line.startsWith(':')) continue;
        const count = parseInt(line.slice(1, 3), 16);
        const address = parseInt(line.slice(3, 7), 16);
        const type = parseInt(line.slice(7, 9), 16);
        if (type !== 0) continue;
        if (address + count > size) throw new RangeError('The program is too big for an Arduino Uno.');
        for (let index = 0; index < count; index++) {
            flash[address + index] = parseInt(line.slice(9 + index * 2, 11 + index * 2), 16);
        }
    }
    return flash;
}

export class AvrRunner {
    constructor(hex, { onSerial = null } = {}) {
        const flash = parseIntelHex(hex);
        this.cpu = new CPU(new Uint16Array(flash.buffer));
        this.ports = {
            B: new AVRIOPort(this.cpu, portBConfig),
            C: new AVRIOPort(this.cpu, portCConfig),
            D: new AVRIOPort(this.cpu, portDConfig),
        };
        this.timers = [timer0Config, timer1Config, timer2Config].map(config => new AVRTimer(this.cpu, config));
        this.adc = new AVRADC(this.cpu, adcConfig);
        this.usart = new AVRUSART(this.cpu, usart0Config, CPU_HZ);
        this.usart.onByteTransmit = byte => onSerial?.(String.fromCharCode(byte));
        // I2C (Wire): bytes go to the device registered at the address; nobody home means no acknowledge.
        this.i2c = new Map();
        this.twi = new AVRTWI(this.cpu, twiConfig, CPU_HZ);
        let device = null;
        this.twi.eventHandler = {
            start: () => this.twi.completeStart(),
            stop: () => this.twi.completeStop(),
            connectToSlave: address => {
                device = this.i2c.get(address) || null;
                device?.begin();
                this.twi.completeConnect(Boolean(device));
            },
            writeByte: value => {
                device?.write(value);
                this.twi.completeWrite(Boolean(device));
            },
            readByte: () => this.twi.completeRead(device ? device.read() : 0xff),
        };
        // Per pin: cycles spent high since the last sample(), plus the last high pulse and the gap between rising edges.
        this.tracks = Object.fromEntries(SIMULATED_PINS.map(name => [name, { mode: PinState.Input, high: false, since: 0, highCycles: 0, pulse: 0, lastRise: -Infinity, period: 0 }]));
        // Set when a pin switches between input, pull-up and output, so the circuit can react before the next read.
        this.modesChanged = false;
        this.sampledAt = 0;
        // Ultrasonic sensors: echo pins are driven by timed events, not by the circuit's settled voltage.
        this.echoes = [];
        for (const [portName, port] of Object.entries(this.ports)) {
            port.addListener(() => this.#trackPort(portName));
        }
    }

    #trackPort(portName) {
        const now = this.cpu.cycles;
        for (const [name, [port, bit]] of Object.entries(PIN_MAP)) {
            if (port !== portName) continue;
            const track = this.tracks[name];
            const state = this.ports[port].pinState(bit);
            const mode = state === PinState.Low ? PinState.High : state;
            if (mode !== track.mode) {
                track.mode = mode;
                this.modesChanged = true;
            }
            const high = state === PinState.High;
            if (high === track.high) continue;
            if (high) {
                track.period = now - track.lastRise;
                track.lastRise = now;
            } else {
                track.pulse = now - track.since;
                track.highCycles += now - Math.max(track.since, this.sampledAt);
                for (const echo of this.echoes) if (echo.trigger === name) this.#ping(echo);
            }
            track.high = high;
            track.since = now;
        }
    }

    /** HC-SR04: a pulse on `trigger` is answered by `echo` held HIGH for the sound's round trip (58 us per cm). */
    addEcho(trigger, echo, centimetres) {
        this.echoes.push({ trigger, echo, centimetres });
    }

    #ping(echo) {
        const [port, bit] = PIN_MAP[echo.echo];
        const micros = value => Math.round(value * CPU_HZ / 1e6);
        this.cpu.addClockEvent(() => {
            this.ports[port].setPin(bit, true);
            this.cpu.addClockEvent(() => this.ports[port].setPin(bit, false), micros(echo.centimetres() * 58));
        }, micros(450));
    }

    /** Advance the program by up to `cycles`, stopping early after `budgetMs` of real time or when a pin changes mode. */
    run(cycles, budgetMs = Infinity) {
        const cpu = this.cpu;
        const target = cpu.cycles + cycles;
        const deadline = performance.now() + budgetMs;
        while (cpu.cycles < target && !this.modesChanged) {
            // Checking the clock every instruction would cost more than the instruction.
            for (let burst = 0; burst < 20_000 && cpu.cycles < target && !this.modesChanged; burst++) {
                avrInstruction(cpu);
                cpu.tick();
            }
            if (performance.now() > deadline) break;
        }
    }

    get seconds() {
        return this.cpu.cycles / CPU_HZ;
    }

    /**
     * What every pin did since the previous call: `level` is the share of time
     * it was HIGH (so PWM reads as brightness), `frequency` is in Hz and
     * `pulseMicros` is the length of the last HIGH pulse (servo signal).
     */
    sample({ reset = true } = {}) {
        const now = this.cpu.cycles;
        const elapsed = Math.max(1, now - this.sampledAt);
        const pins = {};
        for (const [name, [port, bit]] of Object.entries(PIN_MAP)) {
            const track = this.tracks[name];
            const state = this.ports[port].pinState(bit);
            const highCycles = track.highCycles + (track.high ? now - Math.max(track.since, this.sampledAt) : 0);
            pins[name] = {
                output: state === PinState.High || state === PinState.Low,
                pullup: state === PinState.InputPullUp,
                level: highCycles / elapsed,
                // A signal slower than 20 Hz, or one that has stopped, counts as no signal.
                frequency: now - track.lastRise < CPU_HZ / 20 && track.period < CPU_HZ / 20 ? CPU_HZ / track.period : 0,
                pulseMicros: track.pulse * 1e6 / CPU_HZ,
            };
            if (reset) track.highCycles = 0;
        }
        if (reset) this.sampledAt = now;
        return pins;
    }

    /** Apply the voltage the circuit puts on a pin, as a share of 5 V (null = nothing connected). */
    setInput(name, level) {
        const [port, bit] = PIN_MAP[name] || [];
        if (!port || this.echoes.some(echo => echo.echo === name)) return;
        this.ports[port].setPin(bit, (level ?? 0) > .5);
        if (port === 'C') this.adc.channelValues[bit] = (level ?? 0) * 5;
    }
}

/**
 * Run the program for `cycles` against a circuit from createCircuitSimulation
 * and return what the parts should show. `values` holds the button and dial
 * positions. Stops early after `budgetMs` of real time on slow machines.
 */
export function advance(runner, circuit, values, cycles, budgetMs = Infinity) {
    const target = runner.cpu.cycles + cycles;
    const deadline = performance.now() + budgetMs;
    runner.values = values;
    if (!runner.circuit) {
        runner.circuit = circuit;
        for (const echo of circuit.echoes || []) runner.addEcho(echo.trigger, echo.echo, () => echo.centimetres(runner.values));
        for (const { address, device } of circuit.i2c || []) if (!runner.i2c.has(address)) runner.i2c.set(address, device);
    }
    const started = runner.cpu.cycles;
    // Capacitors move on by the simulated time since the last full frame; mid-frame settles take no time.
    const settle = (pins, seconds = 0) => {
        const state = circuit.evaluate(pins, values, seconds);
        for (const [pin, level] of Object.entries(state.pinLevels)) runner.setInput(pin, level);
        return state;
    };
    while (runner.cpu.cycles < target && performance.now() < deadline) {
        runner.run(target - runner.cpu.cycles, deadline - performance.now());
        if (!runner.modesChanged) break;
        // pinMode(INPUT_PULLUP) must read HIGH on the very next digitalRead, not a frame later.
        runner.modesChanged = false;
        settle(runner.sample({ reset: false }));
    }
    return settle(runner.sample(), (runner.cpu.cycles - started) / CPU_HZ);
}
