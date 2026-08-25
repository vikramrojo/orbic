// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Orbic",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "Orbic",
            targets: ["Orbic"]
        )
    ],
    targets: [
        .target(
            name: "Orbic",
            // The .metal sources are the pipeline's committed output and the
            // input to `scripts/build-metallibs.mjs`, but they are not built
            // here: SwiftPM copies them verbatim without compiling, and Xcode
            // cannot link all eight into one default.metallib (they each
            // define the same `orbicOrb`/`orbicSurface` entry point). See
            // task 9.2. Excluding them also clears the "unhandled files"
            // warning they otherwise produce.
            exclude: ["Shaders"],
            // `.copy`, not `.process`: the per-platform subdirectories must
            // survive into the bundle. `.process` would flatten them and the
            // three same-named .metallib files would collide.
            resources: [.copy("Resources/Metallibs")]
        ),
        .testTarget(
            name: "OrbicTests",
            dependencies: ["Orbic"]
        ),
    ]
)
