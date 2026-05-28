 

KULLIYYAH OF INFORMATION AND COMMUNICATION TECHNOLOGY


DEPARTMENT OF INFORMATION SYSTEMS

INFO 4401 REPORT


ELERA: AN INTELLIGENT WEB-BASED CIRCUIT DESIGN ASSISTANT


MOHAMAD IMAD ADDIN BIN JA'FAR
2127923



SUPERVISED BY
DR AHMAD FATZILAH BIN MISMAN




Report submitted in fulfilment of the requirements for Bachelor of Information Technology (Hons)
Kulliyyah of Information and Communication Technology


SEPTEMBER 2025
SEMESTER 2, 2025/2026
ABSTRACT
ABSTRACT
Arduino has become the standard platform for teaching electronics and embedded systems in universities around the world. However, beginner students continue to struggle with common circuit wiring mistakes that existing tools fail to catch during the design process. Errors such as connecting LEDs without current-limiting resistors, exceeding the Arduino Uno's 500 mA USB current limit, assigning multiple signal components to the same I/O pin, and wiring I2C devices to incorrect analogue pins are frequent among novice learners. Popular web-based tools like Tinkercad Circuits (Autodesk, 2017), Wokwi (Wokwi Ltd., 2020), and Fritzing (Friends-of-Fritzing, 2009) allow students to build circuits virtually, but none of them validate wiring during the design phase or explain why a mistake occurred. To address this problem, Elera was developed as an intelligent web-based Arduino circuit design assistant. The system was built using Lit 3 for the component framework, Vite 6 as the build tool, and the @wokwi/elements library for component rendering. Elera provides a drag-and-drop circuit canvas, a metadata-driven component library covering 14 common Arduino parts, and a real-time validation engine that checks for nine categories of electrical errors. These include missing board detection, LED without resistor warnings, total current overload, duplicate pin assignment, servo motor on serial pins, missing power or ground connections, incorrect I2C pin wiring, unconnected components, and floating signal pins. The system also includes an intelligent auto-wiring engine that automatically assigns the correct Arduino pins based on each component's electrical requirements. Development followed an Agile Iterative methodology across seven functional sprints. Elera runs entirely in the browser with no installation required. The project targets undergraduate students enrolled in electronics and embedded systems courses who need proactive, educational feedback while learning circuit design.




TABLE OF CONTENTS
TABLE OF CONTENTS

CONTENTS                PAGE

SUPERVISOR APPROVALii
CERTIFICATE OF ORIGINALITYiii
ACKNOWLEDGEMENT1
ABSTRACT2
TABLE OF CONTENTS3
LIST OF FIGURES7
LIST OF TABLES8
1.0PREAMBLE9
1.1PROBLEM DESCRIPTION9
1.1.1Background of the problem9
1.1.2Problem Statement9
1.2PROJECT OBJECTIVE10
1.3PROJECT SCOPE10
1.3.1Scope10
1.3.2Target Audience10
1.3.3Specific Platform10
1.4CONSTRAINTS10
1.5PROJECT STAGES10
1.6SIGNIFICANCE OF THE PROJECT11
1.7SUMMARY11
CHAPTER THREE: METHODOLOGY12
2.0INTRODUCTION12
2.1SYSTEM REVIEW DIGITAL STORYTELLING/E-LEARNING APPLICATION/GAME REVIEW (Please remove the unnecessary).12
2.1.1Existing System/ Digital Storytelling/E-Learning Application/Game Development (Please slash the unnecessary).12
2.1.2Advantages12
2.1.3Disadvantages12
2.2DISCUSSION13
CHAPTER FOUR: RESULTS AND FINDINGS14
3.0INTRODUCTION14
3.1DEVELOPMENT APPROACH14
3.2REQUIREMENTS SPECIFICATION14
3.3LOGICAL DESIGN14
3.3.1System Analysis and Design Diagram14
3.3.2Data Flow Diagram (if applicable)14
3.4DATABASE DESIGN15
3.5USER INTERFACE/PROTTYPE DESIGN15
3.6SUMMARY15
CHAPTER FOUR: RESULTS AND FINDINGS16
4.1INTRODUCTION16
4.2REQUIREMENT SPECIFICATIONS/DATA COLLECTIONS16
4.2.1The Findings16
4.3CONCEPTUAL DESIGN16
4.4STORY STRUCTURE16
4.4.1Story Plot/Script16
4.4.2Character Design17
4.5STORYBOARD17
CHAPTER FOUR: RESULTS AND FINDINGS18
3.0INTRODUCTION18
3.1DEVELOPMENT APPROACH18
3.2REQUIREMENT SPECIFICATION/DATA COLLECTIONS18
3.2.1The Findings18
3.3THE NEEDS ANALYSIS18
3.4THE APPLICATION DESIGN18
3.5CONTENT DEVELOPMENT18
3.6NAVIGATION FLOW OF THE APPLICATION19
3.7STORYBOARD19
CHAPTER FOUR: RESULTS AND FINDINGS20
3.0INTRODUCTION20
3.1DEVELOPMENT APPROACH20
3.2STRUCTURE20
3.2.1Story Plot20
3.2.2Character Design20
3.3STORYBOARD20
CHAPTER FOUR: RESULTS AND FINDINGS21
4.0INTRODUCTION21
4.1SYSTEM INTEGRATION21
4.2SYSTEM OUTPUT21
4.2.1Administrator21
4.2.2User(s)21
4.3SYSTEM TESTING21
4.3.1Test Plan21
4.3.2Enhancement22
CHAPTER FOUR: RESULTS AND FINDINGS23
5.1INTRODUCTION23
5.2FINAL COMPOSITION (Production)23
5.2.1Digitizing Art23
5.2.22D//3D Modelling and Animation23
5.3RECORDING AND DIGITIZING AUDIO23
5.4IMPLEMENTATION24
5.5EVALUATION/TESTING (Post-Production)24
5.5.1Test Plan24
5.5.2Enhancement24
CHAPTER FOUR: RESULTS AND FINDINGS25
6.1INTRODUCTION25
6.2APPLICATION DEVELOPMENT (Production)25
6.2.1Digitizing 2D/3D Art25
6.2.2Digitizing Scenes25
6.2.3Recording And Digitizing Audio25
6.2.4Authoring25
6.3IMPLEMENTATION25
6.4EVALUATION/TESTING (Post-Production)26
6.4.1Test Plan26
6.4.2Enhancement26
CHAPTER FOUR: RESULTS AND FINDINGS27
7.0PROJET REQUIREMENT27
7.1PROJECT CONSTRAINT27
7.2FUTURE ENHANCEMENT27
7.3CONCLUSION27
REFERENCE28
APPENDICES29


LIST OF FIGURES
LIST OF FIGURES

FIGURE        PAGE


Figure 1 Scene 1.23

LIST OF TABLES
LIST OF TABLES

TABLEPAGE


Table 2-1 A Table13


CHAPTER 1
INTRODUCTION
PREAMBLE

