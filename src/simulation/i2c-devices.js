// The I2C parts the simulator understands. Each device sees the bytes the
// sketch sends to its address and answers reads; `state()` returns the
// properties to show on the part's artwork.
//
//   begin()      a new message addressed to the device starts
//   write(byte)  one byte from the Arduino
//   read()       one byte to the Arduino
//
// shortcut: the LCD ignores custom characters and display shifting, and the
// OLED ignores scrolling and contrast; add them when a lesson uses them.

const LCD_ROW_ADDRESS = [0x00, 0x40, 0x14, 0x54];

/** HD44780 character LCD behind a PCF8574 backpack (what LiquidCrystal_I2C drives). */
function createLcd({ cols = 16, rows = 2 }) {
    const memory = new Uint8Array(0x80).fill(0x20);
    let address = 0, step = 1, fourBit = false, pendingHigh = null, lastPort = 0;
    let display = false, cursor = false, blink = false, backlight = false, graphics = false;
    let dirty = true, shown = null;

    const command = value => {
        if (value & 0x80) { address = value & 0x7f; graphics = false; }
        else if (value & 0x40) graphics = true;
        else if (value & 0x20) { /* function set: lines and font are fixed by the part */ }
        else if (value & 0x10) { if (!(value & 0x08)) address = (address + (value & 0x04 ? 1 : -1)) & 0x7f; }
        else if (value & 0x08) { display = Boolean(value & 0x04); cursor = Boolean(value & 0x02); blink = Boolean(value & 0x01); }
        else if (value & 0x04) step = value & 0x02 ? 1 : -1;
        else if (value & 0x02) address = 0;
        else if (value & 0x01) { memory.fill(0x20); address = 0; step = 1; }
        dirty = true;
    };
    const data = value => {
        if (graphics) return;
        memory[address] = value;
        address = (address + step) & 0x7f;
        dirty = true;
    };
    const nibble = (value, registerSelect) => {
        if (!fourBit) {
            // Power-on is 8-bit mode with only four wires connected: 0x3 keeps it, 0x2 switches to 4-bit.
            if (value === 0x2) fourBit = true;
            return;
        }
        if (pendingHigh == null) { pendingHigh = value; return; }
        const byte = pendingHigh << 4 | value;
        pendingHigh = null;
        if (registerSelect) data(byte); else command(byte);
    };

    return {
        begin() {},
        write(port) {
            // P0 = RS, P2 = enable, P3 = backlight, P4..P7 = data. A nibble is taken when enable falls.
            if (Boolean(port & 0x08) !== backlight) { backlight = Boolean(port & 0x08); dirty = true; }
            if (lastPort & 0x04 && !(port & 0x04)) nibble(lastPort >> 4, Boolean(lastPort & 0x01));
            lastPort = port;
        },
        read: () => 0xff,
        /** The visible text, one string per row (for tests and screen readers). */
        lines: () => LCD_ROW_ADDRESS.slice(0, rows).map(start => String.fromCharCode(...memory.subarray(start, start + cols))),
        state() {
            if (dirty) {
                const characters = new Uint8Array(cols * rows);
                for (let row = 0; row < rows; row++) characters.set(memory.subarray(LCD_ROW_ADDRESS[row], LCD_ROW_ADDRESS[row] + cols), row * cols);
                if (!display) characters.fill(0x20);
                const row = LCD_ROW_ADDRESS.findIndex(start => address >= start && address < start + cols);
                shown = { characters, backlight, cursor: display && cursor, blink: display && blink,
                    cursorX: row < 0 ? 0 : address - LCD_ROW_ADDRESS[row], cursorY: Math.max(0, row) };
                dirty = false;
            }
            return shown;
        },
    };
}

const OLED_WIDTH = 128, OLED_PAGES = 8;
// Commands followed by this many argument bytes; every other command stands alone.
const OLED_ARGUMENTS = { 0x20: 1, 0x21: 2, 0x22: 2, 0x81: 1, 0x8d: 1, 0xa8: 1, 0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1 };

