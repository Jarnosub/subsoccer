const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'fi-FI',
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    const queryUrl = 'https://www.google.com/search?q=subsoccer&udm=2&tbs=qdr:w';
    console.log('Navigating to', queryUrl);
    await page.goto(queryUrl, { waitUntil: 'networkidle' });

    // Handle cookie consent
    try {
        const consentBtn = page.locator('#L2AGLb');
        if (await consentBtn.isVisible()) {
            console.log('Accepting consent...');
            await consentBtn.click();
            await page.waitForTimeout(2000);
        }
    } catch (e) {
        console.log('No consent form found or error:', e.message);
    }

    // Capture screenshot to see what's loaded
    const screenshotPath = '/Users/jarnosaarinen/subsoccer/scratch/screenshot.png';
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to', screenshotPath);

    // Let's dump text/HTML of body or search for img elements
    const imageInfo = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img')).map((img, i) => {
            return {
                index: i,
                src: img.src.substring(0, 100), // truncate base64
                alt: img.alt,
                width: img.width,
                height: img.height,
                parentTag: img.parentElement ? img.parentElement.tagName : 'none',
                parentHref: img.closest('a') ? img.closest('a').href : 'none'
            };
        });
        return imgs.slice(0, 30);
    });

    console.log('First 30 image tags found on page:', imageInfo);

    await browser.close();
}

main().catch(console.error);
