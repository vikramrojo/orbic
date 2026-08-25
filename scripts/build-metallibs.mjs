// Compiles every generated `.metal` artifact into a prebuilt `.metallib`, one
// per supported Apple platform, for `Sources/Orbic/Resources/Metallibs/`.
//
// WHY PREBUILT, RATHER THAN LETTING SwiftPM DO IT (task 9.2)
//
// Determined empirically, not assumed:
//
//   1. `swift build` with `resources: [.process("Shaders")]` copies the
//      `.metal` files into the resource bundle as RAW SOURCE. It never
//      invokes the Metal compiler, so no `default.metallib` exists and
//      `ShaderLibrary.bundle(.module)` finds nothing.
//
//   2. `xcodebuild` DOES run `CompileMetalFile` on each shader — so this is
//      not a SwiftPM limitation — but linking them into a single
//      `default.metallib` fails with ~40 duplicated symbols. That is
//      architectural: every field's artifact is a standalone program that
//      defines the same `[[stitchable]] orbicOrb` / `orbicSurface` entry
//      point, the same `field`/`composite`, and the same helpers. Eight such
//      programs cannot share one library without renaming everything.
//
//   3. Compiling each artifact to its OWN `.metallib` works, and
//      `metal-nm` confirms the entry point is exported.
//
// So each artifact gets its own library, loaded at runtime with
// `ShaderLibrary(url:)` rather than `ShaderLibrary.bundle(.module)`.
//
// WHY THE OUTPUT IS COMMITTED
//
// A `.metallib` bakes in its target triple (`air64_v26-apple-ios17.0.0` vs
// `...-simulator` vs `...-macosx14.0.0`), so one file cannot serve every
// platform — hence one subdirectory per platform below. Committing them keeps
// the Metal toolchain OFF the consumer's critical path: as of Xcode 26 it is
// a separately downloaded component (`xcodebuild -downloadComponent
// MetalToolchain`), absent from a stock install, so compiling shaders during
// a consumer's build would fail for anyone who hasn't fetched it. CI
// regenerates these and fails on drift, the same guarantee the other
// generated files get.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shadersDir = resolve(rootDir, 'Sources/Orbic/Shaders');
const outRoot = resolve(rootDir, 'Sources/Orbic/Resources/Metallibs');

/**
 * One entry per platform the SPM package supports (see `Package.swift`:
 * iOS 17, macOS 14). `directory` is what `MetallibLoader.swift` looks for at
 * runtime — keep the two in step.
 */
export const PLATFORMS = [
  { directory: 'macos', sdk: 'macosx', target: 'air64-apple-macos14.0' },
  { directory: 'ios', sdk: 'iphoneos', target: 'air64-apple-ios17.0' },
  { directory: 'ios-simulator', sdk: 'iphonesimulator', target: 'air64-apple-ios17.0-simulator' },
];

function metalToolchainAvailable() {
  try {
    execFileSync('xcrun', ['--find', 'metal'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function buildMetallibs({ quiet = false } = {}) {
  const sources = readdirSync(shadersDir)
    .filter((f) => f.endsWith('.metal'))
    .sort();

  if (sources.length === 0) {
    throw new Error(`no .metal artifacts in ${shadersDir} — run \`pnpm build:shaders\` first`);
  }

  const written = [];

  for (const platform of PLATFORMS) {
    const outDir = resolve(outRoot, platform.directory);
    // Removed first so a field deleted from the pipeline cannot leave a stale
    // .metallib behind that the freshness check would then treat as current.
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    for (const source of sources) {
      const name = source.replace(/\.metal$/, '');
      const outPath = resolve(outDir, `${name}.metallib`);

      execFileSync(
        'xcrun',
        ['-sdk', platform.sdk, 'metal', '-target', platform.target, '-o', outPath, resolve(shadersDir, source)],
        { stdio: 'pipe' }
      );

      written.push(`${platform.directory}/${name}.metallib`);
    }
  }

  if (!quiet) {
    console.log(`Wrote ${written.length} metallib(s) to ${outRoot}:`);
    for (const w of written) console.log(`  ${w}`);
  }

  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!metalToolchainAvailable()) {
    // Loud and non-zero, deliberately. A silent skip here would let CI go
    // green while shipping stale or missing shader libraries — the exact
    // failure mode scripts/check-shaders.mjs warns about.
    console.error(
      'build-metallibs: no Metal compiler found (`xcrun --find metal` failed).\n' +
        '  This needs a full Xcode AND the separately-downloaded Metal toolchain:\n' +
        '    xcodebuild -downloadComponent MetalToolchain\n' +
        '  As of Xcode 26 that component is NOT part of a stock install.'
    );
    process.exit(1);
  }

  buildMetallibs();
}
