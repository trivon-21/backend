# Airlux backend organization workflow

Reviewed: 2026-11-18 (Asia/Colombo). The shared organization policy is maintained with the frontend roadmap to avoid two independently edited copies:

- [Reviewed guideline snapshot](https://github.com/trivon-21/frontend/blob/edc996f9bad7fbad988427de19595084099db5d5/docs/ORGANIZATION.md) — immutable link, available while baseline merges are pending.
- [Frontend migration PR #74](https://github.com/trivon-21/frontend/pull/74) — current draft and subsequent guideline updates.

After the migration is merged, use the frontend dev branch's docs/ORGANIZATION.md as the maintained source. Update this pointer when policy changes.

## Backend operating rules

Keep team authorship and workflow credit. Use linked task IDs and short-lived feature branches targeting dev; main is for tested releases. During the protected-baseline transition, this implementation PR targets dev-new temporarily and must be retargeted after baseline PR #71 merges.

The current dev ruleset, 20957116, requires zero approving reviews but restricts updates to one always-bypass user. Normal merging is blocked for the current maintainer. An authorized ruleset editor should review the shared recommendation: use PR-and-CI protection for everyday work, retain force-push/deletion protection, and avoid routine administrator bypass. No settings are changed by this guide.

Require the successful hosting check for the synthetic-data demo after the workflow is installed on the target baseline. The manually triggered legacy/domain diagnostics still fail and are not a production gate: fix the documented failures and inventory audit-role mismatch, move required suites into automatically triggered release-PR CI, and then require those checks before an actual production release. Do not require a manual-only check on every PR.

Use a written PR self-review while only one developer is active. Add one independent required reviewer when a second eligible maintainer is available. Do not make an inactive teammate a mandatory reviewer or describe AI review as human approval.

Record backend/frontend SHAs together for each release. Deploy compatible API changes first, verify readiness, then the frontend workflow. Record rollback targets. Database changes require their own migration and restore plan; never seed or reset as part of startup or a deploy build.

Keep isolated local/demo/production databases and secrets. Render Free remains a sleeping portfolio demo with jobs and external mail disabled. Record hosting ownership and transfer/recovery steps, and use fresh demo credentials. Do not share hosting account passwords.

Use one execution tracker in docs/MIGRATION.md, with paired frontend/backend task links. Spend the final five minutes of each session updating acceptance evidence, blockers, and the next action. Delete merged feature branches only after dependent PRs and documentation links are resolved; preserve branches carrying unmerged team work.

## Configuration follow-up

GOV-01 remains pending: agree organization roles and recovery ownership; correct the dev policy in both repos; merge the baselines; retarget implementation PRs; set dev as default; select exact successful CI gates; and record hosting/release ownership. Permission changes, project-board creation, review notifications, and ruleset updates are separate maintainer actions.