/** SSD1306 128x64 OLED (what Adafruit_SSD1306 and U8g2 drive). */
function createOled() {
    const pixels = new Uint8Array(OLED_WIDTH * OLED_PAGES);   // one byte = 8 vertical pixels
    let control = null, pending = null, args = [];
    let column = 0, page = 0, columns = [0, OLED_WIDTH - 1], pages = [0, OLED_PAGES - 1];
    let on = false, inverted = false, dirty = true, shown = null;

    const command = value => {
        if (pending != null) {
            args.push(value);
            if (args.length < OLED_ARGUMENTS[pending]) return;
            if (pending === 0x21) { columns = [args[0] & 127, args[1] & 127]; column = columns[0]; }
            if (pending === 0x22) { pages = [args[0] & 7, args[1] & 7]; page = pages[0]; }
            pending = null;
            return;
        }
        if (OLED_ARGUMENTS[value]) { pending = value; args = []; }
        else if (value === 0xae || value === 0xaf) { on = value === 0xaf; dirty = true; }
        else if (value === 0xa6 || value === 0xa7) { inverted = value === 0xa7; dirty = true; }
        else if (value >= 0xb0 && value <= 0xb7) page = value & 7;
        else if (value <= 0x0f) column = column & 0xf0 | value;
        else if (value >= 0x10 && value <= 0x1f) column = (value & 0x0f) << 4 | column & 0x0f;
    };
    const data = value => {
        pixels[page * OLED_WIDTH + column] = value;
        dirty = true;
        if (++column > columns[1]) {
            column = columns[0];
            if (++page > pages[1]) page = pages[0];
        }
    };

    const lit = (x, y) => on && Boolean(pixels[(y >> 3) * OLED_WIDTH + x] >> (y & 7) & 1) !== inverted;
    return {
        begin() { control = null; },
        write(value) {
            // The first byte of a message says whether commands (0x00) or pixel data (0x40) follow.
            if (control == null) control = value;
            else if (control & 0x40) data(value);
            else command(value);
        },
        read: () => 0,
        lit,
        state() {
            if (dirty && typeof ImageData !== 'undefined') {
                const image = new ImageData(OLED_WIDTH, OLED_PAGES * 8);
                for (let y = 0; y < OLED_PAGES * 8; y++) for (let x = 0; x < OLED_WIDTH; x++) {
                    if (lit(x, y)) image.data.set([255, 255, 255, 255], (y * OLED_WIDTH + x) * 4);
                }
                shown = { imageData: image };
                dirty = false;
            }
            return shown || {};
        },
    };
}

/** A device made of numbered registers: the first written byte picks one, then bytes read or write in order. */
function createRegisters(readRegister, writeRegister = () => {}) {
    let pointer = 0, first = true;
    return {
        begin() { first = true; },
        write(value) {
            if (first) { pointer = value; first = false; } else writeRegister(pointer++, value);
        },
        read: () => readRegister(pointer++) & 0xff,
        state: () => ({}),
    };
}

const bcd = value => Math.floor(value / 10) << 4 | value % 10;

/** DS1307 clock: answers with the computer's date and time (what RTClib reads). */
function createClock({ now = () => new Date() }) {
    return createRegisters(register => {
        const time = now();
        return [bcd(time.getSeconds()), bcd(time.getMinutes()), bcd(time.getHours()), time.getDay() + 1,
            bcd(time.getDate()), bcd(time.getMonth() + 1), bcd(time.getFullYear() % 100), 0][register & 7];
    });
}

/** MPU6050: lying flat and still, tilted around one axis by `tilt()` (0..1 = -90..90 degrees). */
function createMotionSensor({ tilt = () => .5 }) {
    return createRegisters(register => {
        if (register === 0x75) return 0x68;                 // WHO_AM_I
        if (register < 0x3b || register > 0x48) return 0;
        const angle = (tilt() - .5) * Math.PI;
        // 16384 counts = 1 g. Accel X, Y, Z, temperature, gyro X, Y, Z as big-endian pairs.
        const words = [Math.round(16384 * Math.sin(angle)), 0, Math.round(16384 * Math.cos(angle)), 0, 0, 0, 0];
        const word = words[(register - 0x3b) >> 1] & 0xffff;
        return (register - 0x3b) & 1 ? word : word >> 8;
    });
}

const DEVICES = { lcd: createLcd, oled: createOled, clock: createClock, motion: createMotionSensor };

export function createI2cDevice(kind, options = {}) {
    return DEVICES[kind]?.(options) || null;
}
