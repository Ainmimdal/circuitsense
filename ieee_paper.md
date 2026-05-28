Elera: An Intelligent Web-Based Circuit Design Assistant with Real-Time Validation for Arduino Education

Mohamad Imad Addin bin Ja'far
Department of Information Systems
Kulliyyah of Information and Communication Technology
International Islamic University Malaysia (IIUM)
Kuala Lumpur, Malaysia
imad.jafar@live.iium.edu.my

Ahmad Fatzilah bin Misman
Department of Information Systems
Kulliyyah of Information and Communication Technology
International Islamic University Malaysia (IIUM)
Kuala Lumpur, Malaysia


Abstract — Arduino has become a standard platform for teaching electronics and embedded systems in universities. However, beginner students continue to make common circuit wiring errors that existing tools do not catch during the design phase. Errors such as connecting LEDs without current-limiting resistors, exceeding the Arduino Uno's 500 mA USB current limit, assigning multiple components to the same I/O pin, and wiring I2C devices to incorrect analogue pins are frequent among novice learners. Popular web-based tools like Tinkercad Circuits, Wokwi, and Fritzing allow students to build circuits virtually, but they only reveal errors after simulation or not at all. None of them validate wiring during design or explain why a mistake occurred. This paper presents Elera, an intelligent web-based Arduino circuit design assistant that provides real-time, rule-based validation and beginner-friendly feedback within the design environment. Elera includes a drag-and-drop circuit canvas, a metadata-driven component library covering 14 common Arduino parts, a validation engine that checks nine categories of electrical errors, and an auto-wiring engine that assigns correct Arduino pins based on each component's electrical requirements. The system was built using Lit 3, Vite 6, and the Wokwi elements library, and it runs entirely in the browser with no installation required. A needs analysis survey of 35 undergraduate students confirmed strong demand for real-time validation with explanatory feedback, with 49% of respondents selecting it as the single most important feature.

Keywords — arduino, circuit design, real-time validation, auto-wiring, web-based learning, electronics education, beginner feedback, rule-based engine


I. INTRODUCTION

Arduino has become one of the most widely used platforms for introducing students to electronics and embedded systems. At the Kulliyyah of Information and Communication Technology (KICT), International Islamic University Malaysia (IIUM), mechatronics students learn Arduino circuit wiring through hands-on laboratory courses such as the Mechatronic Workshop Lab and the System Integration Lab. Both courses require students to assemble circuits on breadboards using components like LEDs, sensors, and servo motors. In practice, students spend a large portion of their lab time troubleshooting wiring problems rather than focusing on programming logic or system design [1], [2].

Web-based simulation tools such as Tinkercad Circuits [3] and Wokwi [4] can help by letting students prototype circuits before using physical hardware. Fritzing [5] provides a desktop-based breadboard layout tool for documentation and PCB design. More recently, Cirkit Designer [6] introduced AI-assisted circuit prototyping using large language models. These tools are useful, but they share one critical limitation: they are passive. The user builds the circuit manually, and errors only become visible when the simulation runs or when the physical circuit fails. None of them actively check for wiring problems during the design process, and none of them explain to the user why something is wrong or how to fix it.

There is a clear gap between tools that simulate circuits and tools that teach students how to wire them correctly. Four specific problems were identified. First, beginners regularly make electrical wiring errors such as missing ground connections, overcurrent, wrong pin types, and floating pins. These errors only surface during simulation or physical testing. Second, when errors appear, current tools do not explain them in educational terms. Third, every existing web-based circuit builder requires fully manual wiring, which is tedious for students who do not yet know the correct pin assignments. Fourth, no single accessible web application combines visual circuit building, real-time rule-based validation, and automated pin assignment in one environment.

This paper presents Elera, a web-based Arduino circuit design assistant that addresses these gaps. Elera provides a drag-and-drop circuit canvas, a validation engine that checks for nine categories of electrical errors during design, an auto-wiring engine that assigns pins based on component metadata, and a component library where each part's pin roles, current draw, and wiring rules are stored as structured data. The system was developed as a Final Year Project at IIUM KICT using an Agile Iterative methodology across seven sprints.

