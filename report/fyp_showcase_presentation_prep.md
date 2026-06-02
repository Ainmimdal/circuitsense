# Elera FYP Showcase Presentation Prep

Presentation date: 4 June 2026
Format: booth showcase, examiners arrive at their own pace

## Core Message

Elera is an intelligent web-based Arduino circuit design assistant for students. Its main contribution is not circuit simulation. Its contribution is proactive design-stage guidance: real-time rule-based validation, metadata-driven auto-wiring, readable wire cleanup, and AI-assisted circuit building while keeping deterministic validation as the final checker.

Keep returning to this sentence:

> Existing tools help students build or simulate circuits, but Elera guides them while they are designing the circuit.

## 30-Second Opening

Good morning Dr., my project is Elera, an intelligent web-based Arduino circuit design assistant for beginner students.

The problem is that students often make wiring mistakes such as missing ground, using the wrong pin, connecting an LED without a resistor, or assigning two components to the same Arduino pin. Existing tools like Tinkercad, Wokwi, and Fritzing are useful, but they usually show problems only after simulation, through compiler output, or not at all.

Elera addresses this by giving real-time validation while the circuit is being built. It also includes metadata-based auto-wiring, wire cleanup, a BYOK AI assistant, and a custom component builder.

## 2-Minute Booth Pitch

1. Problem:
   Students spend too much lab time finding wiring errors instead of learning system logic. Some mistakes can also damage real components.

2. Gap:
   Tinkercad and Wokwi support simulation, Fritzing supports documentation, and Cirkit Designer supports AI-assisted guidance. However, they do not combine real-time deterministic validation, automatic pin assignment, educational feedback, and wire management in one free browser-based learning tool.

3. Solution:
   Elera provides a drag-and-drop Arduino circuit workspace with a validation engine called EVE. EVE checks nine wiring issue categories in real time and explains the problem in beginner-friendly language.

4. Technical contribution:
   The system uses Lit 3 Web Components, Vite, JavaScript ES modules, @wokwi/elements, Supabase, and a metadata-driven component library. Each component stores pin roles, current draw, validation flags, and auto-wiring rules.

5. Methodology:
   Requirements came from literature review, an online questionnaire with 35 undergraduate respondents, and iterative prototyping. The questionnaire strongly supported the main design decisions: plain-language error messages scored 4.69 out of 5, real-time error checking scored 4.66, and 88 percent said they would probably or definitely use the system in lab courses.

6. Demo transition:
   Let me show how the validation and auto-wiring work in the prototype.

## 5-Minute Demo Flow

Use this order every time:

1. Open workspace
   - Point out the three-panel layout: component sidebar, circuit canvas, and toolbar.
   - Say: "This layout is designed so students can build and receive feedback in the same screen."

2. Show component placement
   - Drag Arduino Uno, LED, resistor, and push button if needed.
   - Mention the component metadata quietly: "These are not only images. Each part has pin and rule metadata."

3. Trigger a validation issue
   - Demonstrate a common error such as LED without resistor, missing ground, duplicate pin, or unconnected component.
   - Say: "This is the main contribution. The system detects the issue during design, before simulation or physical testing."

4. Fix or auto-wire
   - Use auto-wire to connect the component correctly.
   - Say: "The auto-wiring engine assigns pins based on metadata such as digital, analogue, PWM, I2C, power, and ground."

5. Show wire cleanup
   - Create or show messy wiring, then use Clean/Layout if available.
   - Say: "This reduces visual clutter, which matters because beginners struggle when wires cover pins and labels."

6. Show AI assistant
   - Use a simple prompt: "Build an LED blink circuit with a push button to toggle it on and off."
   - Say: "The AI interprets intent, but Elera still executes controlled internal actions and validates the result with deterministic rules."

7. Show component builder or projects modal
   - Keep this short.
   - Say: "This supports extensibility and saved work, but the main research contribution remains validation and guided wiring."

## 10-Second Rescue Lines

Use these if you freeze:

- "The key idea is that Elera gives feedback during design, not only after testing."
- "The AI is not trusted blindly. The validation engine remains deterministic."
- "The component library is metadata-driven, so validation and auto-wiring can read structured pin rules."
- "The questionnaire supports the priority of validation because it was the most requested feature."
- "Simulation is outside the scope because this project focuses on design-stage guidance."

## Questions Examiners Are Likely To Ask

### What is novel about Elera?

Elera combines real-time rule-based validation, metadata-based auto-wiring, educational feedback, wire cleanup, and BYOK AI guidance in one browser-based Arduino learning environment. The novelty is the active design assistant approach, not only circuit drawing or simulation.

### Why not just use Tinkercad or Wokwi?

Tinkercad and Wokwi are useful simulation tools, but they do not provide the same proactive design-stage wiring guidance. Elera focuses on catching wiring mistakes while the student is still constructing the circuit.

### Why is simulation outside the scope?

Full electrical simulation is a different technical problem. Elera focuses on the earlier design stage, where many beginner errors can be detected through deterministic rules before simulation is needed.

### How does the validation engine work?

It reads the current circuit state from the store: placed components, pins, wires, and component metadata. It then checks rule categories such as missing board, LED without resistor, total current overload, duplicate I/O pin assignment, servo on serial pins, missing power or ground, wrong I2C pins, unconnected components, and floating pins.

### How does auto-wiring work?

The auto-wiring engine uses component metadata. Each component defines pin roles and suitable Arduino pin types. The engine assigns compatible pins, avoids conflicts, and creates wire entries that the canvas renders.

### What prevents the AI from hallucinating dangerous wiring?

The AI is not the final authority. It can interpret the user's goal and request controlled actions, but the actual circuit state is still checked by Elera's deterministic validation engine.

### Why BYOK?

BYOK lets the user provide their own AI API key instead of relying fully on a platform-owned key. It also keeps the prototype flexible because the system can be model-agnostic.

### What did the questionnaire prove?

It showed the target users have relevant Arduino experience and confirmed the feature priorities. Plain-language error explanations scored 4.69 out of 5, real-time validation scored 4.66, and 49 percent selected real-time validation with explanations as the single most important feature.

### What are the limitations?

The current scope focuses on Arduino Uno and beginner-level components. It does not perform full physics-based simulation, PCB design, or support every board. The validation rules are structural and educational, not a replacement for lab testing.

### What would be improved next?

Future work can include more boards such as ESP32, richer component libraries, Arduino code execution, stronger AI evaluation, more user testing, and a deeper simulation layer.

## Booth Setup Checklist

Before leaving for the showcase:

- Laptop fully charged.
- Charger packed.
- Browser opened to Elera.
- Backup tab opened with local screenshots or the report figures.
- Demo project saved locally.
- Internet-dependent features tested, especially AI if you plan to show it.
- Offline fallback ready: show validation, auto-wiring, and screenshots even if AI fails.
- Report and technical paper easy to open.
- Keep a bottle of water nearby.

## What To Avoid Saying

- Do not say "Tinkercad is bad." Say: "Tinkercad is strong for simulation, but Elera focuses on design-stage guidance."
- Do not say "AI guarantees correctness." Say: "AI assists, but deterministic validation remains the checker."
- Do not say "This simulates electricity." Say: "This checks structural wiring rules and common beginner mistakes."
- Do not over-focus on the UI. The examiner should remember the validation engine, metadata, and auto-wiring logic.

## Final Closing

To conclude, Elera helps beginner Arduino students by giving immediate feedback while they design circuits. The system reduces trial-and-error through real-time validation, metadata-based auto-wiring, wire cleanup, and AI-assisted guidance, while keeping the core checking rule-based and predictable.
