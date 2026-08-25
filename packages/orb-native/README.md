# @orbic/native (stub)

No source files yet — this package currently ships only `package.json` and
`tsconfig.json`. When `src/` lands:

- Restore a `"build": "tsc -b"` entry to `package.json`'s `scripts`.
- Add `{ "path": "packages/orb-native" }` back to the root `tsconfig.json`'s
  `references` array.

Both were removed because a composite TypeScript project with zero input
files fails `tsc -b` with `TS18003`.
