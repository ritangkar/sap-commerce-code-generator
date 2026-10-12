# Acceptance audit

Baseline: the original acceptance matrix (36 OCC, 39 ImpEx, 20 shared criteria, IDs O/I/S) plus context-specific checks from the continuation brief (IDs P). Status values: PASS (implemented and backed by test evidence), PARTIAL, FAIL, NOT VERIFIED, NOT APPLICABLE. "Evidence" names the test or command that was actually run.

## Totals

| Status | Count |
|---|---|
| PASS | 101 |
| PARTIAL | 7 |
| FAIL | 0 |
| NOT VERIFIED | 4 |
| NOT APPLICABLE | 1 |
| **Total** | **113** |

## Audit-driven fixes (this round)

Found by the audit and fixed with regression tests:

- Axe found **aria-hidden focusable content** on the landing previews, **low-contrast code line numbers/comments** (light theme) and **scrollable lists not keyboard-reachable** → fixed (`CodeView decorative`, token colours, `tabIndex` on lists); covered by `audit.spec` axe tests.
- Short-form `@GetMapping`… mappings were not generated → added mapping-style option (generation, validation, import detection, persistence with legacy-config default).
- `ResponseEntity<…>` produced a spurious missing-import warning → added to the type catalogue.
- Path joining was a naive concatenation → normalised (`normSegment`/`fullPath`); a method path without a leading slash is now a warning with the slash added.
- Missing explicit statement that a controller alone is not a working endpoint → Information diagnostic.
- "Last selected tool" was stored but unused → landing now offers to continue.
- Generated Java had only been eyeballed → compiled with `javac` against stubs (6 variants).
- Network claims rested on request logging only → added runtime wrappers for fetch/XHR/WebSocket/sendBeacon.

## Matrix

