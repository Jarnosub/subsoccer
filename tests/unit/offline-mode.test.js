import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock IndexedDB
const mockStore = {
    items: [],
    add: vi.fn(function(item) { 
        this.items.push(item); 
        return { onsuccess: null, onerror: null, result: item.id };
    }),
    getAll: vi.fn(function() { 
        return { onsuccess: null, onerror: null, result: [...this.items] };
    }),
    get: vi.fn(function(id) {
        return { onsuccess: null, onerror: null, result: this.items.find(i => i.id === id) };
    }),
    put: vi.fn(function(item) {
        const idx = this.items.findIndex(i => i.id === item.id);
        if (idx >= 0) this.items[idx] = item;
        return { onsuccess: null, onerror: null };
    }),
    delete: vi.fn(function(id) {
        this.items = this.items.filter(i => i.id !== id);
        return { onsuccess: null, onerror: null };
    }),
    createIndex: vi.fn()
};

const mockTransaction = {
    objectStore: vi.fn(() => mockStore)
};

const mockDb = {
    objectStoreNames: { contains: vi.fn(() => true) },
    createObjectStore: vi.fn(() => mockStore),
    transaction: vi.fn(() => mockTransaction)
};

// Mock indexedDB globally
global.indexedDB = {
    open: vi.fn(() => {
        const request = { onsuccess: null, onerror: null, onupgradeneeded: null };
        setTimeout(() => {
            if (request.onsuccess) request.onsuccess({ target: { result: mockDb } });
        }, 0);
        return request;
    })
};

vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2) });
vi.stubGlobal('navigator', { onLine: true });

describe('OfflineQueue', () => {
    beforeEach(() => {
        mockStore.items = [];
        mockStore.add.mockClear();
        mockStore.getAll.mockClear();
        mockStore.delete.mockClear();
    });

    it('should export OfflineQueue with required methods', async () => {
        const { OfflineQueue } = await import('../../offline-queue.js');
        expect(OfflineQueue).toBeDefined();
        expect(typeof OfflineQueue.init).toBe('function');
        expect(typeof OfflineQueue.enqueue).toBe('function');
        expect(typeof OfflineQueue.syncAll).toBe('function');
        expect(typeof OfflineQueue.getPendingCount).toBe('function');
        expect(typeof OfflineQueue.getAll).toBe('function');
        expect(typeof OfflineQueue.remove).toBe('function');
        expect(typeof OfflineQueue.updateStatus).toBe('function');
        expect(typeof OfflineQueue.updateBadge).toBe('function');
    });
});

describe('MatchService offline integration', () => {
    it('should have calculateNewElo function intact after offline changes', async () => {
        const { MatchService } = await import('../../match-service.js');
        expect(typeof MatchService.calculateNewElo).toBe('function');

        // Same test as before — ensure ELO calc wasn't broken
        const playerA = { id: '1', elo: 1300 };
        const playerB = { id: '2', elo: 1300 };
        const { newEloA, newEloB } = MatchService.calculateNewElo(playerA, playerB, '1');
        expect(newEloA).toBe(1316);
        expect(newEloB).toBe(1284);
    });

    it('should have recordMatch function', async () => {
        const { MatchService } = await import('../../match-service.js');
        expect(typeof MatchService.recordMatch).toBe('function');
    });

    it('should have _originalRecordMatch for sync', async () => {
        const { MatchService } = await import('../../match-service.js');
        expect(typeof MatchService._originalRecordMatch).toBe('function');
    });
});

describe('Service Worker cache config', () => {
    it('should include all critical game files in ASSETS', async () => {
        const fs = await import('fs');
        const swContent = fs.readFileSync(process.cwd() + '/sw.js', 'utf-8');

        // Core files
        expect(swContent).toContain("'/index.html'");
        expect(swContent).toContain("'/style.css'");
        expect(swContent).toContain("'/config.js'");

        // Game files (offline mode)
        expect(swContent).toContain("'/mobile-game.html'");
        expect(swContent).toContain("'/mobile-game-logic.js'");
        expect(swContent).toContain("'/quick-match.js'");
        expect(swContent).toContain("'/match-service.js'");
        expect(swContent).toContain("'/bracket-engine.js'");
        expect(swContent).toContain("'/offline-queue.js'");

        // Fonts
        expect(swContent).toContain("'/fonts/Subsoccer-2-Regular.woff2'");
        expect(swContent).toContain("'/fonts/Resolve-BoldNrw.otf'");
        expect(swContent).toContain("'/fonts/Resolve-RegularNrw.otf'");
    });

    it('should have network-only paths for admin pages', async () => {
        const fs = await import('fs');
        const swContent = fs.readFileSync(process.cwd() + '/sw.js', 'utf-8');
        expect(swContent).toContain("'/moderator'");
        expect(swContent).toContain("'/analytics-dashboard'");
    });
});

