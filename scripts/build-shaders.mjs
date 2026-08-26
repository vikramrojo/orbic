#!/usr/bin/env node
// Builds shader artifacts by concatenation: preamble[target] + field +
// compositor[shape] + epilogue[shape][target], per docs/shader-abi.md and
// design.md decision #5. No compiler, no transpiler — the field and
// compositor are each authored once, in a portable subset, and the only
// per-target transformation is a Metal vecN/matN -> floatN/floatNxN type
// alias applied to that shared core before it's wrapped in Metal's
// preamble/epilogue (which are hand-authored natively and need no
// aliasing).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintShaderSource, stripComments } from './lint-shader.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetsDir = resolve(rootDir, 'packages/orb-core/shaders/targets');

export const TARGETS = ['glsl', 'sksl', 'metal'];
export const SHAPES = ['orb', 'surface'];

const TARGET_EXTENSION = { glsl: 'glsl', sksl: 'sksl', metal: 'metal' };

/** GLSL vecN/matN -> Metal floatN/floatNxN, applied only to the shared field+compositor core. */
const METAL_TYPE_ALIASES = [
  ['vec2', 'float2'],
  ['vec3', 'float3'],
  ['vec4', 'float4'],
  ['mat2', 'float2x2'],
  ['mat3', 'float3x3'],
  ['mat4', 'float4x4'],
];

export function applyMetalTypeAliases(source) {
  let result = source;
  for (const [glslType, metalType] of METAL_TYPE_ALIASES) {
    result = result.replace(new RegExp(`\\b${glslType}\\b`, 'g'), metalType);
  }
  return result;
}

/**
 * Rewrites PROGRAM-SCOPE `const` to Metal's `constant` address space.
 *
 * GLSL and SkSL accept `const float X = 0.5;` at file scope; Metal rejects it
 * outright — "program scope variable must reside in constant address space" —
 * so every field that declares a named constant outside a function produced a
 * .metal artifact that could not compile. Function-LOCAL `const` is valid
 * Metal exactly as written, so this must be scope-aware: rewriting every
 * `const` would change locals into program-scope-only storage and fail
 * differently.
 *
 * Depth is tracked by scanning characters rather than by regex, skipping line
 * and block comments so a brace inside a comment cannot desynchronise the
 * count. Strings are not handled because the portable shader subset has no
 * string literals (see scripts/lint-shader.mjs).
 */
export function applyMetalProgramScopeConstants(source) {
  // `stripComments` (shared with the linter) blanks comment bodies to spaces
  // while preserving length and newlines, so this copy stays index-aligned
  // with `source` and a brace inside a comment cannot desynchronise the depth
  // count. Strings are not considered because the portable subset has none.
  const scan = stripComments(source);

  let out = '';
  let depth = 0;
  let i = 0;

  while (i < source.length) {
    const ch = scan[i];

    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);

    if (depth === 0 && scan.startsWith('const', i)) {
      const before = i === 0 ? '' : scan[i - 1];
      const after = scan[i + 5];
      const isToken =
        (i === 0 || !/[A-Za-z0-9_]/.test(before)) && after !== undefined && !/[A-Za-z0-9_]/.test(after);
      if (isToken) {
        out += 'constant';
        i += 5;
        continue;
      }
    }

    out += source[i];
    i++;
  }

  return out;
}

function readTarget(baseName, target) {
  return readFileSync(resolve(targetsDir, `${baseName}.${TARGET_EXTENSION[target]}`), 'utf8');
}

/**
 * Builds all six artifacts (2 shapes x 3 targets) for one field, paired with
 * a compositor per shape (`compositors.orb`, `compositors.surface` — the
 * compositor is shape-specific, per design.md's
 * `preamble[target] + field + compositor[shape] + epilogue[shape][target]`
 * and tasks 5.1/7.1's separate `orb.orb` / `surface.orb` files; only the
 * field is shared across both shapes).
 *
 * Lints the field and both compositors first — a failing lint throws and
 * writes nothing, so the CLI's "writes no artifacts when the lint fails"
 * guarantee holds by construction rather than by convention.
 *
 * `metalOutDir`, if given, additionally writes just the Metal-target
 * artifacts there — that's `Sources/Orbic/Shaders/`, where `Package.swift`
 * compiles Metal from. SPM consumers can't run this Node build step, so
 * those files are committed generated artifacts, not a build directory.
 */
