# Diagram 1 — System Architecture (Mermaid flowchart LR)

```mermaid
flowchart LR
    subgraph UI["UI Components"]
        APP["Circuit App\n(shell & toolbar)"]
        SIDEBAR["Component Sidebar\n(component picker)"]
        CANVAS["Circuit Canvas\n(viewport & wire render)"]
        PC["Placed Component\n(rendered instance)"]
        VB["Validation Bar\n(error & warning display)"]
        AI["AI Assistant\n(natural language guidance)"]
        CB["Component Builder\n(custom part creation)"]
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
        SUP["Supabase\n(auth & project storage)"]
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
    AI -->|reads circuit state| STORE
    AI -->|auto-wire actions| STORE
    CB -->|custom component metadata| CL
    SUP <-->|project sync| STORE
    SUP -->|auth| APP
```

---

# Diagram 2 — Sequence Diagram (PlantUML)

```plantuml
@startuml
title Wire Placement and Validation Flow

actor Student
participant "Canvas" as C
participant "Store" as S
participant "Validation Engine" as VE
participant "Validation Bar" as VB

Student -> C : clicks second pin to complete wire
activate C

C -> S : submits new wire connection
activate S

S -> S : records wire and saves history snapshot
S --> C : notifies circuit changed
deactivate C

S -> VB : signals structural change
deactivate S

activate VB
VB -> VE : requests circuit validation
activate VE

VE -> S : reads component instances and wires
S --> VE : returns current circuit state

VE --> VB : returns errors, warnings, and info
deactivate VE

VB -> VB : re-renders updated issue list
deactivate VB

Student <-- VB : sees updated error and warning counts
@enduml
```

---

# Diagram 3 — Entity Relationship Diagram (Runtime Model)

```mermaid
erDiagram
    COMPONENT {
        string id PK
        string name
        string category
        number currentDraw_mA
        object pinMeta
        object autoWire
        string codeTemplate
    }

    INSTANCE {
        string id PK
        string componentId FK
        number x
        number y
    }

    WIRE {
        string id PK
        string fromInstanceId FK
        string fromPinName
        string toInstanceId FK
        string toPinName
        array waypoints
        string color
    }

    COMPONENT ||--o{ INSTANCE : "instantiated as"
    INSTANCE ||--o{ WIRE : "originates from"
    INSTANCE ||--o{ WIRE : "connects to"
```

---

# Diagram 3B — Entity Relationship Diagram (Supabase PostgreSQL Schema)

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

# Diagram 4 — Use Case Diagram (PlantUML)

```plantuml
@startuml
title Elera — Use Cases
left to right direction
skinparam actorStyle awesome

actor Student

rectangle "Elera Circuit Builder" {

    package "Component Management" {
        usecase "Place component" as UC1
        usecase "Move component" as UC2
        usecase "Delete component" as UC3
        usecase "Search components" as UC4
    }

    package "Wiring" {
        usecase "Wire two pins manually" as UC5
        usecase "Auto-wire component" as UC6
        usecase "Edit wire waypoints" as UC7
        usecase "Clean up wire routing" as UC8
    }

    package "Validation" {
        usecase "View validation results" as UC9
    }

    package "Project" {
        usecase "Zoom and pan canvas" as UC10
        usecase "Undo or redo action" as UC11
        usecase "Clear project" as UC12
    }
}

Student --> UC1
Student --> UC2
Student --> UC3
Student --> UC4
Student --> UC5
Student --> UC6
Student --> UC7
Student --> UC8
Student --> UC9
Student --> UC10
Student --> UC11
Student --> UC12
@enduml
```
