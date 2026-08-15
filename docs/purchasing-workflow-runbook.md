# Purchasing Workflow Runbook

1. Back up MongoDB and verify transaction support.
2. Set `PURCHASE_APPROVAL_MODE=manager-first`.
3. Review `npm run migrate:purchasing` and apply with `npm run migrate:purchasing -- --apply`.
4. Deploy frontend and backend together because unlinked legacy receiving is rejected.
5. Run the purchasing Postman collection with Inventory, Manager and Finance tokens.
6. Adapt the Finance branch to canonical `OrderRequest`; do not dual-write `L_PurchaseRequest`.
7. Switch to `two-stage` only after Finance contract tests pass.

Repeated `receiptEventId` values return `409`. Failed receipt transactions change no stock, serial, Procurement, PO/authorization progress or Activity record. Imported Finance history and `LEGACY` Procurement remain read-only and are never linked by guessing.
