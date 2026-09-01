    # Elera

Intelligent web-based Arduino circuit design assistant.

## Quickstart

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build for production

```bash
npm run build
npm run preview
```

## Rebuild FYP Report

Make sure the chapter markdown files are up to date in the artifacts directory, then:

```bash
python report/tools/build_report.py
```

Output: `Elera_FYP1_Report_v4.docx`

## Tech Stack

- **Framework:** Lit 3.2 (Web Components)
- **Build Tool:** Vite 6
- **Component Visuals:** @wokwi/elements 1.9.2
- **Circuit Workspace:** Konva 9
- **Language:** JavaScript (ES Modules)

## Architecture

- [Project status](docs/PROJECT_STATUS.md) - current implementation, health checks, priorities and handoff.
- [Automation engine contract](docs/ENGINE_CONTRACT.md) - normative Auto Wire, Auto Layout, Clean, breadboard and validation rules, with regression traceability and known implementation drift.
- [Auto Wire and Auto Layout flow](docs/AUTOMATION_ENGINE_FLOW.md) - recovered pre-Konva behavior and the required direct/breadboard migration pipeline.
- [Self-healing engine flow](docs/SELF_HEALING_ENGINE.md) - contract-synchronized engine rules and flowcharts, recovery boundaries and orthodox breadboard routing rules.
- [Circuit core rebuild specification](REBUILD_SPEC.md) - schema v2 and physical-realization design baseline.
- [Physical editor architecture](docs/PHYSICAL_EDITOR_ARCHITECTURE.md) - millimetre geometry, semantic placement/connectivity, Konva rendering, current limitations and migration plan.
- [AI agent architecture](docs/AI_AGENT.md) - provider-neutral BYOK transport, tool loop, safety modes, supported providers and extension points.

## AI assistant (BYOK)

Open **AI → Settings → AI Keys**, choose DeepSeek, Gemini, OpenAI, OpenRouter, or a custom OpenAI-compatible endpoint, enter a model and API key, and run **Test**. API keys are kept in session storage for the current browser tab; other AI preferences are saved locally.

The assistant uses Elera's real component library and controller-pin metadata to choose exact pins, validate connections, and invoke separate Auto Wire, Arrange Components, Route Wires, history, and validation tools. The normal editor Auto Layout button retains its combined Auto Wire → arrange → route behavior. DeepSeek and Gemini keys are both supported, but each key must be used with its matching provider endpoint.
