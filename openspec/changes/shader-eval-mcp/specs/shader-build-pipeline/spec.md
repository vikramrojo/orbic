## MODIFIED Requirements

### Requirement: Lint rules are a catalogue, not scattered assertions

The shader linter SHALL hold its rules in one declarative structure. Rule identity SHALL be readable without executing the linter against crafted input or scraping its source.

#### Scenario: The rule set can be enumerated

- **WHEN** the set of enforced rules is requested
- **THEN** it is read from the catalogue directly, rather than discovered by linting fixture shaders and collecting the ids that happen to fire

#### Scenario: Existing behaviour is preserved exactly

- **WHEN** the catalogue replaces the previous inline detection sites
- **THEN** the same sources are rejected with the same rule ids and the same messages, verified by the existing per-rule tests
