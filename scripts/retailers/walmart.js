const { createResult } = require('./scraper-base');
const { chromium } = require('playwright');

const PRODUCTS = [
    {
        url: 'https://www.walmart.com/search?q=subsoccer',
        name: 'Subsoccer (haku)',
        id: 'walmart-search'
    }
];

/**
 * Skrappaa Walmart-hakutulokset "subsoccer" -hakusanalla.
 * Käyttää headful-selainta jotta CAPTCHA voidaan ratkaista.
 */
async function scrapeWalmart() {
    console.log('🇺🇸 Walmart — Subsoccer-tuotteet (headful)...');
    const results = [];

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        viewport: { width: 1280, height: 900 }
    });
    const page = await context.newPage();

    try {
        // Hae Walmart-hakusivu
        await page.goto('https://www.walmart.com/search?q=subsoccer', { waitUntil: 'domcontentloaded', timeout: 30000 });

        console.log('   ⏳ Odotetaan Walmart-sivua (ratkaise CAPTCHA tarvittaessa, 2 min)...');

        // Odota tuotelistaa tai CAPTCHA-ratkaisu
        try {
            await page.waitForSelector('[data-testid="list-view"] [data-item-id], .search-result-gridview-item, [link-identifier]', { timeout: 120000 });
        } catch (_) {
            // Yritä uudelleen navigoimalla
            console.log('   Yritetään uudelleen...');
            await page.goto('https://www.walmart.com/search?q=subsoccer', { waitUntil: 'domcontentloaded' });
            try {
                await page.waitForSelector('[data-testid="list-view"] [data-item-id], .search-result-gridview-item, [link-identifier]', { timeout: 30000 });
            } catch (_2) {
                console.log('   ⚠️  Walmart-hakutuloksia ei saatu ladattua.');
                await browser.close();
                return results;
            }
        }
        await page.waitForTimeout(3000);

        // Kerää tuotteet hakutuloksista
        const products = await page.evaluate(() => {
            const items = [];
            // Walmart käyttää tuotekortteja hakutuloksissa
            const cards = document.querySelectorAll('[data-item-id], [data-testid*="product"], .sans-serif.mid-gray');

            // Yritä eri strategioita
            // Strategia 1: etsi kaikki tuotteet joissa on hinta ja otsikko
            const allLinks = Array.from(document.querySelectorAll('a[href*="/ip/"]'));
            const seen = new Set();

            for (const a of allLinks) {
                const href = a.href;
                if (seen.has(href)) continue;

                // Etsi otsikko
                const titleEl = a.querySelector('[data-automation-id="product-title"], span[data-automation-id]') || a;
                const title = titleEl?.textContent?.trim() || '';
                if (!title || title.length < 5) continue;
                if (!title.toLowerCase().includes('subsoccer')) continue;

                seen.add(href);

                // Etsi hinta — voi olla saman tuotekortin sisällä
                const card = a.closest('[data-item-id]') || a.closest('[data-testid]') || a.parentElement?.parentElement?.parentElement;
                let price = null;
                if (card) {
                    const priceText = card.textContent || '';
                    // Etsi dollarihinta
                    const priceMatches = priceText.match(/\$\s*([\d,]+\.?\d*)/g);
                    if (priceMatches) {
                        // Ota ensimmäinen järkevä hinta (ei liian pieni, esim. sentti)
                        for (const pm of priceMatches) {
                            const val = parseFloat(pm.replace(/[$,]/g, ''));
                            if (val > 5) { price = val; break; }
                        }
                    }
                }

                // Etsi kuva
                let imgUrl = null;
                if (card) {
                    const img = card.querySelector('img[src^="http"]');
                    if (img) imgUrl = img.src;
                }

                items.push({ title, url: href, price, imgUrl });
            }

            return items;
        });

        console.log(`   Löydettiin ${products.length} Subsoccer-tuotetta.`);

        for (const prod of products) {
            console.log(`   📦 ${prod.title.substring(0, 60)} — $${prod.price || '?'}`);
            results.push(createResult({
                retailer: 'walmart-' + results.length,
                product: prod.title,
                url: prod.url,
                price: prod.price,
                currency: 'USD',
                inStock: prod.price ? true : null,
                imageUrl: prod.imgUrl,
            }));
        }

    } catch (err) {
        console.log(`   ❌ Walmart-haku epäonnistui: ${err.message}`);
    }

    await browser.close();
    return results;
}

module.exports = { scrapeWalmart };
