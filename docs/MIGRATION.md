# Airlux Spartan and hosting sprint

Updated: 2026-11-18 (Asia/Colombo). Repository: backend. Baseline: `a3dca5a`. Working branch: `feat/demo-hosting`.

## Goal and schedule
Continue the team-created application within Trivon. Deliver a hosted synthetic-data demo with actual Spartan controls and inventory dispatch as the reference screen. Budget 14 one-hour sessions; allow 18–24 hours if upgrades/deployment block progress. Full portal migration is follow-up work.

## Team credit
The original team designed and implemented the application and business workflows. Sathnuwan Dassana is continuing development, UI migration, deployment preparation, and maintenance. Preserve all Git authorship. Planned work is not completed contribution evidence.

## Baseline
- The current application baseline is merged into remote dev through PRs. dev is the default in both repositories. PR, required GitHub Actions checks, up-to-date branches, resolved review threads, deletion protection, and force-push protection are enforced.
- Frontend baseline: production build and 207 unit tests passed in an isolated audit.
- Backend baseline: npm ci lock mismatch; diagnostic legacy tests 99 pass / 3 fail and lingering work; domain tests 78 pass / 1 fail. Diagnostic install was not lockfile-reproducible.
- No root AI instructions were present on dev-new.
- No live data is needed; use isolated synthetic demo data.

## Decisions
- Keep Angular and business workflows; use Spartan Brain/Helm, Tailwind 4, Angular 22 after sequential major upgrades.
- Keep two repositories. dev is integration; main is release. No full contributor-branch consolidation in this sprint.
- Vercel frontend + Render Free backend + isolated Atlas demo data. Free hosting is a demo, not guaranteed background processing.
- Preserve existing payment-slip persistence; do not add storage migration unless an active filesystem dependency blocks hosting.
- CI reports existing test failures honestly; required hosting checks must pass. PR validation targets dev and main. The temporary dev-new target was removed after baseline integration.

## Tasks
| ID | Task | Status | Acceptance |
|---|---|---|---|
| S01 | Baseline, guidance, and branch setup | Configured remotely | Tracked docs; clean history; defaults unchanged until reviewed |
| S02 | Angular 21 upgrade | Implemented; linked PR | Build/tests pass |
| S03 | Angular 22 and icon upgrade | Implemented; linked PR | Compatible peer dependencies; build/tests pass |
| S04 | Tailwind 4 migration | Implemented; linked PR | Existing styles remain usable |
| S05 | Spartan generation | Implemented; linked PR | Real generated components render |
| S06 | Airlux theme | Implemented; linked PR | Semantic tokens and legacy compatibility |
| S07 | Dispatch list migration | Implemented; linked PR | Search/actions use Spartan |
| S08 | Dispatch dialogs | Implemented; linked PR | API behavior, keyboard focus, and errors preserved |
| S09 | Backend installation/config | Implemented; linked PR | Reproducible ci; safe demo config |
| S10 | Render configuration | Configured; account connection pending | Ready endpoint and reproducible service configuration |
| S11 | Vercel configuration | Configured; account connection pending | Build-time API URL; nested route refresh |
| S12 | CI | Implemented; linked PR | Frontend build/tests; backend hosting checks; visible legacy failures |
| S13 | Verification | Local checks passed; hosted checks pending | Builds, HTTP contracts, mobile/keyboard checks |
| S14 | Release and evidence | Screenshots ready; public release pending | Published URLs and PR/release links, or explicitly recorded external blockers |

## Contribution evidence
Implemented continuation work: tracked Codex guidance and a one-hour task plan; Angular 20→21→22 migrations; maintained icon adapter; Tailwind 4; generated Spartan pilot and theme; responsive inventory navigation; production API configuration; Vercel/Render manifests; CI and browser checks; reproducible Node/npm backend installation; explicit job registration; non-delivering demo mail; guarded synthetic seeding and readiness checks. Team workflow design and original business logic remain credited to the original contributors.

### Verification (2026-11-18)
- Angular 21: production build and 207/207 unit tests passed before moving to 22.
- Angular 22/Tailwind 4/Spartan: production build passed without increasing existing error budgets. Initial bundle is approximately 2.95 MB, above the 2.5 MB warning but below the 3 MB error; the pre-existing product-detail CSS warning remains.
- Frontend npm ci succeeded; 207/207 unit tests passed on the new dependencies.
- Browser checks: 3/3 passed for focus trapping/restoration, HTTP payload/error preservation, retry/search, and mobile layout. Screenshots visually inspected.
- Backend npm ci and 4/4 hosting checks passed.
- Real disposable MongoDB replica-set verification: synthetic customer/finance/inventory login succeeded; non-inventory dispatch access returned 403; reservation→assignment→handover→completion succeeded; stale version returned 409.
- Existing legacy suite remains 99 passing / 3 failing (schema expectations, purchase-report query timeout, service history); domain suite remains 78 passing / 1 failing (audit-scope coverage). The diagnostic Mocha run additionally executed 14 Node tests and waited for existing query timers. These are not reported as passing release checks.
- Deployment build passed with a synthetic HTTPS API URL; missing, HTTP/localhost, incorrect-path, and query-bearing API settings were rejected.
- Spartan healthcheck passed all checks; its optional Prettier formatting step was unavailable and made no changes.
- Real login verification also exposed an existing non-blocking audit-log enum mismatch for the INVENTORY role: login succeeds, but its audit entry is rejected. Track this as a follow-up; no audit behavior is silently changed in the hosting work.
- No public deployment or production database migration has been performed.

### Deployment prerequisites
Vercel, Render, and Atlas connections are not configured in this session. Connect the accounts, supply an isolated Atlas URI and demo password through local/platform secrets, configure Render's exact frontend origin(s), verify backend health, seed demo data, then set Vercel AIRLUX_API_URL and deploy. Use the native Git integrations for subsequent dev updates. Existing diagnostic failures must be resolved before a production release; the required demo CI checks are deliberately separate from those diagnostics.

### Branch and release evidence
Baseline PRs [frontend #73](https://github.com/trivon-21/frontend/pull/73) and [backend #71](https://github.com/trivon-21/backend/pull/71) were merged normally with merge commits, preserving authorship. Implementation PRs [frontend #74](https://github.com/trivon-21/frontend/pull/74) and [backend #72](https://github.com/trivon-21/backend/pull/72) target dev; their live status records checks and merge results. dev is now the default branch in both repos. No history was reset and no administrator merge bypass was used. Historical source contains a deleted .env; use fresh demo secrets and review any old credentials separately without republishing them.

## Handoff
Review the linked PR statuses and start subsequent feature branches from the latest dev after implementation merges. Continue with hosting account access and isolated demo environment setup; do not claim a public URL until it is verified. After deployment, record the real URLs, paired SHAs, hosted smoke-test results, and rollback targets. Keep remaining portal migration and existing backend diagnostic failures in follow-up tasks.

## Organization follow-up

GOV-01 (applied 2026-11-18 at the user's request): removed Restrict updates from both dev rulesets; retained PR, deletion, force-push protections and existing bypass membership; required resolved conversations; added strict required GitHub Actions checks (frontend build-and-test, backend hosting, app ID 15368); merged the baseline PRs; retargeted implementation PRs; set dev as default. The old update lock had blocked ordinary merges even with zero required approvals. Normal baseline merges verified the correction without an administrator override.

The main rulesets retain their intentional release freeze until history reconciliation and release verification. Organization membership and existing bypass actors were not changed. GOV-02 remains pending for broader governance: recovery ownership/access review, hosting ownership, and release readiness. See [organization guidelines](ORGANIZATION.md).
