import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

let doc;

beforeAll(() => {
    const html = readFileSync('index.html', 'utf-8');
    const dom = new JSDOM(html, { url: 'https://subsoccer.pro/' });
    doc = dom.window.document;
});

// ─── Single H1 containing "SUBSOCCER GO" ───
describe('H1 heading structure', () => {
    it('should have exactly one h1 element on the page', () => {
        const h1s = doc.querySelectorAll('main h1');
        expect(h1s.length).toBe(1);
    });

    it('h1 should contain both SUBSOCCER and GO', () => {
        const h1 = doc.querySelector('main h1');
        expect(h1.textContent).toContain('SUBSOCCER');
        expect(h1.textContent).toContain('GO');
    });
});

// ─── Open Graph meta tags ───
describe('Open Graph meta tags', () => {
    it('og:image should be subsoccer-teams.jpg', () => {
        const ogImage = doc.querySelector('meta[property="og:image"]');
        expect(ogImage.content).toBe('https://subsoccer.pro/subsoccer-teams.jpg');
    });

    it('og:image:width and height should be set', () => {
        const w = doc.querySelector('meta[property="og:image:width"]');
        const h = doc.querySelector('meta[property="og:image:height"]');
        expect(w).not.toBeNull();
        expect(h).not.toBeNull();
        expect(w.content).toBe('1536');
        expect(h.content).toBe('1024');
    });

    it('twitter:image should match og:image', () => {
        const tw = doc.querySelector('meta[name="twitter:image"]');
        expect(tw.content).toBe('https://subsoccer.pro/subsoccer-teams.jpg');
    });

    it('descriptions should reference 80+ countries', () => {
        const ogDesc = doc.querySelector('meta[property="og:description"]');
        const metaDesc = doc.querySelector('meta[name="description"]');
        expect(ogDesc.content).toContain('80+');
        expect(metaDesc.content).toContain('80+');
    });
});

// ─── Hreflang coverage ───
describe('Hreflang alternates', () => {
    const requiredLangs = [
        'x-default', 'en', 'fi', 'fr', 'es', 'de', 'pt', 'sv', 'nb', 'da',
        'it', 'nl', 'cs', 'tr', 'hu', 'id', 'vi', 'pl', 'ja', 'zh', 'ko', 'ar', 'az'
    ];

    it('should have hreflang link for all 22 languages + x-default', () => {
        const hreflangs = doc.querySelectorAll('link[rel="alternate"][hreflang]');
        const found = Array.from(hreflangs).map(el => el.getAttribute('hreflang'));
        for (const lang of requiredLangs) {
            expect(found, `missing hreflang="${lang}"`).toContain(lang);
        }
    });
});

// ─── JSON-LD Structured Data ───
describe('JSON-LD structured data', () => {
    let schemas;

    beforeAll(() => {
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        schemas = Array.from(scripts).map(s => JSON.parse(s.textContent));
    });

    it('should have WebApplication schema', () => {
        const webApp = schemas.find(s => s['@type'] === 'WebApplication');
        expect(webApp).toBeDefined();
        expect(webApp.name).toBe('Subsoccer GO');
    });

    it('should have FAQPage schema with 6 questions', () => {
        const faq = schemas.find(s => s['@type'] === 'FAQPage');
        expect(faq).toBeDefined();
        expect(faq.mainEntity.length).toBe(6);
    });

    it('FAQ questions should have proper structure', () => {
        const faq = schemas.find(s => s['@type'] === 'FAQPage');
        for (const q of faq.mainEntity) {
            expect(q['@type']).toBe('Question');
            expect(q.name).toBeTruthy();
            expect(q.acceptedAnswer['@type']).toBe('Answer');
            expect(q.acceptedAnswer.text).toBeTruthy();
        }
    });
});

// ─── FAQ section ───
describe('FAQ section', () => {
    it('should exist in the HTML', () => {
        const faq = doc.getElementById('faq');
        expect(faq).not.toBeNull();
    });

    it('should have 6 question buttons', () => {
        const questions = doc.querySelectorAll('#faq .faq-question');
        expect(questions.length).toBe(6);
    });

    it('should be hidden by default (non-English)', () => {
        const faq = doc.getElementById('faq');
        expect(faq.style.display).toBe('none');
    });
});

// ─── Login link is a proper anchor ───
describe('Login link crawlability', () => {
    it('should have an <a> tag linking to login.html', () => {
        const loginLink = doc.getElementById('hub-login-btn');
        expect(loginLink).not.toBeNull();
        expect(loginLink.tagName).toBe('A');
        expect(loginLink.getAttribute('href')).toContain('login.html');
    });
});

// ─── Canonical and basic SEO ───
describe('Basic SEO elements', () => {
    it('should have canonical URL', () => {
        const canonical = doc.querySelector('link[rel="canonical"]');
        expect(canonical).not.toBeNull();
        expect(canonical.href).toBe('https://subsoccer.pro/');
    });

    it('should have a title tag', () => {
        expect(doc.title).toContain('Subsoccer GO');
    });
});