| ID | Area | Acceptance criterion | Status | Evidence | Gap / corrective action |
|---|---|---|---|---|---|
| O1 | OCC | Application loads with no runtime errors | PASS | audit.spec: console/pageerror listener across OCC+ImpEx flows = none; smoke test | — |
| O2 | OCC | User can select Commerce 2205 | PASS | occ.spec "profiles change generated annotations" | — |
| O3 | OCC | User can select Commerce 2211 | PASS | occ.spec (same); default profile 2211 | — |
| O4 | OCC | Profile-specific templates and diagnostics | PASS | occ.test "profiles" (v1 vs v3 annotations, ann.profile warnings); fixtures occ-2205/occ-2211 | Only the Swagger v1→v3 difference is implemented (verified via SAP upgrade guide). Other differences are deliberately NOT invented; javax/jakarta unverified. |
| O5 | OCC | Valid package and class names accepted | PASS | occ.test "accepts valid and rejects invalid identifiers" | — |
| O6 | OCC | Invalid identifiers rejected | PASS | occ.test (pkg.invalid, class.invalid, keywords); occ.spec "invalid identifiers ... block ZIP" | — |
| O7 | OCC | All five HTTP methods generate correct mappings | PASS | occ.test it.each(5 methods); occ.spec "all HTTP methods"; javac.test compiles both mapping styles | — |
| O8 | OCC | Base and method paths combine correctly | PASS | audit.test "OCC path normalisation" | — |
| O9 | OCC | Path-variable placeholders validated (both directions) | PASS | occ.test "checks path variables both ways"; occ.spec "path variable consistency" | — |
| O10 | OCC | Query parameters generate correct bindings | PASS | occ.test "emits path/query/header/body bindings" | — |
| O11 | OCC | Header parameters generate correct bindings | PASS | same test | — |
| O12 | OCC | Request bodies generate correct bindings | PASS | same test; javac.test kitchen sink | — |
| O13 | OCC | Default values validated against types | PASS | occ.test "validates defaults against types" (ranges, boolean, numbers, ISO dates); occ.spec UI check | — |
| O14 | OCC | Duplicate external parameter names diagnosed | PASS | occ.test "duplicate parameters, methods, mappings" | — |
| O15 | OCC | DTO generation produces the expected class | PASS | fixtures ProductNoteWsDTO.java (both profiles); javac.test | — |
| O16 | OCC | Optional facade generation | PASS | occ.test "optional files"; fixtures; javac.test | — |
| O17 | OCC | Optional validator generation | PASS | occ.test "DTO and validator content"; javac.test | — |
| O18 | OCC | Documentation and response metadata as configured | PASS | occ.test "documentation and response metadata appear"; fixtures | — |
| O19 | OCC | Unsupported annotations/syntax diagnosed | PASS | occ.test ann.syntax/ann.conflict/ann.profile/ann.import; importJava findings (import.method.ann, import.param.ann) | Builder cannot express arbitrary method-level annotations by design; the import reports them instead. |
| O20 | OCC | Repeated generation identical | PASS | occ.test "is deterministic"; ZIP bytes identical across runs | — |
| O21 | OCC | Java import handles supported syntax | PASS | occ.test "java import" (fixtures/ImportMe.java); occ.spec import flow; audit.test shortcut detection | Scanner-based subset only; documented in docs/OCC_GENERATOR.md. |
| O22 | OCC | Unsupported/malformed Java does not silently disappear | PASS | occ.test "reports unsupported constructs" (body, fields, non-endpoint methods, extra annotations, framework params); "fails clearly on malformed input"; occ.spec malformed import | — |
| O23 | OCC | Existing source intact until explicit regeneration | PASS | occ.spec "original preserved until applied" (builder unchanged until Apply+confirm; source kept on Generated tab) | — |
| O24 | OCC | Mock GET behaves as configured | PASS | occ.test mock; occ.spec mock tester (200, path vars, template substitution) | — |
| O25 | OCC | Invalid paths and missing parameters give meaningful results | PASS | occ.test 404/405/missing query/header/type errors; occ.spec 404/405 | — |
| O26 | OCC | Configured status codes and headers displayed | PASS | occ.spec (418 + X-Mock); occ.test | — |
| O27 | OCC | Valid JSON bodies processed | PASS | occ.test "JSON bodies"; occ.spec 201 | — |
| O28 | OCC | Malformed JSON reported clearly | PASS | occ.test; occ.spec "Malformed JSON" | — |
| O29 | OCC | Repeated mock tests deterministic (except simulated duration) | PASS | occ.test "is deterministic, reports configured delay" (duration = configured delay, labelled simulated) | — |
| O30 | OCC | Network inspection: no requests from mock tester | PASS | audit.spec: fetch/XHR/WebSocket/sendBeacon wrappers recorded 0 calls; request log has no off-origin URLs; occ.spec asserts no non-asset requests during mock runs | Chromium only; proves behaviour of the tested flows, not every possible path. |
| O31 | OCC | Save and load restore correct configuration | PASS | occ.spec "save/load, JSON invalid import, reset" | — |
| O32 | OCC | Individual file export works | PASS | occ.spec "ZIP and single-file downloads" (.java content checked) | — |
| O33 | OCC | ZIP export has expected files and README | PASS | occ.spec (names, README text, local-header signature); independent `unzip -t` and Python zipfile.testzip() on a produced ZIP: OK, 6 entries | ZIP uses STORE (no compression) by design. |
| O34 | OCC | JSON export/import round-trips | PASS | occ.test "config JSON round-trips"; occ.spec export; audit.test legacy config (no mappingStyle) loads | — |
| O35 | OCC | Invalid JSON does not overwrite current state | PASS | occ.spec; occ.test rejection cases | — |
| O36 | OCC | Reset requires confirmation | PASS | occ.spec (cancel keeps state, confirm resets) | — |
| I1 | ImpEx | Initial workspace loads correctly | PASS | impex.spec "initial workspace" | — |
| I2 | ImpEx | All four import modes work | PASS | impex.test it.each(4); impex.spec | — |
| I3 | ImpEx | Standard and custom types can be entered | PASS | impex.spec "type, modifiers"; impex.test type.unverified/type.example | — |
| I4 | ImpEx | Supported modifiers serialize correctly | PASS | impex.test; impex.spec; fixture impex-edge (unique, lang, allownull, default) | — |
| I5 | ImpEx | Multiple modifiers retain intended order | PASS | impex.test canonical order + raw verbatim; impex.spec | Structured modifiers always use the fixed order unique,lang,allownull,default; only raw modifiers keep user order. |
| I6 | ImpEx | Raw advanced expressions preserved | PASS | impex.test; fixtures (collection-delimiter=\|,mode=append) | — |
| I7 | ImpEx | Reference expressions remain intact | PASS | impex.test; impex-edge fixture (nested catalogVersion(catalog(id),version)) | — |
| I8 | ImpEx | Macro definitions retain order | PASS | impex.test; impex.spec "macro and column reorder/delete" | — |
| I9 | ImpEx | Duplicate macros diagnosed | PASS | impex.test; impex.spec | — |
| I10 | ImpEx | Undefined references diagnosed | PASS | impex.test (macro.undefined, cell-level info); impex.spec | Detection is regex-based on `$name`; a literal `$` in a cell yields an Information note. |
| I11 | ImpEx | Rows add/edit/duplicate/delete/reorder | PASS | impex.test editing ops; impex.spec "data rows" | — |
| I12 | ImpEx | Adding/removing columns predictable | PASS | impex.test; impex.spec (confirm dialog states discarded cell count) | — |
| I13 | ImpEx | Existing values preserved when mapping unambiguous | PASS | impex.test (add/move column permutes cells); impex.spec | — |
| I14 | ImpEx | Empty cells preserved intentionally | PASS | impex.test; fixture (";EX-002;;;;"); impex.spec | Empty cells are Information-level, not Warning: a deliberate choice to avoid noise (see P6). |
| I15 | ImpEx | Unicode and special characters | PASS | impex.test; fixture impex-edge; impex.spec CSV with Über 東京 | — |
| I16 | ImpEx | Quoted fields and delimiters | PASS | impex.test escapeCell; impex.spec; audit.test CSV↔serializer round trip | — |
| I17 | ImpEx | Newline-containing fields | PASS | impex.test (line numbers); fixture impex-edge; impex.spec Shift+Enter; audit.test round trip | — |
| I18 | ImpEx | Row-length mismatches reported | PASS | impex.test row.length; impex.spec (JSON with mismatch blocks export) | The grid itself keeps rows aligned; mismatches can only arise from loaded JSON. |
| I19 | ImpEx | Duplicate columns diagnosed | PASS | impex.test column.duplicate | — |
| I20 | ImpEx | Repeated serialization identical | PASS | impex.test; audit.test fixture stability | — |
| I21 | ImpEx | Errors block normal export | PASS | impex.spec ".impex button disabled with errors"; occ.spec ZIP disabled | — |
| I22 | ImpEx | Valid CSV imports correctly | PASS | impex.test; impex.spec | — |
| I23 | ImpEx | Header-row and no-header-row modes | PASS | impex.test; impex.spec | — |
| I24 | ImpEx | Quoted delimiters and escaped quotes parsed | PASS | impex.test csv; impex.spec | — |
| I25 | ImpEx | TSV paste works | PASS | impex.spec "TSV paste" (synthetic ClipboardEvent); impex.test pasteMatrix; CSV dialog also accepts tab-delimited text | Paste is simulated with a dispatched ClipboardEvent, not an OS clipboard paste. |
| I26 | ImpEx | UTF-8/Unicode CSV survives import | PASS | impex.spec (UTF-8 file via file chooser); impex.test BOM+Unicode | — |
| I27 | ImpEx | Malformed CSV leaves configuration unchanged | PASS | impex.test fatal; impex.spec "malformed CSV leaves data untouched" | — |
| I28 | ImpEx | Replace requires explicit confirmation | PASS | impex.spec | — |
| I29 | ImpEx | Append behaves as expected | PASS | impex.test; impex.spec | — |
| I30 | ImpEx | Cancellation leaves data unchanged | PASS | impex.spec | — |
| I31 | ImpEx | Save and load restore correct configuration | PASS | impex.spec "save, load, rename, delete" | — |
| I32 | ImpEx | JSON round-trip | PASS | impex.test; impex.spec | — |
| I33 | ImpEx | Invalid JSON/schema does not overwrite state | PASS | impex.test; impex.spec (bad JSON, wrong schema) | — |
| I34 | ImpEx | .impex download contains expected script | PASS | impex.spec (file content compared exactly) | — |
| I35 | ImpEx | Copy action works | PASS | impex.spec (clipboard read back, permissions granted) | Chromium with granted clipboard permission; fallback path (execCommand) not tested. |
| I36 | ImpEx | Reset requires confirmation | PASS | impex.spec | — |
| I37 | ImpEx | REMOVE shows a warning | PASS | impex.test mode.remove; impex.spec banner | — |
| I38 | ImpEx | No code path executes or imports ImpEx | PASS | Source has no network/exec API (grep for fetch/XHR/WebSocket/sendBeacon/eval/new Function/innerHTML: 0 matches in src); impex.spec asserts no execute/import/deploy buttons or links exist | — |
| I39 | ImpEx | Network inspection: CSV processing/generation local | PASS | audit.spec instrumented flow incl. CSV import: 0 API calls, 0 off-origin requests; impex.spec request log | Chromium only. |
| S1 | Shared | Landing page presents both tools | PASS | shared.spec / smoke | — |
| S2 | Shared | Both entry points work | PASS | shared.spec | — |
| S3 | Shared | Navigation back to home | PASS | shared.spec | — |
| S4 | Shared | Browser back/forward | PASS | shared.spec | — |
| S5 | Shared | Direct route navigation | PASS | shared.spec | — |
| S6 | Shared | Refresh works under GitHub Pages base path | PARTIAL | shared.spec runs against dist served ONLY under /sap-commerce-code-generator/ with no SPA fallback (tests/browser/serve-subpath.mjs); hash routing + base "./"; no absolute URLs in dist | Not deployed to real GitHub Pages (forbidden). Emulation, not the real host. |
| S7 | Shared | Desktop layouts coherent | PARTIAL | Author reviewed screenshots at 1440x900 (light+dark) for landing, ImpEx header/data/problems, OCC builder/mock/generated | Manual visual review only; no automated visual-regression baseline. |
| S8 | Shared | Tablet/mobile: no page-level horizontal overflow | PASS | shared.spec overflow checks at 390px and 820px on all routes and key tabs; audit.spec phone dialogs + mock | Data grid and code scroll horizontally inside their own panels (intended). |
| S9 | Shared | Keyboard navigation and visible focus | PARTIAL | shared.spec: arrow-key tabs, computed focus outline; native <dialog> for focus trapping/Escape; Enter/Shift+Enter in grid; axe focus rules clean | No full keyboard-only walkthrough of every flow; no screen-reader testing. |
| S10 | Shared | Inputs have accessible labels | PASS | shared.spec script (every input/select/textarea labelled) + axe WCAG2 A/AA on 3 pages × light/dark: no serious/critical | — |
| S11 | Shared | Validation messages accessible and understandable | PARTIAL | Severity conveyed by text + icon (not colour alone), lists labelled and keyboard-focusable, axe clean, alert roles on blocking banners | Diagnostics list changes are not announced via a live region; not tested with a screen reader. |
| S12 | Shared | Reduced-motion respected | PASS | shared.spec (emulated prefers-reduced-motion → transition duration ≈ 0); CSS media query | — |
| S13 | Shared | Storage errors handled gracefully | PASS | shared.spec (localStorage getter throws → app works, in-memory persistence, alert on save); audit.spec corrupted drafts/saved lists ignored, saved entries not deleted | — |
| S14 | Shared | Saved configurations deletable explicitly | PASS | impex.spec delete with confirm | — |
| S15 | Shared | No backend/AI/analytics/telemetry/source upload | PASS | See I38/O30/I39 + dist URL scan (only XML namespace strings) + npm audit 0 vulns; 3 runtime deps | Own-request audit only: browser/hosting traffic and the user clicking footer links are outside scope. Chromium only. |
| S16 | Shared | Production build succeeds | PASS | `npm run build` ✓ (tsc + vite build) | — |
| S17 | Shared | Type-check and lint pass | PASS | `npm run typecheck`, `npm run lint` clean | — |
| S18 | Shared | All automated tests pass | PASS | Vitest 87/87 (4 files), Playwright 43/43 | — |
| S19 | Shared | Exported files match approved fixtures | PASS | Java files vs tests/fixtures/occ-*; ImpEx vs impex-product/impex-edge; .impex download compared exactly | ZIP verified structurally + deterministically rather than against a byte fixture. |
| S20 | Shared | No unrelated functionality removed | NOT APPLICABLE | Repository was empty at start; git status shows only additions/modifications by this project | — |
| P1 | Context | UI/docs state a controller alone is not a working OCC endpoint | PASS | validate scope.controller Information diagnostic (audit.test), README export text, docs/OCC_GENERATOR.md | — |
| P2 | Context | @GetMapping/@PostMapping/… supported alongside @RequestMapping | PASS | audit.test shortcut mappings; javac.test; import detects all-shortcut controllers | — |
| P3 | Context | Profiles do not fabricate version differences | PASS | Only verified Swagger difference implemented; unknowns documented (docs/RESEARCH_AND_DESIGN.md) | — |
| P4 | Context | Profile persisted, exported in JSON, stated in README | PASS | occ.test JSON round-trip; export README "Selected Commerce profile" | — |
| P5 | Context | Mock duration presented as simulated | PASS | Result shows "N ms (simulated)"; badge MOCK SIMULATION; occ.test | — |
| P6 | Context | Ambiguous empty cells: data preserved with a warning | PARTIAL | Cells preserved verbatim; Warning for empty identifying key and empty rows; Information (not Warning) for other empty cells; message says empty ≠ guaranteed null | Severity of the general empty-cell note is a design choice; raise to Warning if you prefer louder. |
| P7 | Context | Macro expansion preview without destroying definitions | PASS | impex.spec "Macro expansion" tab; serializer keeps references (fixtures) | — |
| P8 | Context | Obvious circular macro references detected | PASS | impex.test macro.circular (graph DFS over $refs in macro values) | Does not analyse macros used inside arbitrary expressions. |
| P9 | Context | Nested reference expressions not flattened | PASS | impex-edge fixture; impex.test | — |
| P10 | Context | Large datasets practical | PARTIAL | 5,000×8 serialize 13 ms + validate 41 ms (unit, one run on this machine); grid pages 200 rows | UI interaction speed with 5k+ rows not measured in a browser. |
| P11 | Context | Generated Java is syntactically valid and internally consistent | PASS | javac.test: 6 variants compile against minimal stubs | Stubs are not real Spring/Swagger/SAP; says nothing about real-project compatibility. |
| P12 | Context | Last-used tool persisted and used | PASS | Landing "Continue with …" link (impex.spec "landing offers to continue") | — |
| P13 | Context | Compatibility with a real SAP Commerce 2205/2211 build | NOT VERIFIED | No SAP Commerce installation or SAP libraries available (and none may be contacted) | Compile and test in your project. |
| P14 | Context | Parity with prospect2p.com reference tools | NOT VERIFIED | Site blocked (HTTP 403) in this environment; per instructions not pursued further | — |
| P15 | Context | Visual review on mobile | PARTIAL | Screenshots reviewed at 390x844: landing, ImpEx data tab, OCC builder/mock; automated overflow checks | Not every state/dialog visually inspected on mobile; mobile grid needs horizontal scroll to see later columns. |
| P16 | Context | Dark-theme contrast | PASS | axe color-contrast clean in dark for all 3 pages (after fixing code line numbers/comments) | Initial states only. |
| P17 | Context | Deployed GitHub Pages behaviour | NOT VERIFIED | Deployment is out of bounds | Verify after publishing. |
| P18 | Context | Browsers other than Chromium | NOT VERIFIED | Only Chromium installed/tested | Firefox/Safari untested (native <dialog>, clipboard API differences possible). |

## Commands and results (last run)

```text
$ npm run typecheck

$ npm run lint

$ npm test
 Test Files  4 passed (4)
      Tests  87 passed (87)
$ npm run build
✓ built in 781ms
$ npm run test:browser

  43 passed (35.7s)
$ npm audit --omit=dev
found 0 vulnerabilities
$ unzip -t (produced ZIP)
No errors detected in compressed data of <scratch>/out.zip.
$ grep src for fetch/XHR/WebSocket/sendBeacon/eval/new Function/innerHTML
0
```

`typecheck` and `lint` print only the command banner because they report no problems. Browser tests ran with `CHROMIUM_PATH` pointing at the preinstalled Chromium against `dist/` served under `/sap-commerce-code-generator/`.

## Not done / limits of this audit

- No live SAP Commerce compile or runtime test; no comparison with the reference site.
- Chromium only; no screen-reader testing; no automated visual regression.
- The 5,000-row figures are a single local run, not a benchmark.
