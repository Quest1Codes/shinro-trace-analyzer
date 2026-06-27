---
description: Address Issue
---

This workflow guides the agent to systematically understand an issue, implement a fix, and open a Pull Request only after manual user approval.

1. **Fetch Issue Context:** Ask the user for the issue number. Run `gh issue view [issue_number]` to read the title, description, acceptance criteria, and reproduction steps.
2. **Identify Scope and Target Files:** Determine whether the issue is backend, frontend, or full-stack. Search the workspace for keywords, routes, components, services, or file paths mentioned in the issue to identify the smallest authoritative set of files to change.
3. **Formulate an Execution Plan:** Print a brief summary that includes the likely root cause, affected layer, files to be changed, and why the planned changes address the root cause rather than only masking symptoms.
4. **Implement the Fix:** Make the necessary code modifications. Follow project conventions for the relevant stack:
   - Backend: TypeScript, Node.js, Express, Zod, ClickHouse, MCP SDK, Anthropic SDK, OpenAI SDK, and Vitest.
   - Frontend: React, TypeScript, Vite, React Router DOM, Recharts, CodeMirror, react-markdown, html2canvas, and jspdf.
5. **Run Verifications:** Run only the relevant repository commands for the files changed.
   - Backend changes: run `bun test` from the project root.
   - Frontend changes: run `bun --cwd frontend run build` and `bun --cwd frontend run lint` from the project root.
   - Full-stack changes: run all of the commands above.
   Fix any resulting errors autonomously before continuing.
6. **Draft PR Metadata:** Generate a conventional PR title and a bulleted PR description based on the diff. Include summary, root cause, fix, and verification notes. Print this draft to the chat for the user to review.
7. **Mandatory Manual Approval:** STOP EXECUTION HERE. Ask the user: *"Do you approve this fix and authorize me to create the PR?"* **CRITICAL:** Do not stage, commit, or create the PR until the user explicitly replies with approval.
8. **Commit and Create PR:** Once approved, stage the files, commit them using Conventional Commits and include `closes #[issue_number]` in the commit body, then run `gh pr create --title "[Approved Title]" --body "[Approved Description]"` to open the PR.