At the Kulliyyah of Information and Communication Technology (KICT), International Islamic University Malaysia (IIUM), mechatronics students are introduced to Arduino circuit wiring through hands-on laboratory courses. In the Mechatronic Workshop Lab, students learn to assemble circuits on physical breadboards using components like LEDs, sensors, and servo motors. The System Integration Lab builds on this by requiring students to combine multiple hardware modules into working embedded systems. Both courses demand that students understand not only how to write Arduino code, but also how to wire components correctly to the right pins with proper power and ground connections.
In practice, many students in these labs spend a large portion of their time troubleshooting wiring problems rather than focusing on the programming logic or system design. A common scenario involves a student connecting an LED directly to 5V without a resistor, or wiring an ultrasonic sensor without a ground connection, and then spending the rest of the lab session trying to figure out why the circuit does not work. Lab instructors often have to move from one student to the next, diagnosing the same basic wiring mistakes repeatedly.
Web-based simulation tools like Tinkercad and Wokwi can help by letting students prototype circuits before using physical hardware. But these tools only show errors after the simulation runs. They don't check for wiring problems during the design phase, and they don't explain what went wrong or why. For a mechatronics student who is still learning which pin types exist on the Arduino Uno, this lack of guidance makes the learning process slower than it needs to be. Elera was built to address this specific problem by providing real-time validation and beginner-friendly feedback within the circuit design environment itself.

PROBLEM DESCRIPTION

Learning Arduino circuit design comes with a lot of friction, especially for students who are doing it for the first time in a lab setting. The problems go beyond simple knowledge gaps. The tools available to students don't do enough to support the learning process.

Background of the Problem

Most beginners pick up Arduino wiring from YouTube tutorials, blog posts, and community forums. They follow along step by step, and when it works, that's great. But when it doesn't, they're stuck trying to figure out why. Common mistakes include connecting an LED straight to 5V without a resistor (which burns it out), wiring two components to the same signal pin, exceeding the Arduino's 500 mA current limit, or plugging an I2C device into the wrong analogue pins. These errors can damage real hardware and produce confusing behaviour that is hard to debug, especially for someone who does not yet have a solid understanding of electrical principles [Insert Citation Here].
Several popular tools exist to help with this. Tinkercad Circuits, built by Autodesk, offers a free browser-based simulator where users can build circuits and run Arduino code (Autodesk, 2017). Wokwi provides a similar web-based simulation environment with support for Arduino, ESP32, and other boards (Wokwi Ltd., 2020). Fritzing is a desktop application focused on breadboard layout and PCB design (Friends-of-Fritzing, 2009). These tools are genuinely useful, but they all share one important limitation. They are passive. The user builds the circuit manually, and errors only become visible when the simulation runs, or when the physical circuit fails. None of them actively check for wiring problems during the design process. And none of them tell the user why something is wrong or how to fix it.
There is a significant difference between a tool that simulates a circuit and one that actually teaches someone how to wire it correctly. That difference is the gap that Elera was designed to fill.
Problem Statement

Four specific problems were identified:
1.  Beginners regularly make electrical wiring errors such as missing grounds, overcurrent, wrong pin types, and floating pins. Existing tools don't catch these during the design phase. The mistakes only surface during simulation or physical testing, which makes finding the root cause much harder.
2.  When errors do appear, current tools don't explain them. There is no feedback telling the student "you're missing a resistor because the LED will draw too much current without one." Students are left to figure it out on their own.
3.  Every existing web-based Arduino circuit builder requires fully manual wiring. The user has to know, for example, that a servo needs a PWM pin, or that an I2C LCD goes on A4 and A5. For beginners who don't know these rules yet, it is a tedious and error-prone process.
4.  No single accessible web application brings together visual circuit building, real-time rule-based validation, and automated pin assignment in one place. Some of these features exist in isolation across different tools, but no one has combined them into a unified learning environment.

PROJECT OBJECTIVE

The main goal of the project is to design and develop Elera, a web-based Arduino circuit design assistant that gives beginners proactive guidance while they build circuits. The specific objectives are:
1.  To design and develop a web-based Arduino circuit builder with drag-and-drop component placement and manual pin-to-pin wiring on an interactive canvas.
2.  To implement a rule-based validation engine (the Elera Validation Engine, or EVE) that detects common electrical errors including missing power and ground connections, current overload, duplicate pin assignments, wrong I2C wiring, floating pins, and missing current-limiting resistors, and provides immediate, beginner-friendly feedback.
3.  To develop an auto-wiring engine that assigns the correct Arduino pins to component pins based on their electrical requirements (digital, analogue, PWM, I2C) and generates the wire connections automatically.
4.  To create a metadata-driven component library where each component's pin roles, current draw, and auto-wiring rules are stored as structured data, so the system can be extended with new components without modifying the core logic.
5.  To develop a component builder that allows users to import custom component images and use AI-assisted pin detection to define pin placements, signal types, and names, enabling the creation of user-defined components that integrate with the validation and auto-wiring engines.

PROJECT SCOPE

1.4.1 Scope
Elera is a web-based application with a primary focus on the Arduino Uno as the target board for beginner-level circuit education. The architecture supports extension to additional boards in future iterations. It includes:
•  A component library with 14 beginner-level parts: Arduino Uno, LED, RGB LED, resistor, push button, potentiometer, servo motor, buzzer, LCD 1602 (I2C), HC-SR04 ultrasonic sensor, DHT22 temperature sensor, PIR motion sensor, NeoPixel LED, IR receiver, and slide switch.
•  A visual canvas with drag-and-drop placement, pin-to-pin wiring, grid snapping, anti-overlap detection, wire waypoint editing, undo/redo, and pan/zoom.
•  A validation engine covering nine rule categories: missing board, LED without resistor, current overload, duplicate pin assignment, servo on serial pins, missing power/ground, wrong I2C pins, unconnected components, and floating pins.
•  An auto-wiring engine that assigns pins based on type and creates the connections automatically.
•  An AI assistant powered by a configurable language model (defaulting to Google Gemini) that allows students to describe a circuit requirement in plain English and receive component suggestions, wiring guidance, and auto-generated connections on the canvas.
•  A component builder that allows users to create custom components by importing an SVG, PNG, or JPG image. The system uses the Gemini vision API to suggest pin placements based on the imported image. Users can review, reposition, rename, and assign signal types to the detected pins before saving the component to their personal library.
•  User authentication and cloud-based project storage via Supabase, allowing students to save and access their circuits from any device.
The following are not included in the current scope:
•  Full circuit simulation or running Arduino code.
•  PCB design or schematic capture.

1.4.2 Target Audience

The primary audience is undergraduate students taking electronics, embedded systems, or mechatronics courses, particularly those in the Mechatronic Workshop Lab and System Integration Lab at KICT, IIUM. These students typically have basic programming skills but limited experience with physical circuit wiring. The secondary audience is hobbyists and self-learners who are starting out with Arduino.

1.4.3 Specific Platform

Elera runs in the browser and uses Supabase as its backend for project persistence and user authentication.

