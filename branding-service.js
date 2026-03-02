import { state } from './config.js';

/**
 * Persoinoi sovelluksen brändin mukaan (esim. Coca-Cola värit)
 * Käyttö: ?brand=partner
 */
export function applyBranding() {
    const params = new URLSearchParams(window.location.search);
    const brandFromUrl = params.get('brand');
    const logoFromUrl = params.get('logo');
    const colorFromUrl = params.get('color');

    const liveId = params.get('live');

    // Jos ollaan live-näkymässä, piilotetaan globaalit elementit heti ja poistutaan
    if (liveId) {
        document.body.classList.add('live-mode');
        const header = document.querySelector('header');
        const appContent = document.getElementById('app-content');
        const navTabs = document.getElementById('nav-tabs');
        const authPage = document.getElementById('auth-page');

        if (header) header.style.display = 'none';
        if (appContent) appContent.style.display = 'none';
        if (navTabs) navTabs.style.display = 'none';
        if (authPage) authPage.style.display = 'none';
        return; // Ei sovelleta globaalia brändäystä live-näkymään
    }

    // Mahdollisuus nollata brändäys (?brand=none)
    if (brandFromUrl === 'none') {
        localStorage.removeItem('subsoccer-brand');
        localStorage.removeItem('subsoccer-logo');
        localStorage.removeItem('subsoccer-color');
        state.brand = null;
        state.brandLogo = null;
        return;
    }

    // Haetaan tallennettu brändi tai käytetään URL-parametria
    const brandId = brandFromUrl || localStorage.getItem('subsoccer-brand');
    const logoUrl = logoFromUrl || localStorage.getItem('subsoccer-logo');
    const colorHex = colorFromUrl || localStorage.getItem('subsoccer-color');

    // Lisätään hienovarainen hiilikuitukuvio taustalle (Subtle Carbon Fiber)
    document.body.style.backgroundColor = '#0a0a0a';
    document.body.style.backgroundImage = `
        linear-gradient(45deg, #0d0d0d 25%, transparent 25%),
        linear-gradient(-45deg, #0d0d0d 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #0d0d0d 75%),
        linear-gradient(-45deg, transparent 75%, #0d0d0d 75%)
    `;
    document.body.style.backgroundSize = '8px 8px';

    if (brandFromUrl && brandFromUrl !== 'none') {
        localStorage.setItem('subsoccer-brand', brandFromUrl);
        state.brand = brandFromUrl;
    }
    if (logoFromUrl && logoFromUrl !== '') {
        localStorage.setItem('subsoccer-logo', logoFromUrl);
        state.brandLogo = logoFromUrl;
    }
    if (colorFromUrl && colorFromUrl !== '') {
        localStorage.setItem('subsoccer-color', colorFromUrl);
    }

    if (brandId) {
        state.brand = brandId;
        state.brandLogo = logoUrl;

        // Käytetään annettua väriä tai oletus-partner-punaista
        let primaryColor = colorHex ? (colorHex.startsWith('#') ? colorHex : '#' + colorHex) : null;
        if (!primaryColor && brandId === 'partner') primaryColor = '#F40009';

        if (primaryColor) {
            document.documentElement.style.setProperty('--sub-red', primaryColor);
            document.documentElement.style.setProperty('--sub-gold', '#FFFFFF');
        }

        const logo = document.querySelector('.main-logo');
        if (logo) {
            if (logoUrl) {
                logo.src = logoUrl;
                logo.style.filter = 'none';
            } else {
                logo.style.filter = 'brightness(0) invert(1)';
            }
            logo.style.opacity = '1';
            logo.style.display = 'block';
        }

        // Näytetään splash screen vain jos tultiin suoralla linkillä
        if (brandFromUrl) {
            showPartnerSplashScreen(logoUrl, primaryColor);
        }
        console.log(`🤝 Branding Applied: ${brandId}`);
    } else {
        // Palautetaan oletusilme (Subsoccer)
        document.documentElement.style.setProperty('--sub-red', '#E30613');
        document.documentElement.style.setProperty('--sub-gold', '#FFD700');
        const logo = document.querySelector('.main-logo');
        if (logo) {
            logo.src = 'logo.png';
            logo.style.filter = 'none';
        }
    }
}

function showPartnerSplashScreen(logoUrl, bgColor) {
    const splash = document.createElement('div');
    splash.id = 'partner-splash';
    splash.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: ${bgColor || '#F40009'}; z-index: 100000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: white; font-family: 'Resolve', sans-serif;
        transition: opacity 0.8s ease-out;
    `;
    splash.innerHTML = `
        <div style="font-size: 1.2rem; letter-spacing: 4px; margin-bottom: 20px; opacity: 0.8;">SUBSOCCER</div>
        ${logoUrl ? `<img src="${logoUrl}" style="max-height: 80px; margin-bottom: 20px;">` : ''}
        <div style="font-size: 2.5rem; font-weight: bold; letter-spacing: 2px; text-align: center; padding: 0 20px; line-height: 1.1;">
            OFFICIAL<br>PARTNER
        </div>
        <div style="margin-top: 40px; width: 40px; height: 2px; background: white; opacity: 0.5;"></div>
    `;
    document.body.appendChild(splash);
    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 800);
    }, 2000);
}

/**
 * Injects a small footer link to the official site
 */
export function injectFooterLink() {
    const container = document.getElementById('app-content');
    if (!container || document.getElementById('subsoccer-footer-link')) return;

    const footer = document.createElement('div');
    footer.id = 'subsoccer-footer-link';
    footer.className = 'subsoccer-footer';
    footer.innerHTML = `
        <div style="display:flex; justify-content:center; gap:25px; margin-bottom:20px;">
            <a href="https://www.instagram.com/originalsubsoccer" target="_blank" style="color:#fff; font-size:1.5rem; opacity:0.8; transition:all 0.2s;"><i class="fa-brands fa-instagram"></i></a>
            <a href="https://www.youtube.com/@Subsoccer" target="_blank" style="color:#fff; font-size:1.5rem; opacity:0.8; transition:all 0.2s;"><i class="fa-brands fa-youtube"></i></a>
            <a href="https://www.tiktok.com/@subsoccer" target="_blank" style="color:#fff; font-size:1.5rem; opacity:0.8; transition:all 0.2s;"><i class="fa-brands fa-tiktok"></i></a>
        </div>
        <a href="https://www.subsoccer.com" target="_blank" style="color:inherit; text-decoration:none; opacity: 0.5;">WWW.SUBSOCCER.COM</a>
    `;
    container.appendChild(footer);
}
