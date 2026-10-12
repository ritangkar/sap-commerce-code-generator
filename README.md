# SAP Commerce Code Generator

A browser-only toolkit for SAP Commerce developers with two tools behind one landing page:

| Tool | Route | What it does |
| --- | --- | --- |
| **OCC Controller Generator & Tester** | `#/occ-generator` | Builds Spring MVC OCC controller scaffolding (plus optional DTO, facade, validator) for SAP Commerce **2205** or **2211**, and simulates requests against a local mock. |
| **ImpEx Generator** | `#/impex-generator` | Builds ImpEx scripts from a header/macro/data editor or CSV import, with deterministic serialization and diagnostics. |

> Build cleaner SAP Commerce code. Generate with confidence.

## Local-first architecture

* Static React + TypeScript single-page app (Vite). **No backend, serverless function, database, AI/LLM call, analytics or SAP connection.**
* All generation, parsing, validation and the mock tester are pure TypeScript functions running in your tab (`src/features/*`).
* Nothing you type, paste or import (Java, ImpEx, CSV, configuration) is transmitted anywhere. Files are read with `FileReader` and written with Blob downloads.
* The tools are **read-only toward SAP Commerce**: no execute/import/deploy action exists. ImpEx is produced as text; Java as source files.
* Hash routing (`#/…`) and a relative asset base mean it works on GitHub Pages sub-paths without server rewrites.

## Explicit limitations

* Output is **scaffolding**. Static checks cannot prove code compiles or behaves correctly in your installation; type, attribute, catalog and language existence for ImpEx cannot be verified offline.
* The reference tools at prospect2p.com could **not** be inspected (blocked in the build environment); see `docs/RESEARCH_AND_DESIGN.md`. Behaviour was designed from public SAP Commerce knowledge, not by copying them.
* ImpEx: importing an existing `.impex` script is out of scope. Manual editing and CSV/TSV import are supported.
* OCC: Java import understands a small documented subset (see `docs/OCC_GENERATOR.md`); the mock tester never executes Java.
* Differences between the 2205 and 2211 profiles are limited to what was verified (Swagger v1 vs OpenAPI v3 annotations). javax/jakarta namespace for your patch level is **unverified**.

## Requirements

Node.js 20+ and npm. Chromium for browser tests (a system Chromium is used; set `CHROMIUM_PATH` if needed).

## Development

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check then production build into `dist/` |
| `npm run preview` | Preview the build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:browser` | Playwright tests against `dist/` served under `/sap-commerce-code-generator/` (run `npm run build` first) |
| `npm run check` | typecheck + lint + unit tests + build |

See `docs/TESTING.md` for details.

## Production build and GitHub Pages

The build uses `base: './'` and hash routing, so `dist/` can be hosted at `https://ritangkar.github.io/sap-commerce-code-generator/` (or any sub-path) unchanged. No workflow, setting or deployment has been added or run by this change.

Manual publishing options when you choose to:

1. **Local verification of the sub-path:** `npm run build && node tests/browser/serve-subpath.mjs`, then open `http://localhost:4173/sap-commerce-code-generator/`.
2. **GitHub Actions (recommended):** in the repository, *Settings → Pages → Source: GitHub Actions*, then add a workflow that runs `npm ci && npm run build` and uploads `dist` with `actions/upload-pages-artifact` and `actions/deploy-pages`.
3. **Manual:** publish the contents of `dist/` to a `gh-pages` branch and select it as the Pages source.

## Data storage and privacy

* Saved configurations, drafts, theme and last-used tool are kept in `localStorage` under the `scg:v1:` prefix, in this browser only.
* Configurations are versioned JSON and validated before they replace anything. Corrupted entries are skipped, never deleted automatically.
* Clearing browser data removes them. Use **Configurations → Export JSON** for backups.
* If storage is blocked or full, the app keeps working in memory and tells you.
* No credentials, tokens or cookies are stored.

## Documentation

* `docs/RESEARCH_AND_DESIGN.md` – research, findings, architecture, privacy audit
* `docs/OCC_GENERATOR.md` – OCC tool reference
* `docs/IMPEX_GENERATOR.md` – ImpEx tool reference
* `docs/TESTING.md` – test strategy and results
