import prebuilt from './prebuilt-sketches.json' with { type: 'json' };

// Turns sketch text into a .hex program: instantly for unchanged starter
// sketches (compiled ahead of time), otherwise through the compile server.
// Compiler errors are rewritten for people who have never seen C++ before.

export const DEFAULT_SKETCH = `// Your code runs on the Arduino on the canvas.
const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}`;

const normalise = code => String(code).replace(/\r\n/g, '\n').trim();

export function prebuiltHex(code) {
    return prebuilt.find(item => normalise(item.code) === normalise(code))?.hex || null;
}

// Each rule: a compiler message pattern and what to tell a beginner instead.
const EXPLANATIONS = [
    [/expected ['‘](?:,['’] or ['‘])?;['’] before/, () => 'A semicolon ; is missing. Most lines of Arduino code end with one. Check the end of this line and the line above it.'],
    [/expected ['‘];['’] at end of input|expected ['‘]\}['’] at end of input|expected declaration before ['‘]\}['’]/, () => 'The curly brackets do not match. Every { needs a closing }. Count them from the top.'],
    [/expected ['‘]\)['’] before/, () => 'A closing bracket ) is missing on this line.'],
    [/expected ['‘]\(['’] before/, () => 'An opening bracket ( is missing on this line.'],
    [/['‘](\w+)['’] was not declared in this scope; did you mean ['‘](\w+)['’]/, match => `Arduino does not know "${match[1]}". Did you mean "${match[2]}"? Spelling and capital letters matter.`],
    [/['‘](\w+)['’] was not declared in this scope/, match => `Arduino does not know "${match[1]}". Check the spelling and capital letters (digitalWrite, not digitalwrite), or create it first with something like "int ${match[1]} = 0;".`],
    [/['‘](\w+)['’] does not name a type/, match => `"${match[1]}" is not a kind of value Arduino knows. Check the spelling, or add the #include line for its library at the top.`],
    [/too few arguments to function ['‘][^'’]*?(\w+)\(/, match => `${match[1]}() needs more values between its brackets.`],
    [/too many arguments to function ['‘][^'’]*?(\w+)\(/, match => `${match[1]}() was given too many values between its brackets.`],
    [/undefined reference to [`'‘](setup|loop)['’]/, match => `Every sketch needs a ${match[1]}() function, even an empty one: void ${match[1]}() { }`],
    [/redefinition of|redeclaration of|conflicting declaration/, () => 'This name is created twice. Each variable or function needs its own name.'],
    [/([\w.]+\.h): No such file or directory/, match => `The library "${match[1]}" is not available in the simulator. Servo, Wire, LiquidCrystal_I2C, Adafruit_SSD1306, RTClib and Adafruit_MPU6050 are; check the spelling of the #include line.`],
    [/missing terminating (["']) character/, match => `Some text is missing its closing quote ${match[1]} on this line.`],
    [/stray ['‘]\\?(\d+|.)['’] in program/, () => 'There is a character on this line that code cannot contain. It often comes from copying text from a web page; retype the quotes and spaces.'],
    [/invalid conversion from ['‘]const char\*['’] to/, () => 'Text in "double quotes" was used where a number or a single character is expected.'],
    [/expected (?:primary-)?expression/, () => 'Something is missing or extra on this line. Check for a missing value, an extra comma or a bracket in the wrong place.'],
    [/expected unqualified-id before/, () => 'This line is not inside a function, or a bracket before it is in the wrong place. Code that does something belongs between the { } of setup() or loop().'],
    [/lvalue required as left operand of assignment/, () => 'To compare two values use == (two equals signs). A single = stores a value.'],
    [/assignment of read-only variable ['‘](\w+)['’]/, match => `"${match[1]}" was created with const, so it cannot change. Remove const if it needs to change.`],
    [/control reaches end of non-void function|no return statement in function returning non-void/, () => 'This function promises to give back a value but has no return line.'],
];

/**
 * Compiler output to a list of `{ line, message, detail }` for beginners.
 * `line` is the 1-based sketch line (null when unknown), `message` is plain
 * language and `detail` keeps the compiler's own wording for anyone curious.
 */
export function explainCompileErrors(output) {
    const problems = [];
    const seenLines = new Set();
    for (const raw of String(output || '').split(/\r?\n/)) {
        const located = /sketch\.ino:(\d+):(?:\d+:)? (?:fatal )?error: (.*)$/.exec(raw);
        const linker = !located && /undefined reference to .*/.exec(raw);
        if (!located && !linker) continue;
        const detail = (located ? located[2] : linker[0]).trim();
        const line = located ? Number(located[1]) : null;
        // One mistake often produces a cascade on the same line; the first message is the useful one.
        if (seenLines.has(line ?? detail)) continue;
        seenLines.add(line ?? detail);
        const rule = EXPLANATIONS.find(([pattern]) => pattern.test(detail));
        problems.push({
            line,
            message: rule ? rule[1](rule[0].exec(detail)) : 'The compiler could not understand this line. Compare it with a working example, character by character.',
            detail,
        });
    }
    if (!problems.length && String(output || '').trim()) {
        problems.push({ line: null, message: 'The code could not be built, and the compiler did not say which line is wrong.', detail: String(output).trim().split(/\r?\n/).slice(-3).join(' ') });
    }
    return problems;
}

export const compileServerUrl = () => (import.meta.env?.VITE_COMPILE_URL || '').replace(/\/$/, '');

/** Resolves to `{ hex }`, `{ problems }` (mistakes in the code) or `{ unavailable: message }`. */
export async function compileSketch(code, { server = compileServerUrl(), fetchImpl = globalThis.fetch } = {}) {
    const ready = prebuiltHex(code);
    if (ready) return { hex: ready };
    if (!server) {
        return { unavailable: 'Changed code needs the compile server, and this copy of Elera does not have one set up. The starter code still runs: press "Starter code" to get it back.' };
    }
    try {
        const response = await fetchImpl(`${server}/compile`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sketch: code }),
        });
        const result = await response.json();
        if (result.hex) return { hex: result.hex };
        if (result.errors) return { problems: explainCompileErrors(result.errors) };
        return { unavailable: result.error || 'The compile server could not build the code. Try again in a moment.' };
    } catch {
        return { unavailable: 'Could not reach the compile server. Check your internet connection; if it has been idle it can take a minute to wake up, so try again.' };
    }
}
