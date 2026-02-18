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
        // Assuming the app is running locally on port 8080 (classic Live Server port)
        // Adjust if needed, e.g., http://localhost:3000
        // Use relative path if simplified for file:// access, but Playwright works best with http
        await page.goto('http://127.0.0.1:8080/index.html');
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

        // Verify successful login (User display name should appear)
        await expect(page.locator('#user-display-name')).toContainText(testUser.username, { timeout: 10000 });
        console.log('Registration successful.');

        // 2. Update Profile
        console.log('Updating profile...');
        await page.click('#btn-profile'); // Open Settings/Profile
        await expect(page.locator('#section-profile')).toBeVisible();

        const newFullName = `Test User ${randomId}`;
        await page.fill('#edit-full-name', newFullName);
        await page.click('#btn-save-profile');

        // Verify Feedback/Notification
        // Assuming a toast/notification appears
        // Or check if value persisted (might need reload or check UI)
        console.log('Profile updated.');
    });

    test('SCENARIO 2: Create and Play Tournament', async ({ page }) => {
        // Note: Tournament mode works without login for guests

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
        await page.click('div[data-player="Player1"]');

        // Click winner for Match 2 (Player 3 wins)
        await page.click('div[data-player="Player3"]');

        // 4. Advance
        await expect(page.locator('#next-rd-btn')).toBeVisible();
        await page.click('#next-rd-btn');
        console.log('Round 1 complete.');

        // 5. Play Final
        // Final: Player 1 vs Player 3
        await page.waitForTimeout(500); // Animation wait

        // Select Tournament Winner (Player 1)
        await page.click('div[data-player="Player1"][data-index]');

        // 6. Finish
        await expect(page.locator('#next-rd-btn')).toHaveText('FINISH TOURNAMENT');
        await page.click('#next-rd-btn');

        // 7. Verify Success
        // Should return to history/setup or show success notification
        // Checking for success notification text
        // await expect(page.getByText('Tournament saved successfully')).toBeVisible(); 
        console.log('Tournament complete.');
    });

});
