/**
 * Subsoccer GO — App Mode Detection
 * Include this as the FIRST script in every HTML page.
 * On app.subsoccer.pro (iOS App Store version):
 *   - Redirects blocked admin/B2B pages back to home
 *   - Hides admin nav items
 *   - Sets window.IS_APP_MODE = true
 */
(function () {
  'use strict';

  var IS_APP_MODE =
    location.hostname === 'app.subsoccer.pro' ||
    /Subsoccer-GO/i.test(navigator.userAgent);

  window.IS_APP_MODE = IS_APP_MODE;

  if (!IS_APP_MODE) return;

  // Pages blocked in app mode (admin / B2B / dev tools)
  var BLOCKED_PAGES = [
    'analytics-dashboard','brand-builder','brand-scanner',
    'control-room','case-study','demo-match','fanatics',
    'feature-roadmap','flick-game','growth','growth-share',
    'kia','lounge-remote','lounge-tv','mini-game-promo',
    'online-game','owner-dashboard','podcast',
    'presentation','presentation-mobile','pricing-calculator',
    'print-card-prototype','pro-leagues','qr-batch-exporter',
    'retail-tracker','single-game','table-card-proto',
    'table-football-scoreboard','test-grid','test-profile',
    'theme-editor','translation-forge','tv',
    'venue-analytics','venue-card-proto','video',
  ];

  // Detect current page slug
  var pathParts = location.pathname.replace(/\/$/, '').split('/');
  var slug = pathParts[pathParts.length - 1].replace(/\.html$/, '') || 'index';

  // Block entire sub-directory paths
  var blockedPaths = ['/moderator/','/archive/','/jarno-ventures/','/brands/','/kia/'];
  var isBlockedPath = blockedPaths.some(function(p){ return location.pathname.indexOf(p) !== -1; });

  if (BLOCKED_PAGES.indexOf(slug) !== -1 || isBlockedPath) {
    location.replace('/');
    return;
  }

  // Hide admin nav items once DOM is ready
  function hideAdminNav() {
    var toHide = [
      '#menu-mod-link',
      'a[href="analytics-dashboard.html"]',
      'a[href="control-room.html"]',
      'a[href="brand-builder.html"]',
      'a[href="growth.html"]',
      'a[href="feature-roadmap.html"]',
      'a[href="presentation.html"]',
    ];
    toHide.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) { (el.closest('li') || el).style.display = 'none'; }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideAdminNav);
  } else {
    hideAdminNav();
  }
})();