Development environment:
•  Windows 10/11, Node.js 18+, Vite 6.0
•  Lit 3.2 (Web Components), @wokwi/elements 1.9.2
•  JavaScript (ES Modules)
•  Supabase (hosted PostgreSQL, authentication, REST API)
User environment:
•  Any modern browser (Chrome, Firefox, Edge)
•  No installation or plugins needed
•  Minimum resolution: 1280 x 720

1.5 CONSTRAINTS

1.  The system is designed with a primary focus on the Arduino Uno as the target board for beginner-level circuit education. The architecture supports extension to additional boards in future iterations.
2.  Component visuals depend on the @wokwi/elements library. If a component is not available in this library, it cannot be displayed in Elera without building custom rendering. The component builder addresses this by allowing users to import their own component images.
3.  The validation engine runs on predefined rules, not physics-based simulation. It catches structural wiring errors but cannot simulate voltage levels, signal timing, or code-dependent behaviour.
4.  The system uses Supabase as its backend for project storage and authentication. Projects are stored in a hosted PostgreSQL database and are accessible from any device after login.
5.  The AI assistant is designed with a provider-agnostic interface, allowing the underlying language model to be configured or replaced. The default integration uses the Google Gemini API. AI-generated responses are non-deterministic and may vary between sessions. The assistant provides guidance and suggestions only and does not override the deterministic validation engine.
6.  The system requires an active internet connection to access the Supabase backend for project persistence and user authentication. Offline usage is not supported in the current design. Within a browser session, circuit state is retained in localStorage as a temporary cache to support uninterrupted work during brief connectivity interruptions.

1.6 PROJECT STAGES

Development followed an iterative approach with these milestones (a Gantt chart is provided in the Appendices):
1.  Literature review and requirements gathering. Reviewing existing tools, identifying gaps, and defining functional requirements.
2.  System architecture design. Planning the modular structure, state management approach, and data flow between components.
3.  Core canvas development. Building the interactive SVG canvas with placement, grid snapping, pan/zoom, and anti-overlap detection.
4.  Component library and sidebar. Creating the metadata-driven catalog and the searchable sidebar UI.
5.  Manual wiring system. Implementing pin-to-pin wiring with orthogonal routing, waypoints, and colour-coded wires.
6.  Validation engine. Developing and integrating the nine-rule engine with the validation bar.
7.  Auto-wire engine. Building the intelligent pin assignment algorithm.
8.  Prototype completion and testing. Final integration, UI polish, and functional verification.
9.  Report writing.

