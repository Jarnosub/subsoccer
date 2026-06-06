const cron = require('node-cron');
const { scanAll } = require('./scan-mentions');

// Aja skannaus joka päivä klo 09:00
const SCHEDULE = '0 9 * * *'; // minuutti tunti päivä kuukausi viikonpäivä

console.log('══════════════════════════════════════════════════');
console.log('  🕐 Subsoccer Brand Scanner — Cron-ajastin');
console.log(`  📅 Ajastettu: joka päivä klo 09:00`);
console.log(`  ⏱️  Käynnistetty: ${new Date().toLocaleString('fi-FI')}`);
console.log('══════════════════════════════════════════════════\n');

cron.schedule(SCHEDULE, async () => {
    console.log(`\n🔔 Ajastettu skannaus käynnistyy: ${new Date().toLocaleString('fi-FI')}`);
    try {
        await scanAll();
    } catch (err) {
        console.error('❌ Ajastettu skannaus epäonnistui:', err.message);
    }
});

console.log('Odottaa seuraavaa ajastettua ajankohtaa...');
console.log('Lopeta painamalla Ctrl+C.\n');
