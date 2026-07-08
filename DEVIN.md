# Devin Agent Routing Rules

Before starting any task, read the relevant skill file from `.agents/skills/` and follow its guidelines.

---

## 1. Frontend Tasks, Implementations, or Code Audits
If the user asks you to implement a feature, fix a bug, build a component, or audit code files **related to the frontend**:
- Read and follow `.agents/skills/developer/backend/SKILL.md` (note: frontend skill may not exist yet; use backend guidelines as fallback).

## 2. Backend Tasks, Implementations, or Code Audits
If the user asks you to implement an endpoint, modify database logic, fix a bug, or audit code files **related to the backend**:
- Read and follow `.agents/skills/developer/backend/SKILL.md`.

---

## 3. Pull Request (PR) Reviews & General Audits
If the user explicitly asks you to "review a PR," "check a branch," or perform a code review without executing implementation tasks:
- Always read and follow `.agents/skills/general-pr-review/SKILL.md` as your baseline reviewing protocol.
- **Conditional Additions:**
  - If the files under review contain TypeScript (`.ts`, `.tsx`), also read and follow `.agents/skills/ts-pr-review/SKILL.md`.
  - If the files under review contain UI components or styles, also read and follow `.agents/skills/ui-pr-review/SKILL.md`.

---

## 4. Pre-Commit Quality & Verification Gate
Before finalizing any implementation task, committing code, or pushing changes to a remote branch:
- You must explicitly read and follow `.agents/skills/general-code-audit/SKILL.md` to run local validation checks.

---

## General Constraints
- Keep your active context window minimal. Drop engineering implementation skills when performing pure PR reviews.
- Adhere strictly to the project-specific guidelines defined in the loaded skills.
- Do not conclude any task or push code until all verification steps in `.agents/skills/general-code-audit/SKILL.md` execute and pass successfully.
