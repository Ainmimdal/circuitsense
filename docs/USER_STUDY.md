# Elera beginner user study

Everything needed to run a small usability study of Elera with people who have never built a circuit: the plan, the session script, the tasks, the consent form, the questionnaires and how to score them. Print sections 5 to 8 once per participant.

Check your department's requirements before recruiting. Some faculties need supervisor sign-off or an ethics form for any study with human participants, and participants under 18 need a parent's or guardian's consent.

## 1. What the study answers

| # | Question | Measured by |
|---|---|---|
| Q1 | Can a complete beginner build a working Arduino circuit with Elera's guidance? | Task completion, help given |
| Q2 | How long does it take, and where do they get stuck? | Time on task, errors, observer notes |
| Q3 | Do they find it usable? | System Usability Scale (SUS) |
| Q4 | Do they come away more confident and knowing more? | Confidence before and after, four knowledge questions before and after |

Suggested success targets for the report (adjust with your supervisor): at least 80% complete Task 1 without help, mean SUS of 68 or more (68 is the commonly cited average across systems), and a rise in mean confidence.

## 2. Participants

- **How many:** 8 to 12. Five already expose most usability problems; 8 or more gives steadier averages for the report.
- **Who:** adults with no electronics experience: never used an Arduino or a breadboard, never used Tinkercad Circuits, Wokwi, Fritzing or Cirkit Designer. Programming experience is fine but record it.
- **Screening question:** "Have you ever connected parts on a breadboard or programmed an Arduino?" If yes, thank them and do not include them.
- Do not use friends who have watched you build Elera.

## 3. Setup

- A laptop with a mouse (trackpads make dragging harder and would measure the trackpad, not Elera), Chrome or Edge, screen at 1366x768 or larger.
- Elera open on the deployed site in a fresh browser profile or a private window, so no earlier project or tutorial state carries over. Start every participant from the same empty canvas.
- Sound on, for the buzzer.
- If the compile server is on a free host, open the Code panel a minute before each session so it is awake (see [COMPILE_SERVER.md](COMPILE_SERVER.md)).
- A stopwatch, a printed observer sheet (section 7) and pen. Screen recording is optional and needs the extra consent tick in section 5.
- Run one pilot session with someone outside the study first and fix anything in this script that confused them. Do not count the pilot's data.
- Note the Elera version (the commit shown by `git log -1 --format=%h` at deploy time) in the report. Do not change the app between participants.

One session takes about 35 minutes.

## 4. Session script

Read the quoted parts aloud so every participant hears the same thing.

1. **Welcome (2 min).** "Thank you for helping. I am testing a website that teaches people to build electronic circuits. I am testing the website, not you. There are no wrong answers, and anything that is confusing is the website's fault and exactly what I need to find. You can stop at any time without giving a reason."
2. **Consent (2 min).** Give them section 5. Answer questions. They sign before anything else happens.
3. **Before questionnaire (3 min).** Section 6, part A.
4. **Thinking aloud (1 min).** "While you work, please say what you are looking at, what you are trying to do and what you expect to happen. I will stay quiet so I do not influence you. If you are truly stuck, tell me and I will give a small hint."
5. **Tasks (20 min).** Hand over one task card at a time (section 8). Start the stopwatch when they finish reading the card; stop it when they say they are done or the time limit passes.
6. **After questionnaire (5 min).** Section 6, parts B and C.
7. **Short interview (3 min).** "What was the most confusing moment?" "What did you like most?" "If you could change one thing, what would it be?" Write down their words, not your summary.
8. **Thank them.** Do not explain or defend the design during the session.

### Helping rules

Wait at least 60 seconds of no progress, or until they ask. Then give the lowest level that works and tick it on the observer sheet:

| Level | What you say | Counts as |
|---|---|---|
| 0 | Nothing | Completed without help |
| 1 | "What do you think the panel is asking you to do?" (a prompt, no information) | Completed with a prompt |
| 2 | Point to the area of the screen involved | Completed with help |
| 3 | Tell them the action | Not completed independently |

If they pass the time limit, say "That is fine, let's move to the next one" and set up the next task for them.

## 5. Consent form

**Study:** Usability of Elera, a web-based Arduino circuit builder
**Researcher:** ______________________ (Final Year Project, Kulliyyah of ICT, IIUM)
**Supervisor:** ______________________ **Contact:** ______________________

