# Diagram 1 — Architecture Diagram (Mermaid flowchart TD)

```mermaid
flowchart TD
    CL["ComponentLibrary\n(component-library.js)\ncomponentDefs, PIN constants, ARDUINO_PINS"]
    ST["CircuitStore\n(store.js)\ninstances[], wires[], pinInfoMap\nwiringState, viewport, history[]"]
    CA["CircuitCanvas\n(circuit-canvas.js)\nDrag-drop, pan/zoom, wire SVG render"]
    CS["ComponentSidebar\n(component-sidebar.js)\nCategory grid, drag source"]
    PC["PlacedComponent\n(placed-component.js)\nWokwi element host, pin dots, drag"]
    VB["ValidationBar\n(validation-bar.js)\nError/warning/info summary strip"]
    VE["ValidationEngine\n(validation-engine.js)\n9 validation rules"]
    AW["AutoWireEngine\n(auto-wire-engine.js)\nPin-type → Arduino pin mapping"]
    WP["WirePath\n(utils/wire-path.js)\nSVG path generator, obstacle helper"]
    AI["AiAssistant\n(components/ai-assistant.js)\nPanel UI, slide-in"]

    CL -- "getComponentDef(id)\ncomponentDefs, PIN, ARDUINO_PINS" --> ST
    CL -- "componentLibrary, categories" --> CS
    CL -- "getComponentDef(id)" --> PC
    CL -- "getComponentDef, ARDUINO_PINS, PIN" --> VE
    CL -- "getComponentDef, ARDUINO_PINS, PIN" --> AW

    CS -- "dragstart: componentId (text/plain)" --> CA
    CA -- "drop event → store.addInstance(componentId, x, y)" --> ST
    CA -- "store.addEventListener('change'|'mousemove')" --> ST
    CA -- "wirePath(x1,y1,x2,y2,opts) → SVG path string" --> WP
    CA -- "renders placed-component per instance" --> PC
    CA -- "store.selectWire / addWireWaypoint / cancelWiring" --> ST

    PC -- "store.registerPinInfo(instanceId, pinInfo)" --> ST
    PC -- "store.startWiring / completeWiring / selectInstance / removeInstance" --> ST
    PC -- "store.addEventListener('change')" --> ST
    PC -- "autoWire(instanceId) → {success, wired, errors}" --> AW
    PC -- "store.commitAutoWire() after batch" --> ST

    AW -- "store.completeWiringDirect / getInstance / wires / pinInfoMap" --> ST

    ST -- "'change' event (lightweight)" --> CA
    ST -- "'change' event" --> PC
    ST -- "'change' event" --> VB
    ST -- "'structural-change' event (+ schedules save)" --> VB

    VB -- "validateCircuit() → {errors,warnings,info,all}" --> VE
    VE -- "store.instances, store.wires, store.pinInfoMap (read-only)" --> ST
    VB -- "store.selectInstance(instanceId) on issue click" --> ST

    WP -- "getObstacles(instances, excludeIds, getComponentDef)" --> ST
    WP -- "generateWireColor(signals) → hex color" --> ST

    AI -- "panel toggle, no store writes (demo mode)" --> ST
```
