# CircuitSense - Codex Project Context

## Project Type
Final Year Project (FYP) for IIUM (IT student).

## Project Purpose
Elera is an intelligent, web-based Arduino circuit builder inspired by tools like Tinkercad/Wokwi, but focused on smarter guidance instead of only manual design.

FYP wants to look more at the software engineering aspect of system development.

The main FYP objective is to build a system that helps students design valid circuits faster by combining:
- visual drag-and-drop circuit building,
- real-time validation and error detection,
- intelligent auto-wiring,
- and (later) AI-assisted circuit generation from goals.

## Why This Project Matters (FYP Value)
This project is meant to be impressive, practical, and novel enough for FYP evaluation by combining software engineering + hardware domain logic.

Key innovation points:
- Rule-based electrical validation (not just drawing wires).
- Smart pin assignment and auto-wiring heuristics.
- Beginner-friendly feedback for common Arduino mistakes.
- Extensible architecture for future AI integration.

## Current Scope (Implemented/Active)
Frontend stack:
- Lit 3
- Vite
- @wokwi/elements for component visuals

Implemented core capabilities:
- Component library with metadata (pin roles, current draw, auto-wire mapping).
- Canvas placement, manual wiring, pan/zoom, undo/redo and project persistence.
- Validation engine and validation bar UI.
- Metadata-driven Auto Wire with nearest-compatible Arduino pin assignment and generated helper components.
- Separate Auto Layout ownership for direct and breadboard-aware scenes.
- Obstacle-aware Clean routing with Arduino header fanout and short local breadboard jumpers.
- Schema v2 logical/physical circuit separation.
- Half-size 400-point and full-size 830-point breadboards with modeled terminal strips and power rails.
- Rigid 2.54 mm component footprints, manual hole snapping, legal rotation and capacity alternatives.

Active stabilization:
- Transactional behavior when Auto Wire runs out of compatible pins.
- Bus-aware and full-size-board validation correctness.
- Removal of remaining DOM readiness dependency from the Layout toolbar flow.
- Automated browser acceptance and dense-scene performance profiling.

Status source of truth:
- `docs/PROJECT_STATUS.md`
- `docs/ENGINE_CONTRACT.md`
- `REBUILD_SPEC.md`

## Planned Scope (Next Phases)
- FastAPI backend?
- PostgreSQL project persistence (Supabase)
- User authentication
- Save/load/share projects
- Arduino code generation
- BOM export
- Goal-based circuit generation with Bring your own Key AI Model (BYOK Model)

## Technical Direction
- Keep logic modular: services for validation/auto-wire, components for UI.
- Use metadata-driven rules so adding components does not require hardcoding everywhere.
- Keep user feedback immediate and readable (error/warning/info).
- Prefer safe JS syntax and avoid editor-sensitive constructs that previously broke formatting.

## Key Design Principles
1. Student-first UX: clear, actionable feedback.
2. Safety-first validation: catch risky wiring early.
3. Extensibility: new components/rules should be easy to add.
4. FYP readiness: architecture and documentation should support proposal/demo/report.

## Short Elevator Pitch
Elera is an intelligent Arduino circuit design assistant for students: it lets users build circuits visually, automatically checks for wiring mistakes, and can suggest/perform smart connections to reduce trial-and-error.
