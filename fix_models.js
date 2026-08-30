const fs = require('fs');
const files = [
    'src/modules/shared/installation/installation.model.js',
    'src/modules/shared/maintenance/maintenance.model.js',
    'src/modules/shared/repair/repair.model.js'
];
for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/<<<<<<< HEAD[\s\S]*?=======\r?\n([\s\S]*?)>>>>>>> origin\/dev-new\r?\n?/g, '$1');
    fs.writeFileSync(file, content);
    console.log('Fixed ' + file);
}
