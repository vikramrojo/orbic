import SwiftUI
import os

/// Name resolution and the degraded fallback colour, mirroring
/// `packages/orb-web/src/runtime/resolveNames.ts` and `fallbackColor.ts`.
///
/// Both component specs require that an unrecognised `field` or
/// `state`/`preset` warns and falls back rather than throwing, and that the
/// behaviour is equivalent on every platform — so the fallback targets and
/// the warning wording are kept deliberately in step with the web bundle.
enum OrbicResolve {
    static let log = Logger(subsystem: "com.orbic", category: "resolve")

    /// Names already warned about, so a bad value passed on every SwiftUI
    /// body evaluation produces one diagnostic rather than a flood. SwiftUI
    /// re-evaluates bodies freely, so this is not optional.
    private static let warned = OSAllocatedUnfairLock(initialState: Set<String>())

    private static func warnOnce(_ key: String, _ message: @autoclosure () -> String) {
        let shouldLog = warned.withLock { seen in seen.insert(key).inserted }
        guard shouldLog else { return }

        // Evaluated into a local first: Logger's interpolation takes an
        // escaping autoclosure, which cannot capture this non-escaping one.
        let text = message()
        log.warning("\(text, privacy: .public)")
    }

    /// Resolves a preset name, falling back to `.subtle`.
    ///
    /// `prop` only changes the wording — `<Orb>` calls it `state` and
    /// `<Surface>` calls it `preset`, but both resolve the same preset table.
    static func preset(_ name: String, component: String, prop: String) -> OrbicPreset {
        if let preset = OrbicPreset(rawValue: name) {
            return preset
        }

        let valid = OrbicPreset.allCases.map(\.rawValue).joined(separator: ", ")
        warnOnce(
            "preset:\(component):\(name)",
            "Orbic \(component): unknown \(prop) \"\(name)\" — valid options are \(valid). Falling back to \"\(OrbicPreset.subtle.rawValue)\"."
        )
        return .subtle
    }

    /// Resolves a field name, falling back to the first shipped field.
    static func field(_ name: String, component: String) -> String {
        if OrbicFields.all.contains(name) {
            return name
        }

        let valid = OrbicFields.all.joined(separator: ", ")
        warnOnce(
            "field:\(component):\(name)",
            "Orbic \(component): unknown field \"\(name)\" — valid options are \(valid). Falling back to \"\(OrbicFields.fallback)\"."
        )
        return OrbicFields.fallback
    }
}

extension Color {
    /// Solid colour derived from `warmth` (hue: cool blue to warm orange) and
    /// `energy` (lightness), shown when the shader library is unavailable.
    ///
    /// Matches `fallbackColorFromChannels` in the web bundle — same 220°
    /// hue sweep, same 55% saturation, same 35–60% lightness range — so a
    /// degraded Orb looks the same on every platform. Deliberately static:
    /// this is a fallback, not a second rendering path to keep in sync.
    public static func orbicFallback(warmth: Double, energy: Double) -> Color {
        let w = min(1, max(0, warmth))
        let e = min(1, max(0, energy))
        return hsl(hue: 220 - 220 * w, saturation: 0.55, lightness: 0.35 + 0.25 * e)
    }

    /// The shared fallback is specified in CSS HSL, but SwiftUI's
    /// `Color(hue:saturation:brightness:)` is HSB. Converting explicitly
    /// keeps the platforms numerically identical rather than approximately
    /// similar — feeding an HSL lightness into an HSB brightness would give a
    /// visibly different colour.
    static func hsl(hue: Double, saturation: Double, lightness: Double) -> Color {
        let c = (1 - abs(2 * lightness - 1)) * saturation
        let hPrime = hue / 60
        let x = c * (1 - abs(hPrime.truncatingRemainder(dividingBy: 2) - 1))
        let m = lightness - c / 2

        let (r, g, b): (Double, Double, Double)
        switch hPrime {
        case ..<1: (r, g, b) = (c, x, 0)
        case ..<2: (r, g, b) = (x, c, 0)
        case ..<3: (r, g, b) = (0, c, x)
        case ..<4: (r, g, b) = (0, x, c)
        case ..<5: (r, g, b) = (x, 0, c)
        default: (r, g, b) = (c, 0, x)
        }

        return Color(red: r + m, green: g + m, blue: b + m)
    }
}
