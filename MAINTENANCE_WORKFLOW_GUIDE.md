# Maintenance Scheduling Backend Implementation

## Overview
This implementation provides a complete backend workflow for the maintenance scheduling system. The process flows from installation completion through maintenance scheduling, customer reminders, quotation acceptance, and finally team assignment.

## Workflow Summary

```
Installation Completed 
  ↓
Maintenance Schedule Created (New)
  ↓
Schedule Details Populated with Dates
  ↓
Draft Saved (optional mid-way recovery)
  ↓
Sent to CSA
  ↓
CSA Sends to Customer
  ↓
Reminders Sent (7 days before each service)
  ↓
Customer Accepts/Rejects
  ↓
If Accepted: Maintenance Record Created (Finance Approved)
  ↓
Material List Sent to Inventory Manager
  ↓
Team Assigned to Maintenance
  ↓
Maintenance Appears on Maintenance Tab
```

---

## Database Models

### 1. **Installation** (Updated)
Extended with maintenance scheduling support:
- `maintenanceStatus`: Installation maintenance lifecycle status
- `maintenanceScheduleId`: Reference to associated maintenance schedule

### 2. **MaintenanceSchedule** (Updated)
- `ticketId`: Unique identifier
- `installationId`: Reference to installation
- `customerId`: Customer reference
- `services`: Array of service items with dates
- `status`: New, Draft Saved, Sent to CSA, Sent to Customer
- `sentToCsaAt`: Timestamp when sent to CSA
- `sentToCustomerAt`: Timestamp when sent to customer

### 3. **MaintenanceScheduleDraft** (New)
Stores draft schedules for recovery if user stops midway:
- `installationId`: Installation reference
- `services`: Partial service configuration
- `lastModified`: Last modification timestamp

### 4. **MaintenanceReminder** (New)
Tracks reminders sent to customers:
- `maintenanceScheduleId`: Associated schedule
- `customerId`: Customer reference
- `serviceDate`: Scheduled service date
- `serviceName`: Service type (First/Second/Third/Fourth Service)
- `status`: Pending, Sent, Accepted, Rejected
- `quotation`: Default materials and estimated cost
- `sentAt`: When reminder was sent
- `customerResponse`: Customer's acceptance/rejection response
- `reminderScheduledFor`: Date when reminder should be sent (7 days before service)

### 5. **Maintenance** (Updated)
Records for finance-approved maintenance:
- `maintenanceScheduleId`: Schedule reference
- `customerId`: Customer reference
- `status`: Finance Approved → Material Sent to IM → Team Assigned
- `materialList`: Items needed for service
- `assignedTeamId`: Team assigned for this maintenance
- `sentToInventoryManagerAt`: When material list was sent
- `scheduledServiceType`: Service name

### 6. **MaintenanceQuotation** (New)
Stores quotation information:
- `maintenanceId`: Associated maintenance
- `defaultMaterials`: Array of materials with costs
- `estimatedTotal`: Total cost estimate

---

## API Endpoints

### Installation Endpoints

#### Complete Installation & Create Schedule
```
POST /api/installations/:id/complete
Request Body:
{
  "maintenanceScheduleData": {} // optional
}
Response:
{
  "success": true,
  "message": "Installation completed and maintenance schedule created",
  "data": {
    "installation": {...},
    "maintenanceSchedule": {...}
  }
}
```

#### Get Completed Installations for Maintenance Tab
```
GET /api/installations/maintenance/completed
Response:
{
  "success": true,
  "count": 5,
  "data": [...]
}
```

---

### Maintenance Schedule Endpoints

#### Get All Schedules
```
GET /api/maintenance/schedules?status=New&search=searchTerm
Response:
{
  "success": true,
  "count": 10,
  "data": [...]
}
```

#### Get Schedule by ID
```
GET /api/maintenance/schedules/:id
Response:
{
  "success": true,
  "data": {
    "...schedule details...",
    "servicesDisplay": [
      { "serviceName": "First Service" },
      { "serviceName": "Second Service" },
      ...
    ]
  }
}
```

#### Update Schedule with Dates
```
PATCH /api/maintenance/schedules/:scheduleId
Request Body:
{
  "services": [
    { "serviceName": "First Service", "date": "2026-10-10T00:00:00Z" },
    { "serviceName": "Second Service", "date": "2027-03-10T00:00:00Z" },
    { "serviceName": "Third Service", "date": "2027-10-10T00:00:00Z" },
    { "serviceName": "Fourth Service", "date": "2028-03-10T00:00:00Z" }
  ],
  "status": "Draft Saved"
}
Response:
{
  "success": true,
  "message": "Maintenance schedule updated",
  "data": {...}
}
```

