# Arduino code, simulation and the compile server

Elera can run Arduino code on the circuit on the canvas. The **Code** button opens an editor under the canvas; **Run** builds the sketch and executes it on a simulated ATmega328P, which lights LEDs, turns servos, sounds buzzers and reads buttons and knobs.

## How the pieces fit

| Piece | Where | Runs |
|---|---|---|
| Code panel (editor, Run/Stop, problems, Serial Monitor, inputs) | `src/components/code-panel.js` | Browser |
| CPU simulation ([avr8js](https://github.com/wokwi/avr8js)) | `src/simulation/avr-runner.js` | Browser |
| Circuit behaviour (which part reacts to which pin) | `src/simulation/circuit-io.js`, `simulation` metadata in `src/component-library.js` | Browser |
| Compile client and beginner error messages | `src/simulation/compile.js` | Browser |
| Prebuilt programs for the lesson starter sketches | `src/simulation/prebuilt-sketches.json` (generated) | Browser |
| Compile server (sketch text in, `.hex` out) | `server/compile-server/` | Its own host |

The site itself stays static. The only thing that needs a server is turning *edited* code into a `.hex` file, because that requires the real Arduino compiler (avr-gcc), which cannot run in a browser tab at a reasonable size.

**Unchanged lesson code never touches the server.** Every lesson's starter sketch is compiled ahead of time into `prebuilt-sketches.json`, so Run works instantly, offline and with no server configured. A test fails if a lesson's code changes without regenerating that file.

## What is simulated

Arduino Uno and Nano. LED, RGB LED, resistor, push button, slide switch, potentiometer, slide potentiometer, buzzer (with sound), servo, photoresistor module, NTC module and the Serial Monitor. PWM (`analogWrite`), `tone()`, `analogRead`, `INPUT_PULLUP` and the Servo library work because the real compiled program runs.

Voltages and LED currents come from a small DC solver (`src/simulation/dc-solver.js`, nodal analysis with LEDs as diodes), so resistor values change brightness, dividers read correctly on analog pins and too many LEDs in series stay dark. Capacitors charge and discharge one time step per frame. Limits: Arduino pins are ideal sources with no current limit, and buzzers and servos draw no current. A PWM pin that reaches a capacitor is held at its average voltage, so an RC filter settles at the duty cycle.

I2C parts on A4 (SDA) and A5 (SCL) receive the bytes the program sends (`src/simulation/i2c-devices.js`): the 16x2 and 20x4 LCD, the SSD1306 OLED, the DS1307 clock (answers with the computer's time) and the MPU6050 (tilt slider). SPI parts on pins 11, 12 and 13 work the same way (`src/simulation/spi-devices.js`): the ILI9341 colour screen and a MicroSD card (an empty FAT16 card the SD library can write to and read back; its files are lost when the simulation stops). NeoPixels, rings and matrices decode the WS2812 signal on their data pin and can be chained. The 7-segment display (common cathode) and LED bar graph are LEDs in the DC solver; the keypad has a 4x4 grid of keys in the code panel.

The compile server installs Servo, SD, LiquidCrystal I2C, Adafruit SSD1306, Adafruit ILI9341, Adafruit NeoPixel, RTClib and Adafruit MPU6050; `Wire.h` and `SPI.h` are built in. Parts without `simulation` metadata (stepper motors, relay, DHT22, IR remote, rotary encoder, load cell) do nothing yet.

To make a new part react, add a `simulation` entry to its definition in `src/component-library.js` using one of the existing kinds (`led`, `rgb-led`, `button`, `switch`, `signal`, `dial`, `buzzer`, `servo`, `resistor`, `light-resistor`, `capacitor`, `diode`, `transistor`, `motor`, `distance`, `led-array`, `keypad`, `pixels`, `i2c`, `spi`). The beginner text and the simulation entries of the compact parts live in `src/part-guide.js`.

## The compile server

`server/compile-server/server.mjs` is one Node file with no dependencies. It shells out to `arduino-cli`.

- `POST /compile` with `{"sketch": "..."}` returns `{"hex": "..."}`, or `{"errors": "..."}` with the compiler output when the code has mistakes.
- `GET /health` returns `{"ok": true}`. The code panel calls it when it opens so a sleeping server starts waking up before the student presses Run.
- Limits: 64 KB per sketch, one compile at a time, 20 requests a minute per address, 60 s per compile, the last 200 results cached in memory.
- `ALLOWED_ORIGINS`: comma-separated sites allowed to call it (for example `https://circuitsense.example.workers.dev`). Default `*`.

It only compiles; it never runs student code. The container holds no secrets. A sketch can `#include` files that exist inside the container, so keep it that way: do not add credentials or mount volumes.

### Hosting choice: Render free web service

Cloudflare (where the site lives) cannot run `arduino-cli`, so the compiler needs a container host. **Render's free web service** was chosen because it runs a Dockerfile straight from this repository, costs nothing and needs no credit card. The trade-off is that a free service sleeps after 15 minutes without requests and takes about a minute to wake. Starter code is unaffected (it is prebuilt), and the health ping on opening the panel hides most of the wait.

Deploy (once):

1. Sign in at [render.com](https://render.com) with GitHub.
2. New > Blueprint, pick this repository. Render reads `render.yaml` and creates the `elera-compile` service.
3. When asked for `ALLOWED_ORIGINS`, enter the site's address (and `http://localhost:5173` if you want local development to use it).
4. Copy the service URL (like `https://elera-compile.onrender.com`) into `.env.production` as `VITE_COMPILE_URL=...`, commit and let Cloudflare rebuild.

If the wake-up delay hurts (for example during a user study), either open the Code panel a minute before the session, or move the same Dockerfile to Google Cloud Run (free allowance, wakes in seconds, but needs a billing account) or a paid Render instance (about 7 USD a month, never sleeps). Nothing in the app changes except `VITE_COMPILE_URL`.

### Run it locally

```bash
docker build -t elera-compile server/compile-server
docker run --rm -p 8787:8787 elera-compile
VITE_COMPILE_URL=http://localhost:8787 npm run dev
```

Without Docker, install [arduino-cli](https://arduino.github.io/arduino-cli/), run `arduino-cli core install arduino:avr`, `arduino-cli lib install Servo "LiquidCrystal I2C" "Adafruit SSD1306" RTClib "Adafruit MPU6050" "Adafruit NeoPixel" "Adafruit ILI9341" SD`, then `node server/compile-server/server.mjs`.

### After editing a lesson's code

```bash
node scripts/compile-lesson-sketches.mjs http://localhost:8787
```

This rewrites `src/simulation/prebuilt-sketches.json`. `test/simulation.test.js` then runs every lesson's program on its finished circuit and checks that the parts behave as the lesson says.

## Compile errors for beginners

`explainCompileErrors()` in `src/simulation/compile.js` rewrites the compiler's output: one message per line of code (the first error on a line is the useful one), a plain explanation, the line number as a button that jumps to it, and the compiler's own wording underneath for the curious. Add a rule to the `EXPLANATIONS` table when a common mistake falls through to the generic message.
