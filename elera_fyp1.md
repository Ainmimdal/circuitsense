# Elera: An Intelligent Web-Based Circuit Design Assistant with Real-Time Validation for Arduino Education

**Mohamad Imad Addin bin Ja'far**
*Department of Information Systems*
*Kulliyyah of Information and Communication Technology*
*International Islamic University Malaysia (IIUM)*
*Kuala Lumpur, Malaysia*
*imad.jafar@live.iium.edu.my*

**Ahmad Fatzilah bin Misman**
*Department of Information Systems*
*Kulliyyah of Information and Communication Technology*
*International Islamic University Malaysia (IIUM)*
*Kuala Lumpur, Malaysia*

## Abstract
Arduino has become a standard platform for teaching electronics and embedded systems in universities. However, beginner students continue to make common circuit wiring errors that existing tools do not catch during the design phase. Errors such as connecting LEDs without current-limiting resistors, exceeding the Arduino Uno's 500 mA USB current limit, assigning multiple components to the same I/O pin, and wiring I2C devices to incorrect analogue pins are frequent among novice learners. Popular web-based tools like Tinkercad Circuits, Wokwi, and Fritzing allow students to build circuits virtually, but they only reveal errors after simulation or not at all. None of them validate wiring during design or explain why a mistake occurred. This paper presents the pre-production design of Elera, an intelligent web-based Arduino circuit design assistant that provides real-time, rule-based validation and beginner-friendly feedback within the design environment. Elera is designed to include a drag-and-drop circuit canvas, a metadata-driven component library covering 14 common Arduino parts, a validation engine that checks nine categories of electrical errors, and an auto-wiring engine that assigns correct Arduino pins based on each component's electrical requirements. The system design uses Lit 3, Vite 6, and the Wokwi elements library, and the application is designed to run entirely in the browser with no installation required. A needs analysis survey of 35 undergraduate students confirmed strong demand for real-time validation with explanatory feedback, with 49% of respondents selecting it as the single most important feature.

## Keywords
arduino, circuit design, real-time validation, auto-wiring, web-based learning, electronics education, beginner feedback, rule-based engine

## Introduction

### Background

Arduino has become one of the most widely used platforms for introducing students to electronics and embedded systems. At the Kulliyyah of Information and Communication Technology (KICT), International Islamic University Malaysia (IIUM), mechatronics students learn Arduino circuit wiring through hands-on laboratory courses such as the Mechatronic Workshop Lab and the System Integration Lab. Both courses require students to assemble circuits on breadboards using components like LEDs, sensors, and servo motors. In practice, students spend a large portion of their lab time troubleshooting wiring problems rather than focusing on programming logic or system design [1], [2].

Web-based simulation tools such as Tinkercad Circuits [3] and Wokwi [4] can help by letting students prototype circuits before using physical hardware. Fritzing [5] provides a desktop-based breadboard layout tool for documentation and PCB design. More recently, Cirkit Designer [6] introduced AI-assisted circuit prototyping using large language models. These tools are useful, but they share one critical limitation: they are passive. The user builds the circuit manually, and errors only become visible when the simulation runs or when the physical circuit fails. None of them actively check for wiring problems during the design process, and none of them explain to the user why something is wrong or how to fix it.

### Problem Statement

There is a clear gap between tools that simulate circuits and tools that teach students how to wire them correctly. Five specific problems have been identified:

First, beginners regularly make electrical wiring errors such as missing ground connections, overcurrent, wrong pin types, and floating pins. These errors only surface during simulation or physical testing. Second, when errors appear, current tools do not explain them in educational terms. Third, every existing web-based circuit builder requires fully manual wiring, which is tedious for students who do not yet know the correct pin assignments. Fourth, the circuit-building experience in current tools is frustrating. Wires overlap and cross over components as the circuit grows, snapping behaviour is inconsistent, and there is no automatic way to clean up wire routing. Students end up spending time managing the visual layout instead of focusing on the circuit logic. Fifth, no single accessible web application combines visual circuit building, real-time rule-based validation, automated pin assignment, and wire management tools in one environment.

### Objectives

The main goal of this project is to design and develop Elera, a web-based Arduino circuit design assistant that gives beginners proactive guidance while they build circuits. The specific objectives are:

