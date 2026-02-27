# TDT4242 – Exercise 2
## Repository layout

### Task 2.1 – Prompting strategy
- Folder: [2_1/](2_1/)
- Written deliverable:
  - Markdown: [2_1/2_1_introduction.md](2_1/2_1_introduction.md)
  - PDF export: [2_1/2_1_introduction.pdf](2_1/2_1_introduction.pdf)

This contains the selected requirement slice (6 functional + 2 non-functional), the dependency order, the prompt strategy document (≤ 500 words), and the example prompt used to drive code generation.

### Task 2.2 – AI-based code generation
- Folder: [2_2/](2_2/)
- Runnable full-stack prototype:
  - Backend: [2_2/server.js](2_2/server.js)
  - Frontend (served by Express): [2_2/public/](2_2/public/)
  - Local persistence: [2_2/data/logs.json](2_2/data/logs.json)
- Documentation: [2_2/README.md](2_2/README.md)
- Execution screenshots: [2_2/screenshots/](2_2/screenshots/)

This folder is kept as the **initial Task 2.2 delivery** (the “first working version”), along with its documentation and screenshots.

### Task 2.3 – Code review + improvements
- Folder: [2_3/](2_3/)
- Written deliverable:
  - Markdown: [2_3/2_3_review.md](2_3/2_3_review.md)
  - PDF export: [2_3/2_3_review.pdf](2_3/2_3_review.pdf)
- Revised implementation (post-review refactor): [2_3/2_2_REVISED/](2_3/2_2_REVISED/)
  - Documentation: [2_3/2_2_REVISED/README.md](2_3/2_2_REVISED/README.md)

Task 2.3 is separated so it’s clear what was reviewed (the original in [2_2/](2_2/)) versus what was changed as a result (the revised version in [2_3/2_2_REVISED/](2_3/2_2_REVISED/)).

### Sources / references
- Folder: [sources/](sources/)

This is supporting material (e.g., files from Exercise 1 and background references) and is not required to run Task 2.2.

## How to run the prototype locally

You can run either the original or the revised version.

### Option A: Run the original Task 2.2 version
```bash
cd 2_2
npm install
npm start
```
Open: http://127.0.0.1:4000/

### Option B: Run the revised Task 2.3 version
```bash
cd 2_3/2_2_REVISED
npm install
npm start
```
Open: http://127.0.0.1:4000/

## Notes (scope and assumptions)

- The prototype is designed to run **locally** and does not call external AI services.
- Logs are stored in a local JSON file (`data/logs.json`) to satisfy “survive restart” with minimal setup.
- The “compliance” signal is implemented as a small rules-based checker, so it’s explainable and easy to review.

## What to read first

- If you want the narrative of the whole exercise: start with [2_1/2_1_introduction.md](2_1/2_1_introduction.md), then [2_2/README.md](2_2/README.md), then [2_3/2_3_review.md](2_3/2_3_review.md).
- If you only want the latest code: go straight to [2_3/2_2_REVISED/](2_3/2_2_REVISED/).
