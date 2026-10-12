# Testing

```bash
npm test                 # Vitest unit tests
npm run lint && npm run typecheck
npm run build
npm run test:browser     # Playwright; needs dist/ (run build first). Set CHROMIUM_PATH if Playwright cannot find its browser.
```

The Playwright config starts `tests/browser/serve-subpath.mjs`, which serves `dist/` only under `/sap-commerce-code-generator/` with no SPA fallback – the same shape as GitHub Pages.

## Unit tests (`tests/unit`)
* `impex.test.ts` – serializer fixture (`tests/fixtures/impex-product.impex`), determinism, all modes, modifier order, raw/reference preservation, quoting/unicode/newlines/empties, line numbers, validation, macros (duplicate/undefined/circular), CSV parser (quotes, CRLF, BOM, ragged, fatal), delimiter detection, import mapping/append/replace, editing operations, paste, JSON envelope round trip and rejection.
* `occ.test.ts` – approved Java fixtures for both profiles (`tests/fixtures/occ-2205|2211`), determinism, profile differences, five HTTP methods, bindings, imports, validation rules, mock engine, Java import (`tests/fixtures/ImportMe.java`), ZIP determinism/structure, config JSON.

To regenerate fixtures after an intentional change: delete the fixture folder and run `UPDATE_FIXTURES=1 npx vitest run tests/unit/occ.test.ts`; review the diff.

## Browser tests (`tests/browser`)
Navigation/back/forward, direct URLs and reload under the sub-path, not-found, tool-switch persistence, overflow at 390 px and 820 px, keyboard/tabs, accessible names, theme + reduced motion, blocked storage, ImpEx (modes, modifiers, macros, rows, columns, CSV append/replace/cancel/malformed, TSV paste, downloads, copy, save/load/rename/delete, JSON round trip, reset), OCC (profiles, validation blocking export, ZIP/file download, optional files, mock tester incl. network tracking, Java import, save/load/reset).

## Known gaps
* No automated accessibility audit (axe) and no screen-reader testing; keyboard checks are limited.
* No live SAP Commerce compilation of generated Java; no tests against real OCC.
* Reference sites were unreachable, so parity with them is untested.
* Only Chromium is exercised.
* Large-data performance (>5k rows) was not measured.
