## ADDED Requirements

### Requirement: Shaders are produced by concatenation

The build SHALL generate each artifact as `preamble[target] + field + compositor[shape] + epilogue[shape][target]`. It SHALL NOT parse, tokenise, or compile the shader source.

#### Scenario: Full artifact matrix is generated

- **WHEN** the shader build runs with 3 fields, 2 compositors and 3 targets
- **THEN** 18 artifacts are produced, one per combination

#### Scenario: SkSL requires no source rewriting

- **WHEN** a field is built for the React Native target
- **THEN** the field body appears in the output byte-identical to its source, because SkSL accepts GLSL `vecN` aliases natively

### Requirement: Metal type aliasing

The build SHALL apply a type-alias substitution table for the Metal target only, mapping GLSL vector and matrix type names to their MSL equivalents.

#### Scenario: Vector and matrix types are aliased

- **WHEN** a field containing `vec2` and `mat2` is built for Metal
- **THEN** the output contains `float2` and `float2x2` respectively

### Requirement: Every generated artifact compiles

Each generated artifact SHALL be validated by the real compiler for its target platform in CI.

#### Scenario: Metal artifacts are compiler-checked

- **WHEN** CI runs `xcrun -sdk iphoneos metal -c` over the generated `.metal` files
- **THEN** every file compiles without error

#### Scenario: SkSL artifacts are compiler-checked

- **WHEN** each SkSL artifact is passed to `Skia.RuntimeEffect.Make`
- **THEN** the call returns a non-null effect

#### Scenario: GLSL artifacts are compiler-checked

- **WHEN** each GLSL artifact is compiled in headless-gl
- **THEN** `getShaderParameter(COMPILE_STATUS)` is true

### Requirement: Generated artifacts are committed and verified fresh

Generated `.metal` files and `Presets.swift` SHALL be committed to the repository, because SPM consumers cannot run a Node build step. CI SHALL detect staleness.

#### Scenario: Stale generated file fails CI

- **WHEN** a source field changes but its generated artifacts are not regenerated and committed
- **THEN** CI reruns the generators and fails on a non-empty `git diff`

### Requirement: Repository layout is safe on case-sensitive filesystems

No two tracked paths SHALL differ only by case, and SwiftPM's convention directories SHALL exist with exactly the casing SwiftPM resolves.

#### Scenario: Case collision fails the build

- **WHEN** two tracked paths differ only by case
- **THEN** CI fails and names every colliding group, because macOS and Windows fold case while Linux does not, so a collision that is invisible to the author is a hard failure for a consumer

#### Scenario: SwiftPM convention directories are asserted against git, not the filesystem

- **WHEN** the layout check runs
- **THEN** it verifies `Sources/Orbic` and `Tests/OrbicTests` in `git ls-files` rather than on disk, since a case-insensitive filesystem reports both spellings as present and would mask the defect

#### Scenario: A missing Tests directory breaks the whole package, not just tests

- **WHEN** `Tests/OrbicTests` is absent on a case-sensitive checkout
- **THEN** SwiftPM infers the test target's sources from `Sources/Orbic`, producing an overlapping-sources error that fails `swift build` for the library itself — so this SHALL be treated as a build-breaking defect rather than a test-only one

#### Scenario: macOS CI cannot be the guard

- **WHEN** the case check is placed in CI
- **THEN** it runs independently of the Swift jobs, because those run on `macos-14`, which folds case and would report success on a layout that is broken for every Linux consumer

### Requirement: Fields ship as separate entry points

Web and React Native bundles SHALL expose each field as an independent entry point so consumers pay only for the fields they import.

#### Scenario: Importing one field does not pull the others

- **WHEN** a consumer imports only `@orbic/web/fields/silk`
- **THEN** the other fields' shader sources are absent from the resulting bundle

### Requirement: Custom fields are built by CLI

The system SHALL provide an `orbic build-shader` command that lints a custom field and emits all six artifacts for it (2 shapes × 3 targets).

#### Scenario: Custom field produces both shapes

- **WHEN** `orbic build-shader ./my-field.orb` succeeds
- **THEN** six artifacts are written and both the orb and surface shapes render with the new material

#### Scenario: Invalid custom field is rejected before emitting

- **WHEN** a custom field violates the portable subset
- **THEN** the CLI fails the lint and writes no artifacts