The rest of this paper is organised as follows. Section II reviews existing circuit design tools and identifies their limitations. Section III describes the system design and development methodology.


II. RELATED WORK

A. Pedagogical Challenges in Electronics Education

Learning electronics through hands-on prototyping places a heavy cognitive demand on students. When working with Arduino circuits, learners must simultaneously manage programming syntax, the pin layout of the microcontroller, component datasheets, and the physical routing of wires on a breadboard or virtual canvas. Cognitive load theory suggests that when the total demand on a learner's working memory exceeds its capacity, learning becomes less effective and errors increase [7]. In a circuit design context, this overload often manifests as wiring mistakes that students do not notice until the circuit fails, at which point tracing the root cause is difficult.

Physical breadboarding adds spatial complexity. Students must understand which rows and columns on the breadboard are electrically connected, how power rails function, and how to route wires without creating short circuits. Research on novice electronics learners has found that a significant portion of lab time is spent on low-level troubleshooting rather than on the conceptual learning objectives of the exercise [1], [2]. Virtual circuit simulators reduce the risk of hardware damage and allow rapid experimentation, but studies on virtual labs in electronics education have noted that simulators do not inherently reduce cognitive load [8]. Students still face the same wiring decisions, and most simulators offer no guidance during the design process.

B. Review of Existing Platforms

Four platforms were reviewed as they represent the most commonly used options in electronics education: Tinkercad Circuits, Fritzing, Wokwi, and Cirkit Designer.

Tinkercad Circuits is a browser-based circuit editor built by Autodesk, aimed at beginners in primary, secondary, and introductory university-level programmes [3]. It provides a drag-and-drop interface with a large selection of simulated components, including the Arduino Uno and Micro:bit. It supports dual programming through visual block-based coding and direct C++ editing [9]. Research has shown that Tinkercad's visual environment helps with student motivation in secondary school settings [10]. However, the platform has usability issues. There is no quick reset function, and the code blocks panel covers the circuit view when open [11]. More critically, there is no proactive error checking during the design phase.

Fritzing started in 2007 at the University of Applied Sciences Potsdam as an open-source tool for documenting electronic prototypes [5]. It offers three views: a photorealistic Breadboard View, a Schematics View, and a PCB View that generates Gerber manufacturing files. Fritzing is widely used in academic settings, but it cannot simulate circuits at all. It does not run code, does not show voltage or current, and has no validation of any kind [12]. Users must build and test their circuits elsewhere.

Wokwi was introduced around 2019 and provides advanced simulation capabilities [4]. Its engine, AVR8js, compiles and runs Arduino code directly in the browser. Board support extends to ESP32, STM32, and Raspberry Pi Pico. The platform provides tools such as a virtual logic analyser and GDB debugging, and it integrates with VS Code and CI/CD pipelines. A study at Jambi University tested Wokwi in basic physics and electronics courses and found a positive correlation between simulator use and skill improvement [13]. However, Wokwi is code-centric, assumes prior programming knowledge, and places several advanced features behind a paid subscription [9].

Cirkit Designer was created by Austin Small, a former Google engineer, to address the gap between wiring guidance and code generation [6]. The platform combines a component library of over 30,000 parts with an AI assistant powered by large language models. A user can describe a project in plain English and receive component suggestions, wiring instructions, and Arduino code. The AI assistant, however, relies on probabilistic language models and can produce incorrect recommendations [6]. The AI also only provides text-based wiring instructions. It does not draw wires on the canvas, so the manual effort remains.

C. Comparison and Identified Gaps

Table I summarises the capabilities of the four reviewed platforms against the features that Elera provides. The comparison reveals four gaps that are consistent across all existing tools.

TABLE I
COMPARISON OF EXISTING CIRCUIT DESIGN PLATFORMS

