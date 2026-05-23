// ─── Sentry Error Monitoring ───
// Auto-loaded via Sentry Loader Script (CDN)
// Configure after Sentry loads:

if (typeof Sentry !== 'undefined' && Sentry.onLoad) {
    Sentry.onLoad(function() {
        Sentry.init({
            environment: window.location.hostname.includes('staging') ? 'staging' 
                       : window.location.hostname.includes('localhost') ? 'development' 
                       : 'production',
            release: 'subsoccer-pro@' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown'),
            sendDefaultPii: true,
            
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
    });
}
