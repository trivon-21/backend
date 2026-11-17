# Airlux Spartan and hosting sprint

Updated: 2026-11-18 (Asia/Colombo). Repository: backend. Baseline: `a3dca5a`. Working branch: `feat/demo-hosting`.

## Goal and schedule
Continue the team-created application within Trivon. Deliver a hosted synthetic-data demo with actual Spartan controls and inventory dispatch as the reference screen. Budget 14 one-hour sessions; allow 18–24 hours if upgrades/deployment block progress. Full portal migration is follow-up work.

## Team credit
The original team designed and implemented the application and business workflows. Sathnuwan Dassana is continuing development, UI migration, deployment preparation, and maintenance. Preserve all Git authorship. Planned work is not completed contribution evidence.

## Baseline
- Both local dev branches fast-forwarded from origin/dev to origin/dev-new. GitHub protects dev and requires PRs; no direct update or rules bypass is used. Remote/default changes are recorded below after confirmation.
- Frontend baseline: production build and 207 unit tests passed in an isolated audit.
- Backend baseline: npm ci lock mismatch; diagnostic legacy tests 99 pass / 3 fail and lingering work; domain tests 78 pass / 1 fail. Diagnostic install was not lockfile-reproducible.
- No root AI instructions were present on dev-new.
- No live data is needed; use isolated synthetic demo data.

## Decisions
- Keep Angular and business workflows; use Spartan Brain/Helm, Tailwind 4, Angular 22 after sequential major upgrades.
- Keep two repositories. dev is integration; main is release. No full contributor-branch consolidation in this sprint.
- Vercel frontend + Render Free backend + isolated Atlas demo data. Free hosting is a demo, not guaranteed background processing.
- Preserve existing payment-slip persistence; do not add storage migration unless an active filesystem dependency blocks hosting.
- CI reports existing test failures honestly; required hosting checks must pass. PR validation also accepts dev-new temporarily while the protected baseline PRs await merge.

## Tasks
| ID | Task | Status | Acceptance |
|---|---|---|---|
| S01 | Baseline, guidance, and branch setup | Local complete; protected baseline PR pending | Tracked docs; clean history; defaults unchanged until reviewed |
| S02 | Angular 21 upgrade | Implemented locally | Build/tests pass |
| S03 | Angular 22 and icon upgrade | Implemented locally | Compatible peer dependencies; build/tests pass |
| S04 | Tailwind 4 migration | Implemented locally | Existing styles remain usable |
| S05 | Spartan generation | Implemented locally | Real generated components render |
| S06 | Airlux theme | Implemented locally | Semantic tokens and legacy compatibility |
| S07 | Dispatch list migration | Implemented locally | Search/actions use Spartan |
| S08 | Dispatch dialogs | Implemented locally | API behavior, keyboard focus, and errors preserved |
| S09 | Backend installation/config | Implemented locally | Reproducible ci; safe demo config |
| S10 | Render configuration | Configured; account connection pending | Ready endpoint and reproducible service configuration |
| S11 | Vercel configuration | Configured; account connection pending | Build-time API URL; nested route refresh |
| S12 | CI | Implemented locally | Frontend build/tests; backend hosting checks; visible legacy failures |
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
Feature branches: frontend feat/spartan-demo; backend feat/demo-hosting. Baseline PRs: [frontend #73](https://github.com/trivon-21/frontend/pull/73), [backend #71](https://github.com/trivon-21/backend/pull/71). Direct push and normal PR merge were rejected by existing branch rules. No administrator bypass was used. Remote dev/default branches remain unchanged. Implementation PRs: [frontend #74](https://github.com/trivon-21/frontend/pull/74), [backend #72](https://github.com/trivon-21/backend/pull/72). They temporarily target dev-new to isolate the code review; retarget to dev after an authorized maintainer merges the baseline PRs. Change the default branch to dev only after that baseline is established. No attribution has been rewritten. Historical source contains a deleted .env; use fresh demo secrets and review any old credentials separately without republishing them.

## Handoff
Implementation is on the feature branches listed above. Review docs/assets in the frontend for the pilot previews. Continue with hosting account connections and isolated demo environment setup; do not claim a public URL until it is verified. After deployment, update this document with the real URLs, frontend/backend SHAs, hosted smoke-test results, and rollback targets. Keep unrelated portal migration and existing backend diagnostic failures in follow-up tasks.

## Organization follow-up

Organization guidelines are recorded in [docs/ORGANIZATION.md](ORGANIZATION.md). The dev ruleset currently requires zero approvals but restricts updates to a single always-bypass actor; baseline merging is blocked for the current maintainer. Recommended remediation is normal PR/CI protection, with force-push/deletion protections retained, rather than routine administrator bypass.

GOV-01 (pending, authorized ruleset editor): review overlapping rules, agree the policy, apply it to both repos, complete the baseline PRs, retarget the implementation PRs, and then establish dev as default with exact working CI gates. Organization permissions, project boards, reviewer assignments, and hosting ownership have not been changed by the documentation update.