| Feature | Tinkercad | Fritzing | Wokwi | Cirkit Designer | Elera |
|---|---|---|---|---|---|
| Primary Focus | Beginner education | Documentation, PCB | Advanced IoT simulation | AI-assisted prototyping | Validation-driven education |
| Platform | Web-based | Desktop | Web-based | Web-based | Web-based |
| Board Support | Arduino, Micro:bit | Visual only | Arduino, ESP32, STM32, Pi Pico | Arduino, ESP32, RPi | Arduino Uno |
| Coding Interface | Block-based + C++ | None | C++, MicroPython | C++ (VS Code) | None (design-focused) |
| Real-Time Simulation | Basic | No | Advanced | Yes | No |
| Real-Time Validation | No | No | No | No (AI text only) | Yes (9 rules) |
| Auto-Wiring | No | No | No | No (text only) | Yes (metadata-driven) |
| Pedagogical Feedback | No | No | No | Partial (AI) | Yes (rule-based) |

First, real-time validation is absent everywhere. All four tools either show errors only after simulation or do not validate at all. Second, automated pin-to-pin wiring does not exist. Every tool requires manual wire routing. Third, educational feedback is either missing or limited to generic error messages. Fourth, components are treated as static graphics without structured metadata about their electrical properties. Without metadata, automatic validation and wiring are not feasible.

Elera was designed to fill these gaps by combining a visual circuit builder with a deterministic validation engine, an auto-wiring engine that assigns pins based on component type, and a metadata-driven component library.


III. SYSTEM DESIGN AND METHODOLOGY

A. Development Approach

Elera was developed using an Agile Iterative approach. The project was divided into short development cycles called sprints. Each sprint focused on a specific feature and produced a working piece of the system. After each sprint, the output was tested and any issues found were fed into the next cycle. This approach was selected because the requirements evolved as the developer worked through each feature. An iterative model accommodates that kind of gradual refinement.

The project was organised into seven sprints: (1) interactive canvas with component placement, grid snapping, and pan/zoom, (2) component library with metadata and the sidebar interface, (3) manual pin-to-pin wiring with orthogonal routing, (4) validation engine covering nine rules and the validation bar UI, (5) auto-wire engine with smart pin assignment, (6) state management upgrades including undo/redo, localStorage persistence, and anti-overlap collision detection, and (7) integration testing, UI polish, and wire cleanup features.

B. Technology Stack

The front-end application was built using Lit 3 as the component framework and Vite 6 as the build tool. Component visuals were rendered using the @wokwi/elements library, which provides SVG representations of real Arduino parts. Supabase was selected as the backend platform, providing a hosted PostgreSQL database, built-in user authentication, and a REST API layer. During FYP1 development, application state was managed client-side using localStorage as a temporary persistence layer. The full Supabase integration is planned for the next phase.

C. Requirements Gathering

Requirements were gathered through three methods. First, a literature review of existing circuit design tools identified which features are standard and which are absent. Second, a needs analysis questionnaire was distributed to 35 undergraduate students from KICT and the Kulliyyah of Engineering at IIUM. Third, iterative prototyping of the UI and validation logic provided practical feedback on which rules worked correctly and which needed refinement.

The survey respondents comprised mainly Mechatronics Engineering (51%) and Electrical Engineering (20%) students, with 80% in Year 3 or Year 4 and 86% having prior Arduino experience. Results showed that 60% of respondents rated their satisfaction with error feedback in existing tools at 2 or below on a 5-point Likert scale (mean: 2.31). The most frequently reported method of discovering wiring errors was manual debugging (51%), followed by component damage (23%) and instructor intervention (14%). Only 9% reported simulation failure as their primary means of error detection. Real-time validation with explanatory feedback received the highest mean ratings among all features surveyed (Q10 mean: 4.66, Q11 mean: 4.69 out of 5). When asked to select the single most important feature, 49% chose real-time validation with error explanations. Overall adoption intent was high, with 88% of respondents indicating they would probably or definitely use the system.

D. System Architecture

Elera was built on a modular architecture using Lit 3 Web Components. The system comprises twelve modules that communicate through an event-driven pattern. When a user performs an action on the canvas, such as placing a wire, the Circuit Store updates its internal state and fires a "structural-change" event. The Validation Engine listens for that event, re-checks the circuit, and sends the results to the Validation Bar, which re-renders automatically. The user sees updated feedback without any manual refresh.

