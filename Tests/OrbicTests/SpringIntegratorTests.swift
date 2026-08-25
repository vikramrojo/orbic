import XCTest
@testable import Orbic

final class SpringIntegratorTests: XCTestCase {
    private let tolerance = 0.001

    private func freshSpring() -> OrbicSpring {
        OrbicSpring(transitioningFrom: .subtle, to: .active)
    }

    private func assertChannelsEqual(
        _ lhs: OrbicChannels,
        _ rhs: OrbicChannels,
        accuracy: Double,
        _ message: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(lhs.energy, rhs.energy, accuracy: accuracy, "\(message) [energy]", file: file, line: line)
        XCTAssertEqual(lhs.coherence, rhs.coherence, accuracy: accuracy, "\(message) [coherence]", file: file, line: line)
        XCTAssertEqual(lhs.warmth, rhs.warmth, accuracy: accuracy, "\(message) [warmth]", file: file, line: line)
        XCTAssertEqual(lhs.pulse, rhs.pulse, accuracy: accuracy, "\(message) [pulse]", file: file, line: line)
    }

    // MARK: - 1. Frame-rate independence

    /// Runs a fresh transition to exactly `time` seconds at a fixed frame
    /// rate, one `advance(by:)` call per rendered frame — the same way a
    /// real render loop would drive it.
    private func run(atFPS fps: Double, upTo time: Double) -> OrbicSpring {
        var spring = freshSpring()
        let dt = 1.0 / fps
        let frameCount = Int((time * fps).rounded())
        for _ in 0..<frameCount {
            spring.advance(by: dt)
        }
        return spring
    }

    func testFrameRateIndependence() {
        // Every checkpoint is an exact multiple of 1/30 s, so it is also an
        // exact multiple of 1/60 s and 1/120 s — no rate lands mid-substep.
        let checkpoints: [Double] = [0.1, 0.3, 0.6, 1.2]

        for t in checkpoints {
            let at30 = run(atFPS: 30, upTo: t)
            let at60 = run(atFPS: 60, upTo: t)
            let at120 = run(atFPS: 120, upTo: t)

            assertChannelsEqual(at30.value, at60.value, accuracy: tolerance, "30fps vs 60fps @ t=\(t)")
            assertChannelsEqual(at60.value, at120.value, accuracy: tolerance, "60fps vs 120fps @ t=\(t)")
            assertChannelsEqual(at30.value, at120.value, accuracy: tolerance, "30fps vs 120fps @ t=\(t)")
        }
    }

    // MARK: - 2. Accumulator fidelity

    /// 1000 frames of 1 ms never land exactly on a 1/120 s substep boundary
    /// (1/120 s ≈ 8.33 ms), so this only agrees with the reference if the
    /// accumulator carries its remainder across calls instead of dropping
    /// it.
    func testAccumulatorFidelityAgainstFixedSubstepDriving() {
        var fineGrained = freshSpring()
        for _ in 0..<1000 {
            fineGrained.advance(by: 0.001)
        }

        var substepGrained = freshSpring()
        for _ in 0..<120 {
            substepGrained.advance(by: 1.0 / 120.0)
        }

        assertChannelsEqual(
            fineGrained.value,
            substepGrained.value,
            accuracy: tolerance,
            "1000×1ms vs 120×(1/120s) after 1 simulated second"
        )
    }

    // MARK: - 3. Large delta is clamped, not run in full

    func testLargeFrameDeltaClampsToMaxFrameDelta() {
        var resumedAfterBackground = freshSpring()
        // A backgrounded app resuming after a minute (or, to make the point
        // starkly, far longer) must not attempt tens of thousands of
        // substeps in a single call.
        resumedAfterBackground.advance(by: 60.0)

        var clampedReference = freshSpring()
        clampedReference.advance(by: OrbicSpring.maxFrameDelta)

        assertChannelsEqual(
            resumedAfterBackground.value,
            clampedReference.value,
            accuracy: 1e-9,
            "a 60s delta must simulate exactly maxFrameDelta (0.25s), not 60s"
        )

        // An even more extreme delta must behave identically and complete
        // promptly rather than attempting an unbounded number of substeps.
        var extreme = freshSpring()
        let start = Date()
        extreme.advance(by: 1_000_000.0)
        let elapsed = Date().timeIntervalSince(start)

        assertChannelsEqual(
            extreme.value,
            clampedReference.value,
            accuracy: 1e-9,
            "an extreme (1,000,000s) delta must still simulate exactly maxFrameDelta"
        )
        XCTAssertLessThan(elapsed, 1.0, "advance(by:) must not hang on an extreme frame delta")
    }
}
