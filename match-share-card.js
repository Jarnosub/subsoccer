/**
 * Subsoccer Match Share Card Generator
 * Creates a high-resolution 1080x1080 Instagram/social-ready victory card
 * using native HTML5 Canvas without external heavy libraries.
 */

export const MatchShareCard = {
    /**
     * Preloads an image safely with CORS
     */
    loadImage(src) {
        return new Promise((resolve) => {
            if (!src) return resolve(null);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn('Failed to load image for share card:', src);
                resolve(null);
            };
            img.src = src;
        });
    },

    /**
     * Helper to draw rounded rectangle on Canvas
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    },

    /**
     * Renders the 1080x1080 Match Victory Card onto a canvas
     */
    async renderCardCanvas({
        winnerName = 'WINNER',
        loserName = 'OPPONENT',
        winnerScore = 3,
        loserScore = 1,
        winnerEloBefore = 1300,
        winnerEloAfter = 1318,
        loserEloBefore = 1300,
        loserEloAfter = 1282,
        winnerAvatarUrl = null,
        loserAvatarUrl = null,
        winnerCountry = '',
        loserCountry = '',
        date = new Date().toLocaleDateString()
    }) {
        await document.fonts.ready;

        const W = 1080;
        const H = 1080;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Load avatar images in parallel
        const [winnerImg, loserImg] = await Promise.all([
            this.loadImage(winnerAvatarUrl),
            this.loadImage(loserAvatarUrl)
        ]);

        // 1. BACKGROUND: Deep dark stadium atmosphere
        const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.75);
        bgGrad.addColorStop(0, '#1c1c22');
        bgGrad.addColorStop(0.6, '#0f0f12');
        bgGrad.addColorStop(1, '#050507');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Carbon fiber pattern overlay
        ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
        for (let y = 0; y < H; y += 12) {
            for (let x = 0; x < W; x += 12) {
                const offset = (Math.floor(y / 12) % 2) * 6;
                ctx.fillRect(x + offset, y, 6, 6);
            }
        }

        // Glowing red flare
        const flareLeft = ctx.createRadialGradient(280, 480, 10, 280, 480, 300);
        flareLeft.addColorStop(0, 'rgba(196, 30, 42, 0.25)');
        flareLeft.addColorStop(1, 'transparent');
        ctx.fillStyle = flareLeft;
        ctx.fillRect(0, 200, 600, 600);

        // Gold subtle border
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
        ctx.lineWidth = 4;
        this.roundRect(ctx, 24, 24, W - 48, H - 48, 24);
        ctx.stroke();

        // 2. HEADER: SUBSOCCER PRO MATCH
        ctx.fillStyle = '#c41e2a';
        ctx.font = '800 28px "Resolve", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.letterSpacing = '4px';
        ctx.fillText('SUBSOCCER // OFFICIAL RANKED MATCH', W / 2, 70);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '600 20px "Resolve", sans-serif';
        ctx.letterSpacing = '2px';
        ctx.fillText(date.toUpperCase(), W / 2, 110);

        // 3. CENTER SCORE BOARD
        const scoreY = 460;
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 130px "Subsoccer", "SubsoccerLogo", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${winnerScore} — ${loserScore}`, W / 2, scoreY);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '800 22px "Resolve", sans-serif';
        ctx.letterSpacing = '4px';
        ctx.fillText('FINAL SCORE', W / 2, scoreY + 85);

        // Helper to draw player card block
        const drawPlayerCard = (x, y, name, avatarImg, eloBefore, eloAfter, isWinner, country) => {
            const cardW = 320;
            const cardH = 460;
            const cx = x + cardW / 2;

            // Card background
            ctx.fillStyle = isWinner ? 'rgba(26, 22, 18, 0.85)' : 'rgba(20, 20, 24, 0.7)';
            this.roundRect(ctx, x, y, cardW, cardH, 18);
            ctx.fill();

            // Border
            ctx.strokeStyle = isWinner ? 'rgba(212, 175, 55, 0.7)' : 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = isWinner ? 3 : 1.5;
            this.roundRect(ctx, x, y, cardW, cardH, 18);
            ctx.stroke();

            // Crown / Status pill for winner
            if (isWinner) {
                ctx.fillStyle = '#c41e2a';
                this.roundRect(ctx, cx - 75, y - 18, 150, 36, 18);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = '800 16px "Resolve", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.letterSpacing = '2px';
                ctx.fillText('👑 WINNER', cx, y);
            }

            // Avatar frame
            const avSize = 190;
            const avX = cx - avSize / 2;
            const avY = y + 45;

            ctx.save();
            this.roundRect(ctx, avX, avY, avSize, avSize, 14);
            ctx.clip();

            if (avatarImg) {
                ctx.drawImage(avatarImg, avX, avY, avSize, avSize);
            } else {
                ctx.fillStyle = '#222';
                ctx.fillRect(avX, avY, avSize, avSize);
                ctx.fillStyle = '#666';
                ctx.font = '900 64px "Subsoccer", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name.charAt(0).toUpperCase(), cx, avY + avSize / 2);
            }
            ctx.restore();

            // Avatar border
            ctx.strokeStyle = isWinner ? '#ffd700' : 'rgba(255,255,255,0.15)';
            ctx.lineWidth = isWinner ? 3 : 1.5;
            this.roundRect(ctx, avX, avY, avSize, avSize, 14);
            ctx.stroke();

            // Player Name
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 36px "Subsoccer", "SubsoccerLogo", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.letterSpacing = '1px';
            const displayName = name.length > 10 ? name.slice(0, 9) + '…' : name;
            ctx.fillText(displayName.toUpperCase(), cx, y + 255);

            // Country if available
            if (country) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.font = '700 16px "Resolve", sans-serif';
                ctx.letterSpacing = '1.5px';
                ctx.fillText(`📍 ${country.toUpperCase()}`, cx, y + 300);
            }

            // ELO Pill box
            const eloPillY = y + 340;
            ctx.fillStyle = isWinner ? 'rgba(196, 30, 42, 0.2)' : 'rgba(255, 255, 255, 0.04)';
            this.roundRect(ctx, cx - 120, eloPillY, 240, 75, 10);
            ctx.fill();
            ctx.strokeStyle = isWinner ? 'rgba(196, 30, 42, 0.6)' : 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            this.roundRect(ctx, cx - 120, eloPillY, 240, 75, 10);
            ctx.stroke();

            // ELO numbers and diff
            const eloDiff = eloAfter - eloBefore;
            const diffSign = eloDiff >= 0 ? `+${eloDiff}` : `${eloDiff}`;

            ctx.fillStyle = '#ffffff';
            ctx.font = '900 32px "Subsoccer", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${eloAfter}`, cx - 35, eloPillY + 38);

            ctx.fillStyle = eloDiff >= 0 ? '#4ade80' : '#f87171';
            ctx.font = '800 22px "Resolve", sans-serif';
            ctx.letterSpacing = '1px';
            ctx.fillText(`(${diffSign})`, cx + 55, eloPillY + 38);
        };

        // Draw Left: Winner Card
        drawPlayerCard(100, 220, winnerName, winnerImg, winnerEloBefore, winnerEloAfter, true, winnerCountry);

        // Draw Right: Loser Card
        drawPlayerCard(660, 220, loserName, loserImg, loserEloBefore, loserEloAfter, false, loserCountry);

        // 4. FOOTER: CTA
        const footerY = 870;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        this.roundRect(ctx, 100, footerY, W - 200, 130, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        this.roundRect(ctx, 100, footerY, W - 200, 130, 16);
        ctx.stroke();

        ctx.fillStyle = '#ffd700';
        ctx.font = '800 24px "Resolve", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.letterSpacing = '2px';
        ctx.fillText(`🏆 ${winnerName.toUpperCase()} TAKES THE WIN`, W / 2, footerY + 28);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '600 18px "Resolve", sans-serif';
        ctx.letterSpacing = '3px';
        ctx.fillText('PLAY & CLIMB THE GLOBAL LEADERBOARD // SUBSOCCER.PRO', W / 2, footerY + 72);

        return canvas;
    },

    /**
     * Generates a PNG Blob from the match card
     */
    async getCardBlob(matchData) {
        const canvas = await this.renderCardCanvas(matchData);
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        });
    },

    /**
     * Triggers native Web Share or fallback download
     */
    async shareMatchResult(matchData) {
        const { winnerName, loserName, winnerScore, loserScore } = matchData;
        const shareText = `⚽ Subsoccer Ranked Match: ${winnerName} won ${winnerScore}-${loserScore} vs ${loserName}! Check my Pro Card on subsoccer.pro 🏆`;
        const shareTitle = `${winnerName} vs ${loserName} // Subsoccer Match Result`;

        try {
            const blob = await this.getCardBlob(matchData);
            if (!blob) throw new Error('Blob generation failed');

            const file = new File([blob], `subsoccer-match-${winnerName}-vs-${loserName}.png`, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: shareTitle,
                    text: shareText,
                    files: [file]
                });
                return { success: true, method: 'share_file' };
            } else if (navigator.share) {
                await navigator.share({
                    title: shareTitle,
                    text: shareText,
                    url: 'https://subsoccer.pro'
                });
                return { success: true, method: 'share_url' };
            } else {
                // Desktop fallback: Download image
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `subsoccer-match-${winnerName}-vs-${loserName}.png`;
                a.click();
                URL.revokeObjectURL(url);
                return { success: true, method: 'download' };
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('Share error, downloading fallback:', err);
                const blob = await this.getCardBlob(matchData);
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `subsoccer-match-${winnerName}-vs-${loserName}.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            }
            return { success: false, error: err };
        }
    }
};

window.MatchShareCard = MatchShareCard;