The twelve modules and their roles are as follows. The Circuit App serves as the root layout component, setting up the header toolbar, sidebar, canvas, validation bar, and AI assistant panel. The Component Library stores the metadata catalog, including pin types, current ratings, auto-wire rules, and code templates for every supported component. The Component Sidebar renders the categorised, searchable component list and handles drag events. The Circuit Canvas provides the SVG-based interactive surface for placement, wiring, selection, pan/zoom, and waypoint editing. The Placed Component module renders each component instance on the canvas, exposes pin targets, and reports pin positions to the Store. The Circuit Store acts as the central state manager, holding all instances, wires, selections, viewport state, and undo/redo history. The Validation Engine runs nine electrical rules against the current circuit state and returns arrays of errors, warnings, and info messages. The Validation Bar displays results with colour-coded severity indicators. The Auto-Wire Engine assigns Arduino pins to component pins using type-based heuristics and creates wire entries in the Store. The Wire Path Utility calculates orthogonal wire routing paths and generates obstacle-aware waypoints. The AI Assistant accepts natural language input from the student, queries the Gemini API, and returns component suggestions and wiring guidance. The Component Builder provides a modal interface for creating custom components from imported images, using the Gemini vision API for pin detection.

E. Validation Engine

The Elera Validation Engine (EVE) implements nine rule categories that check for common electrical errors. Each rule was derived from the most frequent mistakes observed among beginner Arduino users:

1) Missing Board Detection: checks whether an Arduino Uno is present on the canvas. Without a board, no other validation is meaningful.

2) LED Without Resistor: flags any LED that is wired to a power source or signal pin without a current-limiting resistor in the circuit path. The feedback explains that the LED will draw excessive current without a resistor and may burn out.

3) Total Current Overload: sums the current draw of all connected components using the metadata values and checks whether the total exceeds the Arduino Uno's 500 mA USB power limit.

4) Duplicate Pin Assignment: detects when two or more signal components are wired to the same Arduino I/O pin.

5) Servo on Serial Pins: warns when a servo motor is connected to pins 0 or 1, which are reserved for serial communication.

6) Missing Power or Ground: checks whether each component that requires VCC or GND has those connections wired.

7) Incorrect I2C Pin Wiring: verifies that I2C devices such as the LCD 1602 are connected to pin A4 (SDA) and A5 (SCL) on the Arduino Uno.

8) Unconnected Components: flags any component placed on the canvas that has no wires at all.

9) Floating Signal Pins: identifies partially wired components where signal pins are left unconnected.

Each validation result includes a severity level (error, warning, or info), a plain-language message explaining the issue and the fix, and an icon. Validation runs automatically every time a structural change occurs on the canvas.

F. Auto-Wire Engine

The auto-wire engine assigns Arduino pins to a component's pins based on the electrical requirements stored in the component metadata. The assignment follows type-based rules: PWM-capable pins for servo motors, analogue pins for potentiometers, I2C pins (A4 and A5) for LCD modules, and general digital pins for most other components. The engine tracks which Arduino pins are already in use and avoids conflicts. When multiple pins of the same type are available, the engine selects the one that is physically closest to the component to keep wire paths short.

G. Metadata-Driven Component Library

The component library uses a metadata-driven architecture. Each of the 14 supported components is defined as a structured data entry containing its pin names, pin signal types (power, ground, digital, analogue, PWM, I2C SDA, I2C SCL), current draw in milliamps, auto-wire rules, and a code template. This design means that adding a new component requires writing one metadata entry in the library file. The validation engine and auto-wire engine pick up the new component automatically without any code changes.

The supported components are: Arduino Uno, LED, RGB LED, resistor, push button, potentiometer, servo motor, buzzer, LCD 1602 (I2C), HC-SR04 ultrasonic sensor, DHT22 temperature sensor, PIR motion sensor, NeoPixel LED, IR receiver, and slide switch.

H. User Interface Design

