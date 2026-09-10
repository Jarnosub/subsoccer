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
        await page.evaluate(() => emergencyCut());
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
});
