import { describe, it, expect } from 'vitest';
import { MatchService } from '../../match-service.js';

describe('MatchService.calculateNewElo', () => {
    it('pitäisi kasvattaa voittajan ELOa ja laskea häviäjän ELOa kun lähtöpisteet ovat samat', () => {
        const playerA = { id: '1', elo: 1300 };
        const playerB = { id: '2', elo: 1300 };
        const { newEloA, newEloB } = MatchService.calculateNewElo(playerA, playerB, '1');

        expect(newEloA).toBeGreaterThan(1300);
        expect(newEloB).toBeLessThan(1300);
        // K-kertoimella 32 ja samoilla pisteillä muutoksen pitäisi olla 16
        expect(newEloA).toBe(1316);
        expect(newEloB).toBe(1284);
    });

    it('pitäisi varmistaa vähintään 1 pisteen muutos vaikka tasoero olisi suuri', () => {
        const playerA = { id: '1', elo: 2500 };
        const playerB = { id: '2', elo: 500 };
        const { newEloA, newEloB } = MatchService.calculateNewElo(playerA, playerB, '1');

        expect(newEloA).toBe(2501);
        expect(newEloB).toBe(499);
    });
});