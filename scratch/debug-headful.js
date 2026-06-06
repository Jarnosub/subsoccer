const { chromium } = require('playwright');

async function main() {
    console.log('Käynnistetään headful selain...');
    // Launching headful browser
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    const queryUrl = 'https://www.google.com/search?q=subsoccer&udm=2&tbs=qdr:w';
    
    console.log('Navigoidaan osoitteeseen:', queryUrl);
    await page.goto(queryUrl);
    
    console.log('Selain avattu. Odotetaan 15 sekuntia, jotta näet sivun ja voit tarvittaessa ohittaa CAPTCHAn...');
    await page.waitForTimeout(15000);
    
    await browser.close();
    console.log('Selain suljettu.');
}

main().catch(console.error);
