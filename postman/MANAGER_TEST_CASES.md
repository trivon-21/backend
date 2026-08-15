# Manager API checks

Use a valid Manager bearer token and real IDs from the list endpoints.

| Check | Expected result |
|---|---|
| Dashboard with data | Live ticket, approval, inventory, material-request, activity, and action values only |
| Dashboard with empty collections | Zero counts and empty activity/action arrays |
| Analytics for `7d`, `30d`, and `12m` | Ticket trends, resolution time, workload, approval totals, and inventory signals only |
| List technicians | Only `MAIN_TECH`, `SERVICE_TEAM`, and `INSPECTION`; no password or authentication fields |
| Assign a valid technician | Ticket stores the user reference and compatible assignee-name snapshot |
| Assign a missing/invalid-role user | `404`; ticket remains unchanged |
| Resolve and reopen a ticket | Resolution sets `resolvedAt`; reopening clears it |
| Approve or reject a purchase request | Decision is persisted; missing request returns `404` |
| Database unavailable | Read endpoints return `503` with zero/empty payloads; writes are not simulated |
| Removed customer endpoint | `GET /api/manager/customers` returns `404` |

The Manager web routes retain redirects for old bookmarks: vehicle assignment and customers go to Tickets; notifications and settings go to the Manager dashboard.
