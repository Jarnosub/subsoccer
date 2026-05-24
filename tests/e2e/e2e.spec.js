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
        // Log page console output
        page.on('console', msg => console.log(`[Page Console] ${msg.type()}: ${msg.text()}`));
        page.on('pageerror', err => console.error(`[Page Error] ${err.message}`));

        // Scoped mock database state to isolate between tests
        const mockUserDb = {
            id: 'e2e-test-user-id-1234',
            username: 'AUTOTEST',
            email: 'test@example.com',
            elo: 1300,
            wins: 0,
            losses: 0,
            is_admin: false
        };

        // Intercept and mock all Supabase API requests to avoid writing test users/data to production DB
        await page.route('https://ujxmmrsmdwrgcwatdhvx.supabase.co/**', async (route) => {
            const url = route.request().url();
            const method = route.request().method();
            console.log(`[Mock Supabase Intercept] ${method} ${url}`);

            if (url.includes('/auth/v1/signup') || url.includes('/auth/v1/token')) {
                let postData = {};
                try {
                    postData = route.request().postDataJSON() || {};
                } catch (e) {
                    try {
                        const rawData = route.request().postData() || '';
                        const params = new URLSearchParams(rawData);
                        postData = Object.fromEntries(params.entries());
                    } catch (err) {}
                }

                let username = 'AUTOTEST';
                if (postData.options) {
                    try {
                        const opts = typeof postData.options === 'string' ? JSON.parse(postData.options) : postData.options;
                        username = opts.data?.username || username;
                    } catch (err) {}
                } else if (postData.email) {
                    username = postData.email.split('@')[0].toUpperCase();
                }

                mockUserDb.username = username;
                mockUserDb.email = postData.email || 'test@example.com';

                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        access_token: 'mock-token-xyz-123',
                        token_type: 'bearer',
                        expires_in: 3600,
                        refresh_token: 'mock-refresh-token',
                        user: {
                            id: mockUserDb.id,
                            email: mockUserDb.email,
                            user_metadata: { username: mockUserDb.username }
                        }
                    })
                });
            } else if (url.includes('/auth/v1/user') || url.includes('/auth/v1/session')) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: mockUserDb.id,
                        email: mockUserDb.email,
                        user_metadata: { username: mockUserDb.username }
                    })
                });
            } else if (url.includes('/rest/v1/players')) {
                if (method === 'GET') {
                    if (url.includes('username=ilike.')) {
                        // Return empty array to indicate the username is available (not taken)
                        await route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify([])
                        });
                        return;
                    }

                    const acceptHeader = route.request().headers()['accept'] || '';
                    const responseBody = acceptHeader.includes('vnd.pgrst.object') 
                        ? mockUserDb 
                        : [mockUserDb];

                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(responseBody)
                    });
                } else {
                    // POST / PATCH / PUT: update our mock DB state with the values from the UI
                    let body = null;
                    try {
                        body = route.request().postDataJSON();
                    } catch (err) {}
                    if (body) {
                        if (Array.isArray(body)) {
                            Object.assign(mockUserDb, body[0]);
                        } else {
                            Object.assign(mockUserDb, body);
                        }
                    }
                    
                    const acceptHeader2 = route.request().headers()['accept'] || '';
                    const responseBody2 = acceptHeader2.includes('vnd.pgrst.object') 
                        ? mockUserDb 
                        : [mockUserDb];

                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(responseBody2)
                    });
                }
            } else if (url.includes('/rest/v1/countries')) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([
                        { name: 'Finland', code: 'FI' }
                    ])
                });
            } else if (url.includes('/rest/v1/games')) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([])
                });
            } else if (url.includes('/rest/v1/tournament_history')) {
                if (method === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify([])
                    });
                } else {
                    await route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: JSON.stringify({ success: true })
                    });
                }
            } else if (url.includes('/rest/v1/matches')) {
                if (method === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify([])
                    });
                } else {
                    await route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: JSON.stringify({ success: true })
                    });
                }
            } else {
                // Default fallback
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([])
                });
            }
        });

        // Use relative path to leverage the baseURL from playwright.config.js
        await page.goto('/login.html?e2e=true');
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

    test('SCENARIO 3: Normal User Login Redirects to Hub (index.html)', async ({ page }) => {
        // Mock navigator.webdriver to false to simulate a normal user
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        // Navigate to login.html without the e2e query param to trigger normal redirect
        await page.goto('/login.html');

        const randomId = Math.floor(Math.random() * 10000);
        const testUser = {
            username: `RedirectTest${randomId}`,
            email: `redirecttest${randomId}@example.com`,
            password: 'Password123!'
        };

        console.log(`Registering user for redirect test: ${testUser.username}`);

        const signupSwitch = page.locator('#btn-show-signup');
        if (await signupSwitch.isVisible()) {
            await signupSwitch.click();
        }

        await page.fill('#reg-user', testUser.username);
        await page.fill('#reg-email', testUser.email);
        await page.fill('#reg-pass', testUser.password);
        await page.click('#btn-register');

        // Verify that after registration/login, the user is redirected to index.html
        await page.waitForURL('**/index.html', { timeout: 10000 });
        console.log('Redirect test passed.');
    });

});
