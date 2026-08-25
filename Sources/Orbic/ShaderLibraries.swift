import Foundation
import os

/// Locates the prebuilt `.metallib` for a given field and shape.
///
/// Each shader artifact ships as its own library rather than as entries in a
/// single `default.metallib`, because every artifact defines the same
/// `[[stitchable]]` entry point (`orbicOrb` / `orbicSurface`) plus the same
/// `field`/`composite` helpers — linking eight of them together fails with
/// duplicated symbols. See `scripts/build-metallibs.mjs` and task 9.2 for the
/// experiments behind that decision.
///
/// The libraries are compiled ahead of time and committed, one set per
/// platform, so a consumer never needs the Metal toolchain (a separately
/// downloaded component as of Xcode 26) to build an app that uses Orbic.
public enum OrbicShaderLibrary {
    /// Subdirectory of the resource bundle holding libraries built for the
    /// platform this binary is running on. Mirrors `PLATFORMS` in
    /// `scripts/build-metallibs.mjs` — the two must stay in step.
    static var platformDirectory: String {
        #if os(macOS)
        return "macos"
        #elseif targetEnvironment(simulator)
        // A simulator build is x86_64/arm64 host code against an iOS SDK; its
        // AIR triple carries a `-simulator` suffix and a device library will
        // not load into it.
        return "ios-simulator"
        #else
        return "ios"
        #endif
    }

    /// Basename of the artifact for a field/shape pair, matching what
    /// `scripts/build-shaders.mjs` writes.
    static func artifactName(field: String, shape: OrbicShape) -> String {
        "\(field)-\(shape.rawValue)"
    }

    /// URL of the prebuilt library, or `nil` when it is absent from the
    /// bundle — which happens if a consumer vendors the package without its
    /// resources, or if the field name does not exist.
    public static func url(field: String, shape: OrbicShape) -> URL? {
        Bundle.module.url(
            forResource: artifactName(field: field, shape: shape),
            withExtension: "metallib",
            subdirectory: "Metallibs/\(platformDirectory)"
        )
    }

    private static let log = Logger(subsystem: "com.orbic", category: "shaders")

    /// Field/shape pairs already reported as missing, so a failure is logged
    /// once rather than on every frame — the renderer keeps drawing its
    /// fallback, and a per-frame diagnostic would flood the log.
    /// (platform-renderers spec: "Failure is reported once, not per frame".)
    private static let reported = OSAllocatedUnfairLock(initialState: Set<String>())

    /// Resolves the library URL, emitting a diagnostic naming the field and
    /// target exactly once if it cannot be found. Returning `nil` is the
    /// caller's signal to paint the solid fallback colour rather than to
    /// crash or draw nothing.
    public static func resolveOrReport(field: String, shape: OrbicShape) -> URL? {
        if let url = url(field: field, shape: shape) {
            return url
        }

        let key = artifactName(field: field, shape: shape)
        let shouldLog = reported.withLock { seen -> Bool in
            seen.insert(key).inserted
        }

        if shouldLog {
            log.error(
                """
                Orbic: no prebuilt Metal library for field "\(field, privacy: .public)" \
                (\(shape.rawValue, privacy: .public)) on \(platformDirectory, privacy: .public). \
                Expected Metallibs/\(platformDirectory, privacy: .public)/\(key, privacy: .public).metallib \
                in the package resource bundle. Rendering the flat fallback colour instead.
                """
            )
        }

        return nil
    }
}

/// The two shapes a field can be composited into. The raw values are the
/// artifact-name suffixes the shader pipeline emits.
public enum OrbicShape: String, Sendable, CaseIterable {
    case orb
    case surface
}
