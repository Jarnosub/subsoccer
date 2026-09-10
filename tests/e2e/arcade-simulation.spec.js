const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Arcade Pulse Simulation (Phase A - English / Data Studio)', () => {
    test('loads arcade-access.html and displays simulation mode banner', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-access.html') + '?table=demo-pulse-01';
        await page.goto(filePath);

        // Verify simulation banner is visible
        const banner = page.locator('.simulation-banner');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText('SIMULATION MODE');

        // Verify table name and location
        const tableName = page.locator('#tableDisplayName');
        await expect(tableName).toHaveText('Subsoccer Pulse Arena #1');

        // Verify initial power state is OFF
        const powerText = page.locator('#powerStatusLabel');
        await expect(powerText).toContainText('RELAY POWER: OFF');

        // Verify start button is available
        const startBtn = page.locator('#btnStartPlay');
        await expect(startBtn).toBeVisible();
        await expect(startBtn).toBeEnabled();
        await expect(startBtn).toContainText('ACTIVATE 15 MIN PLAY');

        // Verify slot chips exist and switching to 30 min works
        const slot30 = page.locator('#slot-30');
        await slot30.click();
        await expect(startBtn).toContainText('ACTIVATE 30 MIN PLAY (30s DEMO)');
        const durationKpi = page.locator('#kpiDurationText');
        await expect(durationKpi).toHaveText('30 Min');
    });

    test('activates session on start button click and transitions through states', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-access.html') + '?table=demo-pulse-01';
        await page.goto(filePath);

        // Adjust test duration to 5s via simulation controls for faster test
        await page.evaluate(() => setTestDuration(5));

        const startBtn = page.locator('#btnStartPlay');
        await startBtn.click();

        // Check that button shows loading / disabled immediately
        await expect(startBtn).toBeDisabled();

        // Wait for active state (600ms simulated network delay)
        const powerText = page.locator('#powerStatusLabel');
        await expect(powerText).toContainText('RELAY POWER: ON', { timeout: 3000 });

        // Verify visual power on class
        const visualDisplay = page.locator('#visualDisplay');
        await expect(visualDisplay).toHaveClass(/power-on/);

        // Verify countdown is visible
        const countdown = page.locator('#countdownDigits');
        await expect(countdown).toBeVisible();

        // Test emergency stop
        await page.evaluate(() => emergencyStop());
        await expect(powerText).toContainText('EMERGENCY FORCE OFF');
        await expect(visualDisplay).not.toHaveClass(/power-on/);
    });

    test('disables start button when table is locked/disabled', async ({ page }) => {
        const filePath = 'file://' + path.resolve(__dirname, '../../arcade-access.html') + '?table=demo-locked-03';
        await page.goto(filePath);

        const startBtn = page.locator('#btnStartPlay');
        await expect(startBtn).toBeDisabled();

        const statusMsg = page.locator('#statusNote');
        await expect(statusMsg).toContainText('disabled');
    });
});