1. To design and develop a web-based Arduino circuit builder with drag-and-drop component placement and manual pin-to-pin wiring on an interactive canvas by the end of FYP1 (September 2025).
2. To design a rule-based validation engine (the Elera Validation Engine, or EVE) that detects nine categories of common electrical errors, including missing power and ground connections, current overload, duplicate pin assignments, wrong I2C wiring, floating pins, and missing current-limiting resistors, with plans to implement and test it in FYP2.
3. To design an auto-wiring engine that assigns the correct Arduino pins to component pins based on their electrical requirements (digital, analogue, PWM, I2C) and generates the wire connections automatically, with full implementation planned for FYP2.
4. To create a metadata-driven component library where each component's pin roles, current draw, and auto-wiring rules are stored as structured data, so the system can be extended with new components without modifying the core logic.
5. To design a component builder that allows users to import custom component images and use AI-assisted pin detection to define pin placements, signal types, and names, enabling the creation of user-defined components that integrate with the validation and auto-wiring engines.

### Project Scope

Elera is a web-based application with a primary focus on the Arduino Uno as the target board for beginner-level circuit education. The architecture supports extension to additional boards in future iterations. The system is designed to include: a component library with 14 beginner-level parts, a visual canvas with drag-and-drop placement and pin-to-pin wiring, a validation engine covering nine rule categories, an auto-wiring engine that assigns pins based on type, an AI assistant powered by the Google Gemini API, a component builder for user-defined parts, and user authentication with cloud-based project storage via Supabase. Full circuit simulation, running Arduino code, and PCB design are outside the current scope.

**Target Audience:** The primary audience is undergraduate students taking electronics, embedded systems, or mechatronics courses, particularly those in the Mechatronic Workshop Lab and System Integration Lab at KICT, IIUM. These students typically have basic programming skills but limited experience with physical circuit wiring. The secondary audience is hobbyists and self-learners who are starting out with Arduino.

**Specific Platform and Technology Stack:** Elera runs in the browser and uses Supabase as its backend for project persistence and user authentication. The development environment consists of Windows 10/11, Node.js 18+, Vite 6.0, Lit 3.2 (Web Components), @wokwi/elements 1.9.2, JavaScript (ES Modules), and Supabase (hosted PostgreSQL, authentication, REST API). The user-facing environment requires any modern browser (Chrome, Firefox, Edge), no installation or plugins, and a minimum screen resolution of 1280 x 720. UI prototyping was carried out using Figma.

The rest of this paper is organised as follows. Section II reviews existing circuit design tools and identifies their limitations. Section III describes the system design and methodology for the pre-production phase.

## Related Work

### Pedagogical Challenges in Electronics Education

Learning electronics through hands-on prototyping places a heavy cognitive demand on students. When working with Arduino circuits, learners must simultaneously manage programming syntax, the pin layout of the microcontroller, component datasheets, and the physical routing of wires on a breadboard or virtual canvas. Cognitive load theory suggests that when the total demand on a learner's working memory exceeds its capacity, learning becomes less effective and errors increase [7]. In a circuit design context, this overload often manifests as wiring mistakes that students do not notice until the circuit fails, at which point tracing the root cause is difficult.

Physical breadboarding adds spatial complexity. Students must understand which rows and columns on the breadboard are electrically connected, how power rails function, and how to route wires without creating short circuits. Research on novice electronics learners has found that a significant portion of lab time is spent on low-level troubleshooting rather than on the conceptual learning objectives of the exercise [1], [2]. Virtual circuit simulators reduce the risk of hardware damage and allow rapid experimentation, but studies on virtual labs in electronics education have noted that simulators do not inherently reduce cognitive load [8]. Students still face the same wiring decisions, and most simulators offer no guidance during the design process.

Beyond electrical errors, the circuit-building experience itself presents usability friction. During hands-on evaluation of the four reviewed platforms for this project, it was observed that as students add more components and wires, the canvas becomes cluttered. Wires overlap, cross over components, and obscure pin labels, making the circuit harder to read and debug. None of the evaluated tools provide any automatic way to clean up or re-route wires after they are placed. Students must either delete and redraw each wire manually or accept a messy layout. Snapping behaviour also varies across tools, where components do not always align to a consistent grid and wires do not always attach cleanly to pin targets. These usability issues compound the cognitive load described above, because students must spend additional effort managing the visual layout of their circuit on top of the electrical logic.

### Review of Existing Platforms

Four platforms were reviewed as they represent the most commonly used options in electronics education: Tinkercad Circuits, Fritzing, Wokwi, and Cirkit Designer.

