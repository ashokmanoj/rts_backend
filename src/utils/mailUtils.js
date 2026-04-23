const fs = require('fs');

const instantiateFromTemplate = (template, vars) =>
    Object.keys(vars).reduce((a, n) => a.split(`\${${n}}`).join(vars[n]), template);

const readFile = (filename) =>
  fs.readFileSync(filename, { encoding: 'utf-8', flag: 'r'});

module.exports = {
  instantiateFromTemplate
  , readFile
};
