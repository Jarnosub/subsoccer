const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { fetchGoogleNews } = require('./sources/google-news-rss');
const { fetchReddit } = require('./sources/reddit');
const { notifyNewMentions } = require('./notify/email');

const OUTPUT_PATH = path.join(__dirname, '../brand-mentions.json');

// ─── Google Images -skraperi (Playwright) ───────────────────────────────────
// Uusi lähestymistapa: kaivetaan lähdelinkit sivun lähdekoodista (AF_initDataCallback)
// eikä klikkailla kuvia. Paljon nopeampi ja luotettavampi.
async function fetchGoogleImages() {
    console.log('🖼️  Haetaan Google Images -tuloksia...');
    let browser;
    try {
        browser = await chromium.launch({ headless: false });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'fi-FI',
            viewport: { width: 1280, height: 800 }
        });
        const page = await context.newPage();
        await page.goto('https://www.google.com/search?q=subsoccer&udm=2&tbs=qdr:w');

        // Evästehyväksyntä
        try {
            for (const sel of ['button:has-text("Hyväksy kaikki")', 'button:has-text("Accept all")', '#L2AGLb']) {
                const btn = page.locator(sel).first();
                if (await btn.isVisible()) { await btn.click(); await page.waitForTimeout(2000); break; }
            }
        } catch (_) {}

        console.log('⏳ Odotetaan hakutuloksia (ratkaise CAPTCHA selaimessa tarvittaessa)...');
        console.log('   Sinulla on 2 minuuttia aikaa ratkaista CAPTCHA.');
        let imagesLoaded = false;
        try {
            await page.waitForSelector('img[src^="data:image/jpeg"], img[src^="data:image/png"], img[src^="http"]', { timeout: 120000 });
            imagesLoaded = true;
        } catch (_) {
            // CAPTCHA saattoi uudelleenohjata sivun — yritetään navigoida uudelleen
            console.log('   Yritetään uudelleen...');
            try {
                await page.goto('https://www.google.com/search?q=subsoccer&udm=2&tbs=qdr:w', { waitUntil: 'domcontentloaded' });
                await page.waitForSelector('img[src^="data:image/jpeg"], img[src^="data:image/png"], img[src^="http"]', { timeout: 30000 });
                imagesLoaded = true;
            } catch (_2) {}
        }
        if (!imagesLoaded) {
            console.log('⚠️  Google Images -tuloksia ei saatu ladattua.');
            await browser.close();
            return [];
        }
        await page.waitForTimeout(3000);

        // Kaiva lähdelinkit sivun HTML-lähdekoodista
        // Google upottaa kuvatulosten datan script-tageihin
        const results = await page.evaluate(() => {
            const items = [];
            const seen = new Set();
            const html = document.documentElement.innerHTML;

            // Strategia 1: Etsi URL-pareja (kuva-URL + lähde-URL) sivun datasta
            // Google tallentaa ne muodossa: ["https://kuva.jpg",width,height],["https://lahde-sivu.com"...]
            // Etsitään kaikki http-URLit jotka EI ole google/gstatic -domainilta
            const urlRegex = /\["(https?:\/\/[^"]+?)"\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g;
            const imageUrls = []; // {url, width, height}
            let match;
            while ((match = urlRegex.exec(html)) !== null) {
                const url = match[1];
                const w = parseInt(match[2]);
                const h = parseInt(match[3]);
                if (w > 50 && h > 50 && !url.includes('gstatic.com') && !url.includes('google.com/images')) {
                    imageUrls.push({ url, w, h });
                }
            }

            // Strategia 2: Etsi lähdesivujen URLit
            // Ne ovat yleensä muodossa: ["https://www.example.com/page",width,height,"title text"]
            // tai linkitetty kuva-URLien läheisyydessä
            const sourceRegex = /\["(https?:\/\/(?!encrypted)[^"]*?)"(?:,\s*\d+\s*,\s*\d+)?\s*(?:,\s*null)?\s*,\s*"([^"]*?)"\s*(?:,|])/g;
            const sources = [];
            while ((match = sourceRegex.exec(html)) !== null) {
                const url = match[1];
                const title = match[2];
                if (!url.includes('google.') && !url.includes('gstatic.') &&
                    !url.includes('youtube.com/embed') && title.length > 3) {
                    sources.push({ url, title });
                }
            }

            // Strategia 3 (fallback): Etsi kaikki a[href]-linkit joissa on imgrefurl
            const imgResLinks = document.querySelectorAll('a[href*="imgrefurl="]');
            for (const a of imgResLinks) {
                try {
                    const u = new URL(a.href);
                    const refUrl = u.searchParams.get('imgrefurl');
                    const imgUrl = u.searchParams.get('imgurl');
                    if (refUrl && !refUrl.includes('google.com')) {
                        const domain = new URL(refUrl).hostname.replace('www.', '');
                        if (!seen.has(refUrl)) {
                            seen.add(refUrl);
                            items.push({
                                id: `gimg-${items.length}`,
                                imgUrl: imgUrl || null,
                                title: a.textContent?.trim() || 'Subsoccer-kuva',
                                link: refUrl,
                                domain,
                                source: 'google-images',
                                scrapedAt: new Date().toISOString()
                            });
                        }
                    }
                } catch (_) {}
            }

            // Jos imgres-linkit löytyivät, käytä niitä
            if (items.length > 0) return items;

            // Fallback: käytä näkyvät kuvat + lähimmät tunnistetut lähdelinkit
            const visibleImgs = document.querySelectorAll('img');
            visibleImgs.forEach((img, i) => {
                if (img.src && (img.src.startsWith('http') || img.src.startsWith('data:image/jpeg') || img.src.startsWith('data:image/png')) && img.width > 60) {
                    const parentA = img.closest('a');
                    let link = '';
                    let domain = 'google.com';
                    let title = img.alt || 'Subsoccer-kuva';

                    if (parentA && parentA.href) {
                        const href = parentA.href;
                        if (href.includes('imgrefurl=')) {
                            try {
                                const ref = new URL(href).searchParams.get('imgrefurl');
                                if (ref) { link = ref; domain = new URL(ref).hostname.replace('www.', ''); }
                            } catch (_) {}
                        }
                    }

                    // Yritä yhdistää lähdetaulukkoon alt-tekstin perusteella
                    if (!link && sources.length > 0) {
                        const matchedSource = sources[Math.min(i, sources.length - 1)];
                        if (matchedSource) {
                            link = matchedSource.url;
                            title = matchedSource.title || title;
                            try { domain = new URL(link).hostname.replace('www.', ''); } catch (_) {}
                        }
                    }

                    if (img.src && !seen.has(img.src)) {
                        seen.add(img.src);
                        items.push({
                            id: `gimg-${items.length}`,
                            imgUrl: img.src,
                            title,
                            link: link || 'https://www.google.com/search?q=subsoccer&udm=2',
                            domain,
                            source: 'google-images',
                            scrapedAt: new Date().toISOString()
                        });
                    }
                }
            });

            return items;
        });

        await browser.close();

        // Suodata pois data:image/gif ja duplikaatit
        const seen = new Set();
        const unique = results.filter(r => {
            const key = r.link + r.imgUrl;
            if (!seen.has(key) && (!r.imgUrl || !r.imgUrl.startsWith('data:image/gif'))) {
                seen.add(key);
                return true;
            }
            return false;
        });

        console.log(`✅ Google Images: ${unique.length} tulosta löydetty.`);
        return unique;
    } catch (err) {
        console.error('❌ Google Images -haku epäonnistui:', err.message);
        if (browser) await browser.close();
        return [];
    }
}


