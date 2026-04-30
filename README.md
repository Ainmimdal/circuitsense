# Elera

Intelligent web-based Arduino circuit design assistant.

## Quickstart

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build for production

```bash
npm run build
npm run preview
```

## Rebuild FYP Report

Make sure the chapter markdown files are up to date in the artifacts directory, then:

```bash
python build_report.py
```

Output: `Elera_FYP1_Report_v4.docx`

## Tech Stack

- **Framework:** Lit 3.2 (Web Components)
- **Build Tool:** Vite 6
- **Component Visuals:** @wokwi/elements 1.9.2
- **Language:** JavaScript (ES Modules)
