KULLIYYAH OF INFORMATION AND COMMUNICATION TECHNOLOGY
DEPARTMENT OF INFORMATION SYSTEMS
FINAL YEAR PROJECT REPORT
ELERA: AN INTELLIGENT WEB-BASED CIRCUIT DESIGN ASSISTANT
MOHAMAD IMAD ADDIN BIN JA'FAR
2127923
SUPERVISED BY
DR AHMAD FATZILAH BIN MISMAN
Report submitted in fulfilment of the requirements for Bachelor of Information Technology (Hons)
Kulliyyah of Information and Communication Technology
International Islamic University Malaysia
MAY 2026
ABSTRACT
Arduino is a common platform for teaching electronics and embedded systems in universities. Beginner students still make frequent wiring mistakes during circuit design, including LEDs without current-limiting resistors, total current overload, duplicate signal pin assignment, missing power or ground connections, and incorrect I2C wiring. Existing tools such as Tinkercad Circuits, Wokwi, and Fritzing help students create virtual circuits, but their feedback is limited during the design stage [3], [4], [5]. Elera addresses this problem as an intelligent web-based Arduino circuit design assistant for students. The system provides a drag-and-drop circuit canvas, a metadata-driven component library with 14 Arduino parts, real-time validation through the Elera Validation Engine, automatic pin assignment through an auto-wiring engine, wire cleanup through orthogonal routing, a BYOK AI assistant for circuit guidance, and a component builder for user-defined parts. The system is developed using Lit 3, Vite 6, JavaScript ES modules, @wokwi/elements, Supabase, and Google Gemini API integration. The methodology follows an Agile Iterative approach with requirements gathered through literature review, informal observation, a needs analysis questionnaire, and iterative prototyping. The project contributes a student-focused circuit design environment that gives immediate feedback while maintaining an extensible software architecture.
TABLE OF CONTENTS
LIST OF FIGURES
Figure 2.1 Feature comparison of reviewed circuit design platforms
Figure 3.1 System architecture diagram
Figure 3.2 Use case diagram
Figure 3.3 Validation sequence diagram
Figure 3.4 Entity relationship diagram
Figure 3.5 Wire cleanup comparison
LIST OF TABLES
Table 2.1 Existing system review
Table 2.2 Comparison of existing platforms and Elera
Table 3.1 Functional requirements
Table 3.2 Non-functional requirements
Table 3.3 Database tables and data dictionary
CHAPTER 1
INTRODUCTION
1.0 PREAMBLE
This report presents Elera, an intelligent web-based Arduino circuit design assistant for students learning electronics and embedded systems. The system focuses on the design stage of Arduino circuit building, where beginner mistakes are common and feedback from existing tools is limited. Elera combines a visual circuit canvas, real-time rule-based validation, automatic wiring, wire cleanup, AI-assisted guidance, and metadata-driven component management in one browser-based application.
The value of the project is in its software engineering contribution. The project applies modular front-end architecture, structured component metadata, validation rules, pin assignment logic, event-driven state management, and cloud-based persistence to solve a practical learning problem. The report is organised into three chapters. Chapter 1 introduces the problem, objectives, scope, constraints, stages, and significance. Chapter 2 reviews existing circuit design systems and identifies the adaptation used in Elera. Chapter 3 explains the development approach, requirements, logical design, database design, and interface design.
1.1 PROBLEM DESCRIPTION
1.1.1 Background of the Problem
Arduino is widely used to introduce students to electronics, programming, and embedded systems. At IIUM, students in mechatronics and related courses build circuits using breadboards, sensors, LEDs, servo motors, and Arduino boards. These activities require students to understand both programming logic and physical wiring. In practice, students often spend a large portion of lab time finding wiring errors instead of focusing on higher-level system design [1], [2].
Common mistakes include missing ground connections, connecting an LED without a resistor, assigning more than one signal component to the same Arduino I/O pin, exceeding the Arduino Uno USB current limit, and connecting I2C devices to the wrong analogue pins. These mistakes can cause confusing circuit behaviour and may damage real components. Virtual tools reduce hardware risk, but students still need to make the same wiring decisions on the screen [8].
Tinkercad Circuits, Wokwi, and Fritzing support virtual circuit building and documentation [3], [4], [5]. Cirkit Designer adds AI-assisted circuit guidance [6]. These tools are useful, but they do not provide the same kind of proactive design-stage validation that Elera provides. Most feedback appears after simulation, through compiler errors, or through text-based guidance. Students still need clearer feedback while the circuit is being built.
1.1.2 Problem Statement
The main problem is that beginner students lack immediate guidance while designing Arduino circuits. The problem affects undergraduate students in electronics, embedded systems, and mechatronics courses, especially during laboratory sessions where circuit wiring must be completed within limited time. The problem occurs during the design and wiring stage, before the circuit is simulated or tested with real hardware.
Five specific problems were identified:
Beginners make wiring errors such as missing ground connections, current overload, wrong pin types, duplicate pin usage, and floating pins.
Existing tools provide limited educational explanation when wiring mistakes occur.
Manual pin assignment is difficult for beginners who do not know which Arduino pins support digital, analogue, PWM, or I2C signals.
Large circuits become visually messy because wires overlap, cross over components, or hide pin labels.
Existing accessible tools do not combine visual circuit building, real-time validation, automated pin assignment, AI-assisted guidance, component metadata, and wire management in one learning system.
1.2 PROJECT OBJECTIVE
The main objective of this project is to develop Elera as a web-based Arduino circuit design assistant that guides students during circuit construction. The specific objectives are:
To develop a web-based Arduino circuit builder with drag-and-drop component placement, manual pin-to-pin wiring, grid snapping, panning, zooming, and wire waypoint editing.
To implement the Elera Validation Engine, a rule-based engine that detects nine categories of wiring issues and displays beginner-friendly feedback in real time.
To implement an auto-wiring engine that assigns Arduino pins based on component requirements, including digital, analogue, PWM, I2C, power, and ground connections.
To create a metadata-driven component library covering 14 beginner-level Arduino components, with pin roles, current draw, validation flags, and auto-wiring rules stored as structured data.
To integrate a BYOK AI assistant that accepts natural language circuit goals, suggests components, guides wiring, and performs circuit-building actions through the same system tools used by the user.
To implement a component builder that allows users to import custom component images and define pin placements, signal types, current draw, and metadata so that custom parts can work with validation and auto-wiring.
1.3 PROJECT SCOPE
1.3.1 Scope
Elera is a web-based application focused on Arduino Uno circuit design for beginner-level electronics education. The product includes a visual canvas, a searchable component sidebar, manual wiring, automatic wiring, validation feedback, wire cleanup, project persistence, AI-assisted guidance, and custom component creation.
The supported board is Arduino Uno.
The component library includes Arduino Uno, LED, 220 ohm resistor, push button, buzzer, HC-SR04 ultrasonic sensor, servo motor, potentiometer, DHT22 sensor, LCD 16x2 I2C, PIR motion sensor, IR receiver, NeoPixel LED, and slide switch.
The validation engine checks no board, LED without resistor, total current overload, duplicate I/O pin assignment, servo on serial pins, missing power or ground, wrong I2C pins, unconnected components, and floating pins.
The auto-wiring engine assigns pins using metadata and avoids conflicts with pins already used in the circuit.
The wire cleanup feature reroutes wires using orthogonal routing and obstacle-aware waypoints.
Supabase handles user authentication and cloud-based project storage.
The BYOK AI assistant supports configurable model access through user-provided API keys.
Full electrical simulation, Arduino code execution, PCB routing, and support for boards other than Arduino Uno are outside the scope.
1.3.2 Target Audience
The primary target audience is undergraduate students taking electronics, embedded systems, mechatronics, or Arduino-related courses. The system is especially relevant to students in KICT and engineering courses at IIUM who already have basic programming knowledge but limited circuit wiring experience. The secondary audience is Arduino hobbyists and self-learners who need beginner-friendly wiring support.
1.3.3 Specific Platform
Development platform: Windows 10 or Windows 11, Node.js 18 or later, Vite 6, Lit 3, JavaScript ES modules, and @wokwi/elements 1.9.2.
Backend platform: Supabase hosted PostgreSQL, Supabase authentication, and REST API access.
AI platform: BYOK model configuration with Google Gemini API as the default provider.
User platform: Modern desktop browser such as Chrome, Edge, or Firefox with no plugin installation.
Recommended display: 1280 x 720 resolution or higher.
1.4 CONSTRAINTS
Scope constraint: The product focuses on Arduino Uno and beginner-level components.
Time constraint: The system was developed within the Final Year Project schedule by a single student developer.
Resource constraint: Component visuals depend partly on @wokwi/elements and custom uploaded images.
Quality constraint: The validation engine checks structural wiring rules and does not replace physics-based circuit simulation.
Cost constraint: Supabase and AI model access depend on service limits, API keys, and usage quotas.
Risk constraint: AI-generated guidance may vary, so deterministic validation remains the final source of wiring feedback.
1.5 PROJECT STAGES
The project followed an Agile Iterative development flow. The project stages are summarised below, and the detailed Gantt chart is listed in Appendix A.
Problem identification, literature review, and existing system review.
Requirements gathering through observation, questionnaire, and prototype feedback.
Architecture design, metadata schema design, and database design.
Canvas, component sidebar, and component placement development.
Manual wiring, wire routing, waypoint editing, and wire cleanup development.
Validation engine and validation bar development.
Auto-wiring engine and pin assignment logic development.
AI assistant, component builder, project storage, and integration development.
Testing, report writing, and final refinement.
1.6 SIGNIFICANCE OF THE PROJECT
The system helps students detect wiring problems during the design stage.
The validation messages explain the cause of the error and guide the student toward a correction.
The auto-wiring engine reduces the time spent assigning pins manually.
The wire cleanup feature improves readability for larger circuits.
The metadata-driven design makes it easier to add new components without rewriting the whole system.
The BYOK AI assistant supports personalised circuit guidance while keeping deterministic validation as the main checking mechanism.
The project supports beneficial knowledge by making Arduino learning more accessible and reducing avoidable hardware damage.
1.7 SUMMARY
This chapter introduced Elera as an intelligent Arduino circuit design assistant for students. The chapter explained the wiring guidance problem, the project objectives, the product scope, the target users, the platform, the constraints, the project stages, and the significance of the project. The next chapter reviews existing systems and explains the features adapted into Elera.
CHAPTER 2
LITERATURE REVIEW
2.0 INTRODUCTION
This chapter reviews learning challenges in electronics education and compares existing circuit design tools. The review focuses on Tinkercad Circuits, Fritzing, Wokwi, and Cirkit Designer because these tools represent common approaches to web simulation, desktop documentation, advanced browser simulation, and AI-assisted circuit guidance. The discussion identifies the gap that Elera addresses.
2.1 ANALYTICAL METHOD
The analytical method used in this chapter is feature comparison. Each system is reviewed based on platform, developer, main function, advantages, disadvantages, validation support, wiring support, feedback method, AI support, and suitability for beginners. This method was selected because Elera is a system development project, and the main concern is how existing products handle user tasks and technical features.
2.1.1 Existing Systems
Tinkercad Circuits is a browser-based circuit editor developed by Autodesk [3]. It provides a drag-and-drop interface and supports Arduino circuit simulation. It is popular among beginners because users can build circuits without installing software.
Fritzing is an open-source desktop tool maintained by Friends-of-Fritzing [5]. It supports breadboard diagrams, schematic diagrams, and PCB layout. Its strength is documentation because the breadboard view looks close to real components.
Wokwi is a browser-based simulator that supports Arduino, ESP32, STM32, and Raspberry Pi Pico [4]. It can run code in the browser and includes advanced tools such as a logic analyser and debugging support. A study on Wokwi use in electronics learning reported a positive relationship between simulator use and student skill improvement [13].
Cirkit Designer is an AI-assisted circuit prototyping platform [6]. It combines a large component library with text-based AI guidance. Users can describe a project idea and receive component suggestions, wiring guidance, and code suggestions.
System
Developer
Platform
Main Function
URL
Tinkercad Circuits
Autodesk
Web
Beginner circuit simulation
https://www.tinkercad.com
Fritzing
Friends-of-Fritzing
Desktop
Breadboard documentation and PCB layout
https://fritzing.org
Wokwi
Wokwi Ltd.
Web
Code-based embedded simulation
https://wokwi.com
Cirkit Designer
Cirkit Designer
Web
AI-assisted circuit prototyping
https://www.cirkitstudio.com
Table 2.1 Existing system review
2.1.2 Advantages
Tinkercad Circuits is accessible to beginners because it runs in the browser and uses visual drag-and-drop interaction [3]. It supports Arduino simulation and block-based coding, which helps users who are still learning programming [9], [10].
Fritzing is strong for documentation because its breadboard view is easy to understand and its workflow can move from breadboard layout to schematic and PCB views [5], [12]. This makes it useful for project reports and communication between technical and non-technical users.
Wokwi is strong for advanced simulation because it runs Arduino code in the browser and supports several embedded platforms [4]. It is useful for users who already understand programming and want to test code behaviour before using physical hardware.
Cirkit Designer is useful because it introduces AI-assisted guidance into circuit prototyping [6]. Its natural language interaction helps users move from a project idea to a list of components, wiring instructions, and code suggestions.
2.1.3 Disadvantages
Tinkercad Circuits provides limited proactive checking during the design stage. Usability research on Tinkercad also identified interface issues such as view obstruction from code panels and workflow friction [11].
Fritzing does not simulate circuit behaviour and does not validate wiring rules [12]. Users must test their design using another simulator or physical hardware.
Wokwi is powerful but code-centred. It assumes that the user can write or understand code, and some advanced features are linked to a paid model [9]. It gives less support to students who need wiring guidance before simulation.
Cirkit Designer relies on probabilistic AI output [6]. Its guidance can help users, but AI responses may vary and still require checking. The platform gives text-based instructions, while Elera performs wiring actions directly on the canvas and verifies them with deterministic rules.
2.2 SYSTEM ADAPTATION
Elera adapts useful ideas from the reviewed systems and combines them with additional guidance features. From Tinkercad, Elera adopts browser-based circuit building and beginner-friendly visual interaction. From Fritzing, Elera adopts realistic component representation through @wokwi/elements. From Wokwi, Elera adopts the web-first approach that avoids local installation. From Cirkit Designer, Elera adopts AI-assisted guidance, but pairs it with a deterministic validation engine.
The main adaptation is the use of structured component metadata. Each component carries information about pin roles, current draw, validation flags, and auto-wiring rules. This metadata allows the system to check wiring problems and assign pins without hardcoding each circuit case.
2.3 DISCUSSION
Feature
Tinkercad
Fritzing
Wokwi
Cirkit Designer
Elera
Visual circuit builder
Yes
Yes
Yes
Yes
Yes
Real-time design validation
Limited
No
Limited
AI review
Yes
Educational error explanation
Limited
No
Limited
Text guidance
Yes
Auto-wiring
No
No
No
Instruction-based
Yes
Wire cleanup
No
No
No
Limited
Yes
Structured component metadata
Internal
Parts data
Internal
Large library
Yes
BYOK AI assistant
No
No
No
No
Yes
Cloud project storage
Account-based
Local files
Account-based
Account-based
Supabase
Table 2.2 Comparison of existing platforms and Elera
The comparison shows that existing tools support some parts of the circuit design workflow, but they leave a gap in design-stage guidance. Elera addresses this gap through real-time validation, automatic pin assignment, wire cleanup, educational feedback, BYOK AI guidance, and a metadata-driven architecture. The next chapter explains how these features are translated into the system methodology and design.
CHAPTER 3
METHODOLOGY
3.0 INTRODUCTION
This chapter explains the methodology used to develop Elera. It covers the development approach, requirements gathering, functional and non-functional requirements, logical design, database design, and interface design. The chapter focuses on the system development aspects required by the FYP report guideline.
3.1 DEVELOPMENT APPROACH
The Agile Iterative model was selected because Elera contains several modules that benefit from repeated design, testing, and refinement. Validation rules, auto-wiring logic, component metadata, and interface behaviour became clearer as each module was implemented and tested. The iterative approach allowed the project to produce working outputs at each stage while still allowing improvement based on prototype feedback.
The project was organised into seven sprints:
Interactive canvas with component placement, grid snapping, panning, and zooming.
Component library, metadata schema, and component sidebar.
Manual pin-to-pin wiring with orthogonal routing and wire waypoints.
Validation engine with nine rules and validation bar interface.
Auto-wiring engine with smart pin assignment and conflict avoidance.
State management, project persistence, undo, redo, project import, project export, and cloud storage.
AI assistant, component builder, integration testing, wire cleanup, and interface refinement.
3.2 REQUIREMENTS SPECIFICATION
Requirements were gathered through four methods. First, a literature review and existing system review identified common features and missing functions in current circuit design tools. Second, informal observation of Arduino learning activities helped identify repeated wiring mistakes and layout issues. Third, a needs analysis questionnaire involving 35 undergraduate students from KICT and the Kulliyyah of Engineering at IIUM was used to understand user needs. Fourth, iterative prototyping was used to test whether the proposed interaction flow, validation messages, and auto-wiring behaviour were practical.
The questionnaire findings showed strong demand for real-time validation and explanatory feedback. Respondents reported low satisfaction with error feedback in existing tools, and many students discovered wiring errors through manual debugging, instructor intervention, or component failure. These findings supported the decision to make the validation engine, auto-wiring engine, and wire cleanup tools central features of Elera.
3.2.1 Functional Requirements
ID
Requirement
FR1
The system shall allow users to place, move, select, and delete components on a canvas.
FR2
The system shall provide a searchable component sidebar grouped by category.
FR3
The system shall allow manual wiring between component pins.
FR4
The system shall route wires using orthogonal paths and support waypoint editing.
FR5
The system shall validate the circuit after each structural change.
FR6
The system shall detect nine categories of wiring issues.
FR7
The system shall display validation results with severity, icon, and beginner-friendly explanation.
FR8
The system shall auto-wire components to valid Arduino pins using metadata rules.
FR9
The system shall clean up wire routes and reduce overlap with components.
FR10
The system shall save, load, import, and export projects.
FR11
The system shall support user authentication and cloud project storage through Supabase.
FR12
The system shall provide a BYOK AI assistant for natural language circuit guidance.
FR13
The system shall provide a component builder for custom uploaded component images and pin metadata.
FR14
The system shall support undo and redo for circuit editing actions.
Table 3.1 Functional requirements
3.2.2 Non-Functional Requirements
ID
Requirement
NFR1
Validation feedback should appear fast enough to feel immediate after a circuit change.
NFR2
The interface should be understandable to students with limited Arduino wiring experience.
NFR3
The system should run in modern desktop browsers without plugin installation.
NFR4
The component metadata structure should support adding new components with minimal code changes.
NFR5
Project data should be persisted so student work is not lost across sessions.
NFR6
AI guidance should remain separate from deterministic validation so the system can still provide consistent rule-based feedback.
Table 3.2 Non-functional requirements
3.3 LOGICAL DESIGN
3.3.1 System Architecture
Elera uses a modular architecture based on Lit 3 Web Components. The user interface layer contains Circuit App, Component Sidebar, Circuit Canvas, Placed Component, Validation Bar, AI Assistant, Projects Modal, and Component Builder. The service layer contains the Validation Engine, Auto-Wire Engine, and Wire Path Utility. The data layer contains the Circuit Store, Component Library, Supabase database, and AI configuration data.
The architecture follows an event-driven pattern. When a user places a component, edits a wire, or runs auto-wire, the Circuit Store updates the circuit state and emits a structural-change event. The Validation Bar responds by requesting validation from the Validation Engine. The Validation Engine reads component instances, wire connections, and metadata, then returns errors, warnings, and information messages.
Figure 3.1 System architecture diagram
3.3.2 Use Case Diagram
The primary actor is the Student. The main use cases are grouped into component management, wiring, validation, workspace controls, AI guidance, project management, and custom component creation. The AI Assistant acts as a system actor because it can request component placement and auto-wiring actions using internal tools.
Figure 3.2 Use case diagram
3.3.3 Activity Workflow
The main activity starts when the student opens a project and places an Arduino Uno on the canvas. The student then adds components from the sidebar or requests help from the AI assistant. The student may wire pins manually or run auto-wire. After each change, validation runs and the validation bar displays the result. The student fixes any issue and repeats the process until the circuit has no critical errors.
3.3.4 Sequence Diagram
The validation sequence begins when the user completes a wire on the canvas. The Canvas sends the completed wire to the Store. The Store records the wire, saves a history snapshot, and emits a structural-change event. The Validation Bar requests validation, and the Validation Engine runs the nine rules against the latest circuit state. The results are returned to the Validation Bar and shown to the user.
Figure 3.3 Validation sequence diagram
3.3.5 Data Flow Diagram
At context level, the Student sends component commands, wiring commands, project commands, search input, and AI prompts to Elera. The system returns the circuit canvas, validation feedback, project data, and AI responses. At Level 1, the main processes are Manage Components, Manage Wires, Validate Circuit, Auto-Wire Circuit, Manage Projects, Build Custom Component, and Process AI Request.
3.3.6 Package Diagram
The source code is organised into three main packages. The components package contains the Lit UI components. The services package contains validation, auto-wiring, and routing logic. The data package contains the component library, store, and persistence logic. This separation keeps UI rendering, domain rules, and state management easier to maintain.
3.4 DATABASE DESIGN
The database design is based on Supabase PostgreSQL. The database stores users, settings, projects, placed component instances, wire connections, and AI chat history. The static component library remains in the application layer because standard component definitions are shared across users.
Figure 3.4 Entity relationship diagram
Table
Main Attributes
Purpose
Users
id, name, email, createdAt
Stores registered user account data.
UserSettings
userId, encryptedApiKey, theme, preferences, updatedAt
Stores user-specific settings and BYOK configuration.
Projects
id, userId, title, updatedAt
Stores saved circuit projects owned by a user.
ComponentInstances
id, projectId, componentId, x, y
Stores each placed component in a project.
Wires
id, fromInstanceId, fromPinName, toInstanceId, toPinName, waypoints, color
Stores pin-to-pin wire connections and routing points.
AIChatHistory
id, projectId, role, content, timestamp
Stores AI assistant conversation records linked to a project.
Table 3.3 Database tables and data dictionary
The Projects table has a one-to-many relationship with ComponentInstances and Wires. Each ComponentInstance refers to a component definition in the metadata library. Each Wire stores the source and destination instance identifiers, pin names, colour, and waypoints. Waypoints are stored as JSONB because each wire can have a different number of routing points.
3.5 USER INTERFACE / PROTOTYPE DESIGN
The interface uses a three-panel workspace. The top header contains project actions, undo and redo controls, wire cleanup tools, auto-wire actions, AI access, and project controls. The left sidebar contains the searchable component library. The central area contains the circuit canvas and the validation bar.
3.5.1 Header Toolbar
The header toolbar gives quick access to Save, Export, Import, Clean, Reset Wires, Auto-Wire, Auto-Layout, anti-overlap mode, fan-out mode, sharp corner mode, grid size, AI Assistant, Projects, and Clear Project. The toolbar is designed for repeated editing tasks during circuit construction.
3.5.2 Component Sidebar
The component sidebar lists available parts by category. A search field filters the list as the user types. The sidebar also provides access to the custom component builder.
3.5.3 Circuit Canvas
The circuit canvas is the main workspace. It supports drag-and-drop placement, click-to-wire interaction, component movement, wire selection, waypoint editing, panning, zooming, grid snapping, and anti-overlap behaviour.
3.5.4 Validation Bar
The validation bar appears over the canvas and lists current issues. Messages are grouped by severity using errors, warnings, and information items. The bar updates automatically after each structural change.
3.5.5 Auto-Wire and Wire Cleanup
Auto-wire creates valid connections between components and the Arduino Uno based on metadata. Wire cleanup recalculates routes to reduce overlaps and improve readability. The comparison below shows the reason this feature matters for circuit readability.
Figure 3.5 Wire routing before cleanup
Figure 3.6 Wire routing after cleanup
3.5.6 AI Assistant
The AI assistant accepts natural language circuit goals and converts them into structured actions. It can suggest components, explain wiring choices, produce Arduino code snippets, and trigger circuit-building actions through the same internal commands used by the application.
3.5.7 Component Builder
The component builder allows users to upload a component image, define a component name and current draw, place pin markers, assign pin types, and save the component as metadata. Once saved, the custom component can appear in the component library and participate in validation and auto-wiring.
3.5.8 Navigation Flow
The application opens into the circuit workspace. A user can load a saved project or start from an empty canvas. From the workspace, the user can add components, wire pins, use auto-wire, ask the AI assistant, build custom components, view validation results, save the project, export the project, or clear the canvas. All editing paths return to the canvas so the workflow remains focused.
3.6 SUMMARY
This chapter explained the methodology used to develop Elera. The Agile Iterative model supported repeated refinement of the canvas, metadata, validation, auto-wiring, AI assistant, and component builder. Requirements were gathered from literature, observation, questionnaire responses, and prototyping. The logical design shows a modular event-driven system, while the database design shows how Supabase stores projects, component instances, wires, settings, and AI history. The interface design supports a focused circuit-building workflow for beginner Arduino learners.
REFERENCES
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
[11] PLOS ONE, "Examination of the Usability of Tinkercad Application in Educational Environments," 2023. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC10034876/. [Accessed: May 2025].
[12] KSPU, "Specialized Applied Software Fritzing and Its Use for Education," Information Technologies in Education. [Online]. Available: https://www.ite.kspu.edu/index.php/ite/article/view/767. [Accessed: May 2025].
[13] Cahaya-IC, "Utilization of Wokwi Technology as a Modern Electronics Learning Media," Journal of Education Technology and Literacy Culture, 2024. [Online]. Available: https://cahaya-ic.com/index.php/JETLC/article/view/1392. [Accessed: May 2025].
APPENDICES
Appendix A: Project Gantt Chart
The Gantt chart should show the stages listed in Section 1.5, from literature review to final refinement.
Appendix B: Needs Analysis Questionnaire Summary
The questionnaire summary should include respondent profile, current tool experience, validation feedback needs, auto-wiring needs, and adoption intention.
Appendix C: Additional Interface Screens
Additional screenshots may include the component sidebar, validation bar, projects modal, AI assistant panel, and component builder modal.