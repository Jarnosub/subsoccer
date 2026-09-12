import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Arcade Information Display Kiosk (display.html)', () => {
    let dom;
    let window;
    let document;

    beforeEach(() => {
        const htmlPath = path.resolve(__dirname, '../../display.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');

        dom = new JSDOM(htmlContent, {
            runScripts: 'dangerously',
            url: 'http://localhost:8787/display.html?table=demo-pulse-01'
        });
        window = dom.window;
        document = window.document;

        // Mock QRCode constructor
        window.QRCode = vi.fn((container, options) => {
            const img = document.createElement('img');
            img.alt = 'QR Code';
            container.appendChild(img);
            return {
                clear: vi.fn(),
                makeCode: vi.fn()
            };
        });
    });

    it('extracts table parameter from URL and sets table ID label', () => {
        const tableIdLabel = document.getElementById('displayTableId');
        expect(tableIdLabel.textContent).toBe('demo-pulse-01');
    });

    it('displays game rules clearly and does not display match scores', () => {
        const rules = document.querySelectorAll('.rule-card');
        expect(rules.length).toBe(4);
        expect(document.body.textContent).toContain('Istu vastakkain');
        expect(document.body.textContent).toContain('3 Maalia voittaa');

        // Verify score elements do not exist (display is not wired to match scores)
        expect(document.getElementById('homeScore')).toBeNull();
        expect(document.getElementById('awayScore')).toBeNull();
        expect(document.getElementById('matchScore')).toBeNull();
    });

    it('renders "PÖYTÄ VAPAA — PELAA NYT" when state is available', () => {
        window.updateScreenState('available');

        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');
        const ctaTitle = document.getElementById('ctaTitle');

        expect(statusBadge.classList.contains('status-available')).toBe(true);
        expect(statusText.textContent).toContain('PÖYTÄ VAPAA');
        expect(ctaTitle.textContent).toBe('SKANNAA JA PELAA');
    });

    it('renders "PELI KÄYNNISSÄ" when state is active', () => {
        window.updateScreenState('active');

        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');
        const ctaTitle = document.getElementById('ctaTitle');

        expect(statusBadge.classList.contains('status-active')).toBe(true);
        expect(statusText.textContent).toBe('PELI KÄYNNISSÄ');
        expect(ctaTitle.textContent).toBe('PELI KÄYNNISSÄ');
    });

    it('renders neutral offline state and NEVER claims table is free when offline or error occurs', () => {
        window.updateScreenState('offline');

        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');

        expect(statusBadge.classList.contains('status-offline')).toBe(true);
        expect(statusText.textContent).toBe('SUBSOCCER LIVE');
        expect(statusText.textContent).not.toContain('VAPAA');
        expect(statusText.textContent).not.toContain('FREE');
    });
});