The interface uses a three-panel layout. A fixed header bar at the top shows the Elera branding and toolbar buttons for undo, redo, wire cleanup, wire reset, anti-overlap toggle, and clear. A sidebar on the left (240 pixels wide) provides a searchable, categorised component list grouped into six categories: Boards, Sensors, Input, Output, Actuators, and Passive. The central canvas is an SVG workspace supporting drag-and-drop placement, click-to-select, pin-to-pin wiring, panning, zooming, grid-snapped movement, and wire waypoint editing. Components are rendered using the @wokwi/elements library, which provides realistic SVG visuals. The validation bar is an overlay panel inside the canvas area that displays a scrollable list of colour-coded validation messages (red for errors, amber for warnings, blue for informational notes).


REFERENCES

[1] D. Nair, "Online Laboratory Course using Low Tech Supplies to Introduce Digital Logic Design Concepts," in *2021 International e-Engineering Education Services Conference (e-Engineering)*, 2021, pp. 121–126.

[2] D. J. Merrill and S. Swanson, "Reducing Instructor Workload in an Introductory Robotics Course via Computational Design," in *Proceedings of the 50th ACM Technical Symposium on Computer Science Education*, 2019.

[3] Autodesk, "Tinkercad Circuits," Tinkercad. [Online]. Available: https://www.tinkercad.com. [Accessed: May 2025].

[4] Wokwi Ltd., "Wokwi — World's Most Advanced ESP32 Simulator," Wokwi. [Online]. Available: https://wokwi.com/. [Accessed: May 2025].

[5] Friends-of-Fritzing, "Fritzing," Fritzing. [Online]. Available: https://fritzing.org. [Accessed: May 2025].

[6] Cirkit Designer, "Introducing Cirkit Designer: An AI-Powered IDE for Building Arduino and Circuit Projects," Medium, 2024. [Online]. Available: https://medium.com/@cirkit-designer/introducing-cirkit-designer-an-ai-powered-ide-for-building-arduino-and-circuit-projects-3fafb519b9bd. [Accessed: May 2025].

[7] G. Cooper, "Cognitive load theory as an aid for instructional design," *Australasian Journal of Educational Technology*, vol. 6, 1990.

[8] K. Altmeyer, R. Brünken, J. Kuhn, and S. Malone, "The Role of Cognitive Learner Prerequisites for Cognitive Load and Learning Outcomes in AR-Supported Lab Work," *Education Sciences*, vol. 14, p. 1161, 2024.

[9] IoTDunia, "Top 5 Best IoT Simulation Tools Online (No Hardware Needed)," IoTDunia, 2024. [Online]. Available: https://iotdunia.com/best-iot-simulation-tools-online/rbsnp/. [Accessed: May 2025].

[10] ERIC, "Effect of Tinkercad on Students' Computational Thinking Skills and Perceptions," 2024. [Online]. Available: https://files.eric.ed.gov/fulltext/EJ1290797.pdf. [Accessed: May 2025].

[11] PMC, "Examination of the Usability of Tinkercad Application in Educational Environments," PLOS ONE, 2023. [Online]. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC10034876/. [Accessed: May 2025].

[12] KSPU, "Specialized Applied Software Fritzing and Its Use for Education," Information Technologies in Education. [Online]. Available: https://www.ite.kspu.edu/index.php/ite/article/view/767. [Accessed: May 2025].

[13] Cahaya-IC, "Utilization of Wokwi Technology as a Modern Electronics Learning Media," Journal of Education Technology and Literacy Culture, 2024. [Online]. Available: https://cahaya-ic.com/index.php/JETLC/article/view/1392. [Accessed: May 2025].


--- ISSUES LOG ---

1. AUTHOR EMAIL: The email address for Mohamad Imad Addin bin Ja'far is a placeholder. The supervisor's email was omitted entirely. Both need to be confirmed.

2. FIGURES: The original report references Figures 2.1 through 3.15. These are not included in the IEEE paper as the source material only contained figure captions and descriptions, not the actual images. You will need to select which figures to include and add them with proper "Fig. 1" etc. captions.

3. TABLE I: The comparison table was adapted from the original report's Table 2-1 with an added column for Elera.

4. Seven references from the original conversion ([10]–[16] in the previous version) were removed because they were never cited in the paper body. These were: Wikipedia Tinkercad article, Autodesk Fusion 360 blog post, Tinkercad official guide, Fritzing brochure, Arduino Forum thread, Cirkit Studio website, and Wokwi Blog post.
