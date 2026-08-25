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
import { lintShaderSource } from './lint-shader.mjs';

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

if (import.meta.url === `file://${process.argv[1]}`) {
  const fieldsDir = resolve(rootDir, 'packages/orb-core/shaders/fields');
  const compositorsDir = resolve(rootDir, 'packages/orb-core/shaders/compositors');
  const outDir = resolve(rootDir, 'packages/orb-core/shaders/generated');
  const metalOutDir = resolve(rootDir, 'Sources/Orbic/Shaders');
  const webOutPath = resolve(rootDir, 'packages/orb-web/src/generated/shaders.ts');

  // Both shapes now have their real compositor: orb.orb (task 5.1) and
  // surface.orb (task 6.4). Every shipped field is built against both.
  const fieldFiles = readdirSync(fieldsDir).filter((f) => f.endsWith('.orb'));
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

    writeWebShaderModule(fieldsToArtifacts, webOutPath);
    console.log(`Wrote ${Object.keys(fieldsToArtifacts).length} field(s) to ${webOutPath}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