1.7 SIGNIFICANCE OF THE PROJECT
1.  It reduces the trial-and-error cycle. Instead of building a circuit, watching it fail, and trying to figure out what went wrong, students receive feedback during the design phase itself.
2.  The validation engine explains the electrical rule behind each problem, which means students learn from the feedback rather than just being told something is wrong.
3.  Lab instructors spend a significant amount of time catching basic wiring mistakes. Elera automates that detection, allowing instructors to focus on higher-level teaching.
4.  There is nothing to install. It runs in a browser, so any student with a laptop and internet access can use it.
5.  Adding new components is straightforward. A developer only needs to write a metadata entry in the library file, and the validation and auto-wiring code will pick it up automatically.
6.  The project aligns with the Islamic principle of beneficial knowledge (ilm nafi') by making electronics education more accessible to students who may not have easy access to physical hardware.
7.  It supports STEAM education initiatives, especially in environments where universities and schools do not have enough physical Arduino kits for every student [Insert Citation Here].

1.8 SUMMARY

Elera is an intelligent web-based Arduino circuit design assistant built as a Final Year Project at IIUM KICT. The core problem is that existing tools let students build circuits but do not catch wiring mistakes or provide any educational feedback when errors occur. Elera addresses this through four objectives covering the visual builder, validation engine, auto-wiring engine, and metadata-driven component library. The scope is focused on Arduino Uno circuits in a client-side web app aimed at mechatronics and embedded systems students. Constraints include the single-board limitation and the fact that validation is rule-based rather than simulation-based. The next chapter reviews the existing tools in detail and identifies the specific gaps they leave.

CHAPTER 2
LITERATURE REVIEW
2.1 INTRODUCTION

Before building Elera, it was important to understand the educational challenges students face when learning circuit design, and to evaluate what tools already exist for Arduino prototyping. The literature review begins with a discussion of the pedagogical difficulties that arise during hands-on electronics learning, particularly the cognitive load involved in breadboarding and virtual simulation. It then reviews four existing platforms: Tinkercad Circuits, Fritzing, Wokwi, and Cirkit Designer. Each takes a different approach to the problem, and each has both strengths and clear limitations. By identifying where these tools fall short, the review establishes the specific gaps that Elera was designed to fill.

2.2 PEDAGOGICAL CHALLENGES IN ELECTRONICS EDUCATION

Learning electronics through hands-on prototyping places a heavy cognitive demand on students. When working with Arduino circuits, learners must simultaneously manage multiple types of knowledge: understanding the programming syntax, reading the pin layout of the microcontroller, interpreting component datasheets, and physically routing wires on a breadboard or virtual canvas. Cognitive load theory suggests that when the total demand on a learner's working memory exceeds its capacity, learning becomes less effective and errors increase [Insert Citation Here]. In a circuit design context, this overload often manifests as wiring mistakes that students don't notice until the circuit fails to work, at which point they struggle to trace back to the root cause.
Physical breadboarding introduces additional spatial complexity. Students have to understand which rows and columns on the breadboard are electrically connected, how power rails work, and how to route wires without creating short circuits or loose connections. Research on novice electronics learners has found that a significant portion of lab time is spent on low-level troubleshooting rather than on the conceptual learning objectives of the exercise [Insert Citation Here]. The physical nature of the task also means that mistakes can result in damaged components, which adds financial cost and psychological frustration.
Virtual circuit simulators were introduced in part to reduce these barriers. By moving the prototyping process into a software environment, simulators eliminate the risk of hardware damage and allow for rapid experimentation. However, studies on the use of virtual labs in electronics education have noted that while simulators reduce some logistical friction, they do not inherently reduce cognitive load [Insert Citation Here]. Students still need to manage the same wiring decisions, and most simulators offer no guidance during the design process. The errors simply become virtual instead of physical. Without real-time validation or feedback, the pedagogical gap remains.

2.3 SYSTEM REVIEW

Virtual circuit design tools tend to serve very different purposes. Some are built for absolute beginners, others for professional engineers, and most sit somewhere in between. The platforms reviewed below represent the most commonly used options in electronics education today.

2.3.1 Existing Systems

Tinkercad Circuits
Tinkercad Circuits is a browser-based circuit editor built by Autodesk. It is aimed at beginners, covering primary, secondary, and introductory university-level programmes (Autodesk, 2017). The platform started as a 3D modelling tool in 2011 and was acquired by Autodesk in 2013. In 2017, Autodesk merged in the "Electronics Lab" (formerly 123D Circuits) to create what is now known as Tinkercad Circuits (Wikipedia, 2024).
[FIGURE 2.1: Tinkercad Circuits Interface, showing the breadboard editor, component toolbox, and code panel.]
It runs entirely in the browser with a drag-and-drop interface. There is a large selection of simulated components, including the Arduino Uno, Micro:bit, and various sensors (Tinkercad, n.d.). It is available in 16 languages and saw a big jump in usage during the COVID-19 pandemic when remote learning became the norm (Tinkercad, n.d.). One of its strongest features is the dual programming interface. Beginners can use visual block-based coding while more experienced users can write C++ directly (IoTDunia, 2024). There is also an integration with Autodesk Fusion 360 for users who want to take their designs into professional PCB workflows (Autodesk, 2021).
Research has shown that Tinkercad's visual environment helps with student motivation. Case studies with secondary school students found that the platform made abstract concepts like "smart air conditioning systems" feel engaging and accessible (ERIC, 2024).

Fritzing
Fritzing started in 2007 at the University of Applied Sciences Potsdam in Germany, under Prof. Reto Wettach (Fritzing, n.d.). It was originally meant to help non-engineers, designers, and artists document their electronic prototypes. The Friends-of-Fritzing non-profit organisation maintains it as open-source software (Friends-of-Fritzing, 2009).
[FIGURE 2.2: Fritzing Interface, showing the photorealistic breadboard view.]
What makes Fritzing stand out is its three-view workflow. The Breadboard View shows photorealistic component layouts, the Schematics View provides abstract circuit diagrams, and the PCB View generates Gerber manufacturing files (Fritzing, n.d.). The breadboard view uses high-fidelity graphics that look like real components on a real desk, which makes it very intuitive for beginners. The software uses XML and SVG standards, so users can create custom parts through the Parts Editor (Fritzing, n.d.). It is widely used in academic settings like the MIT Media Lab and across maker communities.

Wokwi
Wokwi was introduced around 2019 by Wokwi B.V. and takes a very different approach compared to Tinkercad or Fritzing (Wokwi, n.d.). It is built for advanced simulation. The engine underneath, AVR8js, is an open-source Arduino simulator written in JavaScript and TypeScript that compiles and runs code directly in the browser (Wokwi Blog, n.d.).
[FIGURE 2.3: Wokwi Interface, showing a simulated circuit with the code editor.]
The board support goes well beyond Arduino. Wokwi simulates ESP32, STM32, and Raspberry Pi Pico alongside the traditional Arduino family (Wokwi, n.d.). One standout feature is real-time internet connectivity, where simulated ESP32 devices can connect to virtual WiFi and run MQTT, HTTP, and NTP protocols entirely in the cloud (IoTDunia, 2024). It also provides professional-grade tools like a virtual logic analyser and GDB debugging (Wokwi, n.d.). The platform integrates with VS Code and CI/CD pipelines such as GitHub Actions, and has been adopted by universities including Harvard, NUS, and Tufts (Wokwi, n.d.).
A study at Jambi University tested Wokwi in basic physics and electronics courses with fifty students. The results showed that 44% of students achieved "Good" science process skills, and there was a significant positive correlation between using the simulator and skill improvement (Cahaya-IC, 2024).

Cirkit Designer
Cirkit Designer is a newer platform founded by Austin Small, a former Google engineer with an electrical engineering background from the University of Pennsylvania (Cirkit Designer, n.d.). He created it out of personal frustration. As an eighth-grader, he tried to build an Arduino RFID pet feeder and spent years on it because no tool could guide him through both the wiring and the code (Cirkit Designer, 2024).
[FIGURE 2.4: Cirkit Designer Interface, showing the AI assistant panel alongside the circuit editor.]
The platform combines a library of over 30,000 components with an integrated Arduino IDE powered by VS Code (Cirkit Studio, n.d.). Its main selling point is an AI assistant that uses Large Language Models (LLMs) to walk users through the whole process. A user can type something like "build an RFID pet feeder," and the AI recommends specific components, explains why each one is needed, drafts Arduino code, includes the right libraries, and helps debug compilation errors (Cirkit Designer, 2024). It supports Arduino, ESP32, and Raspberry Pi boards.

2.3.2 Advantages
Tinkercad is the most approachable option for absolute beginners. The block-based coding and drag-and-drop interface make it a natural fit for younger learners and introductory courses. The Fusion 360 integration adds value for anyone who eventually wants to do PCB work.
Fritzing is unmatched for documentation. If the goal is to create clear, visual circuit diagrams that non-technical people can understand, Fritzing is the strongest choice. The fact that it can go from breadboard sketch to PCB manufacturing files within one project is genuinely useful.
Wokwi is by far the most powerful simulator. Support for modern microcontrollers, virtual WiFi, debugging tools, and CI/CD integration put it in a different league. For university-level embedded systems work, it is hard to beat.
Cirkit Designer brings something new with its AI assistant. Being able to describe a project in plain English and get component suggestions and boilerplate code is a real time-saver, and it points to where the industry is heading.

2.3.3 Disadvantages
For all their strengths, these four platforms share some important weaknesses.
Tinkercad has UI problems that actually get in the way of learning. There is no quick reset function, so clearing the canvas means deleting components one at a time. When the code blocks panel is open, it physically covers the circuit view, which makes it hard to see what the code is doing to the hardware in real time (PMC, 2023). There is no proactive error checking during design.
Fritzing cannot simulate anything at all. It does not run code, does not show voltage or current, and has no validation of any kind. Users have to build and test their circuits elsewhere and only come back to Fritzing for documentation (KSPU, n.d.). There is also a well-known criticism from the engineering community that complex Fritzing diagrams turn into a "rat's nest" of overlapping wires that are harder to read than proper schematics (Arduino Forum, 2023).
Wokwi is code-centric. It assumes users already know how to program in C++ or MicroPython, and there is no visual block-based option to ease beginners in (IoTDunia, 2024). Several advanced features also sit behind a $25/month paywall, which limits access for students.
Cirkit Designer's AI is impressive, but it has a fundamental reliability issue. Because it runs on probabilistic language models, it can hallucinate. This means it may recommend the wrong component, confuse an RFID reader with a tag, or generate wiring instructions that don't account for physical constraints (Cirkit Designer, 2024). The AI also only provides text-based wiring instructions. It tells the user where to place wires but does not actually draw them, so the manual effort stays the same.
The biggest gap across all four: none of them check for electrical errors during the design process. None of them tell the user "you're missing a ground connection" or "this LED will burn out without a resistor." And none of them explain why a mistake is a mistake.

2.4 DISCUSSION
[TABLE 2-1: Comparison of Existing Circuit Design Platforms]
Feature
Tinkercad
Fritzing
Wokwi
Cirkit Designer
Primary Focus
Beginner education, simulation
Documentation, PCB design
Advanced IoT simulation
AI-assisted prototyping
Platform
Web-based
Desktop
Web-based
Web-based
Board Support
Arduino Uno, Micro:bit, ATtiny
Visual only (no simulation)
Arduino, ESP32, STM32, Pi Pico
Arduino, ESP32, Raspberry Pi
Coding Interface
Block-based + C++
None
C++, MicroPython
C++ (VS Code engine)
Real-Time Simulation
Basic
No
Advanced (WiFi, MQTT)
Yes
AI Assistance
No
No
No
LLM-based
Real-Time Validation
No
No
No
No (AI text guidance only)
Auto-Wiring
No
No
No
No (text instructions only)
Pedagogical Feedback
No
No
No
Partial (AI-generated)

Looking at the table, a clear pattern emerges. Each tool is good at something specific: Tinkercad at beginner accessibility, Fritzing at documentation, Wokwi at simulation power, Cirkit Designer at AI-assisted code generation. But they all leave the same holes.
Real-time validation is missing everywhere. All four tools either show errors only after you run a simulation, or they don't validate at all. Nobody checks the wiring while the student is still building.
Auto-wiring doesn't exist. Every tool requires manual wire routing. Cirkit Designer's AI gives text instructions ("connect SDA to pin A4"), but the user still has to click and drag each wire themselves.
Educational feedback is an afterthought. When things go wrong, the feedback is either a cryptic compiler error, a generic simulation failure, or nothing at all. None of these tools try to teach the student what the underlying electrical problem is.
Components are treated as static graphics. In most of these tools, a virtual LED is just a picture with connection points. It does not carry metadata about its current draw, pin roles, or voltage requirements. Without that kind of structured data, automatic validation and wiring are not really possible.
Elera was designed to fill these four gaps. It combines a visual circuit builder with a deterministic validation engine (nine predefined electrical rules), an auto-wiring engine that assigns pins based on type, and a metadata-driven component library that makes the whole system extensible. Elera uses fixed, deterministic rules rather than probabilistic AI, so the validation output is predictable and consistent. Elera also provides context-aware feedback that explains both the problem and how to fix it, which none of the four reviewed tools currently offer.

CHAPTER 3
METHODOLOGY
3.0 INTRODUCTION

The choices made during the planning and design phase directly shaped how Elera was built. The development model, the data structures, and the way requirements were gathered all contributed to the final system. This chapter covers the development approach that was adopted, the functional and non-functional requirements that were gathered, the logical design of the system expressed through standard UML and DFD diagrams, the data model used for application state, and the user interface prototype.

3.1 DEVELOPMENT APPROACH

Elera was built using an Agile Iterative approach. In practice, this meant breaking the project into short development cycles called sprints. Each sprint focused on a specific feature and produced a working piece of the system. After each sprint, the output was tested and any issues found were fed into the next cycle.
There were a few reasons for choosing this over a more traditional approach like Waterfall:
•  The requirements were not fully clear from the start. As a single-developer FYP, the exact validation rules, pin assignment logic, and metadata schema became clearer as the developer worked through each feature. An iterative model handles that kind of gradual refinement well.
•  Each sprint delivered a functional output. Even halfway through the project, there was always a working version to demonstrate. This reduces the risk of arriving at the end of the semester with a non-functional prototype.
•  It keeps the workload manageable. Instead of planning everything upfront, the developer could focus on one module at a time and incorporate lessons learned into the next sprint.
The project was organised into seven sprints:
1.  Interactive canvas with component placement, grid snapping, and pan/zoom.
2.  Component library with metadata and the sidebar interface.
3.  Manual pin-to-pin wiring with orthogonal routing.
4.  Validation engine (nine rules) and the validation bar UI.
5.  Auto-wire engine with smart pin assignment.
6.  State management upgrades, including undo/redo, localStorage persistence, and anti-overlap collision detection.
7.  Integration testing, UI polish, and wire cleanup features.
[FIGURE 3.1: Agile Iterative Development Model, showing the sprint cycle: Plan, Design, Build, Test, Review, repeating for each sprint.]

Technology Stack

The front-end application was built using Lit 3 as the component framework and Vite 6 as the build tool. Component visuals are rendered using the @wokwi/elements library, which provides SVG representations of real Arduino parts.

Supabase was selected as the backend platform, providing a hosted PostgreSQL database, built-in user authentication, and a REST API layer. This removes the need for a separate backend server while retaining the full relational structure of a traditional database.

3.2 REQUIREMENTS SPECIFICATION

Requirements were gathered through three methods. First, a literature review of existing circuit design tools (discussed in Chapter 2) identified which features are standard in the market and which are absent. Second, a needs analysis questionnaire was distributed to 35 undergraduate students from KICT and the Kulliyyah of Engineering to understand their experience with existing tools and their preferences for validation features. Third, early prototyping of the UI and validation logic provided practical feedback on which rules worked correctly and which needed refinement.

3.2.1 Functional Requirements

FR1: Component Placement and Management
•  FR1.1: Users can drag components from the sidebar and drop them onto the canvas.
•  FR1.2: Placed components snap to a 20-pixel grid so things stay aligned.
•  FR1.3: With anti-overlap mode on, the system nudges components that would stack on top of each other.
•  FR1.4: Users can select, reposition, and delete components.
FR2: Component Library and Sidebar
•  FR2.1: Components are shown in a categorised sidebar with six groups: Boards, Sensors, Input, Output, Actuators, and Passive.
•  FR2.2: A search box at the top filters the list as the user types.
•  FR2.3: Each entry shows an icon, name, and short description.
FR3: Manual Wiring
•  FR3.1: Wires are created by clicking a source pin, then clicking a destination pin.
•  FR3.2: Wire paths follow orthogonal (right-angle) routing.
•  FR3.3: Colour coding is automatic based on signal type (red for power, black for ground, and so on).
•  FR3.4: Users can add, drag, and delete wire waypoints for manual route adjustments.
•  FR3.5: Individual wires can be selected and deleted.
FR4: Real-Time Validation
•  FR4.1: Validation runs automatically every time a structural change happens (adding, removing, or wiring a component).
•  FR4.2: The engine checks for nine categories of errors:
•  (a) No Arduino board on the canvas.
•  (b) An LED wired without a current-limiting resistor.
•  (c) Total current draw going over the Arduino's 500 mA USB limit.
•  (d) Two or more signal components sharing the same Arduino I/O pin.
•  (e) A servo motor connected to serial pins 0 or 1.
•  (f) A component that is missing its power (VCC) or ground (GND) connection.
•  (g) An I2C device not wired to the correct pins (A4 for SDA, A5 for SCL).
•  (h) A component that has been placed on the canvas but has no wires at all.
•  (i) A partially wired component with pins left floating.
•  FR4.3: Each result includes a severity level (error, warning, or info), a message explaining the issue and the fix, and an icon.
•  FR4.4: Results appear in a validation bar panel overlaid on the canvas.
FR5: Intelligent Auto-Wiring
•  FR5.1: Users can trigger auto-wire to connect a component to the Arduino automatically.
•  FR5.2: Pin assignment follows the metadata rules: PWM pins for servos, analogue pins for potentiometers, I2C pins for LCDs, and digital pins for most other components.
•  FR5.3: The engine tracks which Arduino pins are already taken and avoids conflicts.
•  FR5.4: When multiple pins of the same type are available, the engine picks the one that is physically closest to keep wires short.
FR6: State Management
•  FR6.1: Undo and redo work across up to 50 history states.
•  FR6.2: Projects auto-save to localStorage 500 milliseconds after each structural change.
•  FR6.3: On page reload, the last saved project is restored automatically.
•  FR6.4: A "Clear All" button wipes the canvas and resets everything.
FR7: Component Builder
•  FR7.1: Users can open the component builder from the sidebar.
•  FR7.2: Users can import a component image in SVG, PNG, or JPG format.
•  FR7.3: The system submits the imported image to the Gemini vision API and receives suggested pin coordinates, labels, and signal types.
•  FR7.4: For components with simple geometry, a client-side edge detection algorithm using OpenCV.js provides an alternative pin detection path that does not require an API call.
•  FR7.5: Users can accept, reposition, rename, or delete suggested pins on the imported image.
•  FR7.6: Each pin must be assigned a signal type (power, ground, digital, analogue, PWM, I2C SDA, I2C SCL) before the component can be saved.
•  FR7.7: Saved custom components appear in the sidebar under a Custom category and behave identically to built-in components, including validation and auto-wiring support.
[TABLE 3-1: Summary of Functional Requirements, listing IDs FR1.1 through FR6.4 with descriptions and corresponding modules.]
3.2.2 Non-Functional Requirements

NFR1 (Performance): Validation results should appear within 100 milliseconds of any circuit change. The feedback needs to feel instant to the user.
NFR2 (Usability): A student with no prior experience using simulation tools should be able to use the system without training. Error messages should be written in plain, non-technical language.
NFR3 (Extensibility): Adding a new component should only require writing one metadata entry in the library file. The validation and auto-wire code should not need any changes.
NFR4 (Compatibility): The system should work on the latest stable versions of Chrome, Firefox, and Edge.
NFR5 (Reliability): User work should not be lost. Auto-save via localStorage ensures the project survives page refreshes and accidental tab closures.

3.2.3 Needs Analysis

A needs analysis questionnaire was distributed to 35 undergraduate students from the Kulliyyah of Engineering and KICT, IIUM, comprising mainly Mechatronics Engineering (51%) and Electrical Engineering (20%) students. The majority of respondents were in Year 3 or Year 4 (80%) and had prior experience with Arduino circuit wiring (86%).

Results showed that 60% of respondents rated their satisfaction with error feedback in existing tools at 2 or below on a 5-point Likert scale, with a mean score of 2.31. The most frequently reported method of discovering wiring errors was manual debugging (51%), followed by component damage (23%) and instructor intervention (14%). Only 9% reported simulation failure as their primary means of error detection, indicating that most students wire physical hardware directly without any prior validation step. These findings confirm that existing tools do not provide adequate guidance during the design phase.

The most requested feature was real-time validation with explanatory feedback, which received the highest mean ratings among all features surveyed (Q10 mean: 4.66, Q11 mean: 4.69 out of 5). Auto-wiring received a mean of 4.29, and undo/redo with auto-save received 4.51. When asked to identify the single most important feature, 49% of respondents selected real-time validation with error explanations, followed by auto-wiring at 23%. Overall adoption intent was high, with 88% of respondents indicating they would probably or definitely use the system in their lab courses.

These findings directly informed the prioritisation of the Elera Validation Engine as the primary system contribution. The full questionnaire instrument and raw response data are included in Appendix A.


3.3 LOGICAL DESIGN

3.3.1 System Analysis and Design Diagrams
System Architecture
Elera is built on a modular architecture using Lit 3 Web Components. There are twelve modules, and they communicate through an event-driven pattern. When a user performs an action on the canvas (for example, placing a wire), the Store updates its internal state and fires a "structural-change" event. The Validation Engine listens for that event, re-checks the circuit, and sends the results to the Validation Bar, which re-renders automatically. The user sees updated feedback without any manual refresh.
The table below shows what each module is responsible for:
Module
Role
Circuit App
Root layout component. Sets up the header toolbar, sidebar, canvas, validation bar, and AI assistant panel.
Component Library
The metadata catalog. Stores pin types, current ratings, auto-wire rules, and code templates for every supported component.
Component Sidebar
Renders the categorised, searchable component list. Handles drag events.
Circuit Canvas
SVG-based interactive surface. Handles placement, wiring, selection, pan/zoom, and waypoint editing.
Placed Component
Renders a single component instance on the canvas. Exposes pin targets and reports pin positions to the Store.
Circuit Store
Central state manager. Holds all instances, wires, selections, viewport state, undo/redo history, and handles persistence.
Validation Engine
Runs nine electrical rules against the current circuit state. Returns arrays of errors, warnings, and info messages.
Validation Bar
Displays validation results with colour-coded severity (red, amber, blue) and icons.
Auto-Wire Engine
Assigns Arduino pins to component pins using type-based heuristics. Creates wire entries in the Store.
Wire Path Utility
Calculates orthogonal wire routing paths and generates obstacle-aware waypoints.
AI Assistant
Slide-in panel that accepts natural language input from the student, queries the Gemini API, and returns component suggestions and wiring guidance. Connects to the Store to apply auto-wire actions based on AI output.
Component Builder
Modal interface for creating custom components. Accepts SVG, PNG, or JPG image imports. Submits images to the Gemini vision API for pin detection. Allows users to review, reposition, rename, and assign signal types to detected pins. Saves completed components to the user's personal library in the Store.

[FIGURE 3.2: System Architecture Diagram. A block diagram showing the twelve modules and data flow between them. Component Library feeds metadata to Sidebar, Canvas, Validation Engine, and Auto-Wire Engine. Canvas and Auto-Wire Engine read/write to Store. Store fires structural-change events to Validation Engine. Validation Engine outputs to Validation Bar. AI Assistant reads circuit state from Store and writes auto-wire actions back to Store via the Gemini API. Component Builder submits images to Gemini vision API and saves custom component metadata to Store.]
Use Case Diagram
The primary actor in the system is the Student. The supported use cases include Place Component, Move Component, Delete Component, Wire Components, Edit Wire Waypoints, Search Components, Auto-Wire Component, View Validation Results, Undo/Redo, and Clear Project.
[FIGURE 3.3: Use Case Diagram. UML use case diagram with the Student actor connected to ten use cases.]
Activity Diagram
[FIGURE 3.4: Activity Diagram for the circuit building workflow. Start, then Place Arduino Uno, then Place a Component, then Choose Manual Wire or Auto-Wire. Manual path: click source pin, click destination pin, wire appears. Auto-Wire path: trigger engine, pins assigned, wires generated. Validation runs automatically, then view results. If errors are present, fix wiring and loop back. If no errors, circuit is complete. End.]
Sequence Diagram
[FIGURE 3.5: Sequence Diagram for the validation flow. User interacts with Canvas (places a wire). Canvas calls Store.completeWiring(). Store adds wire and fires 'structural-change' event. Validation Engine receives event, calls validateCircuit(), builds context, and runs nine rules. Results are returned to Validation Bar. Bar renders messages. User reads feedback.]
Package Diagram
[FIGURE 3.6: Package Diagram showing module organisation. Three packages: UI Components (circuit-app, circuit-canvas, placed-component, component-sidebar, validation-bar), Services (validation-engine, auto-wire-engine), and Data (store, component-library, wire-path). UI Components depends on Data. Services depends on Data.]
3.3.2 Data Flow Diagram
Context Diagram (DFD Level 0)
One external entity (the Student) interacts with the Elera system. Inbound data flows include component placement commands, wiring actions, search queries, and auto-wire requests. Outbound flows include the visual circuit display, validation results, and auto-wire confirmations.
[FIGURE 3.7: Context Diagram showing Student entity, Elera process, and labelled data flows.]
DFD Level 1
[FIGURE 3.8: Level 1 DFD with four processes. (1) Manage Components, which takes placement and deletion commands and reads/writes to the Circuit Store data store. (2) Manage Wires, which takes wiring commands and reads/writes wire data. (3) Validate Circuit, which is triggered by structural changes, reads instance and wire data from Store, reads metadata from Component Library, and outputs validation results. (4) Auto-Wire, which takes auto-wire requests, reads metadata and used-pin data, and writes new wires to Store.]
3.3.3 Entity Relationship Diagram (ERD)
The logical data relationships between core entities are represented using an Entity Relationship Diagram. The diagram below shows the relationships between the Component (from the metadata library), the Instance (a placed component on the canvas), and the Wire (a connection between two pin endpoints). Each entity includes its attributes and data types.
[FIGURE 3.9: Entity Relationship Diagram (ERD). Entities: Component (componentId PK: String, name: String, category: String, pinCount: Integer, currentDraw: Float, autoWireRules: JSON), Instance (id PK: String, componentId FK: String, x: Float, y: Float), Wire (id PK: String, fromInstanceId FK: String, fromPinName: String, toInstanceId FK: String, toPinName: String, waypoints: JSON, color: String). Relationships: Component 1..* Instance, Instance 1..* Wire (from), Instance 1..* Wire (to).]

3.4 DATABASE DESIGN

The system uses a PostgreSQL database hosted on Supabase, organised into four tables: Users, Projects, ComponentInstances, and Wires.

The Users table stores account information for each registered student, including a UUID primary key, name, email address, and account creation timestamp.

The Projects table represents a saved circuit design. Each project belongs to one user through a foreign key relationship and stores a title and the timestamp of the last modification.

The ComponentInstances table records each component placed on the canvas for a given project. It stores the component type identifier, which maps to the static component library definition, and the canvas position coordinates.

The Wires table stores each wire connection between two component pins. The source and destination are recorded as foreign keys to ComponentInstances along with the specific pin names. Wire routing waypoints are stored as a JSONB column to accommodate variable-length path arrays without requiring a separate table. The wire colour is stored as a string and is assigned automatically based on signal type during rendering.

The component library definitions are maintained as static metadata in the application layer rather than the database, as they do not change between sessions and are not specific to any user or project.

During FYP1 development, application state is managed client-side using localStorage as a temporary persistence layer to support iterative prototyping without requiring a live server environment. The full Supabase integration is planned for FYP2.

3.5 USER INTERFACE / PROTOTYPE DESIGN

Elera's interface uses a three-panel layout. There is a fixed header bar at the top, a sidebar on the left for browsing components, and a large central canvas where the actual circuit design happens. The validation bar sits as an overlay inside the canvas area.
3.5.1 Header Toolbar
The header shows the Elera branding and subtitle ("Intelligent Arduino Circuit Builder"). On the right side, there are toolbar buttons for undo, redo, wire cleanup, wire reset, anti-overlap toggle, and a clear button. The toolbar is compact and stays out of the way.
[FIGURE 3.10: Header Toolbar screenshot.]
3.5.2 Component Sidebar
A fixed-width panel (240 pixels) on the left side. At the top is a search box that filters components in real time as the user types. Below that, components are grouped into six categories: Boards, Sensors, Input, Output, Actuators, and Passive. Each entry shows an emoji icon, the component name, and a one-line description. To place a component, the user drags it from the sidebar and drops it onto the canvas.
[FIGURE 3.11: Component Sidebar screenshot.]
3.5.3 Circuit Canvas
The canvas is the main workspace. It is an SVG element that supports drag-and-drop placement, click-to-select, pin-to-pin wiring, panning (via middle-click drag or trackpad), zooming (via scroll wheel), grid-snapped movement, and wire waypoint editing.
Components are rendered using @wokwi/elements, which provides realistic SVG visuals of actual Arduino parts. Each component shows interactive pin targets (small circles that highlight on hover) to indicate where wires can connect.
[FIGURE 3.12: Circuit Canvas screenshot with an Arduino Uno and several components wired up.]
3.5.4 Validation Bar
The validation bar is an overlay panel inside the canvas area. It shows a scrollable list of validation messages, each with an icon and colour-coded background (red for errors, amber for warnings, blue for informational notes). It updates automatically whenever the circuit changes, so the user always sees the current state of the validation.
[FIGURE 3.13: Validation Bar screenshot with example messages like "LED has no current-limiting resistor" and "HC-SR04 is missing a ground connection."]
3.5.5 Auto-Wire

When a user triggers auto-wire on a component, the engine creates wires from the component's pins to the appropriate Arduino pins. The wires show up immediately on the canvas, and the validation bar refreshes to reflect the updated circuit.
[FIGURE 3.14: Auto-Wire Result screenshot, showing a servo motor with auto-generated wires going to PWM, VCC, and GND on the Arduino.]
3.5.6 Navigation Flow

[FIGURE 3.15: Navigation Flow diagram. App loads, then Canvas is shown (either empty or restored from the last saved state). The user can place a component, search, wire pins, auto-wire, view validation, undo/redo, or clear the project. All paths lead back to the canvas.]

3.6 SUMMARY
Elera was developed using an Agile Iterative model across seven sprints, starting from the core canvas and building up to the validation and auto-wire engines. Requirements were gathered through a literature review, a needs analysis questionnaire distributed to 35 students, and iterative prototyping. The resulting requirements cover six modules with over 20 functional requirements and five non-functional ones. The system architecture is modular, with eleven components communicating through a centralised store and event-driven updates. The data layer consists of a PostgreSQL database hosted on Supabase with four tables for users, projects, component instances, and wires. The UI prototype is fully functional and matches the three-panel layout described in this chapter. In FYP2, the focus will shift to implementation evaluation, user testing, and full deployment of the Supabase backend.

CHAPTER 4
PROJECT DEVELOPMENT, IMPLEMENTATION AND EVALUATION
4.0 INTRODUCTION
(To be completed in INFO 4402.)
4.1 SYSTEM INTEGRATION
(To be completed in INFO 4402.)
4.2 SYSTEM OUTPUT
4.2.1 Administrator
(To be completed in INFO 4402.)
4.2.2 User(s)
(To be completed in INFO 4402.)
4.3 SYSTEM TESTING
4.3.1 Test Plan
(To be completed in INFO 4402.)
4.3.2 Enhancement
(To be completed in INFO 4402.)

REFERENCES
Autodesk. (2017). *Tinkercad Circuits*. https://www.tinkercad.com

Autodesk. (2021). Autodesk Fusion 360 Electronics Sees Exciting Improvements. https://www.autodesk.com/products/fusion-360/blog/fusion-360-electronics-new-features-november-2021/

Arduino Forum. (2023). BEGINNERS:: Why are Fritzy diagrams so unpopular? https://forum.arduino.cc/t/beginners-why-are-fritzy-diagrams-so-unpopular/1161236

Cahaya-IC. (2024). Utilization of Wokwi Technology as a Modern Electronics Learning Media. *Journal of Education Technology and Literacy Culture*. https://cahaya-ic.com/index.php/JETLC/article/view/1392

Cirkit Designer. (2024). Introducing Cirkit Designer: an AI-powered IDE for building Arduino and circuit projects. *Medium*. https://medium.com/@cirkit-designer/introducing-cirkit-designer-an-ai-powered-ide-for-building-arduino-and-circuit-projects-3fafb519b9bd

Cirkit Designer. (n.d.). *Welcome to Cirkit Designer*. https://learn.cirkitdesigner.com/

Cirkit Studio. (n.d.). *Cirkit Designer, Design, Simulate and Prototype Circuits*. https://www.cirkitstudio.com/

ERIC. (2024). Effect of Tinkercad on Students' Computational Thinking Skills and Perceptions. https://files.eric.ed.gov/fulltext/EJ1290797.pdf

Friends-of-Fritzing. (2009). *Fritzing*. https://fritzing.org

Fritzing. (n.d.). Open-source software for documenting prototypes. https://fritzing.org/media/uploads/publications/FritzingInfoBrochure-lowRes.pdf

IoTDunia. (2024). Top 5 Best IoT Simulation Tools Online (No Hardware Needed). https://iotdunia.com/best-iot-simulation-tools-online/rbsnp/

KSPU. (n.d.). Specialized Applied Software Fritzing and its Use for Education. *Information Technologies in Education*. https://www.ite.kspu.edu/index.php/ite/article/view/767

PMC. (2023). Examination of the usability of Tinkercad application in educational environments. *PLOS ONE*. https://pmc.ncbi.nlm.nih.gov/articles/PMC10034876/

ResearchGate. (2022). Design and Technology in Malaysian Secondary Schools: A Perspective on Challenges. https://www.researchgate.net/publication/357716280

Tinkercad. (n.d.). *Official Guide to Tinkercad Circuits*. https://www.tinkercad.com/blog/official-guide-to-tinkercad-circuits

Wikipedia. (2024). Tinkercad. https://en.wikipedia.org/wiki/Tinkercad

Wokwi. (n.d.). *Wokwi, World's most advanced ESP32 Simulator*. https://wokwi.com/


Wokwi Blog. (n.d.). Brilliant Things People Built with AVR8js Arduino Simulation. https://blog.wokwi.com/cool-things-people-built-with-avr8js/

Xu, J., et al. (2026). CircuitLM: A Multi-Agent LLM-Aided Design Framework for Generating Circuit Schematics from Natural Language Prompts. *arXiv*. https://arxiv.org/abs/2601.04505


APPENDICES
(Gantt chart and additional materials to be added)


--- CHANGES LOG ---

CHANGE 1 — Section 1.5 Constraints
APPLIED. Added constraint #6 (internet connection requirement with localStorage fallback) after constraint #5. Also rewrote constraint #4 from "There is no backend, no database, and no login system, so projects only exist in the browser's local storage" to describe the Supabase backend as the intended design (Change 5 overlap).

CHANGE 2 — Technology Stack
APPLIED. Added a new "Technology Stack" subsection after the sprint list in Section 3.1 Development Approach. This describes Supabase as the backend platform alongside Lit 3 and Vite 6. Also added "Supabase (hosted PostgreSQL, authentication, REST API)" to the development environment bullet list under Section 1.4.3 Specific Platform.

CHANGE 3 — Section 3.4 Database Design
APPLIED. Replaced the entire section. The old content described localStorage as the main persistence and had a "Planned database for FYP2" paragraph. The new content describes the Supabase PostgreSQL schema (Users, Projects, ComponentInstances, Wires) as the authoritative design, with the final sentence noting that localStorage is used during FYP1 prototyping and full Supabase integration is planned for FYP2.

CHANGE 4 — Section 3.2.3 Needs Analysis
APPLIED. Inserted the new subsection after Section 3.2.2 Non-Functional Requirements. Text was kept verbatim from the specification. No style violations found in the provided text.

CHANGE 5 — Throughout the report
APPLIED. All instances identified and rewritten:

1. Section 1.4.1 Scope (line 209): Removed bullet "Backend server, user accounts, or cloud storage" from the out-of-scope list, since the design now includes Supabase.

2. Section 1.4.3 Specific Platform (line 218): Rewrote from "Elera runs entirely in the browser and does not require a server for its core features" to describe Supabase as the backend.

3. Section 1.5 Constraint #4 (line 234): Rewrote from "There is no backend, no database, and no login system" to describe Supabase as the persistence backend.

4. Section 3.3.1, Circuit Store role (line 474): Changed "handles localStorage persistence" to "handles persistence" (storage mechanism described in Section 3.4).

5. Section 3.3.3 ERD intro (line 501): Removed "Although Elera does not use a traditional database in the current FYP1 phase" framing. The ERD now presents the data relationships directly.

6. Section 3.5.6 Navigation Flow figure caption (line 579): Changed "restored from localStorage" to "restored from the last saved state."

7. Section 3.6 Summary (line 582): Rewrote final two sentences. Changed from "All state is managed client-side in memory with localStorage persistence" and "In FYP2, the focus will shift to ... adding server-side persistence" to describe the Supabase schema as the designed data layer, with FYP2 framed as the implementation and deployment phase.

JUDGEMENT CALLS:

- Section 1.4.1 Scope: I removed the "Backend server, user accounts, or cloud storage" bullet from the out-of-scope list entirely, because the design now includes all three via Supabase. Keeping it would contradict the rest of the report.

- Section 1.5 Constraint #5 (AI integration): Left the phrasing "planned for future work" unchanged, as this refers to AI features, not the backend. The instruction to reframe only applied to database/backend references.

- FR6.2 and NFR5 (localStorage references): Left these unchanged. They describe actual implemented behaviour of the working prototype, not forward-looking "planned for FYP2" statements. The FR says projects auto-save to localStorage, which is the current client-side cache behaviour and remains true even with the Supabase design.

- Sprint 6 description (localStorage persistence): Left unchanged for the same reason. It describes what was built during that sprint.