You are invited to try a website that teaches beginners to build electronic circuits, and to tell us what you think of it.

- **What you will do:** answer a short questionnaire, build a few simple circuits on a laptop while saying your thoughts aloud, then answer a second questionnaire. It takes about 35 minutes.
- **Risks:** none beyond normal computer use. Nothing is real hardware; nothing can break.
- **Voluntary:** taking part is your choice. You may skip any question or stop at any time, without giving a reason and without any consequence. If you stop, tell us whether we may keep what you have given so far.
- **What we record:** your answers, how long each task took, and the researcher's notes. With your separate permission below, the laptop screen and your voice (not your face).
- **Privacy:** your name appears only on this form, which is kept apart from your answers. Your answers are labelled with a number (P1, P2 ...). Results are reported as group totals and anonymous quotes in the project report and presentation. Recordings are kept on the researcher's password-protected device and deleted after the project is graded.
- **Benefit:** no payment. You may learn a little about electronics.

Please tick:

- [ ] I have read and understood the information above and had my questions answered.
- [ ] I am 18 or older and agree to take part.
- [ ] (Optional) I agree to the screen and my voice being recorded.
- [ ] (Optional) I agree to anonymous quotes from me being used in the report.

Name: ______________________ Signature: ______________________ Date: ____________

Researcher's signature: ______________________ Participant number: P____

## 6. Questionnaires

Participant number: P____

### Part A: before the tasks

1. Age group: 18 to 20 / 21 to 24 / 25 to 34 / 35 or older
2. Field of study or work: ______________________
3. Have you written computer programs before? Never / A little / Regularly
4. Have you ever built an electronic circuit? Never / Once or twice at school / More
5. How confident are you that you could build a simple circuit that lights an LED?
   1 (not at all) 2 3 4 5 (very confident)
6. How confident are you that you could write code that makes a light blink?
   1 (not at all) 2 3 4 5 (very confident)

Knowledge check. "I do not know" is a perfectly good answer.

7. An LED has one leg longer than the other. Why does that matter?
   a) It does not matter b) The LED only works one way round c) The long leg is stronger d) I do not know
8. Why is a resistor placed in line with an LED?
   a) To make it brighter b) To limit the current so the LED is not damaged c) To store electricity d) I do not know
9. On a breadboard, which holes are connected to each other inside?
   a) All of them b) None of them c) Holes in the same short column, and along each power rail d) I do not know
10. In Arduino code, what does `digitalWrite(13, HIGH)` do?
    a) Reads a button on pin 13 b) Turns pin 13 on c) Waits 13 seconds d) I do not know

Answers (researcher only): 7 b, 8 b, 9 c, 10 b.

### Part B: after the tasks

Questions 5 to 10 from part A again, in the same words, on a fresh page.

### Part C: System Usability Scale

For each statement circle one number: 1 = strongly disagree, 5 = strongly agree.

| # | Statement | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | I think that I would like to use Elera frequently. | | | | | |
| 2 | I found Elera unnecessarily complex. | | | | | |
| 3 | I thought Elera was easy to use. | | | | | |
| 4 | I think that I would need the support of a technical person to be able to use Elera. | | | | | |
| 5 | I found the various functions in Elera were well integrated. | | | | | |
| 6 | I thought there was too much inconsistency in Elera. | | | | | |
| 7 | I would imagine that most people would learn to use Elera very quickly. | | | | | |
| 8 | I found Elera very cumbersome to use. | | | | | |
| 9 | I felt very confident using Elera. | | | | | |
| 10 | I needed to learn a lot of things before I could get going with Elera. | | | | | |

Two more, same scale:

11. The step-by-step guide told me clearly what to do next. 1 2 3 4 5
12. When I made a mistake, Elera helped me understand how to fix it. 1 2 3 4 5

## 7. Observer sheet

One per participant. Participant: P____ Date: ________ Elera version: ________

| Task | Time (mm:ss) | Finished? (Y / N / timed out) | Highest help level (0 to 3) | Wrong placements | Used Show me / Skip (count) |
|---|---|---|---|---|---|
| 1 Blink lesson | | | | | |
| 2 Run the code | | | | | |
| 3 Change the code | | | | | |
| 4 Push to light lesson | | | | | |
| 5 Free build | | | | | |

A **wrong placement** is a part or wire put down that the guide rejects or that the participant then moves or deletes.

