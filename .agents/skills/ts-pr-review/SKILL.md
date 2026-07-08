---
name: ts-pr-review
description: Comprehensive review guidelines for analyzing TypeScript code changes.
---

# TypeScript PR Review Guidelines

## Workflow

1. Read the PR description and linked issue before examining the diff.
2. Identify the change scope: backend-only (`.ts`), frontend-only (`.tsx`), or full-stack.
3. Apply all sections below in order; flag every finding with a severity — **blocking**, **suggestion**, or **nit**.
4. Summarise findings in the Output Format section at the end of your review.

## Style & TS Conventions

- Files and directories use `kebab-case`; classes use `PascalCase`; variables and functions use `camelCase`; constants and env vars use `UPPERCASE`.
- All imports must appear at the top of the file, grouped: external packages → internal modules.
- Use `import type` for any import that is only referenced as a type.
- The project uses `"type": "module"` — all imports must use explicit file extensions (e.g., `.js`) where required; no `require()` or CommonJS patterns.
- Prefer arrow functions for simple operations; use default parameters and object destructuring where appropriate.
- All code — classes, functions, methods, fields, types, interfaces — must have JSDoc using only TypeDoc-compatible tags.

## Type Safety & Correctness

- Prohibit explicit or implicit `any`; enforce precise types or `unknown` with narrowing.
- Use `readonly` on all properties that are not intentionally mutated.
- Prefer Zod schema definitions for all new types; derive the TypeScript type via `z.infer<typeof Schema>`.
- Validate all external inputs (HTTP request bodies, query params, ClickHouse results) with a Zod schema before use.
- Do not cast or assert types after an unvalidated boundary — parse, don't cast.
- Prefer `z.object({ ... }).strict()` for request payloads to reject unknown keys.
- Confirm every Express route handler has a typed `Request` and `Response` from `@types/express`.

## Errors & Logging

- Every modified logic branch must have explicit error handling.
- Async functions must use `try/catch` or propagate errors intentionally to the caller.
- Express error-handling middleware must be invoked via `next(err)`, never swallowed inline.
- All async route handlers must be wrapped to propagate rejected promises to Express's error handler.
- Error messages must be descriptive and must not leak sensitive internal state (stack traces, DB queries, API keys).
- No `console.log` or `console.debug` left in committed code; use a structured logger or remove entirely.

## Security

- ClickHouse (`@clickhouse/client`) queries must be parameterised — no raw string interpolation of user-supplied input.
- Confirm no secrets, API keys, or credentials are hardcoded; they must be read from environment variables (`UPPERCASE`).
- Review Anthropic SDK (`@anthropic-ai/sdk`) and OpenAI SDK (`openai`) prompts to ensure user input is not injected unsanitised into system prompts.
- MCP SDK (`@modelcontextprotocol/sdk`) tool registrations must validate all incoming arguments with Zod before execution.

## Async & Concurrency

- Replace sequential `await` chains with `Promise.all()` wherever calls are independent.
- Ensure Anthropic SDK, OpenAI SDK, and MCP SDK calls handle rate-limit (`429`) and network errors explicitly with retry or graceful degradation.
- Confirm ClickHouse streaming responses are properly closed/consumed to avoid resource leaks.
- Avoid unhandled promise rejections — every `Promise` chain must have a `.catch()` or be awaited inside `try/catch`.

## Testing

- New logic paths must have corresponding Vitest test cases.
- Existing tests must not be deleted or weakened without explicit justification.
- Tests that depend on ClickHouse must use `@testcontainers/clickhouse` to avoid coupling to a live instance.
- Test descriptions must be meaningful and match the exact behaviour under test.
- Confirm test coverage is not reduced by the PR changes.

## Project Conventions

- Commit messages must follow Conventional Commits format; the title must be brief with elaboration in the body, separated by two newlines.
- No TODO or FIXME comments without an associated issue reference.
- Dead code, unused imports, and unreachable branches must be removed before merge.
- Documentation follows Google's Technical Writing Style Guide: active voice, present tense, concise phrasing.

## Output Format

Structure your review findings as follows:

```
## Review Summary

**Scope:** <backend | frontend | full-stack>
**Skills Applied:** <list of skill names used>

### Blocking
- <file>:<line> — <description>

### Suggestions
- <file>:<line> — <description>

### Nits
- <file>:<line> — <description>

### Verdict
<APPROVE | REQUEST_CHANGES | COMMENT>
```
