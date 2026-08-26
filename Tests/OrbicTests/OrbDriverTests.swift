import SwiftUI
import XCTest
@testable import Orbic

@available(iOS 17.0, macOS 14.0, *)
final class OrbDriverTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 0)

    private func advance(_ driver: OrbDriver, seconds: Double, from: Date, speed: Double = 1) -> Date {
        let next = from.addingTimeInterval(seconds)
        driver.advance(to: next, speed: speed)
        return next
    }

    func testFirstAdvanceUsesZeroDeltaRatherThanTheEpochGap() {
        let driver = OrbDriver(preset: .subtle)
        // A Date is an absolute instant; if the first advance measured from
        // anything but itself, dt would be astronomically large and the clamp
        // would still leave the clock jumping on mount.
        driver.advance(to: Date(timeIntervalSinceReferenceDate: 1_000_000), speed: 1)
        XCTAssertEqual(driver.time, 0, accuracy: 1e-12)
    }

    func testSpeedScalesTheClockButNotTheSprings() {
        let slow = OrbDriver(preset: .subtle)
        let fast = OrbDriver(preset: .subtle)
        slow.retarget(to: .active)
        fast.retarget(to: .active)

        var slowNow = start
        var fastNow = start
        slow.advance(to: slowNow, speed: 1)
        fast.advance(to: fastNow, speed: 4)

        for _ in 0..<60 {
            slowNow = advance(slow, seconds: 1.0 / 60.0, from: slowNow, speed: 1)
            fastNow = advance(fast, seconds: 1.0 / 60.0, from: fastNow, speed: 4)
        }

        // Channels are identical: speed must not touch spring behaviour.
        XCTAssertEqual(slow.channels.energy, fast.channels.energy, accuracy: 1e-12)
        XCTAssertEqual(slow.channels.pulse, fast.channels.pulse, accuracy: 1e-12)

        // The clock, meanwhile, has advanced 4x.
        XCTAssertEqual(fast.time, slow.time * 4, accuracy: 1e-9)
        XCTAssertGreaterThan(slow.time, 0)
    }

    func testRetargetKeepsCurrentValuesRatherThanSnapping() {
        let driver = OrbDriver(preset: .subtle)
        let resting = OrbicPresets.channels[.subtle]!
        driver.retarget(to: .active)

        var now = start
        driver.advance(to: now, speed: 1)
        for _ in 0..<10 {
            now = advance(driver, seconds: 1.0 / 60.0, from: now)
        }

        let midFlight = driver.channels
        XCTAssertNotEqual(midFlight.energy, resting.energy, accuracy: 1e-6)

        // Retargeting somewhere else must continue from here, not jump.
        driver.retarget(to: .cooling)
        now = advance(driver, seconds: 1.0 / 120.0, from: now)

        XCTAssertEqual(driver.channels.energy, midFlight.energy, accuracy: 0.05)
    }

    func testResumeDropsTheIdleGap() {
        let driver = OrbDriver(preset: .subtle)
        driver.retarget(to: .active)

        var now = start
        driver.advance(to: now, speed: 1)
        for _ in 0..<10 {
            now = advance(driver, seconds: 1.0 / 60.0, from: now)
        }
        let beforePause = driver.time

        // Ten minutes pass while paused. Without resume(), that whole gap
        // would be integrated on the next frame.
        driver.resume()
        driver.advance(to: now.addingTimeInterval(600), speed: 1)

        XCTAssertEqual(driver.time, beforePause, accuracy: 1e-12)
    }

    func testClockWrapsRatherThanGrowingUnbounded() {
        let driver = OrbDriver(preset: .active)
        var now = start
        driver.advance(to: now, speed: 1)

        // Advance past the 3600 s wrap in large but individually clamped steps.
        for _ in 0..<20_000 {
            now = advance(driver, seconds: 0.25, from: now)
        }

        XCTAssertGreaterThanOrEqual(driver.time, 0)
        XCTAssertLessThan(driver.time, 3600)
    }
}

@available(iOS 17.0, macOS 14.0, *)
final class OrbicResolveTests: XCTestCase {
    func testUnknownNamesFallBackInsteadOfTrapping() {
        XCTAssertEqual(OrbicResolve.preset("nope", component: "Orb", prop: "state"), .subtle)
        XCTAssertEqual(OrbicResolve.field("nope", component: "Orb"), OrbicFields.fallback)
    }

    func testKnownNamesPassThrough() {
        XCTAssertEqual(OrbicResolve.preset("active", component: "Orb", prop: "state"), .active)
        for field in OrbicFields.all {
            XCTAssertEqual(OrbicResolve.field(field, component: "Orb"), field)
        }
    }

    func testFallbackFieldIsTheFirstShippedField() {
        // Matches the web bundle's FIELD_NAMES[0]; the generated list is
        // sorted, so both platforms agree on which field an unknown name
        // resolves to.
        XCTAssertEqual(OrbicFields.fallback, OrbicFields.all.first)
        XCTAssertFalse(OrbicFields.all.isEmpty)
    }

    /// The degraded colour is specified in CSS HSL and must match the web
    /// bundle's `fallbackColorFromChannels` numerically, not approximately.
    func testFallbackColourMatchesTheWebFormula() {
        // warmth 0, energy 0 -> hsl(220, 55%, 35%)
        assertColour(
            Color.orbicFallback(warmth: 0, energy: 0),
            red: 0.1575, green: 0.2858, blue: 0.5425
        )

        // warmth 1, energy 1 -> hsl(0, 55%, 60%)
        assertColour(
            Color.orbicFallback(warmth: 1, energy: 1),
            red: 0.8200, green: 0.3800, blue: 0.3800
        )
    }

    func testFallbackColourClampsOutOfRangeChannels() {
        assertColour(
            Color.orbicFallback(warmth: 5, energy: 5),
            red: 0.8200, green: 0.3800, blue: 0.3800
        )
        assertColour(
            Color.orbicFallback(warmth: -3, energy: -3),
            red: 0.1575, green: 0.2858, blue: 0.5425
        )
    }

    private func assertColour(
        _ color: Color,
        red: Double,
        green: Double,
        blue: Double,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let resolved = color.resolve(in: EnvironmentValues())
        XCTAssertEqual(Double(resolved.red), red, accuracy: 0.002, "red", file: file, line: line)
        XCTAssertEqual(Double(resolved.green), green, accuracy: 0.002, "green", file: file, line: line)
        XCTAssertEqual(Double(resolved.blue), blue, accuracy: 0.002, "blue", file: file, line: line)
    }
}
