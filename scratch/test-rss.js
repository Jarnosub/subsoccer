const https = require('https');

function getRSS(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function main() {
    console.log('Fetching Google News RSS...');
    const url = 'https://news.google.com/rss/search?q=subsoccer&hl=en-US&gl=US&ceid=US:en';
    const rss = await getRSS(url);
    console.log('RSS Status code: 200, length:', rss.length);
    // Print first 500 chars
    console.log(rss.substring(0, 800));
}

main().catch(console.error);