export function buildArtifacts({ name, fieldSource, compositors, outDir, metalOutDir }) {
  const violations = [
    ...lintShaderSource(fieldSource).map((v) => ({ ...v, source: 'field' })),
    ...lintShaderSource(compositors.orb).map((v) => ({ ...v, source: 'compositors.orb' })),
    ...lintShaderSource(compositors.surface).map((v) => ({ ...v, source: 'compositors.surface' })),
  ];
  if (violations.length > 0) {
    const details = violations.map((v) => `  [${v.source}:${v.rule}] ${v.message}`).join('\n');
    throw new Error(`shader lint failed for "${name}" — ${violations.length} violation(s):\n${details}`);
  }

  const artifacts = [];
  for (const shape of SHAPES) {
    for (const target of TARGETS) {
      const preamble = readTarget('preamble', target);
      const epilogue = readTarget(`epilogue-${shape}`, target);

      let core = `${fieldSource}\n\n${compositors[shape]}`;
      if (target === 'metal') {
        core = applyMetalTypeAliases(core);
        // Must run on the core only: the hand-written .metal preamble/epilogue
        // already use `constant` where Metal requires it.
        core = applyMetalProgramScopeConstants(core);
      }

      const content = `${preamble}\n${core}\n\n${epilogue}`;
      const fileName = `${name}-${shape}.${TARGET_EXTENSION[target]}`;
      artifacts.push({ shape, target, fileName, content });
    }
  }

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    for (const artifact of artifacts) {
      writeFileSync(resolve(outDir, artifact.fileName), artifact.content);
    }
  }

  if (metalOutDir) {
    mkdirSync(metalOutDir, { recursive: true });
    for (const artifact of artifacts.filter((a) => a.target === 'metal')) {
      writeFileSync(resolve(metalOutDir, artifact.fileName), artifact.content);
    }
  }

  return artifacts;
}

/**
 * Writes a generated TS module exporting each field's GLSL sources (orb +
 * surface) as string constants, for `@orbic/web` to import directly rather
 * than needing a raw-text-import bundler plugin. Only the `glsl` target is
 * relevant to web; sksl/metal are not included.
 */
