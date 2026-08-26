// GENERATED FILE — DO NOT EDIT.
// Regenerate with `node scripts/build-shaders.mjs`. Sourced from
// packages/orb-core/shaders/fields/*.orb via scripts/build-shaders.mjs's
// writeSwiftFieldNames.

public enum OrbicFields {
    /// Every field shipped with this build, in the same order as the web
    /// bundle's FIELD_SHADERS, so both platforms fall back to the same
    /// "first shipped field" for an unknown name.
    public static let all: [String] = [
        "chladni",
        "flat-color",
        "motes",
        "silk",
        "veils",
    ]

    /// Field used when a caller supplies a name that does not exist.
    public static var fallback: String { all[0] }
}
