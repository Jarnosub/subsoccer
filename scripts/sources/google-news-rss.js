const https = require('https');
const { URL } = require('url');

const FEED_URL =
  'https://news.google.com/rss/search?q=subsoccer&hl=en-US&gl=US&ceid=US:en';

/**
 * Hakee Google News RSS -syötteen ja palauttaa jäsennetyt tulokset.
 * @returns {Promise<Array<{id: string, title: string, link: string, domain: string, source: string, imgUrl: null, scrapedAt: string}>>}
 */
async function fetchGoogleNews() {
  try {
    console.log('Haetaan Google News RSS -syötettä...');
    const xml = await fetchUrl(FEED_URL);
    const items = parseItems(xml);
    console.log(`Google News: löydettiin ${items.length} artikkelia.`);
    return items;
  } catch (err) {
    console.error('Virhe haettaessa Google News RSS -syötettä:', err.message);
    return [];
  }
}

/**
 * Hakee URL-osoitteen sisällön HTTPS:llä.
 * @param {string} url
 * @returns {Promise<string>}
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Seurataan uudelleenohjausta
          console.log('Seurataan uudelleenohjausta...');
          return fetchUrl(res.headers.location).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP-virhe: ${res.statusCode}`));
          res.resume();
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Jäsentää RSS XML:stä <item>-elementit.
 * @param {string} xml
 * @returns {Array}
 */
function parseItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const source = extractSourceTag(block);

    if (!title || !link) {
      continue;
    }

    const domain = extractDomain(link);

    items.push({
      id: `google-news-${Buffer.from(link).toString('base64url').slice(0, 40)}`,
      title: decodeHtmlEntities(title),
      link,
      domain,
      source: 'google-news',
      imgUrl: null,
      scrapedAt: new Date().toISOString(),
    });
  }

  return items;
}

/**
 * Poimii yksinkertaisen XML-tagin sisällön.
 * @param {string} xml
 * @param {string} tag
 * @returns {string|null}
 */
function extractTag(xml, tag) {
  // Tukee sekä CDATA-sisältöä että tavallista tekstiä
  const regex = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
    'i'
  );
  const m = xml.match(regex);
  if (!m) return null;
  return (m[1] || m[2] || '').trim();
}

/**
 * Poimii <source>-tagin sisällön (attribuutit huomioiden).
 * @param {string} xml
 * @returns {string|null}
 */
function extractSourceTag(xml) {
  const regex = /<source[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/source>/i;
  const m = xml.match(regex);
  if (!m) return null;
  return (m[1] || m[2] || '').trim();
}

/**
 * Poimii domain-nimen URL-osoitteesta.
 * @param {string} link
 * @returns {string}
 */
function extractDomain(link) {
  try {
    const parsed = new URL(link);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Purkaa yleisimmät HTML-entiteetit.
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

module.exports = { fetchGoogleNews };
