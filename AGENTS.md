# Airlux backend instructions

## Architecture

Keep the dependency direction clear:

`route -> middleware -> controller -> service -> model`

- `server.js`: application bootstrap only.
- `src/routes/`: top-level route registration.
- `src/modules/<feature>/`: feature routes, controllers, and services.
- `src/models/`: Mongoose schemas, indexes, hooks, and persistence invariants.
- `src/utils/`: pure or mostly pure domain calculations and compatibility rules.
- `test/`: Node test runner tests.
- `scripts/`: audits and migrations.
- `seeds/`: explicit database-mutating seed operations.

Use CommonJS `require` and `module.exports`. Do not introduce isolated ESM files
or a second server framework.

## Separation of responsibilities

- Routes declare HTTP paths, middleware order, and controllers. Keep them free
  of business logic.
- Controllers translate HTTP input and service results into responses. They may
  select status codes but should not contain workflow or persistence logic.
- Services own authorization, business rules, state transitions, persistence
  orchestration, and stable service errors.
- Models own schema validation and persistence-level invariants. Do not hide
  multi-step workflows in model hooks.
- Put reusable calculations, normalization, status derivation, and transition
  rules in focused domain modules under `src/utils/` when they can remain
  independent of Express and MongoDB.
- Do not add unrelated workflows to `inventory_manager.service.js` or its
  controller. Extract a focused service/controller when adding a substantial
  capability.

Soft size targets for new or substantially edited files:

- routes: normally under 150 lines;
- controllers: normally under 250 lines;
- services: normally under 400 lines;
- models and domain utilities: normally under 250 lines.

Exceed a target when cohesion is improved, but explain the choice during review.

## API, validation, and authorization

- Validate and normalize all external input at the boundary. Use allowlists for
  update fields and workflow transitions.
- Treat request bodies, query parameters, headers, and MongoDB identifiers as
  untrusted.
- Never trust client-supplied roles, actor names, totals, stock statuses,
  timestamps, approval history, or protected inventory fields.
- Enforce authentication and role authorization on the backend for every
  protected action. Do not rely on Angular guards.
- Use stable errors with `statusCode`, a machine-readable `code`, and a safe
  message. Preserve established response and error shapes.
- Use appropriate HTTP semantics: 400 invalid input, 401 unauthenticated, 403
  unauthorized, 404 missing resource, 409 conflict/stale transition, and 500
  unexpected server failure.
- Do not leak stack traces, database details, tokens, or internal objects in
  production responses.
- Preserve status-version checks, self-approval restrictions, audit history,
  and legacy read-only behavior in approval workflows.

## MongoDB and Mongoose

- Preserve schema constraints, indexes, references, collection names, timestamps,
  and compatibility hooks unless a migration accompanies the change.
- Validate ObjectIds before querying where malformed identifiers should produce
  a client error.
- Use projections and `lean()` for read-only queries when document methods,
  virtual behavior, or mutation are not required.
- Avoid unbounded collection reads. Add intentional filtering, limits,
  pagination, and supporting indexes when a dataset can grow.
- Avoid N+1 queries and repeated database calls inside loops.
- Use atomic updates or a transaction for multi-document invariants when the
  deployed MongoDB topology supports transactions. Do not claim atomicity when
  it is not provided.
- Never silently change stored enum values or field meanings. Provide a
  backward-compatible read path and an explicit migration plan.

## Compatibility-sensitive domains

Preserve unless explicitly changed:

- `category` and `itemClass` synchronization;
- canonical and legacy stock statuses;
- legacy purchase-status projection;
- `_id`, business-reference, and legacy identifier lookup behavior;
- integer and non-negative inventory quantities;
- purchase receipt, approval, and reconciliation transition rules.

When these change, update the matching Angular domain types and tests.

## Database safety

- Never read or modify `.env`; use `.env.example` for variable documentation.
- The server can start in offline mode after a MongoDB connection failure. Do
  not treat a listening HTTP port as proof of database connectivity.
- Migration commands without `:apply` are the safe inspection path.
- Never run `seed:*` or any `*:apply` command without explicit authorization.
- Before an authorized migration, state the target database, expected affected
  records, rollback or recovery approach, and dry-run result.

## Commands and verification

Run from `backend/`:

- clean install: `npm ci`
- development: `npm run dev`
- start: `npm start`
- all tests: `npm test`
- safe audits/dry runs: `npm run migrate:inventory`,
  `npm run migrate:purchasing`, and `npm run audit:manager-inventory-schema`

For a backend change:

1. Add or update tests for pure domain rules and regressions.
2. Run the most relevant test file with `node --test <test-file>` when useful.
3. Run `npm test`.
4. If the API contract changed, update and verify the frontend consumer.
5. State explicitly whether MongoDB-backed integration behavior was exercised.
6. Review the backend Git diff and status.
