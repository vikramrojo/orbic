#!/usr/bin/env node
// Guards against the class of bug found while investigating task 9.6:
// SwiftPM resolves `Sources/Orbic` and `Tests/OrbicTests` by exact-case
// convention, but a case-INSENSITIVE filesystem (this dev machine, and
// GitHub's macOS runners) will silently fold e.g. `Tests/OrbicTests` and
// `tests/OrbicTests` into one directory, hiding a casing mismatch that git
// still records faithfully. On a case-sensitive checkout (any Linux
// machine, always) SwiftPM then fails to resolve the package at all.
//
// This script operates on `git ls-files` — git's recorded index — rather
// than the local filesystem, because the local filesystem's view is
// exactly what hides this bug.
//
// Two checks:
//   1. No two tracked paths collide when compared case-insensitively, at
//      any directory depth (protects against the general class of bug:
//      two distinct tracked entries that a case-insensitive filesystem
//      could not represent as two files).
//   2. The two paths SwiftPM resolves by convention — `Sources/Orbic` and
//      `Tests/OrbicTests` — are tracked with exactly that casing (protects
//      against the specific incident: a convention path silently tracked
//      under different casing).

import { execFileSync } from "node:child_process";

const REQUIRED_SPM_PREFIXES = ["Sources/Orbic/", "Tests/OrbicTests/"];

function fail(message) {
  console.error(`error: ${message}`);
  process.exitCode = 1;
}

function getTrackedPaths() {
  let output;
  try {
    output = execFileSync("git", ["ls-files"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    fail(
      "failed to run `git ls-files` — cannot verify path casing. " +
        `This is not a passing result. (${err.message})`
    );
    return null;
  }

  const paths = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (paths.length === 0) {
    fail(
      "`git ls-files` returned no tracked paths. Either nothing is committed " +
        "yet, or this ran outside a git repository / against an empty index. " +
        "Refusing to report a pass with nothing to check — that is exactly " +
        "the vacuous-green failure mode this check exists to avoid."
    );
    return null;
  }

  return paths;
}

/**
 * For every directory level present in `paths` (as git records them),
 * finds sets of siblings whose names collide when lowercased. A collision
 * at any level is reported once, at that level — no need to also flag
 * every path underneath it.
 */
function findCaseCollisions(paths) {
  // parentPath -> Map(lowercasedName -> Set(actual names seen))
  const childrenByParent = new Map();

  for (const path of paths) {
    const segments = path.split("/");
    let parent = "";
    for (const segment of segments) {
      if (!childrenByParent.has(parent)) {
        childrenByParent.set(parent, new Map());
      }
      const siblings = childrenByParent.get(parent);
      const lower = segment.toLowerCase();
      if (!siblings.has(lower)) {
        siblings.set(lower, new Set());
      }
      siblings.get(lower).add(segment);
      parent = parent === "" ? segment : `${parent}/${segment}`;
    }
  }

  const collisions = [];
  for (const [parent, siblings] of childrenByParent) {
    for (const [, actualNames] of siblings) {
      if (actualNames.size > 1) {
        collisions.push({
          parent: parent === "" ? "(repository root)" : parent,
          names: [...actualNames].sort(),
        });
      }
    }
  }
  return collisions;
}

function checkNoCaseCollisions(paths) {
  const collisions = findCaseCollisions(paths);
  if (collisions.length === 0) {
    console.log("ok: no case-colliding tracked paths found");
    return true;
  }

  fail(`found ${collisions.length} case-colliding path group(s):`);
  for (const { parent, names } of collisions) {
    console.error(
      `  under ${parent}: ${names.join(" vs ")} — these are one file/directory ` +
        "on any case-insensitive filesystem (macOS default, Windows), so a " +
        "case-sensitive checkout (Linux, and this project's own CI) sees two " +
        "different, unrelated entries instead of the one the author intended."
    );
  }
  return false;
}

function checkSwiftPMLayout(paths) {
  const missing = REQUIRED_SPM_PREFIXES.filter(
    (prefix) => !paths.some((p) => p.startsWith(prefix))
  );

  if (missing.length === 0) {
    console.log(
      `ok: SwiftPM convention paths tracked with exact casing: ${REQUIRED_SPM_PREFIXES.join(", ")}`
    );
    return true;
  }

  fail(
    "SwiftPM's Package.swift declares the `Orbic` and `OrbicTests` targets " +
      "with no explicit `path:`, so it resolves them by convention to exactly " +
      "`Sources/Orbic` and `Tests/OrbicTests`. git does not track the " +
      "following expected path(s) with that exact casing:"
  );
  for (const prefix of missing) {
    console.error(`  missing: ${prefix}`);
  }
  console.error(
    "  On a case-sensitive filesystem this is not a warning — SwiftPM's " +
      "target-source inference falls back onto the wrong directory and " +
      "`swift build` fails for the whole package, not just the affected target."
  );
  return false;
}

const paths = getTrackedPaths();
if (paths === null) {
  process.exit(1);
}

const collisionsOk = checkNoCaseCollisions(paths);
const layoutOk = checkSwiftPMLayout(paths);

process.exit(collisionsOk && layoutOk ? 0 : 1);
