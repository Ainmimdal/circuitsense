// The SPI parts the simulator understands. While a device's chip-select pin
// is LOW it gets every byte the sketch sends:
//
//   transfer(byte, dataMode)  returns the byte the device sends back;
//                             `dataMode` is the level of the D/C pin, if it has one
//   deselect()                chip-select went HIGH
//
// shortcut: the screen ignores scrolling, inversion and reads; the SD card is
// an empty 4 MB card that forgets its files when the simulation stops.

const TFT_WIDTH = 240, TFT_HEIGHT = 320;

/** ILI9341 240x320 colour screen (what Adafruit_ILI9341 drives). */
function createTft() {
    const rgba = new Uint8ClampedArray(TFT_WIDTH * TFT_HEIGHT * 4);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    let command = 0, args = [], columns = [0, TFT_WIDTH - 1], rows = [0, TFT_HEIGHT - 1];
    let x = 0, y = 0, high = null, memoryAccess = 0x48, dirty = true, paint = null;

    const plot = (column, row, colour) => {
        // Bits of the memory access command: 0x20 swaps the axes, 0x40 and 0x80 mirror them.
        // Adafruit's upright orientation (0x48) is the artwork's own.
        const [across, down] = memoryAccess & 0x20 ? [row, column] : [column, row];
        const px = memoryAccess & 0x40 ? across : TFT_WIDTH - 1 - across;
        const py = memoryAccess & 0x80 ? TFT_HEIGHT - 1 - down : down;
        if (px < 0 || px >= TFT_WIDTH || py < 0 || py >= TFT_HEIGHT) return;
        // RGB565: 5 bits red, 6 green, 5 blue.
        rgba.set([(colour >> 11) * 255 / 31, (colour >> 5 & 63) * 255 / 63, (colour & 31) * 255 / 31], (py * TFT_WIDTH + px) * 4);
        dirty = true;
    };

    return {
        transfer(value, dataMode) {
            if (!dataMode) {
                command = value;
                args = [];
                high = null;
                if (value === 0x2c) { x = columns[0]; y = rows[0]; }
                return 0;
            }
            if (command === 0x2c) {
                if (high == null) { high = value; return 0; }
                plot(x, y, high << 8 | value);
                high = null;
                if (++x > columns[1]) { x = columns[0]; if (++y > rows[1]) y = rows[0]; }
                return 0;
            }
            args.push(value);
            if (command === 0x36) memoryAccess = value;
            if (command === 0x2a && args.length === 4) columns = [args[0] << 8 | args[1], args[2] << 8 | args[3]];
            if (command === 0x2b && args.length === 4) rows = [args[0] << 8 | args[1], args[2] << 8 | args[3]];
            return 0;
        },
        deselect() {},
        /** [red, green, blue] of one pixel, for tests. */
        pixel: (px, py) => [...rgba.subarray((py * TFT_WIDTH + px) * 4, (py * TFT_WIDTH + px) * 4 + 3)].map(Math.round),
        state() {
            if (dirty && typeof ImageData !== 'undefined') {
                const image = new ImageData(new Uint8ClampedArray(rgba), TFT_WIDTH, TFT_HEIGHT);
                paint = artwork => artwork.canvas?.getContext('2d').putImageData(image, 0, 0);
                dirty = false;
            }
            return paint ? { paint } : {};
        },
    };
}

const BLOCK = 512;
const SD_BLOCKS = 8192, SD_FAT_BLOCKS = 32, SD_ROOT_ENTRIES = 512;

/** A freshly formatted FAT16 card: only the blocks that hold something are stored. */
function formattedCard() {
    const blocks = new Map();
    const boot = new Uint8Array(BLOCK);
    const view = new DataView(boot.buffer);
    boot.set([0xeb, 0x3c, 0x90, ...'ELERA   '.split('').map(letter => letter.charCodeAt(0))]);
    view.setUint16(11, BLOCK, true);            // bytes per sector
    boot[13] = 1;                               // sectors per cluster
    view.setUint16(14, 1, true);                // reserved sectors (this one)
    boot[16] = 1;                               // number of FATs
    view.setUint16(17, SD_ROOT_ENTRIES, true);
    view.setUint16(19, SD_BLOCKS, true);
    boot[21] = 0xf8;
    view.setUint16(22, SD_FAT_BLOCKS, true);
    boot.set([0x55, 0xaa], 510);
    blocks.set(0, boot);
    const fat = new Uint8Array(BLOCK);
    fat.set([0xf8, 0xff, 0xff, 0xff]);
    blocks.set(1, fat);
    return blocks;
}

/** SD card in SPI mode (what the Arduino SD library talks to). */
function createSdCard() {
    const blocks = formattedCard();
    let frame = [], reply = [], idle = true, appCommand = false, writing = null;

    const run = (index, argument) => {
        const app = appCommand;
        appCommand = false;
        // A version 1 card addresses bytes, so the block number is the address / 512.
        const block = argument / BLOCK;
        if (index === 0) { idle = true; return [0x01]; }
        if (index === 8) return [0x05];                       // "unknown command": a version 1 card
        if (index === 55) { appCommand = true; return [idle ? 0x01 : 0x00]; }
        if (index === 41 && app) { idle = false; return [0x00]; }
        if (index === 58) return [0x00, 0x80, 0xff, 0x80, 0x00];
        if (index === 13) return [0x00, 0x00];
        if (index === 17) return [0x00, 0xff, 0xfe, ...(blocks.get(block) || new Uint8Array(BLOCK)), 0xff, 0xff];
        if (index === 24) { writing = { block, data: null }; return [0x00]; }
        if (index === 9 || index === 10) return [0x00, 0xff, 0xfe, ...new Uint8Array(16), 0xff, 0xff];
        return [0x00];
    };

    return {
        transfer(value) {
            if (reply.length) return reply.shift();
            if (writing) {
                // Start token, 512 bytes, two checksum bytes; then "accepted".
                if (!writing.data) { if (value === 0xfe) writing.data = []; return 0xff; }
                writing.data.push(value);
                if (writing.data.length === BLOCK + 2) {
                    blocks.set(writing.block, Uint8Array.from(writing.data.slice(0, BLOCK)));
                    writing = null;
                    reply = [0x05];
                }
                return 0xff;
            }
            if (!frame.length && (value & 0xc0) !== 0x40) return 0xff;
            frame.push(value);
            if (frame.length === 6) {
                // The answer starts one byte after the command, as on a real card.
                reply = [0xff, ...run(frame[0] & 0x3f, (frame[1] << 24 | frame[2] << 16 | frame[3] << 8 | frame[4]) >>> 0)];
                frame = [];
            }
            return 0xff;
        },
        deselect() { frame = []; reply = []; },
        state: () => ({}),
    };
}

const DEVICES = { tft: createTft, sd: createSdCard };

export function createSpiDevice(kind) {
    return DEVICES[kind]?.() || null;
}
