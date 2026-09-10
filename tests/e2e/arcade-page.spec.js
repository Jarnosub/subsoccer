const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Subsoccer Arcade Customer Page (arcade.html)', () => {
    test('loads table information, slot selector, and ready status', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade.html') + '?table=demo-pulse-01';
        await page.goto(filePath);

        // Header and table info
        await expect(page.locator('#tableTitle')).toHaveText('Subsoccer Arcade #1');
        await expect(page.locator('#tableLocationText')).toContainText('Mall of Tripla, Helsinki');
        await expect(page.locator('#statusBadgeText')).toHaveText('Ready');

        // Slot buttons
        const slot15 = page.locator('#slot-15');
        const slot30 = page.locator('#slot-30');
        await expect(slot15).toHaveClass(/selected/);
        await expect(slot30).toBeVisible();

        // Start button
        const btn = page.locator('#btnActivatePlay');
        await expect(btn).toBeVisible();
        await expect(btn).toBeEnabled();
        await expect(btn).toContainText('ACTIVATE 15 MIN PLAY');

        // Switching slot
        await slot30.click();
        await expect(slot30).toHaveClass(/selected/);
        await expect(slot15).not.toHaveClass(/selected/);
        await expect(btn).toContainText('ACTIVATE 30 MIN PLAY (30s DEMO)');
    });

    test('activates table power and displays countdown with physical button instructions', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade.html') + '?table=demo-pulse-01';
        await page.goto(filePath);

        // Fast test duration (5s)
        await page.evaluate(() => setTestDuration(5));

        const btn = page.locator('#btnActivatePlay');
        await btn.click();

        // Check button becomes disabled / loading
        await expect(btn).toBeDisabled();

        // Active session appears
        const activePanel = page.locator('#activeSessionPanel');
        await expect(activePanel).toHaveClass(/show/, { timeout: 3000 });

        // Hardware visualizer illuminated
        const visual = page.locator('#hardwareVisual');
        await expect(visual).toHaveClass(/power-on/);

        // Player instruction visible
        const instruction = page.locator('.player-action-text');
        await expect(instruction).toContainText('TABLE POWER IS ACTIVE');
        await expect(instruction).toContainText('Press the physical start button');

        // Emergency cut test
        await page.evaluate(() => emergencyCut('test-admin-token'));
        await expect(visual).not.toHaveClass(/power-on/);
        await expect(page.locator('#relayStatusText')).toContainText('EMERGENCY CUT');
    });

    test('shows out of service state for locked table', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade.html') + '?table=demo-locked-03';
        await page.goto(filePath);

        const btn = page.locator('#btnActivatePlay');
        await expect(btn).toBeDisabled();
        await expect(btn).toContainText('TABLE OUT OF SERVICE');
        await expect(page.locator('#statusBadgeText')).toHaveText('Locked');
    });

    test('does not start active UI if backend fails and displays error notice', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade.html') + '?table=demo-pulse-01';
        await page.goto(filePath);

        // Simulate backend 502/error response
        await page.evaluate(() => {
            window._forceFetchForTesting = true;
            window.fetch = async () => ({
                ok: false,
                status: 502,
                json: async () => ({ error: 'Hardware communication timeout' })
            });
        });

        const btn = page.locator('#btnActivatePlay');
        await btn.click();

        // Active panel must NOT appear
        const activePanel = page.locator('#activeSessionPanel');
        await expect(activePanel).not.toHaveClass(/show/);

        // Error notice must be displayed
        const errorNotice = page.locator('#arcadeErrorNotice');
        await expect(errorNotice).toBeVisible();
        await expect(errorNotice).toContainText('Hardware communication timeout');

        // Hardware visualizer must remain standby
        const visual = page.locator('#hardwareVisual');
        await expect(visual).not.toHaveClass(/power-on/);

        // Button should recover and become available again
        await expect(btn).toBeEnabled();
    });

    test('hides admin drawer by default in production and reveals with ?admin=1', async ({ page }) => {
        // Customer view without admin param
        const customerUrl = 'file://' + path.resolve(__dirname, '../../arcade.html') + '?table=demo-pulse-01';
        await page.goto(customerUrl);

        const adminToggle = page.locator('.admin-toggle-btn');
        await expect(adminToggle).toBeHidden();
        const adminDrawer = page.locator('#adminDrawer');
        await expect(adminDrawer).toBeHidden();

        // Operator view with ?admin=1
        const adminUrl = 'file://' + path.resolve(__dirname, '../../arcade.html') + '?table=demo-pulse-01&admin=1';
        await page.goto(adminUrl);

        await expect(page.locator('.admin-toggle-btn')).toBeVisible();
    });
});