Tinkercad Circuits is a browser-based circuit editor built by Autodesk, aimed at beginners in primary, secondary, and introductory university-level programmes [3]. It provides a drag-and-drop interface with a large selection of simulated components, including the Arduino Uno and Micro:bit. It supports dual programming through visual block-based coding and direct C++ editing [9]. Research has shown that Tinkercad's visual environment helps with student motivation in secondary school settings [10]. However, the platform has usability issues. There is no quick reset function, and the code blocks panel covers the circuit view when open [11]. More critically, there is no proactive error checking during the design phase.

Fritzing started in 2007 at the University of Applied Sciences Potsdam as an open-source tool for documenting electronic prototypes [5]. It offers three views: a photorealistic Breadboard View, a Schematics View, and a PCB View that generates Gerber manufacturing files. Fritzing is widely used in academic settings, but it cannot simulate circuits at all. It does not run code, does not show voltage or current, and has no validation of any kind [12]. Users must build and test their circuits elsewhere.

Wokwi was introduced around 2019 and provides advanced simulation capabilities [4]. Its engine, AVR8js, compiles and runs Arduino code directly in the browser. Board support extends to ESP32, STM32, and Raspberry Pi Pico. The platform provides tools such as a virtual logic analyser and GDB debugging, and it integrates with VS Code and CI/CD pipelines. A study at Jambi University tested Wokwi in basic physics and electronics courses and found a positive correlation between simulator use and skill improvement [13]. However, Wokwi is code-centric, assumes prior programming knowledge, and places several advanced features behind a paid subscription [9].

Cirkit Designer was created by Austin Small, a former Google engineer, to address the gap between wiring guidance and code generation [6]. The platform combines a component library of over 30,000 parts with an AI assistant powered by large language models. A user can describe a project in plain English and receive component suggestions, wiring instructions, and Arduino code. The AI assistant, however, relies on probabilistic language models and can produce incorrect recommendations [6]. The AI also only provides text-based wiring instructions. It does not draw wires on the canvas, so the manual effort remains.

### Comparison, Identified Gaps, and System Adaptation

A feature comparison across the four reviewed platforms and Elera is summarised in Table I.

[INSERT TABLE I: COMPARISON OF EXISTING CIRCUIT DESIGN PLATFORMS HERE]

The comparison reveals five gaps that are consistent across all existing tools. First, real-time validation is absent everywhere. All four tools either show errors only after simulation or do not validate at all. Second, automated pin-to-pin wiring does not exist. Every tool requires manual wire routing. Third, educational feedback is either missing or limited to generic error messages. Fourth, components are treated as static graphics without structured metadata about their electrical properties. Without metadata, automatic validation and wiring are not feasible. Fifth, based on hands-on evaluation conducted during this project, the wiring experience across all four tools lacks usability support. Wires become cluttered and overlapping as circuits grow, and none of the tools offer automatic wire cleanup or re-routing. Students must spend time managing wire layout manually, which adds to the overall cognitive burden.

Elera adapts the strengths of each reviewed platform while addressing their shared weaknesses. From Tinkercad, Elera adopts the browser-based, drag-and-drop approach that makes circuit building accessible to beginners. From Fritzing, the concept of realistic visual component rendering is retained through the @wokwi/elements library. From Wokwi, the idea of a web-first platform with no installation requirement is carried forward. From Cirkit Designer, the use of AI-assisted guidance is adapted, but Elera supplements this with a deterministic, rule-based validation engine that produces consistent and predictable feedback. The key differentiation is that Elera adds four features that none of the reviewed platforms currently offer: real-time validation during the design phase, automated pin-to-pin wiring based on structured component metadata, plain-language educational feedback that explains both the problem and the fix, and automatic wire cleanup that re-routes overlapping or tangled wires with a single action.

## Methodology

### Development Approach

The Agile Iterative model was selected as the development approach for this project. The Agile model was chosen for three reasons. First, the requirements for the validation rules, pin assignment logic, and metadata schema were expected to evolve as each feature was designed and prototyped. An iterative model accommodates that kind of gradual refinement. Second, each sprint produces a working deliverable, so even during the pre-production phase there is always a demonstrable output. Third, the iterative structure allows feedback from each sprint to be incorporated into the next cycle, which is well suited to a single-developer Final Year Project.

The project is organised into seven sprints: (1) interactive canvas with component placement, grid snapping, and pan/zoom, (2) component library with metadata and the sidebar interface, (3) manual pin-to-pin wiring with orthogonal routing, (4) validation engine covering nine rules and the validation bar UI, (5) auto-wire engine with smart pin assignment, (6) state management upgrades including undo/redo, localStorage persistence, and anti-overlap collision detection, and (7) integration testing, UI polish, and wire cleanup features.

