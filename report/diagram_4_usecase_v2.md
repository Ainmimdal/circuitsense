# Diagram 4 — Use Case Diagram (PlantUML)

```plantuml
@startuml
title Elera — Implemented Use Cases

left to right direction
skinparam actorStyle awesome

actor Student

rectangle "Elera Circuit Builder" {

    package "Component Management" {
        usecase "Place component on canvas" as UC1
        usecase "Move component" as UC2
        usecase "Delete component" as UC3
    }

    package "Wiring" {
        usecase "Connect two pins manually" as UC4
        usecase "Auto-wire component to Arduino" as UC5
        usecase "Select and recolour wire" as UC6
        usecase "Add or adjust wire bend points" as UC7
        usecase "Delete wire" as UC8
    }

    package "Layout" {
        usecase "Zoom and pan canvas" as UC9
        usecase "Auto-route wires around components" as UC10
        usecase "Reset wire routing" as UC11
        usecase "Toggle anti-overlap detection" as UC12
    }

    package "Project" {
        usecase "Undo or redo action" as UC13
        usecase "Clear entire project" as UC14
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
Student --> UC13
Student --> UC14
@enduml
```
