# Inventory Manager API — Postman Test Guide

Covers **all 31 endpoints** of the `/api/inventory` module with **50 test cases** (TC-01 … TC-50), including negative tests. A ready-to-import collection with automated assertions lives next to this file: `Airlux-InventoryManager.postman_collection.json`.

---

## ⚠️ Before you start — data safety

- These tests **write real documents** to whatever database `backend/.env` (`MONGO_URI`) points at — currently the **shared Atlas cluster**. Nothing here deletes existing data, but creates are real.
- Every document the tests create is prefixed **`PMTEST-`** (SKUs, tags, jobs, serials) or named `PMTEST …`, so teammates can identify and remove them in Atlas later.
- There are **no delete endpoints** in this API, so cleanup is manual (Atlas UI → filter by `PMTEST`). The one exception: TC-23 deletes only the loan that TC-21 itself created.
- Do **not** run any `seeds/` script to "prepare data" — most of them wipe entire collections (see `OVERENGINEERING_AUDIT.md` §8.1).

## 1. Setup

1. **Start the backend**
   ```
   cd backend
   npm install
   npm run dev        # server on http://localhost:5000
   ```
   Wait for `MongoDB connected...` and `Routes initialized` in the console.

2. **Have a login user.** The repo's seed script `seeds/seedInventoryUser.js` creates/updates:
   - identifier: `testuser@airlux.com`
   - password: `Password@123`

   This script is **safe** (it only upserts one user, wipes nothing), but it does write to the shared DB — if the user already exists in Atlas, skip this step. Run with: `node seeds/seedInventoryUser.js`.