[INSERT AGILE ITERATIVE MODEL DIAGRAM HERE]

### Requirements Specifications

Requirements were gathered through three methods. First, a literature review of existing circuit design tools identified which features are standard and which are absent. Second, a needs analysis questionnaire was distributed to 35 undergraduate students from KICT and the Kulliyyah of Engineering at IIUM. Third, iterative prototyping of the UI and validation logic provided practical feedback on which design decisions worked and which needed adjustment.

The survey respondents comprised mainly Mechatronics Engineering (51%) and Electrical Engineering (20%) students, with 80% in Year 3 or Year 4 and 86% having prior Arduino experience. Results showed that 60% of respondents rated their satisfaction with error feedback in existing tools at 2 or below on a 5-point Likert scale (mean: 2.31). The most frequently reported method of discovering wiring errors was manual debugging (51%), followed by component damage (23%) and instructor intervention (14%). Only 9% reported simulation failure as their primary means of error detection. Real-time validation with explanatory feedback received the highest mean ratings among all features surveyed (Q10 mean: 4.66, Q11 mean: 4.69 out of 5). When asked to select the single most important feature, 49% chose real-time validation with error explanations. Respondents also expressed dissatisfaction with the circuit-building experience in current tools, reporting that wires become messy and hard to manage as circuits grow, and that there is no easy way to clean up or re-route existing connections. Overall adoption intent was high, with 88% of respondents indicating they would probably or definitely use the system.

These findings directly informed the prioritisation of the Validation Engine as the primary system contribution and the inclusion of automatic wire cleanup as a planned feature. The full questionnaire instrument and raw response data are included in the Appendices.

### Logical Design

The logical design of Elera describes the system's structure and behaviour through standard UML and data flow diagrams. This subsection presents the narrative that accompanies each diagram.

**System Architecture.** Elera is designed on a modular architecture using Lit 3 Web Components. The system comprises twelve modules that communicate through an event-driven pattern. When a user performs an action on the canvas, such as placing a wire, the Circuit Store updates its internal state and fires a "structural-change" event. The Validation Engine listens for that event, re-checks the circuit, and sends the results to the Validation Bar, which re-renders automatically. The user sees updated feedback without any manual refresh. The twelve modules are: Circuit App, Component Library, Component Sidebar, Circuit Canvas, Placed Component, Circuit Store, Validation Engine, Validation Bar, Auto-Wire Engine, Wire Path Utility, AI Assistant, and Component Builder. The Component Library feeds metadata to the Sidebar, Canvas, Validation Engine, and Auto-Wire Engine. The Canvas and Auto-Wire Engine read from and write to the Store. The Store fires structural-change events to the Validation Engine, which outputs results to the Validation Bar. The AI Assistant reads circuit state from the Store and writes auto-wire actions back to it via the Gemini API. The Component Builder submits images to the Gemini vision API and saves custom component metadata to the Store.

[INSERT SYSTEM ARCHITECTURE DIAGRAM HERE]

**Use Case Diagram.** The primary actor in the system is the Student. The Use Case diagram illustrates ten supported interactions: Place Component, Move Component, Delete Component, Wire Components, Edit Wire Waypoints, Search Components, Auto-Wire Component, View Validation Results, Undo/Redo, and Clear Project. Each use case maps to one or more functional requirements defined during the requirements gathering phase.

[INSERT USE CASE DIAGRAM HERE]

**Activity Diagram.** The Activity diagram illustrates the circuit building workflow from start to finish. The process begins when the student places an Arduino Uno on the canvas, followed by placing one or more components. The student then chooses between manual wiring and auto-wiring. In the manual path, the student clicks a source pin, clicks a destination pin, and a wire appears. In the auto-wire path, the student triggers the engine, pins are assigned, and wires are generated automatically. After either path, the validation engine runs automatically and the student views the results. If errors are present, the student fixes the wiring and the cycle repeats. If no errors are detected, the circuit is complete.

[INSERT ACTIVITY DIAGRAM HERE]

**Sequence Diagram.** The Sequence diagram illustrates the validation flow. The interaction begins when the user interacts with the Canvas by placing a wire. The Canvas calls Store.completeWiring(). The Store adds the wire and fires a "structural-change" event. The Validation Engine receives the event, calls validateCircuit(), builds context from the current circuit state, and runs the nine rules. The results are returned to the Validation Bar, which renders the messages. The user then reads the feedback.

