# API Quick Reference - Maintenance Scheduling

## Base URL
```
http://localhost:5000/api
```

---

## Installation Endpoints

### Complete Installation & Create Schedule
```http
POST /installations/{installationId}/complete
Content-Type: application/json

{}
```
**Response**: `{ success, data: { installation, maintenanceSchedule } }`

### Get Completed Installations
```http
GET /installations/maintenance/completed
```
**Response**: `{ success, count, data: [...] }`

---

## Maintenance Schedule Endpoints

### List All Schedules
```http
GET /maintenance/schedules?status=New&search=keyword
```

### Get Schedule Details
```http
GET /maintenance/schedules/{scheduleId}
```

### Update Schedule with Dates
```http
PATCH /maintenance/schedules/{scheduleId}
Content-Type: application/json

{
  "services": [
    { "serviceName": "First Service", "date": "2026-10-10T00:00:00Z" },
    { "serviceName": "Second Service", "date": "2027-03-10T00:00:00Z" },
    { "serviceName": "Third Service", "date": "2027-10-10T00:00:00Z" },
    { "serviceName": "Fourth Service", "date": "2028-03-10T00:00:00Z" }
  ]
}
```

### Save Draft (Mid-way Recovery)
```http
POST /maintenance/schedules/{scheduleId}/draft
Content-Type: application/json

{
  "services": [
    { "serviceName": "First Service", "date": null },
    { "serviceName": "Second Service", "date": "2027-03-10T00:00:00Z" }
  ]
}
```

### Send to CSA
```http
POST /maintenance/schedules/{scheduleId}/send-to-csa
Content-Type: application/json

{
  "csaNotes": "Please review and approve"
}
```

### Send to Customer (CSA Action)
```http
POST /maintenance/schedules/{scheduleId}/send-to-customer
Content-Type: application/json

{
  "customerNotes": "Your maintenance schedule is ready"
}
```

---

## Maintenance Records Endpoints

### List All Maintenance
```http
GET /maintenance?status=Finance%20Approved&search=keyword
```

### Get Maintenance by Schedule
```http
GET /maintenance/by-schedule/{scheduleId}
```

### Send Material List to Inventory Manager
```http
POST /maintenance/{maintenanceId}/send-material-to-im
```

### Assign Team to Maintenance
```http
POST /maintenance/{maintenanceId}/assign-team
Content-Type: application/json

{
  "teamId": "{teamMongoId}",
  "teamName": "Service Team A"
}
```

---

## Reminder & Quotation Endpoints

### Get Pending Reminders
```http
GET /maintenance/reminders/pending
```

### Send Reminder to Customer
```http
POST /maintenance/reminders/{reminderId}/send
Content-Type: application/json

{
  "defaultMaterials": [
    { "item": "Filter", "quantity": "1", "estimatedCost": 50 },
    { "item": "Refrigerant", "quantity": "1kg", "estimatedCost": 100 }
  ],
  "estimatedTotal": 225
}
```

### Record Customer Response
```http
POST /maintenance/reminders/{reminderId}/respond
Content-Type: application/json

{
  "accepted": true,
  "notes": "Accepted - please proceed"
}
```

---

## Status Values

### Installation Maintenance Status
- `Installation Completed`
- `Schedule Created`
- `Sent to CSA`
- `Sent to Customer`

### Maintenance Schedule Status
- `New`
- `Draft Saved`
- `Sent to CSA`
- `Sent to Customer`

### Maintenance Status
- `Finance Approved`
- `Material Sent to IM`
- `Team Assigned`
- `Scheduled`
- `In Progress`
- `Completed`

### Reminder Status
- `Pending`
- `Sent`
- `Accepted`
- `Rejected`

---

## Example Workflow Sequence

### 1. Mark Installation Complete
```bash
curl -X POST http://localhost:3000/api/installations/12345/complete
```

### 2. List Schedules
```bash
curl http://localhost:3000/api/maintenance/schedules
```

### 3. Update Schedule Dates
```bash
curl -X PATCH http://localhost:3000/api/maintenance/schedules/abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "services": [
      {"serviceName": "First Service", "date": "2026-10-10T00:00:00Z"},
      {"serviceName": "Second Service", "date": "2027-03-10T00:00:00Z"},
      {"serviceName": "Third Service", "date": "2027-10-10T00:00:00Z"},
      {"serviceName": "Fourth Service", "date": "2028-03-10T00:00:00Z"}
    ]
  }'
```

### 4. Send to CSA
```bash
curl -X POST http://localhost:3000/api/maintenance/schedules/abc123/send-to-csa \
  -H "Content-Type: application/json" \
  -d '{"csaNotes": "Ready for review"}'
```

### 5. CSA Sends to Customer
```bash
curl -X POST http://localhost:3000/api/maintenance/schedules/abc123/send-to-customer \
  -H "Content-Type: application/json" \
  -d '{"customerNotes": "Your schedule"}'
```

### 6. Wait for Reminder (Automatic - 7 days before service)
- Scheduler runs every hour
- Sends email to customer
- Customer responds

### 7. Record Response (Customer Accepts)
```bash
curl -X POST http://localhost:3000/api/maintenance/reminders/xyz789/respond \
  -H "Content-Type: application/json" \
  -d '{"accepted": true, "notes": "Accepted"}'
```

### 8. Send Materials to IM (Automatic after acceptance)
```bash
curl -X POST http://localhost:3000/api/maintenance/maintenance123/send-material-to-im
```

### 9. Assign Team
```bash
curl -X POST http://localhost:3000/api/maintenance/maintenance123/assign-team \
  -H "Content-Type: application/json" \
  -d '{"teamId": "team123", "teamName": "Service Team A"}'
```

---

## Common Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    "id": "...",
    "status": "...",
    "...": "..."
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error description"
}
```

---

## Notes

- All dates should be in ISO 8601 format (e.g., "2026-10-10T00:00:00Z")
- Replace `{variables}` with actual values
- Status values are case-sensitive
- All endpoints require valid MongoDB IDs
- Email must be configured in .env for reminders to work

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 Not Found | Check resource ID and endpoint path |
| 400 Bad Request | Verify request body JSON format |
| Status not updating | Check current status is valid for transition |
| Reminders not sending | Verify MAIL_* configuration in .env |
| Schedule not showing | Ensure installation is marked COMPLETED |

---

For detailed documentation, see `MAINTENANCE_WORKFLOW_GUIDE.md`
