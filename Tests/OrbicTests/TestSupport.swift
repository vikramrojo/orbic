import Foundation
@testable import Orbic

/// Decodes `fixtures/golden-frames.json`. The fixture's shape is the
/// shared cross-platform contract; the values are regenerated from
/// `packages/orb-core/src/presets.json` by another workstream and are not
/// owned here.
struct GoldenFrameFixture: Decodable {
    let fixedSubstep: Double
    let maxFrameDelta: Double
    let channels: [String]
    let transitions: [Transition]

    struct Transition: Decodable {
        let from: String
        let to: String
        let spring: SpringParams
        let sampleTimes: [Double]
        /// Keyed by the sample time's own string form (e.g. "0.05"), not by
        /// a sequential index — decoded generically as a string-keyed
        /// dictionary rather than assuming a particular key format, and
        /// paired back up with `sampleTimes` by parsing each key as a
        /// `Double` in `GoldenFrameFixture.Transition.orderedSamples`.
        let samples: [String: [String: Double]]

        struct SpringParams: Decodable {
            let stiffness: Double
            let damping: Double
            let mass: Double
        }

        /// Sample checkpoints in ascending time order, recovered by parsing
        /// each `samples` key back into a `Double` rather than trying to
        /// reproduce JSON's own number-to-string formatting.
        func orderedSamples() -> [(time: Double, values: [String: Double])] {
            samples.compactMap { key, values in
                guard let time = Double(key) else { return nil }
                return (time, values)
            }.sorted { $0.time < $1.time }
        }
    }
}

enum FixtureLoader {
    enum LoadError: Error, CustomStringConvertible {
        case notFound(URL)
        var description: String {
            switch self {
            case .notFound(let url):
                return "golden-frames.json not found at \(url.path)"
            }
        }
    }

    /// Locates `fixtures/golden-frames.json` relative to this source file's
    /// own location (`Tests/OrbicTests/`, two directories below the
    /// repository root) rather than via an SPM resource, since the fixture
    /// lives outside this test target's own directory tree and is a neutral
    /// artifact shared with the TypeScript suite, owned by neither.
    static func goldenFrames() throws -> GoldenFrameFixture {
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent() // OrbicTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // repository root
        let fixtureURL = repoRoot.appendingPathComponent("fixtures/golden-frames.json")

        guard FileManager.default.fileExists(atPath: fixtureURL.path) else {
            throw LoadError.notFound(fixtureURL)
        }

        let data = try Data(contentsOf: fixtureURL)
        return try JSONDecoder().decode(GoldenFrameFixture.self, from: data)
    }
}

extension OrbicChannels {
    /// Looks up a channel by its `presets.json`/fixture name. Test-only
    /// convenience; the shipped API deliberately has no generic channel
    /// accessor.
    func value(named name: String) -> Double? {
        switch name {
        case "energy": return energy
        case "coherence": return coherence
        case "warmth": return warmth
        case "pulse": return pulse
        default: return nil
        }
    }
}
