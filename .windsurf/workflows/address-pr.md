---
description: Address PR Comments
---

This workflow guides the agent to fetch, analyze, and resolve PR review comments, pushing the fixes only after manual user approval.

1. **Checkout the Branch:** Ask the user for the PR number, then run `gh pr checkout [pr_number]`.
2. **Fetch the Comments:** Retrieve both PR discussion comments and review comments for the PR. Prefer comments with file and line context when implementing requested code changes.
3. **Identify Scope:** Determine whether each requested change affects backend, frontend, or both. Follow the relevant project conventions:
   - Backend: TypeScript, Node.js, Express, Zod, ClickHouse, MCP SDK, Anthropic SDK, OpenAI SDK, and Vitest.
   - Frontend: React, TypeScript, Vite, React Router DOM, Recharts, CodeMirror, react-markdown, html2canvas, and jspdf.
4. **Process Comments Sequentially:** For EACH actionable code-review comment, do the following strictly one at a time:
   a. **Announce:** Print the target file, line number, and the reviewer's exact comment.
   b. **Analyze:** Open the file, locate the line, determine the root issue, and decide the smallest safe change needed to resolve it.
   c. **Clarify (Conditional):** If the request is ambiguous, STOP and ask the user for clarification before coding.
   d. **Implement:** Apply only the requested change and any minimal supporting refactor needed to resolve it safely. Do not bundle unrelated refactors.
5. **Run Verifications:** Run only the relevant repository commands for the files changed.
   - Backend changes: run `npm test` from the project root.
   - Frontend changes: run `npm --prefix frontend run build` and `npm --prefix frontend run lint` from the project root.
   - Full-stack changes: run all of the commands above.
   Fix any resulting errors autonomously before continuing.
6. **Draft Commit:** Print a summary of the applied fixes and draft a Conventional Commit message for the user to review.
7. **Mandatory Manual Approval:** STOP EXECUTION HERE. Ask the user: *"Do you approve these fixes and authorize me to push them to the PR?"* **CRITICAL:** Do not stage, commit, or push until the user explicitly approves.
8. **Commit and Push:** Once approved, stage the files, commit with the approved message, and run `git push` to update the Pull Request.
