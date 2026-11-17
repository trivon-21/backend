# Airlux backend

Airlux is a team-created application in [Trivon](https://github.com/trivon-21). Git history preserves contributors' authorship.

## Development
Use Node 24 (`nvm install && nvm use`) and npm 11 (`npm install -g npm@11.21.2`), then `npm ci`. Work on feature branches from `dev`; send reviewed changes to `dev`, with verified releases to `main`.

Copy `.env.example` to `.env`, supply an isolated MongoDB URI/database and a strong JWT secret, then run `npm run dev`. Never use real customer data in public demos.

Run `npm run test:hosting` for deployment checks. `npm test` runs existing legacy/domain suites; the last recorded results were 99 passing / 3 failing legacy tests and 78 passing / 1 failing domain tests. Known failures involve schema expectations, a purchase-report query timeout, service history, and audit-scope coverage. Legacy tests also leave pending work. Inventory login has a separate audit-log role enum mismatch. These issues remain unresolved.

## Hosting
Import `render.yaml` into Render and set its required secrets. Use a separate Atlas database for each environment. `/healthz` returns 200 only while MongoDB is connected. Free services sleep; demo mode disables recurring jobs and uses a non-delivering mail transport. Email-dependent signup/recovery is not supported by this demo: use seeded accounts. No deployment URL is available until credentials are configured.

## Demo fixtures and known checks
After configuring only an isolated demo database, set `DEMO_PASSWORD` (at least 12 characters) and run `npm run seed:demo`. This creates `customer@airlux.example`, `finance@airlux.example`, and `inventory@airlux.example`, plus four synthetic dispatch records. It does not delete existing records and grants no super-admin account. Do not expose real data alongside shared demo accounts.

The required CI workflow runs hosting checks. The separate, manually triggered **Existing suite diagnostics** workflow runs the full legacy/domain suites and reports failures as failures. Their known baseline issues are not release-validation successes. Render's deployment gate applies to the required hosting workflow; run diagnostics before promoting a demo to a production release.

Render setup order: set the Atlas URI and exact HTTPS frontend origin(s), deploy and verify `/healthz`, seed from your local terminal using the same isolated database, then configure Vercel's `AIRLUX_API_URL`. Add the final frontend origin to `FRONTEND_URL` if it differs. Seeding is never part of server startup or deploy builds.