[INSERT SEQUENCE DIAGRAM HERE]

**Data Flow Diagrams.** The Context Diagram (DFD Level 0) shows one external entity, the Student, interacting with the Elera system. Inbound data flows include component placement commands, wiring actions, search queries, and auto-wire requests. Outbound flows include the visual circuit display, validation results, and auto-wire confirmations.

[INSERT CONTEXT DIAGRAM (DFD LEVEL 0) HERE]

The Level 1 DFD decomposes the system into four processes: (1) Manage Components, which takes placement and deletion commands and reads/writes to the Circuit Store data store, (2) Manage Wires, which takes wiring commands and reads/writes wire data, (3) Validate Circuit, which is triggered by structural changes, reads instance and wire data from the Store, reads metadata from the Component Library, and outputs validation results, and (4) Auto-Wire, which takes auto-wire requests, reads metadata and used-pin data, and writes new wires to the Store.

[INSERT LEVEL 1 DFD HERE]

### Database Design

The data model is designed around a PostgreSQL database hosted on Supabase, organised into four tables: Users, Projects, ComponentInstances, and Wires.

The Entity-Relationship Diagram illustrates the logical relationships between three core entities. The Component entity (from the metadata library) contains the attributes componentId (PK, String), name (String), category (String), pinCount (Integer), currentDraw (Float), and autoWireRules (JSON). The Instance entity (a placed component on the canvas) contains id (PK, String), componentId (FK, String), x (Float), and y (Float). The Wire entity (a connection between two pin endpoints) contains id (PK, String), fromInstanceId (FK, String), fromPinName (String), toInstanceId (FK, String), toPinName (String), waypoints (JSON), and color (String). The relationships are: one Component to many Instances, and one Instance to many Wires (from both the source and destination sides).

[INSERT ENTITY-RELATIONSHIP DIAGRAM (ERD) HERE]

The Users table stores account information for each registered student, including a UUID primary key, name, email address, and account creation timestamp. The Projects table represents a saved circuit design. Each project belongs to one user through a foreign key relationship and stores a title and the timestamp of the last modification. The ComponentInstances table records each component placed on the canvas for a given project. It stores the component type identifier, which maps to the static component library definition, and the canvas position coordinates. The Wires table stores each wire connection between two component pins. The source and destination are recorded as foreign keys to ComponentInstances along with the specific pin names. Wire routing waypoints are stored as a JSONB column to accommodate variable-length path arrays without requiring a separate table. The wire colour is stored as a string and is assigned automatically based on signal type during rendering.

The component library definitions are maintained as static metadata in the application layer rather than the database, as they do not change between sessions and are not specific to any user or project. During FYP1 development, application state is managed client-side using localStorage as a temporary persistence layer. The full Supabase integration is planned for FYP2.

[INSERT DATA DICTIONARY TABLE HERE]

### Prototype Design

The user interface prototype follows a three-panel layout. There is a fixed header bar at the top, a sidebar on the left for browsing components, and a large central canvas where the circuit design takes place. The validation bar sits as an overlay inside the canvas area.

**Header Toolbar.** The header shows the Elera branding and subtitle ("Intelligent Arduino Circuit Builder"). On the right side, there are toolbar buttons for undo, redo, wire cleanup, wire reset, anti-overlap toggle, and a clear button. The toolbar is compact and stays out of the way.

[INSERT HEADER TOOLBAR PROTOTYPE SCREENSHOT HERE]

**Component Sidebar.** A fixed-width panel (240 pixels) on the left side. At the top is a search box that filters components in real time as the user types. Below that, components are grouped into six categories: Boards, Sensors, Input, Output, Actuators, and Passive. Each entry shows an emoji icon, the component name, and a one-line description. To place a component, the user drags it from the sidebar and drops it onto the canvas.

[INSERT COMPONENT SIDEBAR PROTOTYPE SCREENSHOT HERE]

**Circuit Canvas.** The canvas is the main workspace. It is an SVG element that supports drag-and-drop placement, click-to-select, pin-to-pin wiring, panning (via middle-click drag or trackpad), zooming (via scroll wheel), grid-snapped movement, and wire waypoint editing. Components are rendered using @wokwi/elements, which provides realistic SVG visuals of actual Arduino parts. Each component shows interactive pin targets (small circles that highlight on hover) to indicate where wires can connect.

[INSERT CIRCUIT CANVAS PROTOTYPE SCREENSHOT HERE]

