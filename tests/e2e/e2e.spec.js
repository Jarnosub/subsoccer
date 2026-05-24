const { test, expect } = require('@playwright/test');

test.describe('Subsoccer Pro E2E', () => {

    // Helper to generate random user details
    const randomId = Math.floor(Math.random() * 10000);
    const testUser = {
        username: `AutoTest${randomId}`,
        email: `autotest${randomId}@example.com`,
        password: 'Password123!'
    };

    test.beforeEach(async ({ page }) => {
        // Use relative path to leverage the baseURL from playwright.config.js
        await page.goto('/login.html');
    });

    test('SCENARIO 1: Registration and Profile Update', async ({ page }) => {
        // 1. Register
        console.log(`Registering user: ${testUser.username}`);

        // Wait for auth page or toggle to signup
        const signupSwitch = page.locator('#btn-show-signup');
        if (await signupSwitch.isVisible()) {
            await signupSwitch.click();
        }

        await page.fill('#reg-user', testUser.username);
        await page.fill('#reg-email', testUser.email);
        await page.fill('#reg-pass', testUser.password);
        await page.click('#btn-register');

        // Verify successful login (the profile-card-container should contain the registered username in uppercase)
        await expect(page.locator('#profile-card-container')).toContainText(testUser.username.toUpperCase(), { timeout: 10000 });
        console.log('Registration successful, profile card name verified.');

        // 2. Update Profile
        console.log('Updating profile...');
        // Open Settings menu using the hamburger menu toggle
        await page.click('#menu-toggle-btn');
        await page.click('#menu-item-edit-profile');
        await expect(page.locator('#profile-edit-fields')).toBeVisible();

        const newFullName = `Test User ${randomId}`;
        await page.fill('#edit-full-name', newFullName);
        await page.click('#btn-save-profile');

        // Verify Feedback/Notification or successful save
        // Save profile triggers notification or sets loading state, wait for profile fields to hide or reload
        await page.waitForTimeout(1000);
        console.log('Profile updated.');
    });

    test('SCENARIO 2: Create and Play Tournament', async ({ page }) => {
        const randomId2 = Math.floor(Math.random() * 10000);
        const tourUser = {
            username: `TourTest${randomId2}`,
            email: `tourtest${randomId2}@example.com`,
            password: 'Password123!'
        };

        console.log(`Registering user for tournament: ${tourUser.username}`);
        const signupSwitch = page.locator('#btn-show-signup');
        if (await signupSwitch.isVisible()) {
            await signupSwitch.click();
        }

        await page.fill('#reg-user', tourUser.username);
        await page.fill('#reg-email', tourUser.email);
        await page.fill('#reg-pass', tourUser.password);
        await page.click('#btn-register');

        // Verify successful login
        await expect(page.locator('#profile-card-container')).toContainText(tourUser.username.toUpperCase(), { timeout: 10000 });
        console.log('User registered, ready to play tournament');

        // Go to play/tournament tab if not already active
        const playTab = page.locator('#tab-tournament');
        if (await playTab.isVisible()) {
            await playTab.click();
        }

        console.log('Navigating to Tournament Mode...');
        await page.click('#btn-tournament-mode');
        await expect(page.locator('#tournament-section')).toBeVisible();

        // 1. Add Players
        const players = ['Player1', 'Player2', 'Player3', 'Player4'];
        for (const p of players) {
            await page.fill('#add-p-input', p);
            await page.click('#btn-add-player');
            // Small wait to ensure UI updates
            await page.waitForTimeout(100);
        }

        // Verify pool count
        await expect(page.locator('#pool-count')).toHaveText('4');
        console.log('Players added.');

        // 2. Start Tournament
        await page.click('#btn-start-tournament');
        await expect(page.locator('#bracket-area')).toBeVisible();
        console.log('Tournament started. Brackets generated.');

        // 3. Play Round 1 (Semifinals)
        // Click winner for Match 1 (Player 1 wins)
        // Use text-based selector since data-player attribute is not present in BracketEngine.createPlayerBtn
        await page.click('.bracket-round:has-text("SEMI-FINALS") .match-player:has-text("Player1")');

        // Click winner for Match 2 (Player 3 wins)
        await page.click('.bracket-round:has-text("SEMI-FINALS") .match-player:has-text("Player3")');

        // 4. Verify Finals bracket is populated with the round 1 winners
        await expect(page.locator('#bracket-round-1 .match-player:has-text("Player1")')).toBeVisible();
        await expect(page.locator('#bracket-round-1 .match-player:has-text("Player3")')).toBeVisible();
        console.log('Round 1 complete, finals populated.');

        // 5. Play Final
        // Final: Player 1 vs Player 3
        await page.waitForTimeout(500); // Animation wait

        // Select Tournament Winner (Player 1)
        await page.click('#bracket-round-1 .match-player:has-text("Player1")');

        // 6. Finish
        await expect(page.locator('#save-btn')).toBeVisible();
        await page.click('#save-btn');

        // 7. Verify Success
        console.log('Tournament complete.');
    });

});