#### Save Draft (Mid-way Recovery)
```
POST /api/maintenance/schedules/:scheduleId/draft
Request Body:
{
  "services": [...]
}
Response:
{
  "success": true,
  "message": "Draft saved successfully",
  "data": {...}
}
```

#### Send Schedule to CSA
```
POST /api/maintenance/schedules/:scheduleId/send-to-csa
Request Body:
{
  "csaNotes": "Optional notes for CSA"
}
Response:
{
  "success": true,
  "message": "Schedule sent to CSA",
  "data": {...}
}
```

#### Send Schedule to Customer (by CSA)
```
POST /api/maintenance/schedules/:scheduleId/send-to-customer
Request Body:
{
  "customerNotes": "Optional notes for customer"
}
Response:
{
  "success": true,
  "message": "Schedule sent to customer and reminders scheduled",
  "data": {...}
}
```

---

### Maintenance (Finance Approved) Endpoints

#### Get All Maintenance Records
```
GET /api/maintenance?status=Finance%20Approved&search=searchTerm
Response:
{
  "success": true,
  "count": 15,
  "data": [...]
}
```

#### Create Maintenance from Quotation Acceptance
```
POST /api/maintenance/create-from-quotation
Request Body:
{
  "maintenanceScheduleId": "mongoid",
  "customerId": "mongoid",
  "ticketId": "#2245",
  "serviceDate": "2026-10-10T00:00:00Z",
  "serviceName": "First Service",
  "materialList": [
    { "item": "Filter", "quantity": "1", "estimatedCost": 50 },
    { "item": "Refrigerant", "quantity": "1kg", "estimatedCost": 100 }
  ],
  "totalEstimatedCost": 225
}
Response:
{
  "success": true,
  "message": "Maintenance record created from customer acceptance",
  "data": {...}
}
```

#### Get Maintenance by Schedule
```
GET /api/maintenance/by-schedule/:scheduleId
Response:
{
  "success": true,
  "count": 4,
  "data": [...]
}
```

#### Send Material List to Inventory Manager
```
POST /api/maintenance/:maintenanceId/send-material-to-im
Response:
{
  "success": true,
  "message": "Material list sent to Inventory Manager",
  "data": {
    "...maintenance...",
    "status": "Material Sent to IM",
    "sentToInventoryManagerAt": "2026-03-15T10:30:00Z"
  }
}
```

#### Assign Team to Maintenance
```
POST /api/maintenance/:maintenanceId/assign-team
Request Body:
{
  "teamId": "teamMongoId",
  "teamName": "Service Team A"
}
Response:
{
  "success": true,
  "message": "Service team assigned to maintenance",
  "data": {
    "...maintenance...",
    "status": "Team Assigned",
    "assignedTeam": "Service Team A"
  }
}
```

---

### Reminder & Quotation Endpoints

#### Get Pending Reminders
```
GET /api/maintenance/reminders/pending
Response:
{
  "success": true,
  "count": 3,
  "data": [...]
}
```

#### Send Reminder to Customer
```
POST /api/maintenance/reminders/:reminderId/send
Request Body:
{
  "defaultMaterials": [
    { "item": "Filter", "quantity": "1", "estimatedCost": 50 }
  ],
  "estimatedTotal": 225
}
Response:
{
  "success": true,
  "message": "Reminder sent to customer",
  "data": {...}
}
```

#### Record Customer Response to Reminder
```
POST /api/maintenance/reminders/:reminderId/respond
Request Body:
{
  "accepted": true,  // or false for rejection
  "notes": "Optional customer notes"
}
Response:
{
  "success": true,
  "message": "Reminder marked as accepted",
  "data": {...}
}
```

---

## Status Enums

### Installation Maintenance Status
- `Installation Completed`: Initial status when installation is finished
- `Schedule Created`: Maintenance schedule has been created
- `Sent to CSA`: Schedule sent to Customer Service Agent for review
- `Sent to Customer`: CSA has sent schedule to customer

### Maintenance Schedule Status
- `New`: Newly created schedule
- `Draft Saved`: Partially filled schedule saved as draft
- `Sent to CSA`: Sent to CSA for approval
- `Sent to Customer`: Sent to customer for their information

### Maintenance Status
- `Finance Approved`: Initial status after customer accepts quotation
- `Material Sent to IM`: Material list sent to Inventory Manager
- `Team Assigned`: Service team has been assigned
- `Scheduled`: Scheduled for execution
- `In Progress`: Currently being executed
- `Completed`: Maintenance completed

