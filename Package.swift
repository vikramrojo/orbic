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
            name: "Orbic"
        ),
        .testTarget(
            name: "OrbicTests",
            dependencies: ["Orbic"]
        ),
    ]
)
