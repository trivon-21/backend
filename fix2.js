const fs = require('fs');
let code = fs.readFileSync('src/modules/shared/installation/installation.controller.js', 'utf8');
code = code.replace("location: installation.customerId?.address || installation.location || '-', installation.customerId?.address || installation.location || '-',", "location: installation.customerId?.address || installation.location || '-',");
fs.writeFileSync('src/modules/shared/installation/installation.controller.js', code);
