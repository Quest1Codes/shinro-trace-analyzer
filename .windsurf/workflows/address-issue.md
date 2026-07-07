# Workflow: Address Issue

This workflow guides the agent to systematically understand an issue, implement a fix, perform rigorous pre-commit validation, and open a Pull Request only after manual user approval.

## 1. Fetch Issue Context
Ask the user for the issue number or URL. Run `gh issue view [issue_number]` to read the title, description, acceptance criteria, and reproduction steps.

## 2. Identify Scope and Target Files
Determine whether the issue is backend, frontend, or full-stack. Search the workspace for keywords, routes, components, services, or file paths mentioned in the issue to identify the smallest authoritative set of files to change.

## 3. Formulate an Execution Plan
Print a brief summary that includes the likely root cause, affected layer, files to be changed, and why the planned changes address the root cause rather than only masking symptoms.
CRITICAL STOP 1: Pause here and print: "Do you approve this execution plan?" Wait for explicit user confirmation before modifying any files.

## 4. Implement the Fix
Make the necessary code modifications. Dynamically adhere to the relevant stack conventions activated via agent.md global routing rules:
- Backend: `@skills:developer/backend`
- Frontend: `@skills:developer/frontend`
CRITICAL STOP 2: Pause here right after implementing the raw code changes. Print: "I have completed the code modifications. Do you want me to proceed to the verification and linting phase?" Wait for user confirmation.

## 5. Pre-Commit Quality & Verification Gate
Explicitly activate and run the complete validation loop mandated by `@skills:general-code-audit`. Allow the skill to handle all phase 1 structural audits, phase 2 automated linting, type-checking, and security scans.
CRITICAL STOP 3: Pause immediately after the skill completes its execution. Show a summary or git diff of what automatic formatting and linting fixes were applied by the toolchain. Print: "Review the automated linting/formatting fixes above. Do you approve these changes and want to proceed to drafting the PR metadata?" Wait for user confirmation.

## 6. Draft PR Metadata
Generate a conventional PR title and a bulleted PR description based on the clean git diff. Include summary, root cause, fix, and verification notes. Print this draft to the chat for the user to review.

## 7. Mandatory Manual Approval
CRITICAL STOP 4: Freeze all automated execution here. Ask the user: "Do you approve this fix and authorize me to create the PR?" Do not stage, commit, or push until the user explicitly replies with approval.

## 8. Commit and Create PR
Once approved, stage the verified files and commit them using Conventional Commits (including `closes #[issue_number]` in the commit body). Run `gh pr create --title "[Approved Title]" --body "[Approved Description]"` to open the PR.