// ─── Pääskripti ────────────────────────────────────────────────────────────
async function scanAll() {
    console.log('══════════════════════════════════════════════════');
    console.log('  🔍 Subsoccer Brand Scanner V2');
    console.log(`  📅 ${new Date().toLocaleString('fi-FI')}`);
    console.log('══════════════════════════════════════════════════\n');

    // Hae kaikki lähteet rinnakkain (paitsi Google Images joka tarvitsee selaimen)
    const [newsResults, redditResults] = await Promise.all([
        fetchGoogleNews(),
        fetchReddit()
    ]);

    // Google Images erikseen (vaatii interaktiivisen selaimen)
    const imageResults = await fetchGoogleImages();

    // Yhdistä tulokset
    const allResults = [...imageResults, ...newsResults, ...redditResults];

    console.log(`\n📊 Yhteenveto:`);
    console.log(`   Google Images: ${imageResults.length}`);
    console.log(`   Google News:   ${newsResults.length}`);
    console.log(`   Reddit:        ${redditResults.length}`);
    console.log(`   Yhteensä:      ${allResults.length}\n`);

    // Vertaa edellisiin tuloksiin → tunnista uudet maininnat
    let previousResults = [];
    try {
        if (fs.existsSync(OUTPUT_PATH)) {
            previousResults = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
        }
    } catch (_) { /* ensimmäinen ajo */ }

    const previousLinks = new Set(previousResults.map(r => r.link));
    const newMentions = allResults.filter(r => !previousLinks.has(r.link));

    if (newMentions.length > 0) {
        console.log(`🆕 ${newMentions.length} uutta mainintaa löydetty!`);

        // Lähetä sähköposti-ilmoitus
        try {
            await notifyNewMentions(newMentions);
        } catch (err) {
            console.log('⚠️  Sähköposti-ilmoituksen lähetys epäonnistui:', err.message);
        }
    } else {
        console.log('ℹ️  Ei uusia mainintoja edellisen skannauksen jälkeen.');
    }

    // Tallenna tulokset
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allResults, null, 2), 'utf-8');
    console.log(`💾 Tulokset tallennettu: ${OUTPUT_PATH}`);
    console.log('══════════════════════════════════════════════════\n');
}

// Aja suoraan tai käytä moduulina
if (require.main === module) {
    scanAll().catch(err => {
        console.error('Skannaus epäonnistui:', err);
        process.exit(1);
    });
}

module.exports = { scanAll };
