const { chromium } = require('playwright');

/**
 * Luo Playwright-selain skrapereita varten.
 * Palauttaa { browser, page } -objektin.
 */
async function createBrowser(options = {}) {
    const browser = await chromium.launch({
        headless: options.headless !== false, // oletuksena headless
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    return { browser, page };
}

/**
 * Yritä suorittaa funktio uudelleen virhetilanteessa.
 * @param {Function} fn - async-funktio
 * @param {number} retries - uudelleenyrityskertojen määrä
 */
async function withRetry(fn, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries) throw err;
            console.log(`   ⟳ Yritys ${i + 1} epäonnistui: ${err.message}. Yritetään uudelleen...`);
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

/**
 * Standardimuotoinen tulos yhdestä tuotteesta.
 */
function createResult(data) {
    return {
        retailer: data.retailer || 'unknown',
        product: data.product || 'Subsoccer',
        url: data.url || '',
        price: data.price || null,
        currency: data.currency || 'USD',
        inStock: data.inStock ?? null,
        rating: data.rating || null,
        reviewCount: data.reviewCount || null,
        imageUrl: data.imageUrl || null,
        scrapedAt: new Date().toISOString(),
    };
}

module.exports = { createBrowser, withRetry, createResult };
