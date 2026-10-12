# Testing

```bash
npm test                 # Vitest unit tests
npm run lint && npm run typecheck
npm run build
npm run test:browser     # Playwright; needs dist/ (run build first). Set CHROMIUM_PATH if Playwright cannot find its browser.
```

The Playwright config starts `tests/browser/serve-subpath.mjs`, which serves `dist/` only under `/sap-commerce-code-generator/` with no SPA fallback – the same shape as GitHub Pages.

Current counts (last full run): **81 unit tests + 6 javac tests = 87 in Vitest (see audit for the exact final numbers)**, 43 Playwright tests. Authoritative results are in `docs/ACCEPTANCE_AUDIT.md`.

## Unit tests (`tests/unit`)
* `impex.test.ts` – serializer fixture (`tests/fixtures/impex-product.impex`), determinism, all modes, modifier order, raw/reference preservation, quoting/unicode/newlines/empties, line numbers, validation, macros (duplicate/undefined/circular), CSV parser (quotes, CRLF, BOM, ragged, fatal), delimiter detection, import mapping/append/replace, editing operations, paste, JSON envelope round trip and rejection.
* `occ.test.ts` – approved Java fixtures for both profiles (`tests/fixtures/occ-2205|2211`), determinism, profile differences, five HTTP methods, bindings, imports, validation rules, mock engine, Java import (`tests/fixtures/ImportMe.java`), ZIP determinism/structure, config JSON.

* `audit.test.ts` – OCC path normalisation, mapping styles, `ResponseEntity`, legacy config load, ImpEx edge fixture (`impex-edge.impex`: nested references, macro column, raw modifiers, multiline/quoted/Unicode cells), REMOVE, CSV↔serializer round trip, 5,000×8 scale check.
* `javac.test.ts` – compiles generated Java against stubs (needs `javac`; skipped otherwise).

To regenerate fixtures after an intentional change: delete the fixture folder and run `UPDATE_FIXTURES=1 npx vitest run tests/unit/occ.test.ts`; review the diff.

## Browser tests (`tests/browser`)
Navigation/back/forward, direct URLs and reload under the sub-path, not-found, tool-switch persistence, overflow at 390 px and 820 px, keyboard/tabs, accessible names, theme + reduced motion, blocked storage, ImpEx (modes, modifiers, macros, rows, columns, CSV append/replace/cancel/malformed, TSV paste, downloads, copy, save/load/rename/delete, JSON round trip, reset), OCC (profiles, validation blocking export, ZIP/file download, optional files, mock tester incl. network tracking, Java import, save/load/reset).

* `audit.spec.ts` – instrumented `fetch`/XHR/WebSocket/`sendBeacon` plus request log and console-error check across both tools' flows; axe (WCAG 2 A/AA, serious+critical) on all three pages in light and dark; corrupted storage; phone-size dialogs.

## Known gaps
* axe covers only automatable WCAG checks on initial states; no screen-reader testing; keyboard checks are limited.
* No live SAP Commerce compilation of generated Java; no tests against real OCC.
* Reference sites were unreachable, so parity with them is untested.
* Only Chromium is exercised.
* Large-data performance (>5k rows) was not measured.
