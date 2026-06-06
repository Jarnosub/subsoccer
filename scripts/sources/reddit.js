const https = require('https');

const REDDIT_SEARCH_URL =
  'https://www.reddit.com/search.json?q=subsoccer&sort=new&limit=25';

/**
 * Hakee Reddit-tulokset JSON-muodossa.
 * @returns {Promise<Buffer>}
 */
function fetchJson() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,fi;q=0.8',
      },
    };

    https
      .get(REDDIT_SEARCH_URL, options, (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(
              new Error(`Reddit palautti statuskoodin ${res.statusCode}`)
            );
          }
          resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Muuntaa yksittäisen Reddit-postauksen yhtenäiseen muotoon.
 * @param {object} child - Reddit API:n palauttama post-objekti
 * @returns {object}
 */
function parsePost(child) {
  const data = child.data;

  const thumbnail =
    data.thumbnail && data.thumbnail.startsWith('http')
      ? data.thumbnail
      : null;

  return {
    id: data.id,
    title: data.title,
    link: `https://www.reddit.com${data.permalink}`,
    domain: 'reddit.com',
    source: 'reddit',
    subreddit: data.subreddit,
    score: data.score,
    imgUrl: thumbnail,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Hakee Reddit-postaukset, joissa mainitaan "subsoccer".
 * Palauttaa tyhjän taulukon virhetilanteessa.
 * @returns {Promise<Array<object>>}
 */
async function fetchReddit() {
  try {
    console.log('🔍 Haetaan Reddit-mainintoja hakusanalla "subsoccer"...');

    const body = await fetchJson();
    const json = JSON.parse(body);

    const children = json?.data?.children ?? [];
    const results = children.map(parsePost);

    console.log(`✅ Reddit: löydettiin ${results.length} tulosta.`);
    return results;
  } catch (err) {
    console.error('❌ Reddit-haku epäonnistui:', err.message);
    return [];
  }
}

module.exports = { fetchReddit };
