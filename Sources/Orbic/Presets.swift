// GENERATED FILE — DO NOT EDIT.
// Regenerate with `node scripts/build-presets.mjs` from packages/orb-core/src/presets.json,
// the single source of truth for Orbic's preset and spring data.

import Foundation

public enum OrbicPreset: String, CaseIterable, Sendable {
    case subtle
    case active
    case cooling
    case warming
    case pacing
}

public struct OrbicChannels: Sendable, Equatable {
    public let energy: Double
    public let coherence: Double
    public let warmth: Double
    public let pulse: Double

    public init(energy: Double, coherence: Double, warmth: Double, pulse: Double) {
        self.energy = energy
        self.coherence = coherence
        self.warmth = warmth
        self.pulse = pulse
    }
}

public struct OrbicSpringParams: Sendable, Equatable {
    public let stiffness: Double
    public let damping: Double
    public let mass: Double

    public init(stiffness: Double, damping: Double, mass: Double) {
        self.stiffness = stiffness
        self.damping = damping
        self.mass = mass
    }
}

public enum OrbicPresets {
    /// Fixed integrator substep, in seconds: semi-implicit Euler at 1/120 s.
    public static let fixedSubstep: Double = 1.0 / 120.0

    public static let channels: [OrbicPreset: OrbicChannels] = [
        .subtle: OrbicChannels(energy: 0.15, coherence: 0.82, warmth: 0.35, pulse: 0.3),
        .active: OrbicChannels(energy: 0.88, coherence: 0.52, warmth: 0.55, pulse: 1.4),
        .cooling: OrbicChannels(energy: 0.3, coherence: 0.74, warmth: 0.12, pulse: 0.55),
        .warming: OrbicChannels(energy: 0.55, coherence: 0.6, warmth: 0.9, pulse: 0.75),
        .pacing: OrbicChannels(energy: 0.48, coherence: 0.68, warmth: 0.5, pulse: 2.0),
    ]

    /// Keyed as "\(from)>\(to)", e.g. "subtle>active". Falls back to "default".
    public static let springs: [String: OrbicSpringParams] = [
        "default": OrbicSpringParams(stiffness: 120.0, damping: 14.0, mass: 1.0),
        "subtle>active": OrbicSpringParams(stiffness: 260.0, damping: 18.0, mass: 1.0),
        "active>subtle": OrbicSpringParams(stiffness: 60.0, damping: 16.0, mass: 1.2),
        "cooling>warming": OrbicSpringParams(stiffness: 90.0, damping: 20.0, mass: 1.0),
        "warming>cooling": OrbicSpringParams(stiffness: 110.0, damping: 15.0, mass: 1.0),
        "pacing>active": OrbicSpringParams(stiffness: 200.0, damping: 12.0, mass: 0.9),
        "active>pacing": OrbicSpringParams(stiffness: 140.0, damping: 22.0, mass: 1.0),
        "subtle>pacing": OrbicSpringParams(stiffness: 150.0, damping: 16.0, mass: 1.0),
    ]

    /// Resolves a (from, to) transition to its spring parameters, falling back to `default`.
    public static func spring(from: OrbicPreset, to: OrbicPreset) -> OrbicSpringParams {
        let key = "\(from.rawValue)>\(to.rawValue)"
        return springs[key] ?? springs["default"]!
    }
}
