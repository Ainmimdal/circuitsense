# Controller board pin tables

Each microcontroller board that Auto Wire can target has one file here, named after its catalog ID (`arduino-uno.json` for `arduino-uno`). The file has one row per physical pin and is the only place a pin's capabilities are written down.

`src/core/board-pins.js` loads these files, checks them, and derives two things the rest of the app reads:

- `autoWirePins`, the per-role pin lists (`digital`, `pwm`, `analog`, `i2c`, `uart`, `power`, `ground`, `constraints`) used by Auto Wire, pin compatibility checks, footprints and the AI tools;
- `pinExitOverride`, the direction each wire leaves the board, used by routing.

## Format

```json
{
  "format": "elera-board-pins-v1",
  "id": "arduino-uno",
  "name": "Arduino Uno",
  "logicVoltage": 5,
  "maxCurrent_mA": 500,
  "pinMaxCurrent_mA": 40,
  "pins": [
    {"name": "0", "capabilities": ["uart_rx"], "constraints": [{"type": "serial_reserved", "severity": "warning"}], "exit": "up"},
    {"name": "3", "capabilities": ["digital", "pwm"], "exit": "up"},
    {"name": "A4", "capabilities": ["analog", "i2c_sda"], "exit": "down"},
    {"name": "5V", "capabilities": ["power"], "exit": "down"},
    {"name": "GND.1", "capabilities": ["ground"], "exit": "down"},
    {"name": "RESET", "capabilities": [], "exit": "down"}
  ]
}
```

- `name` must match the pin name of the board's visual (for Wokwi boards, the element's pin name, such as `GND.1`).
- `capabilities` uses `digital`, `pwm`, `analog`, `i2c_sda`, `i2c_scl`, `uart_rx`, `uart_tx`, `power` and `ground`. `digital` means a pin that Auto Wire may hand out for ordinary digital signals; serial pins are usually left as `uart_*` only, so they are not used by default. A pin with no capabilities can still be listed to give it an `exit`.
- `constraints` are optional annotations. Known types are `serial_reserved`, `input_only` (blocks output and PWM use) and `boot_strap`. Severity is `warning` or `error`.
- `exit` is optional: `up`, `down`, `left` or `right`.
- Row order matters in two places. The first `power` row is the supply Auto Wire connects, so list the board's logic-voltage rail first. When pin positions are not available, Auto Wire falls back to the first free pin in row order.

## Adding a board

1. Add the board to `componentLibrary` in `src/component-library.js` with `autoWirePins: boardPins('<id>')`.
2. Create `src/boards/<id>.json` and import it in `src/core/board-pins.js`.
3. Run `npm test`. `test/board-pins.test.js` fails if the file is invalid, is not registered, or does not match a catalog controller.
