#!/usr/bin/env node
// Lints a portable Orbic shader source (a field or compositor body, written
// once against the portable subset in docs/shader-abi.md) and rejects
// anything that would not compile identically across GLSL ES, SkSL and MSL.
//
// This is intentionally a set of targeted static checks over the source
// text, not a full GLSL parser — the portable subset is deliberately small
// (see docs/shader-abi.md), and the checks below cover exactly the
// constructs it bans.

/**
 * Replaces `//` and `/* *\/` comment bodies with spaces (newlines kept, so
 * line numbers stay accurate), so comment text — including this project's
 * own doc comments about what's banned — never triggers a false positive.
 */
export function stripComments(source) {
  let result = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') {
        result += ' ';
        i++;
      }
    } else if (source[i] === '/' && source[i + 1] === '*') {
      result += '  ';
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        result += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        result += '  ';
        i += 2;
      }
    } else {
      result += source[i];
      i++;
    }
  }
  return result;
}

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function findAll(source, regex) {
  const matches = [];
  const re = new RegExp(regex, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m;
  while ((m = re.exec(source)) !== null) {
    matches.push(m);
    if (m[0].length === 0) re.lastIndex++;
  }
  return matches;
}

/** Parses `const int|float|uint NAME = LITERAL;` declarations into a name -> literal-text map. */
function parseConstLiterals(source) {
  const consts = new Map();
  for (const m of findAll(source, /\bconst\s+(?:int|float|uint)\s+([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g)) {
    consts.set(m[1], m[2]);
  }
  return consts;
}

function isCompileTimeConstant(token, consts) {
  const trimmed = token.trim();
  if (trimmed === '') return true; // e.g. an unsized `[]` — not this rule's concern
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return true;
  return consts.has(trimmed);
}

/** Counts top-level (paren-depth-0) comma-separated arguments in a call's argument text. */
function countTopLevelArgs(argsText) {
  const trimmed = argsText.trim();
  if (trimmed === '') return 0;
  let depth = 0;
  let count = 1;
  for (const ch of trimmed) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

/** Finds calls to `name(...)`, returning each call's full argument text and its start index. */
function findCalls(source, name) {
  const calls = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(source)) !== null) {
    const openIndex = m.index + m[0].length - 1;
    let depth = 1;
    let i = openIndex + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
    calls.push({ index: m.index, argsText: source.slice(openIndex + 1, i - 1) });
  }
  return calls;
}

const RULES = {
  preprocessorDirective: (line) => /^\s*#/.test(line),
};

/**
 * Lints a portable shader source and returns a list of violations. An empty
 * array means the source is within the portable subset.
 */
export function lintShaderSource(source) {
  const violations = [];
  const push = (rule, message, index) => {
    violations.push({ rule, message, line: index !== undefined ? lineAt(source, index) : undefined });
  };

  const stripped = stripComments(source);

  // Preprocessor directives (checked per-line on the comment-stripped text).
  stripped.split('\n').forEach((line, i) => {
    if (RULES.preprocessorDirective(line)) {
      push(
        'preprocessor-directive',
        `line ${i + 1}: preprocessor directives are not portable (SkSL has essentially no preprocessor)`
      );
    }
  });

  // `uniform` declarations — all uniform plumbing lives in preambles/epilogues.
  for (const m of findAll(stripped, /\buniform\b/g)) {
    push(
      'uniform-declaration',
      `line ${lineAt(source, m.index)}: \`uniform\` declarations are not allowed in a field or compositor — uniform plumbing lives entirely in per-platform preambles and epilogues`,
      m.index
    );
  }

  // Texture sampling — no target guarantees a bound texture for a field.
  for (const m of findAll(stripped, /\btexture(2D|Cube|Grad|Proj|Lod)?\s*\(/g)) {
    push(
      'texture-sampling',
      `line ${lineAt(source, m.index)}: texture sampling ("${m[0].trim()}") is not allowed — no target guarantees a bound texture for a field`,
      m.index
    );
  }

  // `discard`.
  for (const m of findAll(stripped, /\bdiscard\b/g)) {
    push('discard', `line ${lineAt(source, m.index)}: \`discard\` is not allowed in a field or compositor`, m.index);
  }

  // `while` loops of any kind.
  for (const m of findAll(stripped, /\bwhile\s*\(/g)) {
    push(
      'while-loop',
      `line ${lineAt(source, m.index)}: \`while\` loops are not allowed — use a \`for\` loop with a compile-time constant bound`,
      m.index
    );
  }

  // Bare `mod(` — must be `oMod(` instead (see docs/shader-abi.md).
  for (const m of findAll(stripped, /\bmod\s*\(/g)) {
    push(
      'bare-mod',
      `line ${lineAt(source, m.index)}: bare \`mod(\` is not allowed — call \`oMod(\` instead (GLSL \`mod\` and Metal \`fmod\` disagree on negative operands)`,
      m.index
    );
  }

  // Two-argument `atan(` — must be `oAtan2(` instead.
  for (const call of findCalls(stripped, 'atan')) {
    if (countTopLevelArgs(call.argsText) === 2) {
      push(
        'two-arg-atan',
        `line ${lineAt(source, call.index)}: two-argument \`atan(\` is not allowed — call \`oAtan2(y, x)\` instead (GLSL/SkSL spell this \`atan(y, x)\`, Metal spells it \`atan2(y, x)\`)`,
        call.index
      );
    }
  }

  // Dynamic (non-compile-time-constant) array indexing.
  const consts = parseConstLiterals(stripped);
  for (const m of findAll(stripped, /([A-Za-z_]\w*)\s*\[\s*([^[\]]*)\s*\]/g)) {
    const index = m[2];
    if (!isCompileTimeConstant(index, consts)) {
      push(
        'dynamic-index',
        `line ${lineAt(source, m.index)}: dynamic array index \`${m[1]}[${index.trim()}]\` is not allowed — indices must be compile-time constants`,
        m.index
      );
    }
  }

  // `for` loops must have a compile-time constant bound.
  for (const m of findAll(stripped, /\bfor\s*\(([^)]*)\)/g)) {
    const parts = m[1].split(';');
    const condition = (parts[1] ?? '').trim();
    const boundMatch = condition.match(/^[A-Za-z_]\w*\s*(<=|<|>=|>|!=)\s*(.+)$/);
    const bound = boundMatch ? boundMatch[2].trim() : undefined;
    if (bound === undefined || !isCompileTimeConstant(bound, consts)) {
      push(
        'unbounded-for',
        `line ${lineAt(source, m.index)}: \`for\` loop bound must be a compile-time constant, found condition \`${condition || '(none)'}\``,
        m.index
      );
    }
  }

  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/lint-shader.mjs <file>');
    process.exit(2);
  }
  const source = readFileSync(path, 'utf8');
  const violations = lintShaderSource(source);
  if (violations.length === 0) {
    console.log(`${path}: OK (0 violations)`);
    process.exit(0);
  }
  console.error(`${path}: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.message}`);
  }
  process.exit(1);
}
