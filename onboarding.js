/**
 * Instant Play Onboarding Handler
 * Extracted from index.html to improve performance and neatness
 */
document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);
    const authPage = document.getElementById('auth-page');

    // Check if user comes from Instant Play victory
    if (params.get('action') === 'claim_result') {
        const p1Score = params.get('p1_score');
        const p2Score = params.get('p2_score');

        // If user is on login screen (not logged in)
        if (authPage && getComputedStyle(authPage).display !== 'none') {
            // Switch to signup form automatically
            if (typeof window.toggleAuth === 'function') {
                window.toggleAuth(true); // Ensured to use global if available
            }

            // Add motivational message
            const signupForm = document.getElementById('signup-form');
            if (signupForm && !document.getElementById('victory-claim-msg')) {
                const msgDiv = document.createElement('div');
                msgDiv.id = 'victory-claim-msg';
                msgDiv.style.cssText = "background: rgba(255, 215, 0, 0.1); border: 1px solid var(--sub-gold); color: #fff; padding: 15px; border-radius: var(--sub-radius); margin-bottom: 25px; font-family: 'Open Sans'; font-size: 0.9rem; line-height: 1.5; text-align: center;";
                msgDiv.innerHTML = `<span style="color:var(--sub-gold); font-weight:bold; font-size:1.2rem; display:block; margin-bottom:5px;">🏆 CLAIM YOUR VICTORY!</span>Create your Pro account to save that <strong>${Math.max(p1Score, p2Score)}-${Math.min(p1Score, p2Score)}</strong> win. Start your journey to the Global Top 100 today!`;

                const title = signupForm.querySelector('h2');
                if (title) title.parentNode.insertBefore(msgDiv, title.nextSibling);
            }
        }
    }

    // Check if user comes from Live Event link
    const liveId = params.get('live');
    if (liveId && authPage && getComputedStyle(authPage).display !== 'none') {
        if (!document.getElementById('live-event-msg')) {
            const msgDiv = document.createElement('div');
            msgDiv.id = 'live-event-msg';
            msgDiv.style.cssText = "background: rgba(255, 215, 0, 0.1); border: 1px solid var(--sub-gold); color: #fff; padding: 15px; border-radius: var(--sub-radius); margin-bottom: 25px; font-family: 'Open Sans'; font-size: 0.9rem; line-height: 1.5; text-align: center;";
            msgDiv.innerHTML = `<span style="color:var(--sub-gold); font-weight:bold; font-size:1.2rem; display:block; margin-bottom:5px;">📢 LIVE EVENT ACCESS</span>Join as a guest or log in to view the live brackets and real-time scores for this event!`;

            const loginForm = document.getElementById('login-form');
            if (loginForm) {
                const title = loginForm.querySelector('h2');
                if (title) title.parentNode.insertBefore(msgDiv, title.nextSibling);
            }
        }
    }
});
