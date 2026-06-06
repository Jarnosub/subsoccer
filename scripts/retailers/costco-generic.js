const { createBrowser, withRetry, createResult } = require('./scraper-base');

/**
 * Geneerinen Costco-skraperi: hakee tuotteen hakusanalla tai tuotenumerolla.
 * Tukee costco.ca, costco.co.nz ja muita Costco-sivustoja.
 */
async function scrapeCostcoGeneric({ id, country, baseUrl, searchUrl, currency }) {
    const flag = { 'CA': '🇨🇦', 'NZ': '🇳🇿', 'AU': '🇦🇺', 'US': '🇺🇸' }[country] || '🌍';
    console.log(`${flag} Costco ${country} — Haetaan Subsoccer...`);

    return withRetry(async () => {
        const { browser, page } = await createBrowser();
        try {
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);

            // Etsi tuote hakutuloksista tai tuotesivulta
            const data = await page.evaluate((baseUrl) => {
                const body = document.body.innerText || '';
                const html = document.documentElement.innerHTML || '';

                // Hinta
                let price = null;
                const priceMatches = body.match(/\$\s*([\d,]+\.\d{2})/g);
                if (priceMatches) {
                    for (const pm of priceMatches) {
                        const val = parseFloat(pm.replace(/[$,]/g, ''));
                        if (val > 50 && val < 5000) { price = val; break; }
                    }
                }

                // Tuotenimi — etsi Subsoccer-maininta
                let product = '';
                const h1 = document.querySelector('h1');
                if (h1 && h1.textContent.toLowerCase().includes('subsoccer')) {
                    product = h1.textContent.trim();
                }
                // Fallback: etsi mikä tahansa otsikko jossa "subsoccer"
                if (!product) {
                    const allHeaders = document.querySelectorAll('h1, h2, h3, a[href*="subsoccer" i], a[href*="Subsoccer"]');
                    for (const h of allHeaders) {
                        if (h.textContent.toLowerCase().includes('subsoccer')) {
                            product = h.textContent.trim().substring(0, 100);
                            break;
                        }
                    }
                }
                // Fallback: hae tuotelinkit
                if (!product) {
                    const links = document.querySelectorAll('a');
                    for (const a of links) {
                        const text = a.textContent || '';
                        if (text.toLowerCase().includes('subsoccer') && text.length > 10 && text.length < 150) {
                            product = text.trim();
                            break;
                        }
                    }
                }

                // Saatavuus
                let inStock = null;
                const lowerBody = body.toLowerCase();
                if (lowerBody.includes('out of stock') || lowerBody.includes('unavailable') || lowerBody.includes('sold out') || lowerBody.includes('no results')) {
                    inStock = false;
                } else if (product && (lowerBody.includes('add to') || lowerBody.includes('delivery') || price)) {
                    inStock = true;
                }

                // Kuva
                let imageUrl = null;
                const imgs = document.querySelectorAll('img[src*="subsoccer" i], img[alt*="subsoccer" i], img[alt*="Subsoccer"]');
                if (imgs.length > 0) imageUrl = imgs[0].src;

                // Tuotesivu-URL (jos hakusivulla, etsitään linkki tuotesivulle)
                let productUrl = '';
                const productLinks = document.querySelectorAll('a[href*="subsoccer" i], a[href*="2029137"]');
                if (productLinks.length > 0) {
                    productUrl = productLinks[0].href;
                }

                return { price, product, inStock, imageUrl, productUrl };
            }, baseUrl);

            await browser.close();

            const foundProduct = data.product || null;
            const productUrl = data.productUrl || searchUrl;

            if (!foundProduct) {
                console.log(`   ⚠️  Subsoccer ei löytynyt Costco ${country} -sivustolta.`);
                return null;
            }

            return createResult({
                retailer: id,
                product: foundProduct,
                url: productUrl,
                price: data.price,
                currency,
                inStock: data.inStock,
                imageUrl: data.imageUrl,
            });
        } catch (err) {
            await browser.close();
            throw err;
        }
    });
}

// ─── Costco Kanada ──────────────────────────────────────────
async function scrapeCostcoCA() {
    return scrapeCostcoGeneric({
        id: 'costco-ca',
        country: 'CA',
        baseUrl: 'https://www.costco.ca',
        searchUrl: 'https://www.costco.ca/CatalogSearch?dept=All&keyword=subsoccer',
        currency: 'CAD',
    });
}

// ─── Costco Uusi-Seelanti ───────────────────────────────────
async function scrapeCostcoNZ() {
    return scrapeCostcoGeneric({
        id: 'costco-nz',
        country: 'NZ',
        baseUrl: 'https://www.costco.co.nz',
        searchUrl: 'https://www.costco.co.nz/search?text=subsoccer',
        currency: 'NZD',
    });
}

module.exports = { scrapeCostcoCA, scrapeCostcoNZ, scrapeCostcoGeneric };
