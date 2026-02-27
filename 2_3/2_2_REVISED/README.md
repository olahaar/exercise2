# Task 2.2 – Full-stack prototype
This folder contains a minimal React + Express implementation of the requirement slice from Task 2.1. The app runs locally, stores prompts in a JSON file, computes compliance, and lets the user add reflections with a visually distinct UI.

## Quick start
- Prerequisites: Node 18+.
- Install dependencies: `npm install` inside `exercise2/2_3/2_2_REVISED`.
- Run locally: `npm start`, then open `http://127.0.0.1:4000/`.
- Default CORS origin is `http://localhost:5173`. If you keep the single-bundle setup served by Express, no change is needed.

## Files
- [server.js](server.js): Express server, API routes, compliance rules, JSON persistence, security middleware, and static hosting for the React UI.
- [package.json](package.json): Dependencies (express, cors, helmet) and scripts.
- [data/logs.json](data/logs.json): Local persistence for logged prompts.
- [public/index.html](public/index.html): HTML shell that loads the UI.
- [public/styles.css](public/styles.css): Styles for the UI.
- [public/api.js](public/api.js): Shared request/error handling wrapper for all API calls.
- [public/hooks.jsx](public/hooks.jsx): Data orchestration hook (`useDashboardData`) for frontend state and mutations.
- [public/components.jsx](public/components.jsx): UI components (`PromptForm`, `LogList`, `DeclarationPanel`, etc.).
- [public/app.jsx](public/app.jsx): Thin root composition layer that wires hooks and components.

## Revisions from Task 2.3
- Centralized backend rules in `server.js` (`RULES` for limits and banned terms) to remove scattered magic numbers.
- Unified validation logic across create/update paths with shared `validateLogInput(...)`.
- Added serialized write queue (`serializeWrite(...)`) around JSON persistence to reduce concurrent write overwrite risk.
- Changed timestamps to be server-generated only for stronger audit consistency.
- Split frontend responsibilities into API, hook, and component modules while preserving the original UX.
- Kept CSP/runtime-CDN setup as a documented prototype tradeoff (deferred hardening).

## API surface
- `GET /api/guidelines` → `{ guidelines: string[] }`.
- `GET /api/logs` → `{ logs: LogEntry[] }`.
- `POST /api/logs` with `{ tool, prompt, reflection? }` → `{ entry }` (computes compliance and stores).
- `PATCH /api/logs/:id/reflection` with `{ reflection }` → `{ entry }`.
- `DELETE /api/logs/:id` → `204 No Content`.
- `GET /api/declaration` → `{ total_logs, compliant_logs, needs_review_logs, guidelines, declaration_text }`.

`LogEntry` shape:
```
{
  id: string,
  tool: string,
  prompt: string,
  reflection: string,
  timestamp: ISO string,
  compliance: { status: 'compliant' | 'needs_review', reasons: string[] }
}
```

## Requirement coverage
- R1 Log AI use: `POST /api/logs` saves tool, prompt, reflection, timestamp to [data/logs.json](data/logs.json) and shows in the UI list.
- R2 View NTNU guidelines: [public/index.html](public/index.html) pulls `GET /api/guidelines` and lists them on the front page.
- R4 Show compliance status: Each card renders a status pill; the backend computes it in [server.js](server.js).
- R6 Explain why not compliant: Reasons appear under each prompt when the backend flags it.
- R7 Add reflection: Reflection editor per log uses `PATCH /api/logs/:id/reflection`; visually distinct block satisfies R28.
- R8 Auto declaration: `GET /api/declaration` aggregates logs and renders a declaration string.
- R26 Security: Helmet, tight JSON limits, localhost binding, restricted CORS origin, and minimal error detail in [server.js](server.js).
- R28 Visual distinction: Reflection area uses a separate card tone and dashed border in [public/styles.css](public/styles.css) (the `.reflection` block rendered by [public/components.jsx](public/components.jsx)).

## How to test
1. Start the server: `npm start`.
2. Add two sample logs (one compliant, one with a banned term like “plagiarize”).
3. Add a reflection; the card should highlight the reflection box.
4. Click “Refresh declaration”; capture a screenshot of the dashboard showing guidelines, logs, and declaration.

## What was AI-generated vs. manual
- Generated with GitHub Copilot (GPT-5.3 Codex) following the prompt strategy from Task 2.1. All files were produced via AI with manual inspection and small edits to fix runtime issues like ESM/CommonJS import mismatch, tighten validation, and adjust the UI.
- No external code copied; everything in this folder was produced in-session.

## Repository link