export function writeWebShaderModule(fieldsToArtifacts, outPath) {
  const entries = Object.entries(fieldsToArtifacts).map(([fieldName, artifacts]) => {
    const orbSource = artifacts.find((a) => a.shape === 'orb' && a.target === 'glsl').content;
    const surfaceSource = artifacts.find((a) => a.shape === 'surface' && a.target === 'glsl').content;
    return `  '${fieldName}': {\n    orb: ${JSON.stringify(orbSource)},\n    surface: ${JSON.stringify(surfaceSource)},\n  },`;
  });

  const module = `// GENERATED FILE — DO NOT EDIT.
// Regenerate with \`node scripts/build-shaders.mjs\`. Sourced from
// packages/orb-core/shaders/{fields,compositors,targets}/*.orb via
// scripts/build-shaders.mjs's writeWebShaderModule.

export const FIELD_SHADERS = {
${entries.join('\n')}
} as const;

export type FieldName = keyof typeof FIELD_SHADERS;
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, module);
}

/**
 * Writes ONE MODULE PER FIELD, plus a barrel that re-exports them.
 *
 * The single `FIELD_SHADERS` object this replaced could not be tree-shaken:
 * bundlers cannot drop unused PROPERTIES of an object literal, so a consumer
 * using one field still shipped the source of every other one — roughly 180 kB
 * of shader text for five fields. Splitting them into modules lets a consumer
 * import exactly the fields they use (task 10.1).
 *
 * The barrel still exists, because the harness and any consumer that genuinely
 * wants every field should not have to enumerate them. Importing the barrel
 * pulls everything in, by design; importing a field module pulls in only it.
 */
export function writePerFieldShaderModules(fieldsToArtifacts, outDir, target, label) {
  const names = Object.keys(fieldsToArtifacts);

  for (const [fieldName, artifacts] of Object.entries(fieldsToArtifacts)) {
    const orb = artifacts.find((a) => a.shape === 'orb' && a.target === target).content;
    const surface = artifacts.find((a) => a.shape === 'surface' && a.target === target).content;

    const module = `// GENERATED FILE — DO NOT EDIT.
// Regenerate with \`node scripts/build-shaders.mjs\`. ${label} sources for the
// "${fieldName}" field. One module per field so a consumer bundles only what
// it imports — see writePerFieldShaderModules in scripts/build-shaders.mjs.

export const orb = ${JSON.stringify(orb)};
export const surface = ${JSON.stringify(surface)};

export default { orb, surface };
`;
    mkdirSync(resolve(outDir, 'fields'), { recursive: true });
    writeFileSync(resolve(outDir, 'fields', `${fieldName}.ts`), module);
  }

  const imports = names.map((n) => `import * as ${identifier(n)} from './fields/${n}.js';`).join('\n');
  const entries = names.map((n) => `  '${n}': ${identifier(n)},`).join('\n');

  const barrel = `// GENERATED FILE — DO NOT EDIT.
// Regenerate with \`node scripts/build-shaders.mjs\`.
//
// Barrel over every field's ${label} sources. Importing this pulls in ALL
// fields by design; import './fields/<name>.js' directly (or the package's
// \`fields/<name>\` subpath) to bundle only one.

${imports}

export const FIELD_SHADERS = {
${entries}
} as const;

export type FieldName = keyof typeof FIELD_SHADERS;
`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'shaders.ts'), barrel);
}

/** A field name as a valid JS identifier — `flat-color` is not one. */
function identifier(name) {
  return name.replace(/[^A-Za-z0-9_$]/g, '_');
}

/**
 * Writes the canonical list of shipped field names into `@orbic/core`, so
 * name resolution and the "first shipped field" fallback have ONE definition
 * shared by web, native and (via Fields.swift) Swift — rather than each
 * bundle deriving its own from its own generated shader module and drifting.
 */
export function writeCoreFieldNames(fieldsToArtifacts, outPath) {
  const names = Object.keys(fieldsToArtifacts);
  const entries = names.map((n) => `  '${n}',`).join('\n');

  const module = `// GENERATED FILE — DO NOT EDIT.
// Regenerate with \`node scripts/build-shaders.mjs\`. Sourced from
// packages/orb-core/shaders/fields/*.orb via scripts/build-shaders.mjs's
// writeCoreFieldNames.

/** Every field shipped with this build, in a deterministic (sorted) order. */
export const FIELD_NAMES = [
${entries}
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, module);
}

/**
 * Writes a generated TS module exporting each field's SkSL sources, for
 * `@orbic/native` to hand to `Skia.RuntimeEffect.Make`. Mirrors
 * `writeWebShaderModule`; only the `sksl` target is relevant to Skia, just as
 * only `glsl` is relevant to web.
 */
