const fs = require('fs');

function patchController() {
  const path = 'src/modules/shared/jobMaterialRequest/jobMaterialRequest.controller.js';
  let code = fs.readFileSync(path, 'utf8');

  // submitMaterialRequest (Maintenance)
  code = code.replace(
    /status: MAINTENANCE_STATUS\.PENDING\s*\}\s*,\s*\{\s*new:\s*true\s*\}/,
    "status: MAINTENANCE_STATUS.PENDING, paymentStatus: 'Pending' }, { new: true, strict: false }"
  );

  // submitMaterialRequest (ServiceRequest resubmission)
  code = code.replace(
    /status: WORKFLOW_STATUS\.PENDING\s*\}\s*,\s*\{\s*new:\s*true\s*\}/g,
    "status: WORKFLOW_STATUS.PENDING, paymentStatus: 'Pending' }, { new: true, strict: false }"
  );

  // sendToInventoryManager (ServiceRequest)
  code = code.replace(
    /\{\s*status:\s*WORKFLOW_STATUS\.SENT_TO_IM\s*\}\s*,\s*\{\s*new:\s*true\s*\}/g,
    "{ status: WORKFLOW_STATUS.SENT_TO_IM, paymentStatus: 'Sent to IM' }, { new: true, strict: false }"
  );
  
  // sendToInventoryManager (Maintenance)
  code = code.replace(
    /\{\s*status:\s*MAINTENANCE_STATUS\.SENT_TO_IM\s*\}\s*,\s*\{\s*new:\s*true\s*\}/g,
    "{ status: MAINTENANCE_STATUS.SENT_TO_IM, paymentStatus: 'Sent to IM' }, { new: true, strict: false }"
  );

  // Add JobMaterialRequest creation to sendToInventoryManager
  const imCreationCode = `
    if (!sourceRecord) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const JobMaterialRequest = require('./jobMaterialRequest.model');
    const jobTypeMapping = {
      'Service': 'Repair',
      'Installation': 'Installation',
      'Maintenance': 'Maintenance',
      'Repair': 'Repair'
    };
    
    // Create IM record
    const imRecord = new JobMaterialRequest({
      jobId: resolvedId,
      jobType: jobTypeMapping[requestType] || 'Repair',
      items: (materials || []).map(m => ({ itemName: m.item, quantity: m.quantity })),
      status: 'PENDING'
    });
    await imRecord.save();
`;
  code = code.replace(
    /if\s*\(!sourceRecord\)\s*\{\s*return\s*res\.status\(404\)\.json\(\{\s*success:\s*false,\s*message:\s*'Request not found'\s*\}\);\s*\}/,
    imCreationCode
  );

  // approveFinance
  code = code.replace(
    /\{\s*status:\s*WORKFLOW_STATUS\.FINANCE_APPROVED\s*\}\s*,\s*\{\s*new:\s*true\s*\}/g,
    "{ status: WORKFLOW_STATUS.FINANCE_APPROVED, paymentStatus: 'Approved' }, { new: true, strict: false }"
  );
  code = code.replace(
    /\{\s*status:\s*MAINTENANCE_STATUS\.FINANCE_APPROVED\s*\}\s*,\s*\{\s*new:\s*true\s*\}/g,
    "{ status: MAINTENANCE_STATUS.FINANCE_APPROVED, paymentStatus: 'Approved' }, { new: true, strict: false }"
  );
  
  // rejectFinance
  code = code.replace(
    /financeNotes: reason \|\| 'Rejected by Finance'\s*\}\s*,\s*\{\s*new:\s*true\s*\}/g,
    "financeNotes: reason || 'Rejected by Finance', paymentStatus: 'Rejected' }, { new: true, strict: false }"
  );

  fs.writeFileSync(path, code);
}

function patchRoutes() {
  const path = 'src/modules/shared/jobMaterialRequest/jobMaterialRequest.routes.js';
  let code = fs.readFileSync(path, 'utf8');

  // We need to inject paymentStatus into the returned JSON so UI can use it.
  
  code = code.replace(
    /requestType: item\.serviceType \|\| 'Repair'\s*\};/g,
    "requestType: item.serviceType || 'Repair', paymentStatus: item.paymentStatus || item.status };"
  );
  
  code = code.replace(
    /requestType: REQUEST_TYPES\.INSTALLATION\s*\};/g,
    "requestType: REQUEST_TYPES.INSTALLATION, paymentStatus: item.paymentStatus || item.status };"
  );
  
  code = code.replace(
    /isFreeOfCharge\s*\};/g,
    "isFreeOfCharge, paymentStatus: req.paymentStatus || 'New' };"
  );
  
  code = code.replace(
    /materials: item\.materialList \|\| \[\]\s*\};/g,
    "materials: item.materialList || [], paymentStatus: item.paymentStatus || item.status };"
  );

  fs.writeFileSync(path, code);
}

patchController();
patchRoutes();
