const fs = require('fs');

const path = '../frontend/src/app/features/technician/pages/main-technician-materials/main-technician-materials.component.ts';
let code = fs.readFileSync(path, 'utf8');

// Update UI to check for 'Approved' instead of 'Finance Approved'
code = code.replace(
  /status: 'Finance Approved' \| 'New' \| 'Pending Approval' \| 'Pending' \| 'Sent to IM';/g,
  "status: 'Approved' | 'Finance Approved' | 'New' | 'Pending Approval' | 'Pending' | 'Sent to IM';"
);

code = code.replace(
  /case 'Finance Approved':/g,
  "case 'Finance Approved':\n        case 'Approved':"
);

code = code.replace(
  /this\.selectedRequest\.status !== 'Finance Approved'/g,
  "this.selectedRequest.status !== 'Finance Approved' && this.selectedRequest.status !== 'Approved'"
);

// Map API paymentStatus to UI status
code = code.replace(
  /status: item\.status \|\| 'New',/g,
  "status: item.paymentStatus || item.status || 'New',"
);

// We need to add paymentStatus to the RawMaterialRequest interface
code = code.replace(
  /status\?: string;/g,
  "status?: string;\n    paymentStatus?: string;"
);
code = code.replace(
  /status\?: MaterialRequest\['status'\];/g,
  "status?: MaterialRequest['status'];\n    paymentStatus?: string;"
);


fs.writeFileSync(path, code);
