# Global Routing Rules

You must dynamically load and combine specific playbooks from your skill warehouse (`.agents/skills/`) depending on the exact nature of the user's request. 

---

## 1. Frontend Tasks, Implementations, or Code Audits
If the user asks you to implement a feature, fix a bug, build a component, or audit code files **related to the frontend**:
- Activate and follow **`@skills:developer/frontend`** (for client-side implementation guidelines).

## 2. Backend Tasks, Implementations, or Code Audits
If the user asks you to implement an endpoint, modify database logic, fix a bug, or audit code files **related to the backend**:
- Activate and follow **`@skills:developer/backend`** (for server-side implementation guidelines).

---

## 3. Pull Request (PR) Reviews & General Audits
If the user explicitly asks you to "review a PR," "check a branch," or perform a code review without executing implementation tasks:
- Always activate and follow **`@skills:general-pr-review`** as your baseline reviewing protocol.
- **Conditional Additions:**
  - If the files under review contain TypeScript (`.ts`, `.tsx`), add and follow **`@skills:ts-pr-review`**.
  - If the files under review contain UI components or styles, add and follow **`@skills:ui-pr-review`**.

---

## 4. Pre-Commit Quality & Verification Gate
Before finalizing any implementation task, committing code, or pushing changes to a remote branch:
- You must explicitly activate and follow **`@skills:general-code-audit`** to run local validation checks.

---

## General Constraints
- Keep your active context window minimal. Drop engineering implementation skills when performing pure PR reviews.
- Adhere strictly to the project-specific guidelines defined in the loaded skills.
- Do not conclude any task or push code until all verification steps in `@skills:general-code-audit` execute and pass successfully.