#!/usr/bin/env node
// Generates Sources/Orbic/Presets.swift from packages/orb-core/src/presets.json.
// presets.json is the single source of truth; this script performs no tuning
// decisions of its own, only a data-format translation.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url)) + '/..';
const presetsPath = resolve(rootDir, 'packages/orb-core/src/presets.json');
const outPath = resolve(rootDir, 'Sources/Orbic/Presets.swift');

const presetsData = JSON.parse(readFileSync(presetsPath, 'utf8'));

const channels = presetsData.channels;
const presetNames = Object.keys(presetsData.presets);
const springKeys = Object.keys(presetsData.springs);

function swiftNumber(n) {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

const presetCases = presetNames.map((name) => `    case ${name}`).join('\n');

const channelEntries = presetNames.map((name) => {
  const values = presetsData.presets[name];
  const args = channels.map((c) => `${c}: ${swiftNumber(values[c])}`).join(', ');
  return `        .${name}: OrbicChannels(${args}),`;
});

const springEntries = springKeys.map((key) => {
  const params = presetsData.springs[key];
  return `        "${key}": OrbicSpringParams(stiffness: ${swiftNumber(params.stiffness)}, damping: ${swiftNumber(params.damping)}, mass: ${swiftNumber(params.mass)}),`;
});

const swift = `// GENERATED FILE — DO NOT EDIT.
// Regenerate with \`node scripts/build-presets.mjs\` from packages/orb-core/src/presets.json,
// the single source of truth for Orbic's preset and spring data.

import Foundation

public enum OrbicPreset: String, CaseIterable, Sendable {
${presetCases}
}

public struct OrbicChannels: Sendable, Equatable {
    public let energy: Double
    public let coherence: Double
    public let warmth: Double
    public let pulse: Double

    public init(energy: Double, coherence: Double, warmth: Double, pulse: Double) {
        self.energy = energy
        self.coherence = coherence
        self.warmth = warmth
        self.pulse = pulse
    }
}

public struct OrbicSpringParams: Sendable, Equatable {
    public let stiffness: Double
    public let damping: Double
    public let mass: Double

    public init(stiffness: Double, damping: Double, mass: Double) {
        self.stiffness = stiffness
        self.damping = damping
        self.mass = mass
    }
}

public enum OrbicPresets {
    /// Fixed integrator substep, in seconds: semi-implicit Euler at 1/120 s.
    public static let fixedSubstep: Double = 1.0 / 120.0

    public static let channels: [OrbicPreset: OrbicChannels] = [
${channelEntries.join('\n')}
    ]

    /// Keyed as "\\(from)>\\(to)", e.g. "subtle>active". Falls back to "default".
    public static let springs: [String: OrbicSpringParams] = [
${springEntries.join('\n')}
    ]

    /// Resolves a (from, to) transition to its spring parameters, falling back to \`default\`.
    public static func spring(from: OrbicPreset, to: OrbicPreset) -> OrbicSpringParams {
        let key = "\\(from.rawValue)>\\(to.rawValue)"
        return springs[key] ?? springs["default"]!
    }
}
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, swift);

console.log(`Wrote ${presetNames.length} presets and ${springKeys.length} spring entries to ${outPath}`);
