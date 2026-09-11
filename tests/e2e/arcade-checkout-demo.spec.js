const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Subsoccer Arcade / Pulse Checkout Demo (arcade-checkout-demo.html)', () => {


    test('loads table information, package options, and order summary', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html') + '?table=pulse-tripla-01';
        await page.goto(filePath);

        // Header & demo ribbon
        await expect(page.locator('.demo-ribbon')).toContainText('DEMO — Ei oikeaa veloitusta eikä laiteohjausta');
        await expect(page.locator('#tableTitle')).toContainText('Subsoccer Pulse');
        await expect(page.locator('#tableLocationText')).toContainText('Mall of Tripla');
        await expect(page.locator('#statusBadgeText')).toHaveText('Vapaa');

        // Check package buttons (15, 30, 60 min)
        const slot15 = page.locator('.slot-btn[data-duration="15"]');
        const slot30 = page.locator('.slot-btn[data-duration="30"]');
        const slot60 = page.locator('.slot-btn[data-duration="60"]');

        await expect(slot15).toBeVisible();
        await expect(slot30).toHaveClass(/selected/); // Default selected
        await expect(slot60).toBeVisible();

        // Order summary
        await expect(page.locator('#summaryDuration')).toHaveText('30 minuuttia');
        await expect(page.locator('#summaryTotal')).toHaveText('9,00 €');
        await expect(page.locator('#btnPayLabel')).toContainText('Siirry maksamaan • 9,00 €');

        // Change package to 15 min
        await slot15.click();
        await expect(slot15).toHaveClass(/selected/);
        await expect(slot30).not.toHaveClass(/selected/);
        await expect(page.locator('#summaryDuration')).toHaveText('15 minuuttia');
        await expect(page.locator('#summaryTotal')).toHaveText('5,00 €');
        await expect(page.locator('#btnPayLabel')).toContainText('Siirry maksamaan • 5,00 €');
    });

    test('completes successful customer journey from payment to active play', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html') + '?table=pulse-tripla-01';
        await page.goto(filePath);

        // Click proceed to pay
        await page.click('#btnProceedToPay');

        // Payment sheet opens
        const sheet = page.locator('#paymentSheet');
        await expect(sheet).toBeVisible();
        await expect(page.locator('#sheetItemTitle')).toContainText('Subsoccer Pulse 30 min');
        await expect(page.locator('#sheetItemPrice')).toHaveText('9,00 €');

        // Click Apple Pay
        await page.click('#btnPayApple');

        // Starting state appears
        await expect(page.locator('#stateStarting')).toBeVisible();
        await expect(page.locator('#statusBadgeText')).toHaveText('Käynnistyy');

        // Transitions to Active session
        const activePanel = page.locator('#stateActive');
        await expect(activePanel).toBeVisible({ timeout: 4000 });
        await expect(page.locator('#statusBadgeText')).toHaveText('Peli käynnissä');
        await expect(page.locator('#hardwareVisual')).toHaveClass(/power-on/);

        // Player instruction callout
        const instruction = page.locator('.player-action-text');
        await expect(instruction).toContainText('PÖYTÄ VALMIS!');
        await expect(instruction).toContainText('Paina pöydän fyysistä vihreää START-nappia');

        // Countdown digits are running
        await expect(page.locator('#timerDigits')).toBeVisible();
    });

    test('handles user cancelling payment in payment sheet', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html');
        await page.goto(filePath);

        // Open sheet
        await page.click('#btnProceedToPay');
        await expect(page.locator('#paymentSheet')).toBeVisible();

        // Click cancel
        await page.click('#btnCancelPay');
        await expect(page.locator('#paymentBackdrop')).not.toHaveClass(/open/);

        // Notice banner displayed
        const notice = page.locator('#noticeBanner');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('Maksu peruutettu. Pöytävaraus vapautettu.');

        // Remains in available package selection state
        await expect(page.locator('#stateSelectPackage')).toBeVisible();
        await expect(page.locator('#btnProceedToPay')).toBeEnabled();
    });

    test('handles pre-payment conflict scenario (table booked by another)', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html') + '?scenario=conflict';
        await page.goto(filePath);

        // Attempt to pay
        await page.click('#btnProceedToPay');

        // Conflict notice shown and table locked
        const notice = page.locator('#noticeBanner');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('Pöytä varattiin juuri toiselle pelaajalle');
        await expect(page.locator('#statusBadgeText')).toHaveText('Varattu');
        await expect(page.locator('#btnProceedToPay')).toBeDisabled();
    });

    test('handles table in maintenance mode', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html') + '?scenario=maintenance';
        await page.goto(filePath);

        await expect(page.locator('#statusBadgeText')).toHaveText('Huollossa');
        await expect(page.locator('#btnProceedToPay')).toBeDisabled();
    });

    test('handles post-payment hardware failure with refund flow and does NOT re-prompt payment', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html') + '?scenario=startup_fail';
        await page.goto(filePath);

        // Proceed to pay
        await page.click('#btnProceedToPay');
        await page.click('#btnPayMobilePay');

        // Check startup investigation state
        await expect(page.locator('#stateUncertain')).toBeVisible({ timeout: 2500 });
        await expect(page.locator('#stateUncertain')).toContainText('Selvitämme pöydän käynnistystä...');

        // Check transition to refund state
        const refundPanel = page.locator('#stateRefunded');
        await expect(refundPanel).toBeVisible({ timeout: 4000 });
        await expect(refundPanel).toContainText('Käynnistys epäonnistui — Hyvitys käynnistetty');
        await expect(refundPanel).toContainText('Hyvitys vahvistettu (Simuloitu)');
        await expect(refundPanel).toContainText('9,00 €');

        // MUST NOT prompt to pay again!
        await expect(refundPanel.locator('button')).toHaveText(/Palaa päänäkymään/);
        await expect(page.locator('#stateSelectPackage')).not.toBeVisible();
    });

    test('persists active session across page reload and transitions to expired', async ({ page }) => {
        // Fast mode: 15s session for testing countdown and expiration
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html') + '?fast=1';
        await page.goto(filePath);

        // Pay and start
        await page.click('#btnProceedToPay');
        await page.click('#btnPayCard');

        // Wait until active
        await expect(page.locator('#stateActive')).toBeVisible({ timeout: 4000 });

        // Reload page to test persistence
        await page.reload();

        // Must still be active after reload
        await expect(page.locator('#stateActive')).toBeVisible();
        await expect(page.locator('#statusBadgeText')).toHaveText('Peli käynnissä');

        // Wait for 15s countdown to expire
        await expect(page.locator('#stateExpired')).toBeVisible({ timeout: 18000 });
        await expect(page.locator('#stateExpired')).toContainText('Peliaika päättyi');

        // Option to buy new play time
        const resetBtn = page.locator('#stateExpired button');
        await expect(resetBtn).toContainText('Osta uutta peliaikaa');
        await resetBtn.click();

        // Returns to available package selection
        await expect(page.locator('#stateSelectPackage')).toBeVisible();
        await expect(page.locator('#statusBadgeText')).toHaveText('Vapaa');
    });

    test('opens scenario test panel and switches scenarios', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html');
        await page.goto(filePath);

        // Open test panel
        await page.click('#btnOpenTestPanel');
        const drawer = page.locator('#testDrawer');
        await expect(drawer).toBeVisible();

        // Select maintenance scenario
        await page.click('#scen-maintenance');
        await expect(drawer).not.toBeVisible();
        await expect(page.locator('#statusBadgeText')).toHaveText('Huollossa');
        await expect(page.locator('#btnProceedToPay')).toBeDisabled();

        // Re-open and reset demo
        await page.click('#btnOpenTestPanel');
        await page.click('#btnResetDemoStorage');
        await expect(page.locator('#statusBadgeText')).toHaveText('Vapaa');
        await expect(page.locator('#btnProceedToPay')).toBeEnabled();
    });
});
