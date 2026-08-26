import Foundation

/// Per-instance animation state for an `Orb`: the channel springs plus the
/// field clock.
///
/// A reference type held in `@State` so each Orb owns its own springs — two
/// Orbs in different states must not share an integrator — and so the
/// `TimelineView` closure can advance it without SwiftUI treating the
/// advance as a state mutation that invalidates the view (TimelineView is
/// already driving the redraws).
///
/// This deliberately drives `OrbicSpring` rather than SwiftUI's `withSpring`:
/// the golden-frame fixture is a cross-platform numeric contract, and only
/// the shared integrator satisfies it.
@available(iOS 17.0, macOS 14.0, *)
final class OrbDriver {
    private var spring: OrbicSpring
    private var currentPreset: OrbicPreset

    /// Unwrapped field clock in seconds. Wrapped on read, not here, so
    /// elapsed time is never lost to the wrap.
    private var tRaw: Double = 0

    /// Timestamp of the previous advance. `nil` means the next advance is the
    /// first, which uses dt = 0 so a mount (or a resume after pausing) never
    /// applies one huge delta.
    private var lastTimestamp: Date?

    /// Matches the web runtime's TIME_WRAP_SECONDS: the field clock wraps at
    /// an hour so `t` never grows large enough to lose float precision in the
    /// shader.
    private static let timeWrapSeconds: Double = 3600

    init(preset: OrbicPreset) {
        self.currentPreset = preset
        self.spring = OrbicSpring(
            value: OrbicPresets.channels[preset]!,
            target: OrbicPresets.channels[preset]!,
            params: OrbicPresets.spring(from: preset, to: preset)
        )
    }

    /// Points the springs at a new preset, keeping current values and
    /// velocities so a mid-flight change retargets continuously instead of
    /// snapping (orb-component spec: "Mid-flight retarget").
    func retarget(to preset: OrbicPreset) {
        guard preset != currentPreset else { return }

        spring.params = OrbicPresets.spring(from: currentPreset, to: preset)
        spring.target = OrbicPresets.channels[preset]!
        currentPreset = preset
    }

    /// Advances the springs and the clock to `date`, returning the channel
    /// values to hand the shader.
    ///
    /// `speed` scales the field clock only — never the springs — so a faster
    /// clock does not change how a transition feels (orb-component spec:
    /// "Speed scales the clock only").
    @discardableResult
    func advance(to date: Date, speed: Double) -> OrbicChannels {
        let dt: Double
        if let last = lastTimestamp {
            dt = date.timeIntervalSince(last)
        } else {
            dt = 0
        }
        lastTimestamp = date

        spring.advance(by: dt)
        tRaw += dt * speed * spring.value.pulse

        return spring.value
    }

    /// Field clock for the shader, wrapped into [0, 3600).
    var time: Double {
        tRaw.truncatingRemainder(dividingBy: Self.timeWrapSeconds)
    }

    /// Current channel values without advancing anything — used by the
    /// paused and reduced-motion paths, which render one frame and schedule
    /// no further work.
    var channels: OrbicChannels {
        spring.value
    }

    /// Call before resuming after a pause so the idle gap is not integrated
    /// as a single enormous delta.
    func resume() {
        lastTimestamp = nil
    }
}
