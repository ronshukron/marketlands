const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/extractUrls.js <file>');
  process.exit(1);
}

const s = fs.readFileSync(file, 'utf8');

const urlRe = /https?:\/\/[^\s"'`\\]+/g;
const relRe = /\/api\/[A-Za-z0-9_\-\/\?\=\&\.%]+/g;
const hostRe = /(rexail|ecommerce|product|price|catalog|store|graphql)/gi;

const urls = new Set(s.match(urlRe) || []);
const rels = new Set(s.match(relRe) || []);

console.log(`File: ${file}`);
console.log(`Absolute URLs (${urls.size}):`);
Array.from(urls).slice(0, 200).forEach((u) => console.log(u));
console.log(`\nRelative /api URLs (${rels.size}):`);
Array.from(rels).slice(0, 200).forEach((u) => console.log(u));

// Also print interesting string literals-ish segments containing host keywords
const hits = [];
let m;
const strRe = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
while ((m = strRe.exec(s)) !== null) {
  const val = m[1];
  if (hostRe.test(val)) hits.push(val);
}
console.log(`\nInteresting string literals (${hits.length}):`);
hits.slice(0, 200).forEach((h) => console.log(h));


