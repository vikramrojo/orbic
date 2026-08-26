import SwiftUI

/// An animated Orb: a field composited through a soft radial falloff, driven
/// by the shared spring integrator.
///
/// The public surface (`field`, `state`, `size`, `speed`, `paused`, `edge`,
/// `backlight`)
/// matches `<Orb>` on web and native, with the same defaults — the
/// orb-component spec requires no platform-only prop and no differing default.
///
/// `edge` tightens the limb without touching interior density, so the orb
/// keeps its transparency and only its outline gets crisper. `backlight` is a
/// light behind the sphere, brightening the limb and spilling slightly past
/// the silhouette — tinted by the field's colour, not white, so it reads as
/// light around the orb rather than the hard rim that was retired.
@available(iOS 17.0, macOS 14.0, *)
public struct Orb: View {
    private let field: String
    private let state: String
    private let size: CGFloat
    private let speed: Double
    private let paused: Bool
    private let edge: Double
    private let backlight: Double

    public init(
        field: String,
        state: String = OrbicPreset.subtle.rawValue,
        size: CGFloat = 160,
        speed: Double = 1,
        paused: Bool = false,
        edge: Double = 0,
        backlight: Double = 0
    ) {
        self.field = field
        self.state = state
        self.size = size
        self.speed = speed
        self.paused = paused
        self.edge = edge
        self.backlight = backlight
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// One driver per Orb instance: two Orbs in different states must not
    /// share springs.
    @State private var driver: OrbDriver?

    private var resolvedField: String { OrbicResolve.field(field, component: "Orb") }
    private var resolvedPreset: OrbicPreset {
        OrbicResolve.preset(state, component: "Orb", prop: "state")
    }

    /// True when the Orb must render exactly one frame and schedule no
    /// per-frame work: either the caller paused it, or the system asked for
    /// reduced motion. Reduced motion renders at the preset's resting values
    /// rather than animating slowly (platform-renderers spec).
    private var isStatic: Bool { paused || reduceMotion }

    public var body: some View {
        let preset = resolvedPreset
        let restingChannels = OrbicPresets.channels[preset]!

        Group {
            if let libraryURL = OrbicShaderLibrary.resolveOrReport(field: resolvedField, shape: .orb) {
                if isStatic {
                    // No TimelineView at all — creating one and freezing it
                    // would still schedule work.
                    OrbShaderLayer(
                        libraryURL: libraryURL,
                        channels: driver?.channels ?? restingChannels,
                        time: driver?.time ?? 0,
                        size: size,
                        edge: edge,
                        backlight: backlight
                    )
                } else {
                    TimelineView(.animation) { timeline in
                        let driver = ensureDriver(for: preset)
                        let channels = driver.advance(to: timeline.date, speed: speed)

                        OrbShaderLayer(
                            libraryURL: libraryURL,
                            channels: channels,
                            time: driver.time,
                            size: size,
                            edge: edge,
                            backlight: backlight
                        )
                    }
                }
            } else {
                // Shader unavailable: a solid colour from warmth/energy,
                // rather than a crash or an empty region.
                // A soft radial fade, not `.clipShape(Circle())`: the orb
                // compositor no longer draws a hard silhouette, so a crisply
                // clipped fallback would look nothing like the thing it is
                // standing in for.
                Color.orbicFallback(warmth: restingChannels.warmth, energy: restingChannels.energy)
                    .mask(
                        RadialGradient(
                            gradient: Gradient(stops: [
                                .init(color: .black, location: 0),
                                .init(color: .black, location: 0.36),
                                .init(color: .clear, location: 1.0),
                            ]),
                            center: .center,
                            startRadius: 0,
                            endRadius: size / 2
                        )
                    )
            }
        }
        // A concrete frame, not a scaleEffect: a `size` change must
        // re-evaluate the shader at the new resolution rather than upscale an
        // already-rasterised image (orb-component spec).
        .frame(width: size, height: size)
        .accessibilityHidden(true)
        .onChange(of: state) { _, _ in
            driver?.retarget(to: resolvedPreset)
        }
        .onChange(of: isStatic) { _, nowStatic in
            // Coming back from paused/reduced-motion, drop the stale
            // timestamp so the idle gap isn't integrated as one huge delta.
            if !nowStatic { driver?.resume() }
        }
    }

    /// Lazily creates the driver on the first animated frame. `@State` cannot
    /// be initialised from `preset` at `init` time without recreating it on
    /// every re-render, which would reset the springs mid-transition.
    private func ensureDriver(for preset: OrbicPreset) -> OrbDriver {
        if let driver {
            return driver
        }
        let created = OrbDriver(preset: preset)
        // Assigning during body evaluation is safe here because the value is
        // nil exactly once; the assignment does not change what this frame
        // renders.
        DispatchQueue.main.async { self.driver = created }
        return created
    }
}

/// The shader-backed layer itself, split out so the animated and static paths
/// share one definition of how uniforms reach the shader.
@available(iOS 17.0, macOS 14.0, *)
private struct OrbShaderLayer: View {
    let libraryURL: URL
    let channels: OrbicChannels
    let time: Double
    let size: CGFloat
    let edge: Double
    let backlight: Double

    var body: some View {
        // Argument order is the frozen uniform ABI (docs/shader-abi.md).
        // `position` and `color` are supplied by colorEffect itself, so the
        // explicit list starts at `resolution`.
        let shader = ShaderLibrary(url: libraryURL).orbicOrb(
            .float2(Float(size), Float(size)),
            .float(Float(time)),
            .float(Float(channels.energy)),
            .float(Float(channels.coherence)),
            .float(Float(channels.warmth)),
            .float(Float(channels.pulse)),
            // Trailing, orb-only — the Orb component's `edge` and `backlight`
            // props, in declaration order. Not part of the frozen four-channel
            // ABI; see epilogue-orb.metal.
            .float(Float(edge)),
            .float(Float(backlight))
        )

        Rectangle()
            .foregroundStyle(.white)
            .colorEffect(shader)
    }
}
