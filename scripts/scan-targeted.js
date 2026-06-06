const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const QUERY = process.argv[2] || 'subsoccer costco';
const OUTPUT_PATH = path.join(__dirname, '../brand-mentions.json');

async function scanGoogle(query) {
    console.log('══════════════════════════════════════════════════');
    console.log(`  🔍 Kohdennettu haku: "${query}"`);
    console.log(`  📅 ${new Date().toLocaleString('fi-FI')}`);
    console.log('══════════════════════════════════════════════════\n');

    let browser;
    try {
        browser = await chromium.launch({ headless: false });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'en-US',
            viewport: { width: 1280, height: 900 }
        });

        // ─── 1. Google Web Search ───────────────────────────────────
        console.log('🌐 Haetaan Google-hakutuloksia...');
        const page = await context.newPage();
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`);

        // Evästehyväksyntä
        try {
            for (const sel of ['button:has-text("Hyväksy kaikki")', 'button:has-text("Accept all")', '#L2AGLb']) {
                const btn = page.locator(sel).first();
                if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); await page.waitForTimeout(1500); break; }
            }
        } catch (_) {}

        console.log('⏳ Odotetaan hakutuloksia (ratkaise CAPTCHA tarvittaessa, 2 min aikaa)...');
        try {
            await page.waitForSelector('#search', { timeout: 120000 });
        } catch (_) {
            console.log('⚠️  Hakutuloksia ei saatu ladattua.');
            await browser.close();
            return;
        }
        await page.waitForTimeout(2000);

        // Kerää web-hakutulokset
        const webResults = await page.evaluate(() => {
            const results = [];
            // Google hakutulokset ovat yleensä <a> tagien sisällä #search-kontissa
            const searchDiv = document.querySelector('#search') || document.body;
            const links = searchDiv.querySelectorAll('a[href^="http"]');

            for (const a of links) {
                const href = a.href;
                if (href.includes('google.com') || href.includes('gstatic.com') || href.includes('accounts.google')) continue;

                // Etsi otsikko (h3-elementti linkin sisällä)
                const h3 = a.querySelector('h3');
                if (!h3) continue;

                const title = h3.textContent?.trim();
                if (!title) continue;

                let domain = '';
                try { domain = new URL(href).hostname.replace('www.', ''); } catch (_) {}

                // Etsi kuvake/thumbnail
                let imgUrl = null;
                const parentDiv = a.closest('[data-hveid]') || a.closest('.g');
                if (parentDiv) {
                    const img = parentDiv.querySelector('img[src^="http"], img[src^="data:image/jpeg"], img[src^="data:image/png"]');
                    if (img && img.width > 30) imgUrl = img.src;
                }

                results.push({
                    id: `web-${results.length}`,
                    title,
                    link: href,
                    domain,
                    source: 'google-web',
                    imgUrl,
                    scrapedAt: new Date().toISOString()
                });
            }
            return results;
        });

        console.log(`✅ Google Web: ${webResults.length} tulosta.\n`);

        // ─── 2. Google Images ───────────────────────────────────────
        console.log('🖼️  Haetaan Google Images -tuloksia...');
        const imgPage = await context.newPage();
        await imgPage.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&udm=2`);

        let imageResults = [];
        try {
            await imgPage.waitForSelector('img[src^="data:image/jpeg"], img[src^="data:image/png"], img[src^="http"]', { timeout: 30000 });
            await imgPage.waitForTimeout(3000);

            imageResults = await imgPage.evaluate(() => {
                const items = [];
                const seen = new Set();
                document.querySelectorAll('img').forEach((img, i) => {
                    if (img.src && (img.src.startsWith('http') || img.src.startsWith('data:image/jpeg') || img.src.startsWith('data:image/png')) && img.width > 60) {
                        if (!seen.has(img.src) && !img.src.startsWith('data:image/gif')) {
                            seen.add(img.src);
                            items.push({
                                id: `gimg-costco-${items.length}`,
                                imgUrl: img.src,
                                title: img.alt || 'Subsoccer Costco -kuva',
                                link: 'https://www.google.com/search?q=subsoccer+costco&udm=2',
                                domain: 'google.com',
                                source: 'google-images',
                                scrapedAt: new Date().toISOString()
                            });
                        }
                    }
                });
                return items;
            });
            console.log(`✅ Google Images: ${imageResults.length} kuvaa.\n`);
        } catch (_) {
            console.log('⚠️  Google Images ei latautunut (CAPTCHA?). Ohitetaan.\n');
        }

        await browser.close();

        // ─── Yhdistä tulokset ───────────────────────────────────────
        const allNew = [...webResults, ...imageResults];

        console.log('📊 Yhteenveto:');
        console.log(`   Web-tuloksia:  ${webResults.length}`);
        console.log(`   Kuvia:         ${imageResults.length}`);
        console.log(`   Yhteensä:      ${allNew.length}\n`);

        // Tulosta web-tulokset
        if (webResults.length > 0) {
            console.log('🌐 Web-tulokset:');
            webResults.forEach((r, i) => {
                console.log(`   ${i + 1}. [${r.domain}] ${r.title}`);
                console.log(`      ${r.link}\n`);
            });
        }

        // Yhdistä olemassa olevaan dataan
        let existing = [];
        try {
            if (fs.existsSync(OUTPUT_PATH)) {
                existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
            }
        } catch (_) {}

        const existingLinks = new Set(existing.map(r => r.link));
        const brandNew = allNew.filter(r => !existingLinks.has(r.link));

        const merged = [...brandNew, ...existing];
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2), 'utf-8');

        console.log(`🆕 ${brandNew.length} uutta tulosta lisätty.`);
        console.log(`💾 Tallennettu: ${OUTPUT_PATH}`);
        console.log('══════════════════════════════════════════════════\n');

    } catch (err) {
        console.error('❌ Haku epäonnistui:', err.message);
        if (browser) await browser.close();
    }
}

scanGoogle(QUERY);
