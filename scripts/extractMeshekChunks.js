const fs = require('fs');

const file = process.argv[2] || 'temp-allorigins.html';
const html = fs.readFileSync(file, 'utf8');
const matches = [...html.matchAll(/"(?<src>\/_next\/static\/chunks\/[^"]+\.js)"/g)];
const unique = Array.from(new Set(matches.map((m) => m.groups.src)));

console.log(`File: ${file}`);
console.log(`Found ${unique.length} chunk urls`);
unique.slice(0, 50).forEach((u) => console.log(u));