describe('CSS offline styles', () => {
    it('should have offline-bar styles', async () => {
        const fs = await import('fs');
        const cssContent = fs.readFileSync(process.cwd() + '/style.css', 'utf-8');
        expect(cssContent).toContain('#offline-bar');
        expect(cssContent).toContain('#offline-bar.visible');
        expect(cssContent).toContain('.offline-bar-inner');
        expect(cssContent).toContain('#offline-sync-badge');
    });
});

describe('Script.js offline sync integration', () => {
    it('should import OfflineQueue', async () => {
        const fs = await import('fs');
        const scriptContent = fs.readFileSync(process.cwd() + '/script.js', 'utf-8');
        expect(scriptContent).toContain("import { OfflineQueue } from './offline-queue.js'");
        expect(scriptContent).toContain('OfflineQueue.init()');
        expect(scriptContent).toContain('OfflineQueue.syncAll()');
        expect(scriptContent).toContain('OfflineQueue.getPendingCount()');
    });

    it('should show/hide offline bar based on connection', async () => {
        const fs = await import('fs');
        const scriptContent = fs.readFileSync(process.cwd() + '/script.js', 'utf-8');
        expect(scriptContent).toContain("offline-bar");
        expect(scriptContent).toContain("classList.add('visible')");
        expect(scriptContent).toContain("classList.remove('visible')");
    });
});

describe('Quick match offline support', () => {
    it('should pass offlineQueued to showVictory', async () => {
        const fs = await import('fs');
        const qmContent = fs.readFileSync(process.cwd() + '/quick-match.js', 'utf-8');
        expect(qmContent).toContain('result.offlineQueued');
        expect(qmContent).toContain('offlineQueued = false');
        expect(qmContent).toContain('victory-offline-msg');
    });
});

describe('Mobile game logic offline support', () => {
    it('should handle offlineQueued result in tournament match recording', async () => {
        const fs = await import('fs');
        const mglContent = fs.readFileSync(process.cwd() + '/mobile-game-logic.js', 'utf-8');
        expect(mglContent).toContain('result.offlineQueued');
        expect(mglContent).toContain('Match queued offline');
    });
});

describe('File integrity checks', () => {
    it('all modified files should exist and have content', async () => {
        const fs = await import('fs');
        const files = [
            process.cwd() + '/offline-queue.js',
            process.cwd() + '/match-service.js',
            process.cwd() + '/sw.js',
            process.cwd() + '/script.js',
            process.cwd() + '/ui.js',
            process.cwd() + '/style.css',
            process.cwd() + '/quick-match.js',
            process.cwd() + '/mobile-game-logic.js',
            process.cwd() + '/version.js',
        ];

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            expect(content.length).toBeGreaterThan(100);
        }
    });

    it('backup files should exist', async () => {
        const fs = await import('fs');
        const backupDir = process.cwd() + '/backups/offline-mode-backup-20260606/';
        const backups = ['match-service.js', 'script.js', 'sw.js', 'ui.js', 'style.css', 'quick-match.js', 'mobile-game-logic.js'];
        
        for (const file of backups) {
            const exists = fs.existsSync(backupDir + file);
            expect(exists).toBe(true);
        }
    });
});

describe('Syntax validation', () => {
    it('quick-match.js should not have duplicate/garbage code', async () => {
        const fs = await import('fs');
        const content = fs.readFileSync(process.cwd() + '/quick-match.js', 'utf-8');
        // Check no garbage like "}heer();" which was a previous bug
        expect(content).not.toContain('}heer');
    });

    it('match-service.js should have balanced braces', async () => {
        const fs = await import('fs');
        const content = fs.readFileSync(process.cwd() + '/match-service.js', 'utf-8');
        const opens = (content.match(/{/g) || []).length;
        const closes = (content.match(/}/g) || []).length;
        expect(opens).toBe(closes);
    });

    it('offline-queue.js should have balanced braces', async () => {
        const fs = await import('fs');
        const content = fs.readFileSync(process.cwd() + '/offline-queue.js', 'utf-8');
        const opens = (content.match(/{/g) || []).length;
        const closes = (content.match(/}/g) || []).length;
        expect(opens).toBe(closes);
    });
});
