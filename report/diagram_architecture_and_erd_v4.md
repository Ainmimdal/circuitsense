# Diagram 1 — Architecture Diagram (Mermaid flowchart LR)

```mermaid
flowchart LR
    subgraph UI["UI Components"]
        APP["Circuit App\n(shell & toolbar)"]
        SIDEBAR["Component Sidebar\n(component picker)"]
        CANVAS["Circuit Canvas\n(viewport & wire render)"]
        PC["Placed Component\n(rendered instance)"]
        VB["Validation Bar\n(error & warning display)"]
        AI["AI Assistant\n&laquo;planned&raquo;"]
    end

    subgraph SVC["Services"]
        VE["Validation Engine\n(9 circuit rules)"]
        AWE["Auto-Wire Engine\n(smart pin assignment)"]
    end

    subgraph DATA["Data"]
        STORE["Circuit Store\n(state, history & persistence)"]
        CL["Component Library\n(definitions & pin metadata)"]
    end

    subgraph BACK["Backend"]
        SUP["Supabase\n&laquo;planned&raquo;"]
    end

    CL -->|component list & categories| SIDEBAR
    CL -->|component metadata| PC
    CL -->|component metadata & pin types| VE
    CL -->|pin type rules| AWE

    SIDEBAR -->|selected component| CANVAS
    CANVAS <-->|circuit state & placement commands| STORE
    PC <-->|circuit state & user actions| STORE
    PC -->|auto-wire request| AWE
    AWE -->|resolved wire connections| STORE

    VB <-->|change notifications & selection| STORE
    VB -->|validation request| VE
    VE -->|reads circuit state| STORE
    VE -->|validation results| VB

    APP -->|undo, redo, clear & routing commands| STORE
    SUP <-->|project sync| STORE
    SUP -->|auth| APP
```

---

# Diagram 3 — Entity Relationship Diagram (Mermaid erDiagram)
## Planned Supabase PostgreSQL Schema

```mermaid
erDiagram
    Users {
        UUID user_id PK
        VARCHAR name
        VARCHAR email
        TIMESTAMP created_at
    }

    Projects {
        UUID project_id PK
        UUID user_id FK
        VARCHAR title
        TIMESTAMP updated_at
    }

    ComponentInstances {
        UUID instance_id PK
        UUID project_id FK
        VARCHAR component_id
        FLOAT pos_x
        FLOAT pos_y
    }

    Wires {
        UUID wire_id PK
        UUID project_id FK
        UUID from_instance_id FK
        UUID to_instance_id FK
        VARCHAR from_pin
        VARCHAR to_pin
        JSONB waypoints
        VARCHAR color
    }

    Users ||--o{ Projects : "owns"
    Projects ||--o{ ComponentInstances : "contains"
    Projects ||--o{ Wires : "contains"
    ComponentInstances ||--o{ Wires : "connects from"
    ComponentInstances ||--o{ Wires : "connects to"
```

---

## Self-Check — Architecture Diagram

| Item | Status | Reason for exclusion |
|------|--------|----------------------|
| `wire-path.js` | Excluded | Internal utility used only by `circuit-canvas.js` for SVG path generation; has no independent architectural role and adding it would exceed the 12-node limit |
| `placed-component.js` | Included | Shown as **Placed Component** inside UI subgraph |
| `ai-assistant.js` | Included | Shown as **«planned»** inside UI subgraph |
| `index.js` | Excluded | Entry-point only; imports and registers custom elements, contains no business logic |
| `pinInfoMap` (runtime state) | Excluded | Transient `Map` built at runtime from Wokwi element properties; never persisted, not an architectural concern |
| `wiringState`, `mousePos`, `viewport` | Excluded | Transient store fields; excluded per prior spec and irrelevant to module-level architecture |
| Auto-save to localStorage | Not shown as separate node | Captured under the **Circuit Store** node label "state, history & persistence"; it is an internal behaviour of the store, not a separate module |
| Supabase | Included | Shown as **«planned»** inside Backend subgraph, connected to Store ("project sync") and Circuit App ("auth") |
