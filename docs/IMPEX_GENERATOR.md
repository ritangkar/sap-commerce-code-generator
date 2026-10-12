# ImpEx Generator

## Modes and type
`INSERT_UPDATE` (default), `INSERT`, `UPDATE`, `REMOVE` (shows a destructive-operation warning). Type is free text; example types and templates (Product, Category, CatalogVersion, Media, Customer, REMOVE example) are **examples, not verified metadata**. Optional raw type modifiers (`[batchmode=true]`).

## Columns
Attribute/expression text is **never rewritten** (reference expressions, `$macro` references, project-specific syntax). Structured modifiers `unique`, `lang`, `allownull`, `default` are written in that canonical order, followed by raw modifiers verbatim, in a single bracket group: `name[unique=true,lang=en,default=x,virtual=true]`. Columns can be added, edited, reordered, removed; adding/moving keeps cell data aligned; removing a column that holds data asks for confirmation and states the count.

## Macros
Ordered `$name=value` definitions written before the header in that order. Diagnostics: invalid name, empty/multiline value, duplicate (warning – later wins), undefined reference, use before definition, circular reference (error). `$config-…` references are treated as system macros. A read-only expansion preview is shown; the script keeps the references.

## Data editor
Add/edit/duplicate/delete/reorder rows, empty cells kept as empty, multi-line cells (Shift+Enter), tab-separated paste into any cell (rows appended; columns beyond the header are reported, never silently dropped), paging for >200 rows, row/column counts.

## CSV / TSV import
File or pasted text, UTF-8 (BOM stripped), delimiter auto-detect or manual (`, ; tab |`), RFC-4180 quoting (delimiters/newlines in quotes, `""`), header row on/off, mapping CSV → ImpEx columns (auto by header name else by position), preview, ragged/blank-line/stray-quote diagnostics, unterminated quote = fatal (import disabled), unmapped CSV columns listed, append or replace (replace asks confirmation), Cancel changes nothing.

## Serializer
Layout: optional `# comment`, macros, blank line, header, rows (each row starts with `;`). Cells are quoted only when they contain `;`, `"` or line breaks (`"` doubled); otherwise written untouched (no trimming). Empty cells stay empty – they are **not** converted to `<ignore>` or null. Output ends with a newline, is deterministic, and exposes line numbers (header, macros, rows) used by diagnostics.

## Validation
Errors: missing/invalid type, no columns, empty attribute, malformed expression/raw modifiers, `;` in headers, invalid macro names, circular macros, row length ≠ header length. Warnings: REMOVE, duplicate columns/macros, undefined macros, missing unique key (non-INSERT), empty identifying cell, empty row, suspicious attribute, lang format, dangling commas/empty parentheses in references, modifier duplicated in raw text. Information: unverified custom/example types, empty cells, whitespace, undefined `$` in cells. Structural checks are reliable; anything about existence in your system is only informational/warning. **Errors disable copy and `.impex` download.**

## Exports
Copy and `.impex` download (generated script) vs **Export JSON** (editable configuration, schema `sap-commerce-code-generator/impex-config` v1) in *Configurations*. Save/load/rename/delete named configurations in localStorage; import validates before replacing.

## Out of scope
Importing existing `.impex` scripts, executing ImpEx, system metadata lookups.
