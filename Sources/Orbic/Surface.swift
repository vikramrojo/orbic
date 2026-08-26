import SwiftUI

/// A static Surface: the same field as an `Orb`, composited for a full-bleed
/// background that text sits on top of.
///
/// Exposes `field`, `preset` and `scale`, plus per-channel overrides — and
/// deliberately exposes no `state`, no spring configuration, and no animation
/// option, per the surface-component spec. A Surface renders one frame and
/// schedules no ongoing work: there is no `TimelineView` anywhere in this
/// file, which is what makes "always static" structural rather than a
/// default someone can flip.
@available(iOS 17.0, macOS 14.0, *)
public struct Surface: View {
    private let field: String
    private let preset: String
    private let scale: Double
    private let energy: Double?
    private let coherence: Double?
    private let warmth: Double?
    private let pulse: Double?

    public init(
        field: String,
        preset: String = OrbicPreset.subtle.rawValue,
        scale: Double = 3.0,
        energy: Double? = nil,
        coherence: Double? = nil,
        warmth: Double? = nil,
        pulse: Double? = nil
    ) {
        self.field = field
        self.preset = preset
        self.scale = scale
        self.energy = energy
        self.coherence = coherence
        self.warmth = warmth
        self.pulse = pulse
    }

    private var resolvedField: String { OrbicResolve.field(field, component: "Surface") }

    /// Preset channels with any explicit per-channel override applied.
    private var channels: OrbicChannels {
        let base = OrbicPresets.channels[
            OrbicResolve.preset(preset, component: "Surface", prop: "preset")
        ]!

        return OrbicChannels(
            energy: energy ?? base.energy,
            coherence: coherence ?? base.coherence,
            warmth: warmth ?? base.warmth,
            pulse: pulse ?? base.pulse
        )
    }

    public var body: some View {
        let channels = self.channels

        GeometryReader { geometry in
            if let libraryURL = OrbicShaderLibrary.resolveOrReport(field: resolvedField, shape: .surface) {
                // Resolution is the real pixel size: world space divides by
                // min(resolution.x, resolution.y), so a Surface must know its
                // own aspect to show the same feature size at any shape.
                let shader = ShaderLibrary(url: libraryURL).orbicSurface(
                    .float2(Float(geometry.size.width), Float(geometry.size.height)),
                    // A Surface is static: the clock is pinned at zero rather
                    // than sampled, so the same preset always renders the
                    // same frame.
                    .float(0),
                    .float(Float(channels.energy)),
                    .float(Float(channels.coherence)),
                    .float(Float(channels.warmth)),
                    .float(Float(channels.pulse)),
                    .float(Float(scale))
                )

                Rectangle()
                    .foregroundStyle(.white)
                    .colorEffect(shader)
            } else {
                Color.orbicFallback(warmth: channels.warmth, energy: channels.energy)
            }
        }
        // Decorative and behind content: it must never absorb taps or
        // hit-testing (surface-component spec).
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
