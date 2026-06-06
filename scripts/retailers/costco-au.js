const { createBrowser, withRetry, createResult } = require('./scraper-base');

const PRODUCT_URL = 'https://www.costco.com.au/c/Subsoccer-C3-Bench-Soccer-Game/p/2029137';

async function scrapeCostcoAU() {
    console.log('🇦🇺 Costco Australia — Subsoccer C3...');

    return withRetry(async () => {
        const { browser, page } = await createBrowser();
        try {
            await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);

            const data = await page.evaluate(() => {
                // Hinta
                let price = null;
                const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"], [data-testid*="price"]');
                for (const el of priceEls) {
                    const text = el.textContent || '';
                    const match = text.match(/\$\s*([\d,]+\.?\d*)/);
                    if (match) {
                        price = parseFloat(match[1].replace(',', ''));
                        break;
                    }
                }
                // Fallback: etsi mikä tahansa hintamuotoilu sivulta
                if (!price) {
                    const body = document.body.innerText;
                    const m = body.match(/\$\s*([\d,]+\.\d{2})/);
                    if (m) price = parseFloat(m[1].replace(',', ''));
                }

                // Tuotenimi
                let product = '';
                const h1 = document.querySelector('h1');
                if (h1) product = h1.textContent.trim();

                // Saatavuus
                let inStock = null;
                const bodyText = document.body.innerText.toLowerCase();
                if (bodyText.includes('out of stock') || bodyText.includes('unavailable') || bodyText.includes('sold out')) {
                    inStock = false;
                } else if (bodyText.includes('add to') || bodyText.includes('in stock') || bodyText.includes('delivery')) {
                    inStock = true;
                }

                // Arvostelut
                let rating = null;
                let reviewCount = null;
                const ratingEl = document.querySelector('[class*="rating"], [class*="stars"], [aria-label*="star"]');
                if (ratingEl) {
                    const rText = ratingEl.textContent || ratingEl.getAttribute('aria-label') || '';
                    const rMatch = rText.match(/([\d.]+)\s*(?:out of|\/)\s*5/);
                    if (rMatch) rating = parseFloat(rMatch[1]);
                }
                const reviewEl = document.querySelector('[class*="review"], [class*="Review"]');
                if (reviewEl) {
                    const rvMatch = (reviewEl.textContent || '').match(/(\d+)\s*(?:review|arvostelu)/i);
                    if (rvMatch) reviewCount = parseInt(rvMatch[1]);
                }

                // Kuva
                let imageUrl = null;
                const img = document.querySelector('[class*="product"] img[src^="http"], [class*="gallery"] img[src^="http"]');
                if (img) imageUrl = img.src;

                return { price, product, inStock, rating, reviewCount, imageUrl };
            });

            await browser.close();

            return createResult({
                retailer: 'costco-au',
                product: data.product || 'Subsoccer C3 Bench Soccer Game',
                url: PRODUCT_URL,
                price: data.price,
                currency: 'AUD',
                inStock: data.inStock,
                rating: data.rating,
                reviewCount: data.reviewCount,
                imageUrl: data.imageUrl,
            });
        } catch (err) {
            await browser.close();
            throw err;
        }
    });
}

module.exports = { scrapeCostcoAU };
