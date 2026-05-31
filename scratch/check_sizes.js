const fs = require('fs');
const https = require('https');
const path = require('path');

const files = [
  path.join(__dirname, '../backups/players_latest.json'),
  path.join(__dirname, '../backups/events_latest.json'),
  path.join(__dirname, '../backups/games_latest.json')
];

const urls = [];
for (const file of files) {
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.forEach(item => {
      for (const val of Object.values(item)) {
        if (typeof val === 'string' && val.includes('supabase.co/storage')) {
          urls.push(val);
        }
      }
    });
  }
}

const uniqueUrls = [...new Set(urls)];
console.log(`Checking ${uniqueUrls.length} unique Supabase Storage URLs...`);

const results = [];
let completed = 0;

function checkUrl(url) {
  const req = https.request(url, { method: 'HEAD' }, (res) => {
    const size = parseInt(res.headers['content-length'] || '0', 10);
    results.push({ url, size, contentType: res.headers['content-type'] });
    completed++;
    if (completed === uniqueUrls.length) {
      printResults();
    }
  });

  req.on('error', (err) => {
    results.push({ url, size: 0, contentType: 'error', error: err.message });
    completed++;
    if (completed === uniqueUrls.length) {
      printResults();
    }
  });

  req.end();
}

function printResults() {
  results.sort((a, b) => b.size - a.size);
  let totalBytes = 0;
  
  console.log('\n--- TOP STORAGE ASSETS BY SIZE ---');
  results.forEach((r, idx) => {
    totalBytes += r.size;
    const sizeMb = (r.size / (1024 * 1024)).toFixed(3);
    console.log(`${idx + 1}. [${sizeMb} MB] Type: ${r.contentType} | URL: ${r.url}`);
  });
  
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(`\nTotal Size of Database-Linked Assets: ${totalMb} MB`);
}

if (uniqueUrls.length === 0) {
  console.log('No Supabase Storage URLs found.');
} else {
  uniqueUrls.forEach(checkUrl);
}
