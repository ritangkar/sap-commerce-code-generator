# OCC Controller Generator & Tester

## Profiles
| | 2205 | 2211 |
|---|---|---|
| Class tag | `@Api(tags=…)` | `@Tag(name=…)` |
| Operation | `@ApiOperation(value, notes, nickname)` | `@Operation(summary, description, operationId)` |
| Responses | `@ApiResponses/@ApiResponse(code, message)` | `@ApiResponses/@ApiResponse(responseCode, description)` |
| Parameter docs | `@ApiParam` | `@Parameter` |
| DTO docs | `@ApiModel`, `@ApiModelProperty` | `@Schema` |

Everything else is identical. javax namespaces are generated for both (unverified for your patch level). A mismatching extra annotation (v1 on 2211 or v3 on 2205) raises a warning.

## What a controller is and is not
A generated controller is **one layer** of an OCC endpoint. It does not provide business logic, facade/service wiring, DTO mapping or field exposure, Spring configuration, security configuration, extension dependencies or registration in a real OCC web application. The tool states this as an Information diagnostic, in the exported README and here. Return types are free text (e.g. `ResponseEntity<String>`, a WsDTO or `void`); none is presented as the universal SAP Commerce convention.

## Configuration
Controller: package, class, base path, `@Controller`(+`@ResponseBody`) or `@RestController`, mapping style (`@RequestMapping(method = …)` or `@GetMapping`/`@PostMapping`/`@PutMapping`/`@PatchMapping`/`@DeleteMapping`), API tag, extra class annotations (raw, no imports generated). Endpoints (several per controller): method name, GET/POST/PUT/PATCH/DELETE, path, consumes/produces, summary, description, success status (`@ResponseStatus`), documented response codes, return type, `@Secured` roles. Parameters: `@PathVariable`, `@RequestParam`, `@RequestHeader`, `@RequestBody` with external name, Java name, type, required, default, description. Optional WsDTO (fields, types, descriptions, required → `@NotNull`, getters/setters, `Serializable`), facade interface + implementation skeleton, validator skeleton.

Type catalogue: String, Integer, Long, Boolean, Double, BigDecimal, LocalDate, LocalDateTime, OffsetDateTime, Instant, Date, `List<String>`, custom types (fully qualified names are imported) and a few WsDTO hints. Unqualified unknown types are used as written and flagged (no import).

## Path rules
Base path and method path are normalised to exactly one slash between them (`/products/` + `{code}` → `/products/{code}`; empty method path → `/products`; duplicate slashes collapsed). A method path without a leading `/` is a warning and a slash is added in the generated annotation; a base path without one is an error. Every `{placeholder}` needs a path variable of the same name (except `{baseSiteId}`, informational) and vice versa.

## Generated files
`src/<package>/<Class>.java` for the controller, DTO, facade, `Default…Facade` and validator; ZIP adds `README.md` (profile, files, assumptions, wiring, limitations, manual checks). Output is deterministic (fixed ordering, sorted/grouped imports, no timestamps).

Facade/validator are scaffolding with TODOs; facade bodies throw `UnsupportedOperationException`. With no facade enabled the controller method throws the same. With a validator and a body parameter the controller validates through a Spring `Errors` object and throws `WebserviceValidationException` (**import must be verified**).

## Compile check of the generated Java
`tests/unit/javac.test.ts` compiles six generated variants with `javac` against **minimal stub annotations** in `tests/java-stubs` (skipped when `javac` is unavailable). This shows the output is syntactically valid and internally consistent (controller ↔ facade ↔ DTO signatures, imports). It does **not** show compatibility with real Spring, Swagger/OpenAPI or SAP Commerce classes.

## Validation (Error / Warning / Information)
Package and identifier syntax, reserved words, naming conventions, duplicate method names and mappings, path syntax and balanced braces, path variable ↔ placeholder consistency (`{baseSiteId}` is informational), duplicate external/Java parameter names, default value vs type (ranges, booleans, numbers, ISO dates), one body max, body on GET/DELETE, consumes on GET, status codes, security roles, extra annotation syntax/conflicts/profile mismatch, DTO fields, duplicate generated file paths, missing imports for unknown types, profile notes. **Errors disable ZIP export**; warnings stay visible. Static checks never prove compilation.

## Java import (supported subset)
Text scanner (comments/strings masked) for one `class` with: `@Controller/@RestController`, class `@RequestMapping(value/path)`, `@Api/@Tag`, other class annotations (kept as extras); methods with `@RequestMapping`/`@Get|Post|Put|Patch|DeleteMapping` (value/path, method, consumes, produces), `@Secured`, `@ResponseStatus(HttpStatus.X)`, `@ApiOperation/@Operation`, `@ApiResponses`; parameters with `@PathVariable/@RequestParam/@RequestHeader/@RequestBody` (+ `@ApiParam/@Parameter`). **Reported, not imported:** method bodies, fields/injection, non-mapped methods, extends/implements, other annotations, framework parameters (`HttpServletRequest` …), DTO/facade/validator. Malformed or unsupported input yields errors and leaves the builder unchanged. The original text is kept (Generated Code tab) until you clear it; the builder changes only after explicit apply + confirmation.

## Mock tester
Pure simulation (`mock.ts`), no `fetch`. Matches method + path against configured endpoints (404 / 405 with `Allow`), extracts path variables, applies defaults, checks required query/header params and type compatibility (400), content type (415), JSON body validity and DTO required fields (400), then returns the endpoint's configured status, headers, body (`{{path.x}}`, `{{query.x}}`, `{{header.x}}` substitution). Duration is the configured delay (timer only), so results are deterministic. Results are labelled *MOCK SIMULATION*.

## Integration assumptions
Add the files to a web extension, register facade/validator beans, ensure component scanning, configure OAuth/security, compile with your build, and test on a development system.
