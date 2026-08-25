import Foundation

/// Semi-implicit (symplectic) Euler integrator driving the four Orbic
/// channels between preset states. The stepping order, fixed substep, and
/// frame-delta clamp are a cross-platform contract: this must match the
/// TypeScript integrator numerically, not just qualitatively. See
/// `openspec/changes/orbic-foundation/design.md` decision 8 and
/// `docs/shader-abi.md`.
public struct OrbicSpring: Sendable {
    /// Frame deltas larger than this are clamped before being added to the
    /// accumulator, so a single call (e.g. a backgrounded app resuming after
    /// tens of seconds) always runs a bounded number of substeps rather than
    /// thousands.
    public static let maxFrameDelta: Double = 0.25

    /// Fixed integration substep, in seconds (1/120 s). Shared with
    /// `OrbicPresets.fixedSubstep` rather than redeclared, so the two can't
    /// silently drift apart.
    public static let fixedSubstep: Double = OrbicPresets.fixedSubstep

    /// Tolerance used when deciding whether the accumulator holds a whole
    /// substep, so accumulated floating-point error never stalls a substep
    /// that is due.
    private static let substepEpsilon: Double = 1e-9

    public private(set) var value: OrbicChannels
    public private(set) var velocity: OrbicChannels
    public var target: OrbicChannels
    public var params: OrbicSpringParams

    /// Seconds of real frame time accumulated but not yet consumed by a
    /// whole fixed substep. Carried across calls to `advance(by:)`.
    private var accumulator: Double = 0

    public init(
        value: OrbicChannels,
        target: OrbicChannels,
        params: OrbicSpringParams,
        velocity: OrbicChannels = OrbicChannels(energy: 0, coherence: 0, warmth: 0, pulse: 0)
    ) {
        self.value = value
        self.target = target
        self.params = params
        self.velocity = velocity
    }

    /// Resolves the initial value, target, and spring parameters from the
    /// shared preset and spring tables in `Presets.swift`.
    public init(transitioningFrom from: OrbicPreset, to: OrbicPreset) {
        self.init(
            value: OrbicPresets.channels[from]!,
            target: OrbicPresets.channels[to]!,
            params: OrbicPresets.spring(from: from, to: to)
        )
    }

    /// Advances the spring by `frameDelta` seconds of real elapsed time.
    ///
    /// `frameDelta` is clamped to `maxFrameDelta` *before* being added to the
    /// accumulator. The accumulator is then drained in whole
    /// `fixedSubstep`-sized physics steps, leaving any remainder for the
    /// next call rather than discarding it.
    public mutating func advance(by frameDelta: Double) {
        let clamped = min(max(frameDelta, 0), Self.maxFrameDelta)
        accumulator += clamped

        while accumulator + Self.substepEpsilon >= Self.fixedSubstep {
            step(dt: Self.fixedSubstep)
            accumulator -= Self.fixedSubstep
        }
    }

    private mutating func step(dt: Double) {
        var ve = velocity.energy
        var vc = velocity.coherence
        var vw = velocity.warmth
        var vp = velocity.pulse

        let e = Self.integrate(value.energy, velocity: &ve, target: target.energy, params: params, dt: dt)
        let c = Self.integrate(value.coherence, velocity: &vc, target: target.coherence, params: params, dt: dt)
        let w = Self.integrate(value.warmth, velocity: &vw, target: target.warmth, params: params, dt: dt)
        let p = Self.integrate(value.pulse, velocity: &vp, target: target.pulse, params: params, dt: dt)

        value = OrbicChannels(energy: e, coherence: c, warmth: w, pulse: p)
        velocity = OrbicChannels(energy: ve, coherence: vc, warmth: vw, pulse: vp)
    }

    /// One semi-implicit Euler step for a single scalar channel: velocity is
    /// updated first, then position is advanced using the *new* velocity.
    /// Using the old velocity here would make this explicit Euler, which is
    /// unstable at these stiffnesses and diverges from the TypeScript
    /// integrator.
    private static func integrate(
        _ value: Double,
        velocity: inout Double,
        target: Double,
        params: OrbicSpringParams,
        dt: Double
    ) -> Double {
        let acceleration = (-params.stiffness * (value - target) - params.damping * velocity) / params.mass
        velocity += acceleration * dt
        return value + velocity * dt
    }
}
