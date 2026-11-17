# Airlux backend organization workflow

Reviewed: 2026-11-18 (Asia/Colombo). The shared organization policy is maintained with the frontend roadmap to avoid two independently edited copies:

- [Maintained organization guide](https://github.com/trivon-21/frontend/blob/dev/docs/ORGANIZATION.md).
- [Frontend implementation PR #74](https://github.com/trivon-21/frontend/pull/74) records the transition and checks.

## Backend operating rules

Keep team authorship and workflow credit. Use linked task IDs and short-lived feature branches targeting dev; main is for tested releases. Baseline PR #71 is merged; the implementation PR now targets dev. dev is the GitHub default in both repos.

The dev ruleset (20957116, now `dev / PR and CI`) previously blocked ordinary merges through Restrict updates and a single bypass user. At the user’s request that update lock was removed while retaining PR, deletion, and force-push protection. Resolved review threads and the GitHub Actions hosting check (app 15368) are required, with up-to-date branches and zero mandatory approvals for solo development. Existing bypass actors remain unchanged; no administrator bypass was used. main retains its release freeze.

Require the successful hosting check for the synthetic-data demo after the workflow is installed on the target baseline. The manually triggered legacy/domain diagnostics still fail and are not a production gate: fix the documented failures and inventory audit-role mismatch, move required suites into automatically triggered release-PR CI, and then require those checks before an actual production release. Do not require a manual-only check on every PR.

Use a written PR self-review while only one developer is active. Add one independent required reviewer when a second eligible maintainer is available. Do not make an inactive teammate a mandatory reviewer or describe AI review as human approval.

Record backend/frontend SHAs together for each release. Deploy compatible API changes first, verify readiness, then the frontend workflow. Record rollback targets. Database changes require their own migration and restore plan; never seed or reset as part of startup or a deploy build.

Keep isolated local/demo/production databases and secrets. Render Free remains a sleeping portfolio demo with jobs and external mail disabled. Record hosting ownership and transfer/recovery steps, and use fresh demo credentials. Do not share hosting account passwords.

Use one execution tracker in docs/MIGRATION.md, with paired frontend/backend task links. Spend the final five minutes of each session updating acceptance evidence, blockers, and the next action. Delete merged feature branches only after dependent PRs and documentation links are resolved; preserve branches carrying unmerged team work.

## Configuration follow-up

GOV-01 dev policy, baseline merges, PR retargeting, default branches, and exact CI gates are configured. GOV-02 remains pending for organization roles/recovery access, hosting ownership, and main release readiness. Organization membership, bypass membership, project boards, and reviewer assignments were not changed.
