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
