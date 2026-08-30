const fs = require('fs');
const file = 'src/modules/shared/jobMaterialRequest/jobMaterialRequest.controller.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/    } catch \(err\) \{\r?\n        res\.status\(500\)\.json\(\{ success: false, error: err\.message \}\);\r?\n    \}\r?\n\}\);\r?\n/, '    } catch (err) {\n        res.status(500).json({ success: false, error: err.message });\n    }\n};\n');
fs.writeFileSync(file, content);
console.log('Fixed syntax error');
