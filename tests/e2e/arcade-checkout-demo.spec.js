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

        // Check new test package buttons (5, 15, 30 min) and verify 60 min is removed
        const slot5 = page.locator('.slot-btn[data-duration="5"]');
        const slot15 = page.locator('.slot-btn[data-duration="15"]');
        const slot30 = page.locator('.slot-btn[data-duration="30"]');
        const slot60 = page.locator('.slot-btn[data-duration="60"]');

        await expect(slot5).toBeVisible();
        await expect(slot15).toHaveClass(/selected/); // Default selected (15 min)
        await expect(slot30).toBeVisible();
        await expect(slot60).toHaveCount(0); // 60 min must be removed

        // Initial order summary (15 min / 5,00 €)
        await expect(page.locator('#summaryDuration')).toHaveText('15 minuuttia');
        await expect(page.locator('#summaryTotal')).toHaveText('5,00 €');
        await expect(page.locator('#btnPayLabel')).toContainText('Siirry maksamaan • 5,00 €');

        // Change package to 5 min / 2,50 €
        await slot5.click();
        await expect(slot5).toHaveClass(/selected/);
        await expect(slot15).not.toHaveClass(/selected/);
        await expect(page.locator('#summaryDuration')).toHaveText('5 minuuttia');
        await expect(page.locator('#summaryTotal')).toHaveText('2,50 €');
        await expect(page.locator('#btnPayLabel')).toContainText('Siirry maksamaan • 2,50 €');

        // Change package to 30 min / 7,00 €
        await slot30.click();
        await expect(slot30).toHaveClass(/selected/);
        await expect(slot5).not.toHaveClass(/selected/);
        await expect(page.locator('#summaryDuration')).toHaveText('30 minuuttia');
        await expect(page.locator('#summaryTotal')).toHaveText('7,00 €');
        await expect(page.locator('#btnPayLabel')).toContainText('Siirry maksamaan • 7,00 €');
    });

    test('completes successful customer journey from payment to active play without buy button in game', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html') + '?table=pulse-tripla-01';
        await page.goto(filePath);

        // Click proceed to pay (default 15 min / 5,00 €)
        await page.click('#btnProceedToPay');

        // Payment sheet opens
        const sheet = page.locator('#paymentSheet');
        await expect(sheet).toBeVisible();
        await expect(page.locator('#sheetItemTitle')).toContainText('Subsoccer Pulse 15 min');
        await expect(page.locator('#sheetItemPrice')).toHaveText('5,00 €');

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

        // Requirement: Pelin aikana näytetään jäljellä oleva aika ilman ostopainiketta
        await expect(activePanel.locator('button')).toHaveCount(0);
        await expect(page.locator('#stateSelectPackage')).not.toBeVisible();
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
        await expect(refundPanel).toContainText('5,00 €');

        // MUST NOT prompt to pay again!
        await expect(refundPanel.locator('button')).toHaveText(/Palaa päänäkymään/);
        await expect(page.locator('#stateSelectPackage')).not.toBeVisible();
    });

    test('persists active session across reload, and on expired shows Pelaa uudelleen starting fresh selection', async ({ page }) => {
        // Fast mode: 15s session for testing countdown and expiration
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-checkout-demo.html') + '?fast=1';
        await page.goto(filePath);

        // Pay and start
        await page.click('#btnProceedToPay');
        await page.click('#btnPayCard');

        // Wait until active
        await expect(page.locator('#stateActive')).toBeVisible({ timeout: 4000 });

        // Verify active play does NOT have a buy button
        await expect(page.locator('#stateActive button')).toHaveCount(0);

        // Reload page to test persistence
        await page.reload();

        // Must still be active after reload
        await expect(page.locator('#stateActive')).toBeVisible();
        await expect(page.locator('#statusBadgeText')).toHaveText('Peli käynnissä');
        await expect(page.locator('#stateActive button')).toHaveCount(0);

        // Wait for 15s countdown to expire and table to become freed
        await expect(page.locator('#stateExpired')).toBeVisible({ timeout: 18000 });
        await expect(page.locator('#stateExpired')).toContainText('Peliaika päättyi');
        await expect(page.locator('#statusBadgeText')).toHaveText('Pöytä vapaa');

        // Requirement: Ajan päätyttyä ja pöydän vapauduttua näytä ”Pelaa uudelleen”.
        // Se aloittaa uuden ajanvalinnan ja maksun, ei jatka vanhaa sessiota.
        const playAgainBtn = page.locator('#stateExpired #btnPlayAgain');
        await expect(playAgainBtn).toBeVisible();
        await expect(playAgainBtn).toContainText('Pelaa uudelleen');
        await playAgainBtn.click();

        // Returns to clean package selection for a new game
        await expect(page.locator('#stateSelectPackage')).toBeVisible();
        await expect(page.locator('#statusBadgeText')).toHaveText('Vapaa');
        await expect(page.locator('#btnProceedToPay')).toBeEnabled();
        await expect(page.locator('#btnProceedToPay')).toContainText('Siirry maksamaan');
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
