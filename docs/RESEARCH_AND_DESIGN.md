# Research and design

## 1. What was inspected

* **Repository:** empty (no commits, files, scripts or dependencies). No existing architecture to preserve, so a new Vite + React + TypeScript app was created; nothing was deleted or overwritten.
* **Reference hub and tools:** `https://prospect2p.com/sap-commerce-tools`, `/occ-controller-generator`, `/impex-generator`. **All requests were blocked** by the build environment's network proxy (HTTP 403 / DNS failure). A web search found no public description or source repository. Consequently **nothing about the reference tools' UI, templates or behaviour is verified**; every statement about them in the task brief remains unverified and no code or text was copied from them.
* **SAP documentation (via web search):** SAP's "Upgrading your Implementation" guide and community posts on Swagger in 2211.

## 2. Technical findings

* **Verified:** 2211 replaced Swagger v1 annotations (`io.swagger.annotations.*`: `@Api`, `@ApiOperation`, `@ApiParam`, `@ApiResponse(s)`, `@ApiModel`) with OpenAPI v3 (`io.swagger.v3.oas.annotations.*`: `@Tag`, `@Operation`, `@Parameter`, `@ApiResponse(s)`, `@Schema`). This is the only version-specific template difference implemented.
* **Unverified / recorded as assumptions** (surfaced as diagnostics and in the exported README): javax.* vs jakarta.* namespaces per patch level; package of `WebserviceValidationException`; packages of catalogue WsDTO types (`ProductWsDTO`, …); whether `{baseSiteId}` needs a `@PathVariable` in a given project.
* ImpEx syntax used (from general SAP knowledge): header `MODE Type;attr[modifiers]`, data rows starting with an empty type column (`;`), `$macro=value`, `[unique=true,lang=en,allownull=true,default=…]`, quoted cells with `""` escaping.
* Project-specific facts (extensions, Spring beans, security config, type system) cannot be known offline.

## 3. Architecture

```
src/app            shell, routes, landing (HashRouter, lazy tool pages)
src/shared         storage, files, zip, diagnostics, highlighter, dialogs, config manager, drafts
src/features/impex model · csv · serializer · validate · templates + React components
src/features/occ   model · javaTypes · generate · validate · mock · importJava · export + React components
tests/unit         Vitest (pure logic, fixtures)
tests/browser      Playwright (served under the Pages sub-path)
```

Decisions:

* **Pure core, thin UI.** Generation, serialization, validation, CSV parsing, mock simulation and Java import are pure functions with unit tests; components only call them.
* **Hash routing + `base: './'`** – refresh/direct links work on GitHub Pages with no rewrites.
* **No editor dependency.** Output is shown with a small built-in tokenizer (java/impex/json); inputs are plain textareas. Total JS ≈ 420 kB (≈ 130 kB gzip), three runtime dependencies (react, react-dom, react-router-dom).
* **Own ZIP writer** (STORE, fixed timestamps → byte-deterministic) instead of a dependency.
* **localStorage** with versioned envelopes (`schema`, `version`, `config`), validated by `parse*Config` before use; drafts also cached in memory so tool switches survive blocked storage.
* No remote fonts: system UI and monospace stacks.

## 4. Design direction

Warm-neutral surfaces, one deep-teal accent, amber/red/blue reserved for diagnostics; compact developer-tool density; code-first split workspaces (editor left, output right, stacked on small screens); light/dark themes via tokens (`src/styles/tokens.css`); motion limited to 140–180 ms fades and honouring `prefers-reduced-motion`. The landing page previews are produced by the real generators.

## 5. Test strategy

Unit tests with approved fixtures for exact output, determinism and diagnostics; Playwright journeys for navigation, both tools, import/export round trips, storage failure, overflow at mobile/tablet widths and external-request tracking. See `docs/TESTING.md`.

## 6. Privacy / security audit

Method: (a) `grep` of `src/` for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval(`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, URLs – only a static repository link in the footer was found; (b) scan of `dist/` for URLs – only XML-namespace strings inside React; (c) Playwright records every request in landing, navigation, generation, CSV import and mock-test flows and asserts none leaves the app's origin (and, for the mock tester, that no request other than already-loaded assets is made); (d) `npm audit --omit=dev` → 0 vulnerabilities. User content is rendered as React text nodes. Not claimed: zero traffic under all circumstances – the browser, hosting and user-clicked footer links are outside the app's own requests.
