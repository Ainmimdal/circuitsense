# Diagram 3 — Entity Relationship Diagram (Mermaid erDiagram)

```mermaid
erDiagram
    COMPONENT {
        string id PK
        string name
        string category
        number currentDraw_mA
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
        string toInstanceId FK
        string color
    }

    COMPONENT ||--o{ INSTANCE : "instantiated as"
    INSTANCE ||--o{ WIRE : "originates from"
    INSTANCE ||--o{ WIRE : "connects to"
```
