---
description: Address PR Comments
---

# Workflow: Address PR Comments

This workflow guides the agent to fetch, analyze, and resolve PR review comments, pushing the fixes only after manual user approval.

## 1. Checkout the Branch
Ask the user for the PR number or URL, then run `gh pr checkout [pr_number]`.

## 2. Fetch the Comments
Retrieve both PR discussion comments and review comments for the PR. Prefer comments with file and line context when implementing requested code changes.

## 3. Identify Scope & Load Skills
Determine whether each requested change affects backend, frontend, or both. Dynamically adhere to the relevant stack conventions activated via agent.md global routing rules:
- Backend: `@skills:developer/backend`
- Frontend: `@skills:developer/frontend`

## 4. Process Comments Sequentially
For EACH actionable code-review comment, do the following strictly one at a time:
- **a. Announce:** Print the target file, line number, and the reviewer's exact comment.
- **b. Analyze:** Open the file, locate the line, determine the root issue, and decide the smallest safe change needed to resolve it.
- **c. Clarify (Conditional):** If the request is ambiguous, STOP and ask the user for clarification before coding.
- **d. Implement:** Apply only the requested change and any minimal supporting refactor needed to resolve it safely. Do not bundle unrelated refactors.

CRITICAL STOP 1: Pause here right after implementing the raw code changes for the comments. Print: "I have completed the code modifications. Do you want me to proceed to the verification and linting phase?" Wait for user confirmation.

## 5. Pre-Commit Quality & Verification Gate
Explicitly activate and run the complete validation loop mandated by `@skills:general-code-audit`. Allow the skill to handle all phase 1 structural audits, phase 2 automated linting, type-checking, and security scans.

CRITICAL STOP 2: Pause immediately after the skill completes its execution. Show a summary or git diff of what automatic formatting and linting fixes were applied. Print: "Review the automated linting/formatting fixes above. Do you approve these changes and want to proceed to drafting the commit message?" Wait for user confirmation.

## 6. Draft Commit
Print a summary of the applied fixes and draft a Conventional Commit message for the user to review.

## 7. Mandatory Manual Approval
CRITICAL STOP 3: Freeze all automated execution here. Ask the user: *"Do you approve these fixes and authorize me to push them to the PR?"* **CRITICAL:** Do not stage, commit, or push until the user explicitly approves.

## 8. Commit and Push
Once approved, stage the verified files, commit with the approved message, and run `git push` to update the Pull Request.