3. **Import the collection** — Postman → *Import* → select `Airlux-InventoryManager.postman_collection.json`. The `baseUrl` variable is preset to `http://localhost:5000/api` (edit it in the collection's *Variables* tab if your port differs).

4. **Run it**
   - **Everything at once:** right-click the collection → *Run collection* → keep the default order → *Run*. Requests chain automatically (login token, created IDs). Expected result: **all 50 pass**.
   - **One by one:** run folder *00 Setup & Auth* first (TC-01 stores the JWT into `{{token}}`; every other request inherits it via the collection's Bearer auth). Then run any folder top-to-bottom — later requests in a folder often depend on IDs saved by earlier ones.

### How authentication works here
Every `/api/inventory/*` route uses the `protect` middleware: it requires the header `Authorization: Bearer <JWT>`. TC-01 (login) captures the token automatically. Tokens expire per `JWT_EXPIRES_IN` in `.env` — if you start getting 401s mid-session, re-run TC-01.

### ❗ Quirks to know before testing (they are not your mistakes)
| Quirk | Detail |
|---|---|
| **Two kinds of IDs** | Items and asset-loans are addressed by Mongo `_id` (24-hex). Orders (`ORD-…` in `orderId`), material requests (`requestId`), order requests (`requestId`), RMA (`rmaId`), quarantine (`quarantineId`) are addressed by their **business ID string**, not `_id`. Using the wrong one "succeeds" with `null`. |
| **PATCH returns `null`, not 404** | `PATCH /orders/:id` and `/material-requests/:id` on an unknown ID reply **200 with `null` body** — a known API gap. |
| **Wrong-ID errors are 500** | Approve/reject/return on unknown IDs reply 500 with a message (not 404). |
| **Technicians come from another DB** | `GET /technicians` reads collection `TechTeamMembers` in a separate `Dassana` database — may legitimately return `[]`. |
| **Return logs vanish after 14 days** | `asset_return_logs` has a TTL index — records auto-delete 14 days after `returnedAt`. Don't be surprised if old logs are gone. |

---

## 2. Test cases

Legend: 🔒 = requires Bearer token (all except TC-01/02/03 override it). Body = raw JSON.

### Folder 00 — Setup & Auth

| # | Test | Method & URL | Body / Notes | Expected |
|---|---|---|---|---|
| TC-01 | Login, capture token | `POST {{baseUrl}}/auth/login` | `{"identifier":"testuser@airlux.com","password":"Password@123"}` | **200**, body has `token` (saved to `{{token}}`) and `user` |
| TC-02 | Reject missing token | `GET {{baseUrl}}/inventory/list` (auth: none) | — | **401** `Not authenticated` |
| TC-03 | Reject bad token | `GET {{baseUrl}}/inventory/list` (Bearer `not-a-real-token`) | — | **401** `Invalid or expired token` |

### Folder 01 — Dashboard & Activity

| # | Test | Method & URL | Expected |
|---|---|---|---|
| TC-04 | Dashboard aggregation 🔒 | `GET /inventory/dashboard` | **200**; `stats` has exactly `materialReservations`, `dispatchQueue`, `assetHealth`, `stockAlerts`; `recentActivity` + `reorderList` arrays; `status:"Operational"` |
| TC-05 | Activity log 🔒 | `GET /inventory/activity` | **200**; array; every entry `type` ∈ return/dispatch/request/grn/alert |

### Folder 02 — Inventory Items

| # | Test | Method & URL | Body / Notes | Expected |
|---|---|---|---|---|
| TC-06 | Create classified catalog item 🔒 | `POST /inventory/item` | HVAC classification, compatibility, planning and storage fields; no stock fields | **201**; `available:0`, `reserved:0`, `stockStatus:"out-of-stock"`; `_id` saved to `{{itemId}}` |
| TC-07 | Duplicate SKU blocked 🔒 | `POST /inventory/item` | same complete catalog payload and `sku` | **409** `SKU already exists` |
| TC-08 | List contains item 🔒 | `GET /inventory/list` | — | **200**; array includes the new SKU |
| TC-09 | Get by id 🔒 | `GET /inventory/item/{{itemId}}` | — | **200**; `_id` matches |
| TC-10 | Unknown id 🔒 | `GET /inventory/item/64b000000000000000000000` | valid-format, nonexistent ObjectId | **404** `Item not found` |
| TC-11 | Update master data 🔒 | `PATCH /inventory/item/{{itemId}}` | `{"unitCost":1500,"location":"Warehouse B"}` | **200**; `unitCost` = 1500 |
| TC-11A | Reject direct stock mutation 🔒 | `PATCH /inventory/item/{{itemId}}` | `{"available":99}` | **400** `USE_STOCK_WORKFLOW`; quantity unchanged |

Catalog creation never receives physical stock. Use `POST /inventory/receipts` after creating the product.

### Folder 03 — Suppliers & Procurement

| # | Test | Method & URL | Body / Notes | Expected |
|---|---|---|---|---|
| TC-12 | Create supplier 🔒 | `POST /inventory/suppliers` | `{"name":"PMTEST-Supplier-<timestamp>"}` (auto-unique) | **201**; `status:"active"` |
| TC-13 | Duplicate supplier 🔒 | `POST /inventory/suppliers` | same name | **400** `Supplier already exists` |
| TC-14 | List suppliers 🔒 | `GET /inventory/suppliers` | — | **200**; includes created name |
| TC-14A | Receive existing SKU 🔒 | `POST /inventory/receipts` | `inventoryId`, positive quantity, `supplierId`, invoice, cost and storage data | **201**; existing stock increases and response contains both `item` and `procurement` |
| TC-15 | GRN side effect of TC-14A 🔒 | `GET /inventory/procurements` | — | **200**; a record with `invoiceNumber:"PMTEST-RECEIPT-001"` exists (proves receiving logged the GRN) |

Receipt validation checks: quantity must be a positive whole number; supplier and existing item IDs must exist; serialized receipts require exactly one unique serial per unit; duplicate SKUs and serials return **409**.

Lifecycle: **catalog creation → purchase order (if required) → physical receipt/GRN → reservation/dispatch → return/RMA**.

### Folder 04 — Dispatch Orders & Material Requests *(data-dependent)*

These two PATCH endpoints can only be meaningfully tested if the DB already contains orders / material requests (there is no create endpoint for them in this module — they come from other parts of the system or seeders).

| # | Test | Method & URL | Body / Notes | Expected |
|---|---|---|---|---|
| TC-16 | List orders 🔒 | `GET /inventory/orders` | test script saves first `orderId` → `{{dispatchOrderId}}` | **200**; array |
| TC-17 | Update order status 🔒 | `PATCH /inventory/orders/{{dispatchOrderId}}` | `{"status":"ready","lastMovedAt":"<now>"}` — ⚠️ uses the **`orderId` string** (`ORD-…`), *not* `_id` | **200**; `status:"ready"` — or `null` body if no orders exist (known quirk, still 200) |
| TC-18 | List material requests 🔒 | `GET /inventory/material-requests` | saves first `requestId` | **200**; array |
| TC-19 | Update material request 🔒 | `PATCH /inventory/material-requests/{{materialRequestId}}` | `{"status":"reserved","lastMovedAt":"<now>"}` — uses `requestId`, not `_id`. Valid statuses: pending / reserved / completed | **200**; `status:"reserved"` (or `null` if none exist) |

> **Manual extra check:** send `{"status":"pending","lastMovedAt":null}` — the service should *unset* `lastMovedAt`/`completedAt` (state reset path).

### Folder 05 — Asset Management (full lending lifecycle)

| # | Test | Method & URL | Body / Notes | Expected |
|---|---|---|---|---|
| TC-20 | List technicians 🔒 | `GET /inventory/technicians` | reads external `Dassana` DB | **200**; array (possibly empty) |
| TC-20A | Receive serialized tool 🔒 | `POST /inventory/receipts` | New Tools and Test Equipment payload plus one generated `{{toolAssetTag}}` | **201**; received tool ID saved for lending |
| TC-21 | Check out a tool 🔒 | `POST /inventory/asset-loans` | serialized tool ID and its exact unloaned asset tag | **201**; `_id` saved to `{{loanId}}`; duplicate active checkout returns **409** |
| TC-22 | Loan appears in list 🔒 | `GET /inventory/asset-loans` | — | **200**; contains `{{loanId}}` |
| TC-23 | Return the tool 🔒 | `POST /inventory/asset-loans/return/{{loanId}}` | uses the loan's Mongo `_id`; no body. Deletes the loan + writes a return log | **200**; returned doc `_id` = `{{loanId}}` |
| TC-24 | Return logged 🔒 | `GET /inventory/asset-return-logs` | ⚠️ logs auto-delete after 14 days (TTL) | **200**; a log with `assetTag:"PMTEST-TAG-01"` |
| TC-25 | Double return blocked 🔒 | `POST /inventory/asset-loans/return/{{loanId}}` again | loan no longer exists | **500** `Failed to return tool` |

### Folder 06 — Purchase Order Requests (create → update → approve / reject)

| # | Test | Method & URL | Body / Notes | Expected |
|---|---|---|---|---|
| TC-26 | Create PO request 🔒 | `POST /inventory/order-requests` | `supplierName`, `status:"pending-approval"`, `priority:"urgent"`, 2 items (qty 2 × 1200 + qty 5 × 300) | **201**; `requestId` matches `ORD-YYYYMMDD-HHMMSS`; **`totalEstimate` auto-computed = 3900**; saved to `{{orderRequestId}}` |
| TC-27 | Appears in list 🔒 | `GET /inventory/order-requests` | — | **200**; contains the requestId |
| TC-28 | Update recomputes total 🔒 | `PATCH /inventory/order-requests/{{orderRequestId}}` | replace items with qty 3 × 1200 | **200**; `totalEstimate` = **3600** |
| TC-29 | Approve 🔒 | `PATCH /inventory/order-requests/{{orderRequestId}}/approve` | no body | **200**; `status:"approved"`, `approvedBy` + `approvedAt` set; no stock receipt is created |
| TC-30 | Approval remains separate from receipt 🔒 | `GET /inventory/procurements` | — | **200**; no synthetic `AWAITING-<requestId>` GRN exists |
| TC-31 | Create 2nd request 🔒 | `POST /inventory/order-requests` | 1 item | **201**; saved to `{{rejectRequestId}}` |
| TC-32 | Reject with reason 🔒 | `PATCH /inventory/order-requests/{{rejectRequestId}}/reject` | `{"reason":"Budget exceeded — PMTEST"}` | **200**; `status:"rejected"`, `rejectionReason` stored |
| TC-33 | Approve unknown id 🔒 | `PATCH /inventory/order-requests/ORD-00000000-000000/approve` | — | **500** message contains `not found` |
| TC-34 | Suggested orders 🔒 | `GET /inventory/suggested-orders` | low-stock reorder suggestions | **200**; every returned item has `status` ∈ {warning, critical} |

### Folder 07 — Returns, RMA & Quarantine

| # | Test | Method & URL | Body / Notes | Expected |
|---|---|---|---|---|
| TC-35 | Snapshot stock 🔒 | `GET /inventory/item/{{itemId}}` | saves `available` → `{{stockBefore}}` | **200** |
| TC-36 | Leftover return, condition **good** 🔒 | `POST /inventory/leftover-returns` | `jobId`, `itemId:{{itemId}}`, `itemName`, `quantityReturned:5`, `condition:"good"` | **201**; `returnId` `LR-…`; `restoredToStock:true`, `movedToQuarantine:false` |
| TC-37 | Stock actually restored 🔒 | `GET /inventory/item/{{itemId}}` | — | **200**; `available` = `{{stockBefore}}` **+ 5** |
| TC-38 | Leftover return, condition **damaged** 🔒 | `POST /inventory/leftover-returns` | `condition:"damaged"`, qty 2, no itemId needed | **201**; `movedToQuarantine:true` (a `QZ-…` quarantine item is auto-created) |
| TC-39 | Both returns listed 🔒 | `GET /inventory/leftover-returns` | — | **200**; jobs PMTEST-JOB-01 & 02 present |
| TC-40 | Create RMA case 🔒 | `POST /inventory/rma-cases` | known inventory `serialNumber` and `faultDescription` | **201**; item metadata auto-filled; `status:"reported"` |
| TC-41 | Valid transition 🔒 | `PATCH /inventory/rma-cases/{{rmaId}}` | `{"status":"under-review"}` | **200**; status updated |
| TC-42 | **Invalid** transition 🔒 | same, `{"status":"closed"}` | closed is not reachable from under-review (must go via resolved) | **400** `Invalid status transition from 'under-review' to 'closed'` |
| TC-43 | Resolve with note 🔒 | same, `{"status":"resolved","resolution":"…"}` | | **200**; `resolvedAt` set, resolution stored |
| TC-44 | Close 🔒 | same, `{"status":"closed"}` | valid from resolved | **200**; `status:"closed"` |
| TC-45 | RMA listed 🔒 | `GET /inventory/rma-cases` | — | **200**; contains `{{rmaId}}` |
| TC-46 | Manual quarantine 🔒 | `POST /inventory/quarantine` | `itemName`, `quantity:3`, `reason` (required) | **201**; `quarantineId` `QZ-…`; `status:"quarantined"` |
| TC-47 | Quarantine list = active only 🔒 | `GET /inventory/quarantine` | — | **200**; includes `{{quarantineId}}`; **every** row `status:"quarantined"` (disposed items filtered out) |
| TC-48 | Dispose 🔒 | `PATCH /inventory/quarantine/{{quarantineId}}/dispose` | uses `quarantineId`, no body | **200**; `status:"disposed"`, `disposedAt` + `disposedBy` set |
| TC-49 | Double dispose blocked 🔒 | same again | — | **400** `Item is already disposed` |
| TC-50 | Summary reflects run 🔒 | `GET /inventory/returns-summary` | — | **200**; `leftoverReturns.total ≥ 2`, `restoredToStock ≥ 1`, `movedToQuarantine ≥ 1`, `rmaCases.total ≥ 1`, `quarantine.disposed ≥ 1` |

> **RMA state machine (for your own exploratory tests):** `reported → under-review → (sent-to-supplier →) resolved → closed`. Any other jump must return 400.

---

## 3. Endpoint coverage checklist (33/33)

| Endpoint | Covered by |
|---|---|
| `GET /dashboard` | TC-04 |
| `GET /list` | TC-02, 03, 08 |
| `GET /item/:id` | TC-09, 10, 35, 37 |
| `PATCH /item/:id` | TC-11, 11A |
| `POST /item` | TC-06, 07 |
| `POST /receipts` | TC-14A |
| `GET /suppliers` | TC-14 |
| `POST /suppliers` | TC-12, 13 |
| `GET /procurements` | TC-15, 30 |
| `GET /orders` | TC-16 |
| `PATCH /orders/:id` | TC-17 |
| `GET /material-requests` | TC-18 |
| `PATCH /material-requests/:id` | TC-19 |
| `GET /technicians` | TC-20 |
| `GET /asset-loans` | TC-22 |
| `GET /available-tools` | manual UI/API verification |
| `POST /asset-loans` | TC-21 |
| `POST /asset-loans/return/:id` | TC-23, 25 |
| `GET /asset-return-logs` | TC-24 |
| `GET /order-requests` | TC-27 |
| `POST /order-requests` | TC-26, 31 |
| `PATCH /order-requests/:id` | TC-28 |
| `PATCH /order-requests/:id/approve` | TC-29, 33 |
| `PATCH /order-requests/:id/reject` | TC-32 |
| `GET /suggested-orders` | TC-34 |
| `GET /activity` | TC-05 |
| `GET /returns-summary` | TC-50 |
| `GET /leftover-returns` | TC-39 |
| `POST /leftover-returns` | TC-36, 38 |
| `GET /rma-cases` | TC-45 |
| `POST /rma-cases` | TC-40 |
| `PATCH /rma-cases/:id` | TC-41–44 |
| `GET /quarantine` | TC-47 |
| `POST /quarantine` | TC-46 |
| `PATCH /quarantine/:id/dispose` | TC-48, 49 |

## 4. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| TC-01 fails 401 | Test user missing or wrong password → run `node seeds/seedInventoryUser.js` once |
| TC-01 fails 423 | Account locked after repeated bad logins — wait for the lock to expire or reset via the seed script |
| Everything 401 mid-run | JWT expired → re-run TC-01 |
| `ECONNREFUSED` | Backend not running → `npm run dev` in `backend/` |
| Backend logs `querySrv ECONNREFUSED` | Network blocks Atlas SRV DNS — see the hint `db.js` prints (set `MONGO_DNS_SERVERS`) |
| TC-17 / TC-19 pass but body `null` | No orders / material requests in the DB — expected; the endpoints have no 404 (known quirk) |
| TC-37 off by 5 | You re-ran TC-36 without re-running TC-35 (snapshot stale) — run the folder in order |
