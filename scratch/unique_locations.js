const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '../backups/public_tracking_latest.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const locations = new Set(data.map(d => d.location).filter(Boolean));
console.log("Unique locations in public_tracking:", Array.from(locations));
