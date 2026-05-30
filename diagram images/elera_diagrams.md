# Elera Architecture Diagrams

This document contains the consolidated PlantUML diagrams for the Elera project, including the Use Case Diagram, Sequence Diagram, and Entity-Relationship Diagram (ERD).

## 1. Use Case Diagram

```plantuml
@startuml
left to right direction
skinparam packageStyle rectangle

actor Student
actor "AI Assistant" as AI

package "Component Management" {
  usecase "Place Component" as UC1
  usecase "Move Component" as UC2
  usecase "Delete Component" as UC3
  usecase "Search Components" as UC4
}

package "Component Builder" {
  usecase "Create Custom Component" as UC13
  usecase "Detect Pins via AI" as UC14
}

package "Wiring" {
  usecase "Wire Two Pins Manually" as UC5
  usecase "Auto-Wire Component" as UC6
  usecase "Edit Wire Waypoints" as UC7
  usecase "Clean Up Wire Routing" as UC8
}

package "Validation" {
  usecase "View Validation Results" as UC9
}

package "Project" {
  usecase "Zoom and Pan Canvas" as UC10
  usecase "Undo or Redo Action" as UC11
  usecase "Clear Project" as UC12
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

AI --> UC1
AI --> UC5
AI --> UC6
AI --> UC14
@enduml
```

## 2. Sequence Diagram (Validation Flow)

```plantuml
@startuml
actor User
participant Canvas
participant Store
participant "Validation Bar" as VB
participant "Validation Engine" as VE

User -> Canvas : complete a wire
Canvas -> Store : completeWiring()
activate Store

Store -> Store : record wire
Store -> Store : save history snapshot
Store -> VB : trigger "structural-change" event
deactivate Store

activate VB
VB -> VE : request validation()
activate VE

VE -> Store : read current component instances and wires
activate Store
Store --> VE : return instances and wires
deactivate Store

VE -> VE : run nine rules
VE --> VB : return validation results
deactivate VE

VB -> VB : re-render updated issue list
VB --> User : display new error and warning counts
deactivate VB
@enduml
```

## 3. Entity-Relationship Diagram (ERD)

```plantuml
@startuml
' Hide the circle icon and use solid lines for relations
hide circle
skinparam linetype ortho

entity "Users" as users {
  * id : UUID <<PK>>
  --
  name : String
  email : String
  createdAt : Timestamp
}

entity "UserSettings" as settings {
  * userId : UUID <<PK>> <<FK>>
  --
  encryptedApiKey : String
  theme : String
  preferences : JSONB
  updatedAt : Timestamp
}

entity "Projects" as projects {
  * id : UUID <<PK>>
  --
  userId : UUID <<FK>>
  title : String
  updatedAt : Timestamp
}

entity "AIChatHistory" as aichat {
  * id : UUID <<PK>>
  --
  projectId : UUID <<FK>>
  role : String
  content : Text
  timestamp : Timestamp
}

entity "ComponentInstances" as instances {
  * id : String <<PK>>
  --
  projectId : UUID <<FK>>
  componentId : String <<FK>>
  x : Float
  y : Float
}

entity "Wires" as wires {
  * id : String <<PK>>
  --
  fromInstanceId : String <<FK>>
  fromPinName : String
  toInstanceId : String <<FK>>
  toPinName : String
  waypoints : JSONB
  color : String
}

entity "Component (Metadata Library)" as component {
  * componentId : String <<PK>>
  --
  name : String
  category : String
  currentDraw_mA : Number
  pinMeta : Object
  autoWire : Object
  codeTemplate : String
}

' Relationships
users ||--|| settings : "configures"
users ||--o{ projects : "creates"
projects ||--o{ instances : "contains"
projects ||--o{ aichat : "has"
component ||--o{ instances : "defines"
instances ||--o{ wires : "source of"
instances ||--o{ wires : "destination of"

@enduml
```
