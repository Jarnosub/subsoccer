const fs = require('fs');
const path = require('path');
const { scrapeCostcoAU } = require('./retailers/costco-au');
const { scrapeCostcoCA, scrapeCostcoNZ } = require('./retailers/costco-generic');

const OUTPUT_PATH = path.join(__dirname, '../retail-tracker.json');

function loadData() {
    try {
        if (fs.existsSync(OUTPUT_PATH)) {
            return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
        }
    } catch (_) {}
    return { products: [] };
}

function saveData(data) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function findProduct(data, retailer) {
    return data.products.find(p => p.retailer === retailer);
}

function addOrUpdateProduct(data, result) {
    const today = new Date().toISOString().split('T')[0];
    const historyEntry = {
        date: today,
        price: result.price,
        inStock: result.inStock,
        rating: result.rating,
        reviewCount: result.reviewCount,
    };

    let existing = findProduct(data, result.retailer);
    if (existing) {
        existing.product = result.product || existing.product;
        existing.url = result.url || existing.url;
        existing.currency = result.currency || existing.currency;
        existing.imageUrl = result.imageUrl || existing.imageUrl;
        existing.lastScraped = result.scrapedAt;

        const todayIdx = existing.history.findIndex(h => h.date === today);
        if (todayIdx >= 0) {
            existing.history[todayIdx] = historyEntry;
        } else {
            existing.history.push(historyEntry);
        }
    } else {
        data.products.push({
            retailer: result.retailer,
            product: result.product,
            url: result.url,
            currency: result.currency,
            imageUrl: result.imageUrl,
            lastScraped: result.scrapedAt,
            history: [historyEntry],
        });
    }

    return historyEntry;
}

function detectChanges(data, result) {
    const existing = findProduct(data, result.retailer);
    if (!existing || existing.history.length === 0) return { isNew: true };

    const last = existing.history[existing.history.length - 1];
    const changes = [];

    if (last.price !== null && result.price !== null && last.price !== result.price) {
        const diff = result.price - last.price;
        const pct = ((diff / last.price) * 100).toFixed(1);
        const dir = diff > 0 ? '📈 NOUSSUT' : '📉 LASKENUT';
        changes.push(`${dir}: ${last.price} → ${result.price} ${result.currency} (${diff > 0 ? '+' : ''}${pct}%)`);
    }

    if (last.inStock === false && result.inStock === true) {
        changes.push('🟢 TULI SAATAVILLE!');
    } else if (last.inStock === true && result.inStock === false) {
        changes.push('🔴 LOPPUNUT!');
    }

    if (last.reviewCount !== null && result.reviewCount !== null && result.reviewCount > last.reviewCount) {
        changes.push(`⭐ Uusia arvosteluja: ${last.reviewCount} → ${result.reviewCount}`);
    }

    return { isNew: false, changes };
}

async function trackPrices() {
    console.log('══════════════════════════════════════════════════');
    console.log('  💰 Subsoccer Retail Tracker');
    console.log(`  📅 ${new Date().toLocaleString('fi-FI')}`);
    console.log('══════════════════════════════════════════════════\n');

    const data = loadData();
    const allResults = [];

    // Hae Costco Australia
    try {
        const costcoResult = await scrapeCostcoAU();
        allResults.push(costcoResult);
    } catch (err) {
        console.log(`❌ Costco AU: ${err.message}`);
    }

    // Hae Costco Kanada
    try {
        const result = await scrapeCostcoCA();
        if (result) allResults.push(result);
    } catch (err) {
        console.log(`❌ Costco CA: ${err.message}`);
    }

    // Hae Costco Uusi-Seelanti
    try {
        const result = await scrapeCostcoNZ();
        if (result) allResults.push(result);
    } catch (err) {
        console.log(`❌ Costco NZ: ${err.message}`);
    }

    // Käsittele tulokset
    console.log('\n📊 Tulokset:\n');
    const alerts = [];

    for (const result of allResults) {
        const { isNew, changes } = detectChanges(data, result);
        addOrUpdateProduct(data, result);

        const stockEmoji = result.inStock === true ? '🟢' : result.inStock === false ? '🔴' : '⚪';
        const priceStr = result.price ? `${result.price} ${result.currency}` : 'Ei hintaa';
        const ratingStr = result.rating ? `⭐ ${result.rating}/5 (${result.reviewCount || '?'} arvostelua)` : '';

        console.log(`   ${stockEmoji} ${result.retailer.toUpperCase()}`);
        console.log(`      ${result.product}`);
        console.log(`      💰 ${priceStr}`);
        if (ratingStr) console.log(`      ${ratingStr}`);
        console.log(`      🔗 ${result.url}`);

        if (isNew) {
            console.log(`      🆕 Uusi tuote lisätty seurantaan!`);
        } else if (changes && changes.length > 0) {
            changes.forEach(c => {
                console.log(`      ⚠️  ${c}`);
                alerts.push(`${result.retailer}: ${c}`);
            });
        } else {
            console.log(`      ✅ Ei muutoksia`);
        }
        console.log('');
    }

    // Tallenna
    saveData(data);

    console.log(`💾 Data tallennettu: ${OUTPUT_PATH}`);
    console.log(`📦 Seurannassa: ${data.products.length} tuotetta`);

    if (alerts.length > 0) {
        console.log('\n🔔 HÄLYTYKSET:');
        alerts.forEach(a => console.log(`   ${a}`));
    }

    console.log('\n══════════════════════════════════════════════════\n');
}

if (require.main === module) {
    trackPrices().catch(err => {
        console.error('Seuranta epäonnistui:', err);
        process.exit(1);
    });
}

module.exports = { trackPrices };
