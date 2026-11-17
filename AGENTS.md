# Airlux backend: agent instructions

Read README.md, docs/MIGRATION.md, and docs/ORGANIZATION.md before editing. Update the task board and handoff at the end of each task.

## Working agreements
- Team-owned application in trivon-21. Preserve original authorship, workflows, API paths, status values, and permissions.
- Organization settings in the guide are recommendations: do not apply permission/ruleset changes as part of an unrelated task. Do not bypass protected refs to get a merge through.
- Integrate through short-lived branches targeting `dev`; `main` is for verified releases. Do not reset history or bulk-merge old branches.
- Pin dependencies and lockfiles. Use Node 24 (see .nvmrc) and npm 11. Never bypass peer dependencies.
- Work in coherent tasks that a developer can review in a one-hour session. Avoid unrelated rewrites.
- Record actual checks; distinguish passed, failed, skipped, and unverified. Never hide existing failures.
- Do not commit secrets or account credentials. Do not reset, seed, or migrate an unspecified database.
- Preserve team attribution. Credit Sathnuwan Dassana only for verified continuation work, with PR/release evidence when available.

## Architecture and checks
Express/Mongoose application: src/app.js composes HTTP; src/server.js owns startup; src/modules contains domain features. Keep imports free of background job registration. Demo deployments disable scheduled jobs and external mail.

Run `npm ci`, `npm run test:hosting`, `npm run test:domain`, and `npm run test:legacy`. Existing domain/legacy failures are tracked separately. Integration tests reset their database: use only the explicitly isolated audit database and run serially. No forced process exit to conceal lingering handles.