export function writeNativeShaderModule(fieldsToArtifacts, outPath) {
  const entries = Object.entries(fieldsToArtifacts).map(([fieldName, artifacts]) => {
    const orbSource = artifacts.find((a) => a.shape === 'orb' && a.target === 'sksl').content;
    const surfaceSource = artifacts.find((a) => a.shape === 'surface' && a.target === 'sksl').content;
    return `  '${fieldName}': {\n    orb: ${JSON.stringify(orbSource)},\n    surface: ${JSON.stringify(surfaceSource)},\n  },`;
  });

  const module = `// GENERATED FILE — DO NOT EDIT.
// Regenerate with \`node scripts/build-shaders.mjs\`. Sourced from
// packages/orb-core/shaders/{fields,compositors,targets}/*.orb via
// scripts/build-shaders.mjs's writeNativeShaderModule.

export const FIELD_SHADERS = {
${entries.join('\n')}
} as const;

export type FieldName = keyof typeof FIELD_SHADERS;
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, module);
}

/**
 * Writes the generated Swift list of shipped field names, so the Swift
 * bundle resolves `field` against exactly the same set — and the same
 * ordering, which decides the "first shipped field" fallback — as
 * `@orbic/web`'s FIELD_SHADERS. The Metal sources themselves are not
 * embedded here: Swift loads prebuilt .metallib resources instead (task
 * 9.2, scripts/build-metallibs.mjs).
 */
export function writeSwiftFieldNames(fieldsToArtifacts, outPath) {
  const names = Object.keys(fieldsToArtifacts);
  const cases = names.map((n) => `        "${n}",`).join('\n');

  const source = `// GENERATED FILE — DO NOT EDIT.
// Regenerate with \`node scripts/build-shaders.mjs\`. Sourced from
// packages/orb-core/shaders/fields/*.orb via scripts/build-shaders.mjs's
// writeSwiftFieldNames.

public enum OrbicFields {
    /// Every field shipped with this build, in the same order as the web
    /// bundle's FIELD_SHADERS, so both platforms fall back to the same
    /// "first shipped field" for an unknown name.
    public static let all: [String] = [
${cases}
    ]

    /// Field used when a caller supplies a name that does not exist.
    public static var fallback: String { all[0] }
}
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, source);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fieldsDir = resolve(rootDir, 'packages/orb-core/shaders/fields');
  const compositorsDir = resolve(rootDir, 'packages/orb-core/shaders/compositors');
  const outDir = resolve(rootDir, 'packages/orb-core/shaders/generated');
  const metalOutDir = resolve(rootDir, 'Sources/Orbic/Shaders');
  const webOutPath = resolve(rootDir, 'packages/orb-web/src/generated/shaders.ts');
  const swiftFieldsOutPath = resolve(rootDir, 'Sources/Orbic/Generated/Fields.swift');
  const nativeOutPath = resolve(rootDir, 'packages/orb-native/src/generated/shaders.ts');
  const coreFieldsOutPath = resolve(rootDir, 'packages/orb-core/src/generated/fields.ts');

  // Both shapes now have their real compositor: orb.orb (task 5.1) and
  // surface.orb (task 6.4). Every shipped field is built against both.
  // Sorted: `readdirSync` order is filesystem-dependent, and it decides both
  // the key order of the generated web module and which field is the
  // "first shipped field" fallback. Unsorted, the generated files could
  // differ between machines and trip the CI freshness check spuriously.
  const fieldFiles = readdirSync(fieldsDir)
    .filter((f) => f.endsWith('.orb'))
    .sort();
  const orbCompositorFile = 'orb.orb';
  const surfaceCompositorFile = 'surface.orb';

  if (fieldFiles.length === 0) {
    console.error('No .orb field source found to build.');
    process.exit(1);
  }

  const orbCompositorSource = readFileSync(resolve(compositorsDir, orbCompositorFile), 'utf8');
  const surfaceCompositorSource = readFileSync(resolve(compositorsDir, surfaceCompositorFile), 'utf8');

  try {
    const fieldsToArtifacts = {};
    for (const fieldFile of fieldFiles) {
      const fieldSource = readFileSync(resolve(fieldsDir, fieldFile), 'utf8');
      const name = fieldFile.replace(/\.orb$/, '');

      const artifacts = buildArtifacts({
        name,
        fieldSource,
        compositors: { orb: orbCompositorSource, surface: surfaceCompositorSource },
        outDir,
        metalOutDir,
      });
      fieldsToArtifacts[name] = artifacts;

      console.log(`Wrote ${artifacts.length} artifacts to ${outDir}:`);
      for (const artifact of artifacts) {
        console.log(`  ${artifact.fileName}`);
      }
      const metalArtifacts = artifacts.filter((a) => a.target === 'metal');
      console.log(`Wrote ${metalArtifacts.length} Metal artifact(s) to ${metalOutDir} (Package.swift compiles from here):`);
      for (const artifact of metalArtifacts) {
        console.log(`  ${artifact.fileName}`);
      }
    }

    writePerFieldShaderModules(fieldsToArtifacts, dirname(webOutPath), 'glsl', 'GLSL');
    console.log(`Wrote ${Object.keys(fieldsToArtifacts).length} per-field GLSL module(s) to ${dirname(webOutPath)}/fields`);

    writeCoreFieldNames(fieldsToArtifacts, coreFieldsOutPath);
    console.log(`Wrote ${Object.keys(fieldsToArtifacts).length} field name(s) to ${coreFieldsOutPath}`);

    writePerFieldShaderModules(fieldsToArtifacts, dirname(nativeOutPath), 'sksl', 'SkSL');
    console.log(`Wrote ${Object.keys(fieldsToArtifacts).length} per-field SkSL module(s) to ${dirname(nativeOutPath)}/fields`);

    writeSwiftFieldNames(fieldsToArtifacts, swiftFieldsOutPath);
    console.log(`Wrote ${Object.keys(fieldsToArtifacts).length} field name(s) to ${swiftFieldsOutPath}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
