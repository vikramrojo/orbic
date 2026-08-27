## ADDED Requirements

### Requirement: The server evaluates and does not author

The MCP server SHALL expose evaluation tools only. It SHALL NOT expose any tool that generates or edits shader source.

#### Scenario: Authoring is refused by omission

- **WHEN** the server advertises its tools
- **THEN** every tool takes an existing field and returns measurements or renders, because authoring was never the bottleneck — the portable subset is small and the linter rejects violations immediately

### Requirement: Tools return measurements and a render

Each evaluation tool SHALL return structured measurements, and tools that rasterise SHALL also return the rendered image.

#### Scenario: Appearance defects that numbers miss become visible

- **WHEN** a field renders as a blur, or a component falls back to a flat colour instead of running its shader
- **THEN** the returned image makes it apparent, which no measurement in the existing gates did

#### Scenario: The image's audience is stated

- **WHEN** a tool that returns an image is described
- **THEN** the description states that the image is useful only to a vision-capable consumer, rather than implying every caller benefits

### Requirement: One implementation serves MCP, CLI and CI

Evaluation logic SHALL live in a library that the MCP server, the CLI and the existing checks all call. The gates SHALL NOT be reimplemented for the server.

#### Scenario: A measurement cannot drift between transports

- **WHEN** the same field is evaluated through the MCP server and through the CLI
- **THEN** both produce identical measurements, because both call the same function

### Requirement: The evaluation tools are verified against known defects

The tools SHALL be validated by reproducing defects that have already occurred, not only by unit-testing their arithmetic.

#### Scenario: A tool that cannot rediscover a known defect is not finished

- **WHEN** the tools are pointed at fields whose measured properties are already known — a sparse field's peak-to-mean ratio, a field clipping at maximum, a known feature density
- **THEN** they independently reproduce those figures, on the same principle as the render harness's own self-test against known-identical and known-different pairs
