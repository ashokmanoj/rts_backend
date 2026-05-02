const fs = require('fs');

const escapeHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const instantiateFromTemplate = (template, vars) =>
    Object.keys(vars).reduce((a, n) => {
      // Don't escape the 'link' variable as it's intended to be a raw URL in an href
      const value = n === 'link' ? vars[n] : escapeHTML(vars[n]);
      return a.split(`\${${n}}`).join(value);
    }, template);

const readFile = (filename) =>
  fs.readFileSync(filename, { encoding: 'utf-8', flag: 'r'});

module.exports = {
  instantiateFromTemplate
  , readFile
};
