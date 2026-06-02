import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

// Load translations.js in a simulated browser environment
let TRANSLATIONS, FLAG_MAP;

beforeAll(() => {
    const code = readFileSync('translations.js', 'utf-8');
    // Wrap const declarations so they attach to window
    const wrappedCode = code
        .replace(/^const TRANSLATIONS/m, 'window.TRANSLATIONS')
        .replace(/^const FLAG_MAP/m, 'window.FLAG_MAP');

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        runScripts: 'dangerously',
        url: 'https://subsoccer.pro/',
    });
    dom.window.eval(wrappedCode);
    TRANSLATIONS = dom.window.TRANSLATIONS;
    FLAG_MAP = dom.window.FLAG_MAP;
});

// ─── All 22 languages exist ───
describe('Language completeness', () => {
    const expectedLangs = [
        'en', 'fi', 'fr', 'es', 'de', 'pt', 'sv', 'nb', 'da',
        'it', 'nl', 'cs', 'tr', 'hu', 'id', 'vi', 'pl', 'ja', 'zh', 'ko', 'ar', 'az'
    ];

    it('should have all 22 languages', () => {
        expect(Object.keys(TRANSLATIONS).length).toBe(22);
        for (const lang of expectedLangs) {
            expect(TRANSLATIONS[lang]).toBeDefined();
        }
    });

    it('FLAG_MAP should have all 22 languages', () => {
        for (const lang of expectedLangs) {
            expect(FLAG_MAP[lang]).toBeDefined();
        }
    });
});

// ─── Every language has all required keys ───
describe('Translation key coverage', () => {
    it('newly added languages (ko, ar, az) should have all English keys', () => {
        const enKeys = Object.keys(TRANSLATIONS.en).sort();
        for (const lang of ['ko', 'ar', 'az']) {
            const langKeys = Object.keys(TRANSLATIONS[lang]).sort();
            const missing = enKeys.filter(k => !langKeys.includes(k));
            expect(missing, `${lang} is missing keys: ${missing.join(', ')}`).toEqual([]);
        }
    });

    it('no language should have more than 5 missing keys', () => {
        const enKeys = Object.keys(TRANSLATIONS.en);
        for (const [lang, dict] of Object.entries(TRANSLATIONS)) {
            const langKeys = Object.keys(dict);
            const missing = enKeys.filter(k => !langKeys.includes(k));
            expect(missing.length, `${lang} missing ${missing.length} keys: ${missing.join(', ')}`).toBeLessThanOrEqual(5);
        }
    });
});

// ─── No empty translations ───
describe('No empty translation values', () => {
    it('no translation value should be empty string', () => {
        for (const [lang, dict] of Object.entries(TRANSLATIONS)) {
            for (const [key, value] of Object.entries(dict)) {
                expect(value.trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0);
            }
        }
    });
});

// ─── Arabic (ar) specifics ───
describe('Arabic translations', () => {
    it('should have UAE flag', () => {
        expect(FLAG_MAP.ar).toBe('🇦🇪');
    });

    it('should use sports terminology', () => {
        const ar = TRANSLATIONS.ar;
        expect(ar.my_games).toContain('مباريات');
        expect(ar.tournament).toContain('بطولة');
        expect(ar.player_prefix).toBe('لاعب');
    });
});

// ─── Azerbaijani (az) specifics ───
describe('Azerbaijani translations', () => {
    it('should have Azerbaijan flag', () => {
        expect(FLAG_MAP.az).toBe('🇦🇿');
    });

    it('should not contain known typos', () => {
        const az = TRANSLATIONS.az;
        // Previously fixed typos - make sure they stay fixed
        expect(az.buy_your_own).not.toContain('masaını');
        expect(az.semifinals).not.toContain('YARIMMF');
        expect(az.pc_local_arena).not.toContain('areana');
        expect(az.pc_tournaments_won).not.toContain('turir');
        expect(az.pc_tournaments_won).toContain('turnir');
    });

    it('should use correct dative form', () => {
        expect(TRANSLATIONS.az.start_playing).toContain('oynamağa');
    });
});

// ─── Korean (ko) refinements ───
describe('Korean translations', () => {
    it('should have Korea flag', () => {
        expect(FLAG_MAP.ko).toBe('🇰🇷');
    });

    it('should use refined terms (not raw loanwords)', () => {
        const ko = TRANSLATIONS.ko;
        expect(ko.map_tagline).not.toContain('플레이');
        expect(ko.pc_local_arena).toContain('홈');
        expect(ko.pc_ai_portrait_studio).toContain('프로필');
    });
});
