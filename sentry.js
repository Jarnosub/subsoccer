// ─── Sentry Error Monitoring ───
// Paste your DSN from: https://sentry.io → Settings → Projects → Client Keys (DSN)
const SENTRY_DSN = '';  // ← PASTE YOUR DSN HERE

function initSentry() {
    if (!SENTRY_DSN || typeof Sentry === 'undefined') return;
    
    Sentry.init({
        dsn: SENTRY_DSN,
        environment: window.location.hostname.includes('staging') ? 'staging' 
                   : window.location.hostname.includes('localhost') ? 'development' 
                   : 'production',
        release: 'subsoccer-pro@' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown'),
        
        // Performance: sample 10% of transactions
        tracesSampleRate: 0.1,
        
        // Session replay: capture 0% normally, 100% on error
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        
        // Don't send from localhost
        beforeSend(event) {
            if (window.location.hostname === 'localhost') return null;
            return event;
        },

        // Ignore common non-actionable errors
        ignoreErrors: [
            'ResizeObserver loop',
            'Non-Error promise rejection',
            'Load failed',
            'Failed to fetch',
            'NetworkError',
            'AbortError',
        ],
    });

    // Tag with page for easier filtering
    Sentry.setTag('page', window.location.pathname);
    
    console.log('[Sentry] Initialized for', Sentry.getClient()?.getOptions()?.environment);
}
