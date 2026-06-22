---
name: general-code-audit
description: Default code quality and cleanliness validation checks.
triggers:
  - "reviewing a pull request"
---

# General Code Audit Guidelines

## Code Cleanliness

- Remove dead code, unreachable branches, and unused variables or imports.
- Strip leftover `console.log`, `console.debug`, and commented-out debugging blocks.
- Confirm no TODO or FIXME comments are introduced without an associated issue reference.

## Error Handling

- Verify every modified logic branch has explicit error handling.
- Ensure async functions use try/catch or propagate errors intentionally to the caller.
- Confirm error messages are descriptive and do not leak sensitive internal state.

## Naming Conventions

- Classes: `PascalCase`
- Variables, functions, methods: `camelCase`
- Files and directories: `kebab-case`
- Constants and environment variables: `UPPERCASE`

## Imports

- Place all imports at the top of the file, grouped logically (external → internal).
- Use `import type` for imports that are only referenced as types.

## Documentation

- All classes, functions, methods, fields, types, and interfaces must have JSDoc.
- Use only TypeDoc-compatible tags.
- Follow Google's Technical Writing Style Guide: active voice, present tense, concise phrasing.

## Testing (Vitest)

- Confirm new logic paths have corresponding Vitest test cases.
- Check that existing tests are not deleted or weakened without justification.
- Verify test descriptions are meaningful and match the behaviour under test.

## Git Hygiene

- Commit messages must follow the Conventional Commits format.
- The title must be brief; elaborate detail belongs in the commit body.
- Two newlines must separate the title from the body.
