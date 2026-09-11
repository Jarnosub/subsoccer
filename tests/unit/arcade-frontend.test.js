import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Arcade Frontend Client (arcade.html)', () => {
    let dom;
    let window;
    let document;

    beforeEach(() => {
        const htmlPath = path.resolve(__dirname, '../../arcade.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Create JSDOM with script execution enabled
        dom = new JSDOM(htmlContent, {
            runScripts: 'dangerously',
            url: 'http://localhost:8787/arcade.html?table=demo-pulse-01'
        });
        window = dom.window;
        document = window.document;

        // Mock Stripe JS
        window.Stripe = vi.fn((key) => ({
            elements: vi.fn(({ clientSecret }) => ({
                create: vi.fn((type) => ({
                    mount: vi.fn((selector) => {
                        const target = document.querySelector(selector);
                        if (target) {
                            const input = document.createElement('input');
                            input.id = 'mock-stripe-element';
                            target.appendChild(input);
                        }
                    })
                }))
            })),
            confirmPayment: vi.fn(async () => ({
                paymentIntent: { id: 'pi_test_123', status: 'succeeded' }
            }))
        }));
    });

    afterEach(() => {
        if (window && window.resetTimer) {
            window.resetTimer();
        }
    });

    it('initializes with slot 15 min selected and shows correct package prices', () => {
        const slot5 = document.getElementById('slot-5');
        const slot15 = document.getElementById('slot-15');
        const slot30 = document.getElementById('slot-30');

        expect(slot15.classList.contains('selected')).toBe(true);
        expect(slot5.classList.contains('selected')).toBe(false);
        expect(slot30.classList.contains('selected')).toBe(false);

        expect(slot5.textContent).toContain('2,50 €');
        expect(slot15.textContent).toContain('5,00 €');
        expect(slot30.textContent).toContain('7,00 €');

        const btnLabel = document.getElementById('btnActivateLabel');
        expect(btnLabel.textContent).toContain('MAKSA 15 MIN · 5,00 €');
    });

    it('updates CTA button label when user selects different slots', () => {
        const btnLabel = document.getElementById('btnActivateLabel');

        // Select 5 min
        window.selectSlot(5);
        expect(btnLabel.textContent).toBe('MAKSA 5 MIN · 2,50 €');

        // Select 30 min
        window.selectSlot(30);
        expect(btnLabel.textContent).toBe('MAKSA 30 MIN · 7,00 €');

        // Select 30 s test
        window.selectSlot('test30s');
        expect(btnLabel.textContent).toContain('KÄYNNISTÄ TESTI 30 S');
    });

    it('opens Stripe checkout modal and mounts Payment Element on commercial slot activation', async () => {
        // Mock fetch for create-payment-intent
        window.fetch = vi.fn().mockImplementation(async (url) => {
            if (url.includes('create-payment-intent')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        orderId: 'ord-test-12345',
                        clientSecret: 'pi_test_secret_12345',
                        amountCents: 500,
                        durationMinutes: 15,
                        publishableKey: 'pk_test_sample'
                    })
                };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({ success: true })
            };
        });

        window.selectSlot(15);
        await window.activateTablePower();

        // Modal should now be visible
        const modal = document.getElementById('stripeModalBackdrop');
        expect(modal.style.display).toBe('flex');

        // Summary details should match
        expect(document.getElementById('summaryDuration').textContent).toBe('15 min');
        expect(document.getElementById('summaryAmount').textContent).toBe('5,00 €');

        // Stripe Elements should have mounted
        expect(window.Stripe).toHaveBeenCalledWith('pk_test_sample');
        expect(document.getElementById('mock-stripe-element')).not.toBeNull();
    });

    it('handles payment confirmation and initiates order polling for table activation', async () => {
        vi.useFakeTimers();

        let pollCount = 0;
        window.fetch = vi.fn().mockImplementation(async (url) => {
            if (url.includes('create-payment-intent')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        orderId: 'ord-poller-1',
                        clientSecret: 'pi_test_secret_poll',
                        amountCents: 500,
                        durationMinutes: 15,
                        publishableKey: 'pk_test_sample'
                    })
                };
            }
            if (url.includes('arcade-session') && url.includes('orderId=')) {
                pollCount++;
                if (pollCount === 1) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            success: true,
                            order: {
                                orderId: 'ord-poller-1',
                                status: 'pending_activation'
                            }
                        })
                    };
                } else {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            success: true,
                            order: {
                                orderId: 'ord-poller-1',
                                status: 'active',
                                timeRemainingSecs: 900,
                                expiresAt: new Date(Date.now() + 900000).toISOString()
                            }
                        })
                    };
                }
            }
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        });

        // Open checkout and confirm
        await window.openStripeCheckout(15);
        await window.handleConfirmPayment();

        // Modal closed, Starting panel displayed
        const modal = document.getElementById('stripeModalBackdrop');
        expect(modal.style.display).toBe('none');

        const startingPanel = document.getElementById('stateStartingPanel');
        expect(startingPanel.style.display).toBe('flex');

        // Fast-forward timer for poll 1 (pending_activation)
        await vi.advanceTimersByTimeAsync(1500);
        expect(document.getElementById('startingDesc').textContent).toContain('Käynnistetään NETIO-relettä');

        // Fast-forward timer for poll 2 (active)
        await vi.advanceTimersByTimeAsync(1500);

        // Should transition to active session panel
        expect(startingPanel.style.display).toBe('none');
        const activePanel = document.getElementById('activeSessionPanel');
        expect(activePanel.classList.contains('show')).toBe(true);
        expect(document.getElementById('statusBadgeText').textContent).toBe('In Play');

        vi.useRealTimers();
    });

    it('transitions to refund_required panel if hardware activation fails', async () => {
        vi.useFakeTimers();

        window.fetch = vi.fn().mockImplementation(async (url) => {
            if (url.includes('create-payment-intent')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        orderId: 'ord-fail-1',
                        clientSecret: 'pi_test_fail',
                        amountCents: 250,
                        durationMinutes: 5,
                        publishableKey: 'pk_test_sample'
                    })
                };
            }
            if (url.includes('arcade-session') && url.includes('orderId=')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        order: {
                            orderId: 'ord-fail-1',
                            status: 'refund_required',
                            errorReason: 'NETIO-releeseen ei saatu yhteyttä. Maksu palautetaan automaattisesti.'
                        }
                    })
                };
            }
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        });

        await window.openStripeCheckout(5);
        await window.handleConfirmPayment();

        // Fast-forward timer for polling
        await vi.advanceTimersByTimeAsync(1500);

        // Refunded panel displayed
        const refundedPanel = document.getElementById('stateRefundedPanel');
        expect(refundedPanel.style.display).toBe('flex');
        expect(document.getElementById('refundedDesc').textContent).toContain('NETIO-releeseen ei saatu yhteyttä');

        // Clicking reset returns to ready
        window.resetToAvailable();
        expect(refundedPanel.style.display).toBe('none');
        expect(document.getElementById('packageSection').style.display).toBe('flex');
        expect(document.getElementById('statusBadgeText').textContent).toBe('Ready');

        vi.useRealTimers();
    });

    it('displays expired panel after game countdown finishes and cooldown elapses', () => {
        vi.useFakeTimers();

        // Start a 2s session
        window.startActivePlay(2, null, 2);

        expect(document.getElementById('activeSessionPanel').classList.contains('show')).toBe(true);

        // Advance 2 seconds -> onSessionExpired triggered
        vi.advanceTimersByTime(2000);
        expect(document.getElementById('relayStatusText').textContent).toContain('EXPIRED (COOLDOWN)');

        // Advance 4s cooldown
        vi.advanceTimersByTime(4000);

        // Expired panel appears
        const expiredPanel = document.getElementById('stateExpiredPanel');
        expect(expiredPanel.style.display).toBe('flex');

        // User clicks "PELAA UUDELLEEN"
        window.resetToAvailable();
        expect(expiredPanel.style.display).toBe('none');
        expect(document.getElementById('packageSection').style.display).toBe('flex');
        expect(document.getElementById('statusBadgeText').textContent).toBe('Ready');

        vi.useRealTimers();
    });
});