Notes (time, what they did, what they said). Mark each with C (confusion), E (error), D (delight) or S (suggestion):

________________________________________________________________

________________________________________________________________

________________________________________________________________

## 8. Task cards

Cut these apart and hand them over one at a time. They say what to achieve, not which buttons to press; finding the buttons is part of what is being tested.

> **Task 1.** You want to learn how to make a light blink. Find the lesson called **Blink** and follow it until Elera tells you the circuit is finished.

Limit 8 minutes. Done when the lesson's finish screen appears.

> **Task 2.** Your circuit is built. Now make the light on the screen actually blink, without any real hardware.

Limit 3 minutes. Done when the simulation is running and the LED blinks. (They may reach it from the finish screen or the Code button; note which.)

> **Task 3.** Make the light blink faster.

Limit 5 minutes. Done when the changed code runs and the LED visibly blinks faster. If they make a typing mistake, do not help: watching whether the error message gets them unstuck is the point. Note the message they saw.

> **Task 4.** Find the lesson called **Push to light** and build it. Then check that it works by pressing the button in your circuit.

Limit 10 minutes. Done when the simulation runs and the LED lights while the button is held.

> **Task 5.** Without a lesson: start an empty circuit and add an Arduino, a breadboard, a buzzer and whatever else you think it needs. Connect it so the buzzer could be switched on by the Arduino. Use anything Elera offers to help you.

Limit 8 minutes. Done when validation shows no errors and the buzzer is connected to a digital pin and GND. Note whether they wire by hand or use Auto Wire, and how they react to validation messages. This is the hardest task; not finishing is expected for some participants and is useful data.

Tasks 2 to 4 need the in-app code simulation. If the deployed version does not have it, skip tasks 2 and 3 and end task 4 at the lesson's finish screen.

## 9. Scoring and reporting

Enter the results in a spreadsheet with one row per participant.

**Effectiveness (Q1).** For each task: completion rate = participants who finished within the limit at help level 0 or 1, divided by all participants. Report level 2 separately as "completed with help".

**Efficiency (Q2).** Median and range of time on task, counting only those who finished. With this few participants the median is more honest than the mean. Also report mean wrong placements and Show me / Skip use per task.

**Satisfaction (Q3).** SUS score per participant:

1. For odd statements (1, 3, 5, 7, 9): answer minus 1.
2. For even statements (2, 4, 6, 8, 10): 5 minus answer.
3. Add the ten results and multiply by 2.5. The score is between 0 and 100.

In a spreadsheet with the ten answers in B2 to K2: `=((B2-1)+(5-C2)+(D2-1)+(5-E2)+(F2-1)+(5-G2)+(H2-1)+(5-I2)+(J2-1)+(5-K2))*2.5`

Report the mean, the lowest and the highest. Around 68 is average, above about 80 is very good, below about 50 signals serious problems. A SUS score is not a percentage. Report statements 11 and 12 separately as means; they are not part of SUS.

**Learning (Q4).** Mean confidence before and after for each of the two confidence questions, and the number of knowledge questions answered correctly before and after (out of 4). With 8 to 12 people, show the per-participant change in a table or paired dot plot rather than claiming statistical significance. If your supervisor wants a test, use the Wilcoxon signed-rank test on the paired scores.

**Problems found.** Go through the observer notes and group the C and E notes that describe the same problem. For each problem record: what happened, how many participants hit it, and a severity:

| Severity | Meaning |
|---|---|
| 3 | Stopped someone finishing a task |
| 2 | Caused a long delay or needed help |
| 1 | Brief hesitation, recovered alone |

Sort by severity, then by how many people hit it. That table, with what you changed in response, is usually the strongest part of the evaluation chapter.

**Honest limits to state in the report:** a small convenience sample, a simulated circuit rather than real hardware, the researcher is also the developer (participants tend to be kind), and one short session cannot show long-term learning.

## 10. Optional: comparing with Cirkit Designer

Only if time allows. Use a within-subjects design: each participant builds the same Blink circuit in both tools, half starting with Elera and half with Cirkit Designer so that practice does not favour one. Give the Cirkit Designer round a picture of the finished circuit as the goal, since it has no guided lesson. Record time, completion and help level for both, and one SUS form per tool. Sessions grow to about an hour, so recruit fewer tasks (Task 1 only) rather than more time.
