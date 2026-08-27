## ADDED Requirements

### Requirement: The portable subset is published as data

The lint rules SHALL be expressed as a declarative catalogue from which rule ids and messages can be emitted as JSON, rather than as detection logic with the identifiers embedded at each call site.

#### Scenario: The catalogue is derived from the enforcing code

- **WHEN** the machine-readable subset is produced
- **THEN** its rule ids come from the same table the linter evaluates, so a rule cannot exist in one and be absent from the other

#### Scenario: Restructuring does not change what is rejected

- **WHEN** the rules are moved into a table
- **THEN** every rule id, message text and detection behaviour is unchanged, and the existing per-rule tests pass without modification

### Requirement: The prose contract and the data cannot silently diverge

A test SHALL assert that every rule id in the manifest appears in `docs/shader-abi.md`.

#### Scenario: A rule removed from either side fails the build

- **WHEN** a rule id is added to the manifest but not documented, or removed from the doc but not the manifest
- **THEN** the consistency test fails, naming the id

### Requirement: The frozen prose remains the authored source

The manifest SHALL describe the contract without becoming its definition. `docs/shader-abi.md` SHALL NOT be generated from the manifest.

#### Scenario: Reasoning survives that data cannot carry

- **WHEN** the manifest publishes the banned-construct list
- **THEN** the doc retains the explanations a list cannot hold — why `oMod` exists rather than a `mod`-to-`fmod` rewrite, and why `min(resolution)` is load-bearing

### Requirement: A skill document accompanies the manifest

An agent-facing `SKILL.md` SHALL ship alongside the JSON, covering how to evaluate a field.

#### Scenario: An agent can act without reading the frozen spec end to end

- **WHEN** an agent is asked to evaluate a field
- **THEN** the skill names the available measurements and the traps that have actually caused defects, without restating the whole ABI