### Reminder Status
- `Pending`: Waiting to be sent
- `Sent`: Reminder has been sent to customer
- `Accepted`: Customer accepted the maintenance
- `Rejected`: Customer rejected the maintenance

---

## Automatic Processes

### Reminder Scheduler
- **Location**: `/src/jobs/scheduler.js` and `/src/jobs/reminder.job.js`
- **Frequency**: Configurable via `REMINDER_JOB_INTERVAL` environment variable (default: 60 minutes)
- **Function**: 
  1. Finds pending reminders scheduled for "now or earlier"
  2. Sends email reminders to customers with:
     - Service date and name
     - Default quotation with materials
     - Estimated cost
  3. Processes accepted reminders and creates Maintenance records

### Email Configuration
Configure in `.env`:
```
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password
REMINDER_JOB_INTERVAL=60
```

---

## Frontend Integration Points

### 1. Installation Tab → Complete Installation
- Button: "Complete Installation"
- Action: `POST /api/installations/:id/complete`
- Result: Redirects to Maintenance Schedule tab

### 2. Maintenance Schedule Tab (Main Technician)
- Display schedules with status badges
- For "New" status:
  - Allow date selection for each service
  - Show draft save option
  - Button: "Send to CSA"

### 3. Maintenance Schedule Tab (CSA)
- Display schedules with status = "Sent to CSA"
- View and edit notes
- Button: "Send to Customer"

### 4. Reminders (Background)
- Automatic processing via scheduler
- Can manually trigger: `GET /api/maintenance/reminders/pending`

### 5. Maintenance Tab (Materials)
- Display after customer acceptance
- Status: "Finance Approved"
- Button: "Send to Inventory Manager"
- Status changes to "Material Sent to IM"

### 6. Team Management Tab
- Display maintenance with status = "Material Sent to IM"
- Dropdown to select team
- Button: "Assign Team"
- Status changes to "Team Assigned"

### 7. Maintenance Tab (Final)
- Display maintenance with status = "Team Assigned"
- Shows assigned team and material list
- Technicians can then work on it

---

## Error Handling

All endpoints return:
```json
{
  "success": false,
  "error": "Error message here",
  "message": "Detailed error description"
}
```

Common scenarios:
- 404: Resource not found
- 400: Invalid request body
- 500: Server error with detailed message

---

## Testing the Workflow

### Step 1: Complete Installation
```bash
curl -X POST http://localhost:3000/api/installations/{installationId}/complete
```

### Step 2: Get Created Schedule
```bash
curl http://localhost:3000/api/maintenance/schedules
```

### Step 3: Update with Dates
```bash
curl -X PATCH http://localhost:3000/api/maintenance/schedules/{scheduleId} \
  -H "Content-Type: application/json" \
  -d '{
    "services": [
      {"serviceName": "First Service", "date": "2026-10-10T00:00:00Z"},
      ...
    ]
  }'
```

### Step 4: Send to CSA
```bash
curl -X POST http://localhost:3000/api/maintenance/schedules/{scheduleId}/send-to-csa \
  -H "Content-Type: application/json" \
  -d '{"csaNotes": "Review and approve"}'
```

### Step 5: Send to Customer
```bash
curl -X POST http://localhost:3000/api/maintenance/schedules/{scheduleId}/send-to-customer \
  -H "Content-Type: application/json" \
  -d '{"customerNotes": "Sent for your approval"}'
```

### Step 6: Check Pending Reminders (after 7 days before service)
```bash
curl http://localhost:3000/api/maintenance/reminders/pending
```

---

## Environment Variables

```env
# Database
MONGODB_URI=mongodb://localhost:27017/maintenance-db

# Email (for reminder notifications)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password

# Scheduler
REMINDER_JOB_INTERVAL=60  # minutes between reminder checks

# Server
PORT=5000
```

---

## Notes

1. **Draft Recovery**: If a user stops creating a schedule midway, they can retrieve the draft through the save draft endpoint
2. **Automatic Reminders**: Set `REMINDER_JOB_INTERVAL` to check frequently (e.g., every 5 minutes) for testing
3. **Material List**: Default materials are generated in the reminder job. Customize in the `processPendingReminders` function
4. **Email Template**: Customize email template in `/src/jobs/reminder.job.js`
5. **Timezone**: All dates are stored in UTC; ensure frontend converts to local timezone for display

---

## Future Enhancements

1. Add SMS reminders in addition to email
2. Implement customer portal for acceptance/rejection
3. Add attachment support (photos, documents) to maintenance records
4. Implement escalation for rejected reminders
5. Add reporting and analytics dashboard
6. Implement partial/phased service options
7. Add cost adjustments and approval workflows
8. Implement rescheduling capabilities
