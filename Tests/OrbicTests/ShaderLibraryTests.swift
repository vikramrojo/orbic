import Metal
import XCTest
@testable import Orbic

/// Proves the task 9.2 distribution model actually works: that a prebuilt,
/// committed `.metallib` is present in the resource bundle for the platform
/// under test, that Metal will load it, and that it exports the
/// `[[stitchable]]` entry point the SwiftUI renderer looks up.
///
/// Without this, a broken shader pipeline would only surface as a blank orb
/// on a device — the failure mode that made the "program scope variable must
/// reside in constant address space" bug invisible for so long.
final class ShaderLibraryTests: XCTestCase {
    /// Driven from the generated list, NOT a hand-written literal.
    ///
    /// This was `["chladni", "silk", "veils", "flat-color"]` and had silently
    /// gone stale: `ribbons` shipped without its metallibs ever being verified
    /// on Swift, and nothing detected the omission because the test only ever
    /// checked the fields it already knew about. A hardcoded list here can
    /// only ever under-report.
    private var fields: [String] { OrbicFields.all }

    func testEveryFieldAndShapeHasAPrebuiltLibrary() {
        for field in fields {
            for shape in OrbicShape.allCases {
                XCTAssertNotNil(
                    OrbicShaderLibrary.url(field: field, shape: shape),
                    "missing prebuilt metallib for \(field)-\(shape.rawValue) on \(OrbicShaderLibrary.platformDirectory) — run `pnpm build:metallibs`"
                )
            }
        }
    }

    func testPrebuiltLibrariesLoadAndExportTheStitchableEntryPoint() throws {
        guard let device = MTLCreateSystemDefaultDevice() else {
            throw XCTSkip("no Metal device available on this machine")
        }

        for field in fields {
            for shape in OrbicShape.allCases {
                let url = try XCTUnwrap(
                    OrbicShaderLibrary.url(field: field, shape: shape),
                    "missing prebuilt metallib for \(field)-\(shape.rawValue)"
                )

                // Loading is the real assertion: a library built for the wrong
                // target triple, or truncated, fails here rather than at
                // first draw.
                let library = try device.makeLibrary(URL: url)

                let expected = shape == .orb ? "orbicOrb" : "orbicSurface"
                XCTAssertTrue(
                    library.functionNames.contains(expected),
                    "\(field)-\(shape.rawValue).metallib does not export \(expected); has \(library.functionNames)"
                )
            }
        }
    }

    func testMissingFieldReturnsNilRatherThanCrashing() {
        // The renderer's contract is to degrade to a solid colour, so an
        // unknown field must be a nil, not a trap.
        XCTAssertNil(OrbicShaderLibrary.url(field: "no-such-field", shape: .orb))
        XCTAssertNil(OrbicShaderLibrary.resolveOrReport(field: "no-such-field", shape: .orb))
    }

    func testPlatformDirectoryMatchesTheRunningPlatform() {
        #if os(macOS)
        XCTAssertEqual(OrbicShaderLibrary.platformDirectory, "macos")
        #elseif targetEnvironment(simulator)
        XCTAssertEqual(OrbicShaderLibrary.platformDirectory, "ios-simulator")
        #else
        XCTAssertEqual(OrbicShaderLibrary.platformDirectory, "ios")
        #endif
    }
}
