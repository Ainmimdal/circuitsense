# Elera

Elera is a web-based Arduino circuit design assistant built as an IIUM Final Year Project. Students place parts on a canvas or a breadboard, wire them by hand or with Auto Wire, tidy the scene with Auto Layout, and get validation feedback as they go. An optional bring-your-own-key AI assistant can build circuits through the same tools.

The repository is named `circuitsense`, which was the project's earlier name; the product is Elera.

## Quickstart

Requires Node.js 18 or newer.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # node --test over test/*.test.js
npm run build     # production build into dist/
npm run preview   # serve the production build
```

`npm run dev`, `npm test` and `npm run build` first run pre-scripts that regenerate `src/generated/wokwi-elements-manifest.js` and the synchronized block in `docs/SELF_HEALING_ENGINE.md`. `npm test` fails if the Wokwi manifest is out of date (`npm run components:generate` fixes it). There are no lint or type-check scripts.

## Tech stack

- Lit 3 web components for the application shell, sidebar, validation bar and modals
- Konva 9 for the interactive circuit workspace
- `@wokwi/elements` 1.9 for most component artwork
- Vite 6, plain JavaScript ES modules, Node's built-in test runner
- No backend: projects, preferences and the "account" are stored in the browser's `localStorage`

## Repository layout

| Path | Contents |
| --- | --- |
| `src/index.js`, `src/circuit-app.js` | Entry point and application shell (toolbar, Auto Wire / Auto Layout / Clean buttons) |
| `src/components/` | Lit UI: Konva canvas host, sidebar, validation bar, AI panel, projects, settings/login and component builder modals |
| `src/physical/` | The live circuit engine: schema-4 project model, command store with undo/redo, breadboard surfaces, footprints, snap solver, connectivity, Auto Wire, Auto Layout, routing (in a Web Worker) and validation |
| `src/editor/` | Pointer interaction controller and selection helpers |
| `src/core/` | Shared, renderer-independent definitions: component geometry, part registry, breadboard topology, pin capabilities, the Auto Wire pin planner, Fritzing part contract |
| `src/ai/` | BYOK AI agent: provider transports, tool registry, settings |
| `src/component-library.js` | Component catalog with electrical and Auto Wire metadata |
| `src/store.js`, `src/services/`, `src/components/placed-component.js` | Legacy schema-v2 editor engine. Not loaded by the running app; kept for its regression tests and as a porting reference |
| `public/converted-parts/` | Parts converted from Fritzing `.fzpz` archives, loaded at startup |
| `scripts/` | Wokwi manifest generator, Fritzing converter, docs sync, FYP report builder |
| `test/` | `node --test` suites |
| `docs/` | Engineering documentation (see below) |
| `report/` | FYP report drafts, IEEE paper, diagrams, templates and assets |

## Documentation

- [Project status](docs/PROJECT_STATUS.md): what is implemented, current test/build health and next priorities.
- [Automation engine contract](docs/ENGINE_CONTRACT.md): normative rules for Auto Wire, Auto Layout, Clean, breadboards and validation, with a traceability registry checked by `test/engine-contract.test.js`.
- [Self-healing engine flow](docs/SELF_HEALING_ENGINE.md): flowcharts plus a block generated from the contract by `npm run docs:sync`.
- [Physical editor architecture](docs/PHYSICAL_EDITOR_ARCHITECTURE.md): the schema-4 Konva editor that the app runs today.
- [Component architecture assessment](docs/COMPONENT_ARCHITECTURE_ASSESSMENT.md): how part metadata, packages, topology and artwork are separated.
- [Auto Wire and Auto Layout flow](docs/AUTOMATION_ENGINE_FLOW.md): reference for porting the legacy automation behavior into the physical editor.
- [AI agent](docs/AI_AGENT.md): providers, tool loop, action modes and key handling.
- [Fritzing part import](docs/FRITZING_PART_IMPORT.md) and [component definition](docs/ELERA_COMPONENT_DEFINITION.md): converter usage and the `elera-fritzing-part-v1` record.
- [Circuit core rebuild specification](REBUILD_SPEC.md): the original schema-v2 design baseline.

## AI assistant (BYOK)

Open the settings dialog (the gear icon in the toolbar, or the settings link in the AI panel), go to **AI Keys**, choose DeepSeek, Gemini, OpenAI, OpenRouter or a custom OpenAI-compatible endpoint, enter a model and API key, and press **Test**. The key is kept in `sessionStorage` for the current tab and sent directly from the browser to the provider; other AI preferences are saved in `localStorage`.

The assistant uses the real component catalog and controller-pin metadata, and calls separate Auto Wire, Arrange Components, Route Wires, history and validation tools. The toolbar's **Auto Layout** button still runs Auto Wire, arrangement and routing together. See [docs/AI_AGENT.md](docs/AI_AGENT.md).

## Importing Fritzing parts

```bash
node scripts/convert-fritzing-part.mjs path/to/part.fzpz
```

Output goes to `public/converted-parts/<part-id>/` and is added to `public/converted-parts/catalog.json`. See [docs/FRITZING_PART_IMPORT.md](docs/FRITZING_PART_IMPORT.md).

## Rebuilding the FYP report

Requires Python 3 with `python-docx`.

```bash
python scripts/build_elera_full_report.py
```

This writes `report/drafts/Elera_FYP1_Report_v6_formatted.docx` and `report/elera_full_report_ch1_to_ch3_formatted.md` from the BIT FYP template. The older `report/tools/build_report.py` reads chapter files from a hard-coded path on the author's machine and will not run elsewhere.