**Validation Bar.** The validation bar is an overlay panel inside the canvas area. It shows a scrollable list of validation messages, each with an icon and colour-coded background (red for errors, amber for warnings, blue for informational notes). It updates automatically whenever the circuit changes, so the user always sees the current state of the validation.

[INSERT VALIDATION BAR PROTOTYPE SCREENSHOT HERE]

**Auto-Wire.** When a user triggers auto-wire on a component, the engine creates wires from the component's pins to the appropriate Arduino pins. The wires show up immediately on the canvas, and the validation bar refreshes to reflect the updated circuit.

[INSERT AUTO-WIRE RESULT PROTOTYPE SCREENSHOT HERE]

**Wire Cleanup.** As users add, move, and delete components, wires can become tangled. Paths may overlap with other components, cross unnecessarily, or take longer routes than needed. The wire cleanup feature re-routes all existing wires using the orthogonal pathfinding algorithm to find cleaner paths that avoid obstacles. The user triggers this with a single button press from the header toolbar. This addresses one of the key usability pain points identified in the literature review, where all four existing tools leave wire management entirely to the user.

[INSERT WIRE CLEANUP BEFORE/AFTER PROTOTYPE SCREENSHOT HERE]

**Navigation Flow.** The application loads and displays the Canvas, either empty or restored from the last saved state. From the canvas, the user can place a component, search the library, wire pins manually, trigger auto-wire, run wire cleanup, view validation results, undo/redo actions, or clear the project. All paths lead back to the canvas.

[INSERT NAVIGATION FLOW DIAGRAM HERE]

## References
[1] D. Nair, "Online Laboratory Course using Low Tech Supplies to Introduce Digital Logic Design Concepts," in 2021 International e-Engineering Education Services Conference (e-Engineering), 2021, pp. 121-126.
[2] D. J. Merrill and S. Swanson, "Reducing Instructor Workload in an Introductory Robotics Course via Computational Design," in Proceedings of the 50th ACM Technical Symposium on Computer Science Education, 2019.
[3] Autodesk, "Tinkercad Circuits," Tinkercad. [Online]. Available: https://www.tinkercad.com. [Accessed: May 2025].
[4] Wokwi Ltd., "Wokwi - World's Most Advanced ESP32 Simulator," Wokwi. [Online]. Available: https://wokwi.com/. [Accessed: May 2025].
[5] Friends-of-Fritzing, "Fritzing," Fritzing. [Online]. Available: https://fritzing.org. [Accessed: May 2025].
[6] Cirkit Designer, "Introducing Cirkit Designer: An AI-Powered IDE for Building Arduino and Circuit Projects," Medium, 2024. [Online]. Available: https://medium.com/@cirkit-designer/introducing-cirkit-designer-an-ai-powered-ide-for-building-arduino-and-circuit-projects-3fafb519b9bd. [Accessed: May 2025].
[7] G. Cooper, "Cognitive load theory as an aid for instructional design," Australasian Journal of Educational Technology, vol. 6, 1990.
[8] K. Altmeyer, R. Brunken, J. Kuhn, and S. Malone, "The Role of Cognitive Learner Prerequisites for Cognitive Load and Learning Outcomes in AR-Supported Lab Work," Education Sciences, vol. 14, p. 1161, 2024.
[9] IoTDunia, "Top 5 Best IoT Simulation Tools Online (No Hardware Needed)," IoTDunia, 2024. [Online]. Available: https://iotdunia.com/best-iot-simulation-tools-online/rbsnp/. [Accessed: May 2025].
[10] ERIC, "Effect of Tinkercad on Students' Computational Thinking Skills and Perceptions," 2024. [Online]. Available: https://files.eric.ed.gov/fulltext/EJ1290797.pdf. [Accessed: May 2025].
[11] PMC, "Examination of the Usability of Tinkercad Application in Educational Environments," PLOS ONE, 2023. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC10034876/. [Accessed: May 2025].
[12] KSPU, "Specialized Applied Software Fritzing and Its Use for Education," Information Technologies in Education. [Online]. Available: https://www.ite.kspu.edu/index.php/ite/article/view/767. [Accessed: May 2025].
[13] Cahaya-IC, "Utilization of Wokwi Technology as a Modern Electronics Learning Media," Journal of Education Technology and Literacy Culture, 2024. [Online]. Available: https://cahaya-ic.com/index.php/JETLC/article/view/1392. [Accessed: May 2025].
