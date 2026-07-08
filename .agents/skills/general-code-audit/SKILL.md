---
name: general-code-audit
description: Mandated local code quality, security, and logical validation checks executed prior to any git commit or push.
---

# Global Code Audit & Pre-Commit Protocol

You must autonomously execute this two-phase validation suite locally. Resolve all flagged issues before staging or committing any code changes. Act as your own rigorous code reviewer.

## Phase 1: Logical & Structural Audit (Manual)

Before running automated tools, you must verify the following architectural standards that a linter cannot catch.

### 1. Code Cleanliness & State
- Strip leftover `console.log`, `console.debug`, and commented-out debugging blocks.
- Confirm no `TODO` or `FIXME` comments are introduced without an associated issue reference.

### 2. Error Handling
- Verify every modified logic branch has explicit error handling.
- Ensure async functions use `try/catch` or propagate errors intentionally to the caller.
- Confirm error messages are descriptive and do not leak sensitive internal state to the client.

### 3. Documentation
- All newly created classes, functions, methods, fields, types, and interfaces must have JSDoc.
- Use only TypeDoc-compatible tags.
- Follow Google's Technical Writing Style Guide: active voice, present tense, concise phrasing.

### 4. Testing (Vitest)
- Confirm new logic paths have corresponding Vitest test cases.
- Check that existing tests are not deleted or weakened without explicit justification.
- Verify test descriptions are meaningful and accurately match the behavior under test.

---

## Phase 2: Static Analysis (Automated Terminal Validation)

As your final quality gate, you must run these static code analysis commands in the terminal to catch syntax, type, and security issues—including any accidental errors introduced during Phase 1. You must resolve all failures.

### 1. Type Verification (TypeScript)
* **Command:** `cd frontend && bunx tsc --noEmit --strict` (TypeScript config lives in `frontend/`)
* **Action Required:** Analyze the compiler output. You must resolve all type errors, null safety warnings, and interface mismatches before proceeding. Do not ignore strict compiler warnings.

### 2. Auto-Fixing & Manual Lint Review
* **Commands:** Run `bunx eslint . --fix` first, followed by `bun run lint` — both from the **project root**. These cover both `backend/` and `frontend/src/`.
* **Action Required:** Allow the `--fix` command to handle formatting, imports, naming conventions, and stylistic adjustments automatically. Next, evaluate the output of `bun run lint` to catch structural anti-patterns, React lifecycle issues, or dead objects. Resolve all legitimate violations manually.

### 3. Targeted Security Scanning
* **Command:** `semgrep scan --config p/typescript --config p/javascript --config p/owasp-top-ten --config p/nodejsscan --config p/react <filename>`
* **Action Required:** Replace `<filename>` with the specific paths of the files you modified. Inspect the output for vulnerabilities (e.g., XSS, injection vectors). Patch all identified security risks locally before staging.

---

## Git Hygiene (Final Step)

- Commit messages must strictly follow the Conventional Commits format (e.g., `feat:`, `fix:`, `chore:`).
- The title must be brief; elaborate detail belongs in the commit body.
- Two newlines must separate the title from the body.