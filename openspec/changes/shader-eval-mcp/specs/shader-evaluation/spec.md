## ADDED Requirements

### Requirement: Evaluation measures appearance, not conformance

The evaluation library SHALL report what a rendered field looks like, as measurements distinct from the pass/fail gates. Conformance and appearance SHALL NOT be collapsed into a single score.

#### Scenario: A conformant field that looks wrong is still reported

- **WHEN** a field passes lint, compiles, and clears contrast, aspect and brand-unity, but renders as an undifferentiated blur
- **THEN** the evaluation tools still report its measured feature count, brightness distribution and silhouette profile, because none of the gates asked those questions

#### Scenario: No score conflates the two

- **WHEN** evaluation output is produced
- **THEN** measurements are reported as named quantities rather than reduced to one number that mixes "is legal" with "looks right"

### Requirement: Brightness is decomposed, not totalled

Brightness SHALL be reported as straight colour, alpha, and the product as composited over the background — three quantities, not one.

#### Scenario: Two independent causes of darkness are distinguishable

- **WHEN** an orb renders darker than intended
- **THEN** the report separates a dim field from a transparent compositor, because the fix for each is different and a single luminance figure cannot tell them apart

### Requirement: Sparse fields are distinguishable from dim fields

Evaluation SHALL report peak alongside mean, so that a field of bright features on a dark ground is not mistaken for a uniformly dim one.

#### Scenario: A dotted field is not misdiagnosed

- **WHEN** a field renders bright features covering a small fraction of its area
- **THEN** its high peak-to-mean ratio is reported, identifying it as sparse — a condition gain cannot fix, since raising gain only clips features already near maximum

### Requirement: Feature density is measured, not assumed

Evaluation SHALL report the count of distinct rendered features and the fraction of lit area.

#### Scenario: Intended density is verifiable

- **WHEN** a field is authored with constants intended to produce roughly one hundred features in view
- **THEN** the measured count is reported, so a value off by an order of magnitude is caught before a human sees it

### Requirement: Channel observability is measured on both shapes

Evaluation SHALL sweep each of the four channels independently and report the resulting image difference, for the orb and the surface separately.

#### Scenario: A silently ignored channel is surfaced

- **WHEN** a field compiles but never reads `warmth`
- **THEN** the sweep reports approximately zero difference for that channel, distinguishing "compiles" from "expresses the contract"

#### Scenario: `pulse` reading zero is correct, not a defect

- **WHEN** the sweep varies `pulse` at fixed `t`
- **THEN** a zero result is reported as expected, because `pulse` acts through the runtime clock rather than as a uniform the field reads
