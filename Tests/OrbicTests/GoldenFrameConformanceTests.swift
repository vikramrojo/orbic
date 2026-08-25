import XCTest
@testable import Orbic

/// Cross-platform conformance: every sampled value in
/// `fixtures/golden-frames.json` must match the Swift integrator
/// within ±0.001. This is the test that makes "the same orb everywhere" a
/// verified property rather than an aspiration — see
/// `openspec/changes/orbic-foundation/design.md`, risk "Three spring
/// implementations drift".
final class GoldenFrameConformanceTests: XCTestCase {
    private let tolerance = 0.001

    func testGoldenFrames() throws {
        let fixture: GoldenFrameFixture
        do {
            fixture = try FixtureLoader.goldenFrames()
        } catch {
            XCTFail("Could not load golden-frames.json: \(error)")
            return
        }

        // The fixture's own constants are the shared contract; the
        // integrator must not silently diverge from them.
        XCTAssertEqual(
            fixture.fixedSubstep, OrbicSpring.fixedSubstep, accuracy: 1e-12,
            "fixture fixedSubstep must match OrbicSpring.fixedSubstep"
        )
        XCTAssertEqual(
            fixture.maxFrameDelta, OrbicSpring.maxFrameDelta, accuracy: 1e-12,
            "fixture maxFrameDelta must match OrbicSpring.maxFrameDelta"
        )
        XCTAssertEqual(fixture.transitions.count, 20, "expected all 20 ordered preset pairs")

        var mismatches: [String] = []
        var missingPresets: [String] = []

        for transition in fixture.transitions {
            guard let from = OrbicPreset(rawValue: transition.from),
                  let to = OrbicPreset(rawValue: transition.to) else {
                missingPresets.append("\(transition.from) -> \(transition.to)")
                continue
            }

            let checkpoints = transition.orderedSamples()
            if checkpoints.count != transition.sampleTimes.count {
                mismatches.append(
                    "\(transition.from)->\(transition.to): sample count \(checkpoints.count) " +
                    "!= sampleTimes count \(transition.sampleTimes.count)"
                )
            }

            var spring = OrbicSpring(
                value: OrbicPresets.channels[from]!,
                target: OrbicPresets.channels[to]!,
                params: OrbicSpringParams(
                    stiffness: transition.spring.stiffness,
                    damping: transition.spring.damping,
                    mass: transition.spring.mass
                )
            )

            var simulatedTime = 0.0
            for checkpoint in checkpoints {
                // Drive in fixed-substep-sized calls up to this checkpoint.
                // Each call passes exactly `fixedSubstep`, always well under
                // `maxFrameDelta`, so the clamp never interferes here.
                while simulatedTime + OrbicSpring.fixedSubstep <= checkpoint.time + 1e-9 {
                    spring.advance(by: OrbicSpring.fixedSubstep)
                    simulatedTime += OrbicSpring.fixedSubstep
                }

                for channel in fixture.channels {
                    guard let expected = checkpoint.values[channel] else { continue }
                    guard let actual = spring.value.value(named: channel) else { continue }
                    let diff = actual - expected
                    if abs(diff) > tolerance {
                        mismatches.append(
                            "\(transition.from)->\(transition.to) @ t=\(checkpoint.time) [\(channel)]: " +
                            "expected \(expected), got \(actual), diff \(diff)"
                        )
                    }
                }
            }
        }

        if !missingPresets.isEmpty {
            XCTFail("Fixture referenced unknown preset names: \(missingPresets.joined(separator: ", "))")
        }

        if !mismatches.isEmpty {
            XCTFail(
                "Golden-frame conformance failed for \(mismatches.count) sample(s):\n"
                + mismatches.joined(separator: "\n")
            )
        }
    }
}
