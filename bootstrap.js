const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'index.js');
const runtimePath = path.join(__dirname, '.index-runtime.js');
let code = fs.readFileSync(sourcePath, 'utf8');

code = code.replace(
  '[`Alle gangleden worden automatisch uit Discord gesynchroniseerd naar de tab Leden.",',
  '["Alle gangleden worden automatisch uit Discord gesynchroniseerd naar de tab Leden.",'
);

fs.writeFileSync(runtimePath, code, 'utf8');
require(runtimePath);
