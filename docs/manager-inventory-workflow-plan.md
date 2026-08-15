# Unified AirLux Manager and Inventory Purchasing Plan

The complete workspace plan is maintained at `../../docs/manager-inventory-workflow-plan.md`. This tracked copy records the implementation contract used by the backend.

## Lifecycles

- Normal: `Inventory Request -> Manager Approval -> Finance Approval -> PO Issued -> Receipt/GRN`
- Manager-first rollout: `Inventory Request -> Manager Approval -> PO Issued -> Receipt/GRN`
- Non-PO: `Authorization Request -> Manager Approval -> Receipt/GRN -> Finance Reconciliation when required`

`OrderRequest` is authoritative. Inventory users submit requests and issue approved POs; Managers make operational decisions; Finance makes financial decisions and reconciles paid Non-PO receipts. Only `POST /api/inventory/receipts` posts stock, and it must run transactionally.

The four Manager routes remain Overview (`/manager`), Operations (`/manager/tickets`), Approvals (`/manager/orders`) and Analytics (`/manager/analytics`). Vehicles, Notifications, Settings and Customer Directory remain removed.

Use `PURCHASE_APPROVAL_MODE=manager-first` until the Finance branch is adapted and tested against canonical `OrderRequest`; then switch to `two-stage`. Run `npm run migrate:purchasing` before `npm run migrate:purchasing -- --apply`.

See `purchasing-workflow-runbook.md` and `../postman/Airlux-Purchasing-Workflow.postman_collection.json` for rollout and API verification.
