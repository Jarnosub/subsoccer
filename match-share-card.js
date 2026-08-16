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
    async renderCardCanvas(payload = {}) {
        await document.fonts.ready;

        const W = 1080;
        const H = 1080;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Resolve parameters with backward-compatible fallbacks
        const p1Name = payload.p1Name || (payload.winnerNumber === 1 ? payload.winnerName : payload.loserName) || 'PLAYER 1';
        const p2Name = payload.p2Name || (payload.winnerNumber === 2 ? payload.winnerName : payload.loserName) || 'PLAYER 2';
        const p1Score = payload.p1Score !== undefined ? payload.p1Score : (payload.winnerNumber === 1 ? payload.winnerScore : payload.loserScore);
        const p2Score = payload.p2Score !== undefined ? payload.p2Score : (payload.winnerNumber === 2 ? payload.winnerScore : payload.loserScore);
        const p1EloBefore = payload.p1EloBefore !== undefined ? payload.p1EloBefore : (payload.winnerNumber === 1 ? payload.winnerEloBefore : payload.loserEloBefore) || 1300;
        const p1EloAfter = payload.p1EloAfter !== undefined ? payload.p1EloAfter : (payload.winnerNumber === 1 ? payload.winnerEloAfter : payload.loserEloAfter) || 1300;
        const p2EloBefore = payload.p2EloBefore !== undefined ? payload.p2EloBefore : (payload.winnerNumber === 2 ? payload.winnerEloBefore : payload.loserEloBefore) || 1300;
        const p2EloAfter = payload.p2EloAfter !== undefined ? payload.p2EloAfter : (payload.winnerNumber === 2 ? payload.winnerEloAfter : payload.loserEloAfter) || 1300;
        const p1AvatarUrl = payload.p1AvatarUrl || (payload.winnerNumber === 1 ? payload.winnerAvatarUrl : payload.loserAvatarUrl);
        const p2AvatarUrl = payload.p2AvatarUrl || (payload.winnerNumber === 2 ? payload.winnerAvatarUrl : payload.loserAvatarUrl);
        const winnerName = payload.winnerName || (payload.winnerNumber === 1 ? p1Name : p2Name);
        const p1Won = payload.winnerNumber ? (payload.winnerNumber === 1) : (p1Score > p2Score || winnerName === p1Name);
        const durationStr = payload.matchDurationStr || (payload.matchDuration ? `${Math.floor(payload.matchDuration / 60)}:${(payload.matchDuration % 60).toString().padStart(2, '0')}` : '0:45');

        // Load avatar images in parallel
        const [p1Img, p2Img] = await Promise.all([
            this.loadImage(p1AvatarUrl),
            this.loadImage(p2AvatarUrl)
        ]);

        // 1. BACKGROUND: Split Stadium Arena (Left Petrol Navy, Right Subsoccer Red)
        // Left Half
        const leftGrad = ctx.createLinearGradient(0, 0, W / 2, H);
        leftGrad.addColorStop(0, '#101c24');
        leftGrad.addColorStop(0.5, '#1c2b36');
        leftGrad.addColorStop(1, '#0e171e');
        ctx.fillStyle = leftGrad;
        ctx.fillRect(0, 0, W / 2, H);

        // Right Half
        const rightGrad = ctx.createLinearGradient(W / 2, 0, W, H);
        rightGrad.addColorStop(0, '#8a0b12');
        rightGrad.addColorStop(0.5, '#b8151f');
        rightGrad.addColorStop(1, '#66080d');
        ctx.fillStyle = rightGrad;
        ctx.fillRect(W / 2, 0, W / 2, H);

        // Subtle split line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
        ctx.stroke();

        // Dark stadium vignette overlay
        const vignette = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, W * 0.72);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);

        // 2. TOP BRAND BADGE: SUBSOCCER
        const badgeW = 200;
        const badgeH = 44;
        const badgeX = (W - badgeW) / 2;
        const badgeY = 60;
        ctx.fillStyle = '#c41e2a';
        this.roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        this.roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'normal 26px "Subsoccer", "Open Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SUBSOCCER', W / 2, badgeY + badgeH / 2 + 1);

        // 3. HEADER LABELS
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 18px "Resolve", "Open Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MATCH RESULT', W / 2, 145);

        // Winner Announcement (single clean outline)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'normal 44px "Subsoccer", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🏆  ${winnerName.toUpperCase()} WINS!`, W / 2, 205);

        // 4. GIANT MATCH SCORE (P1_SCORE — P2_SCORE)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'normal 130px "Subsoccer", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${p1Score} — ${p2Score}`, W / 2, 330);

        // 5. HELPER TO DRAW PLAYER PORTRAIT & CARD
        const drawPlayerSide = (cx, name, avatarImg, eloBefore, eloAfter, isWinner) => {
            const photoSize = 250;
            const photoX = cx - photoSize / 2;
            const photoY = 430;

            // Photo wrapper background & clip
            ctx.save();
            this.roundRect(ctx, photoX, photoY, photoSize, photoSize, 12);
            ctx.clip();

            if (avatarImg) {
                ctx.drawImage(avatarImg, photoX, photoY, photoSize, photoSize);
            } else {
                ctx.fillStyle = isWinner ? '#221111' : '#111822';
                ctx.fillRect(photoX, photoY, photoSize, photoSize);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'normal 80px "Subsoccer", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name.charAt(0).toUpperCase(), cx, photoY + photoSize / 2);
            }
            ctx.restore();

            // Photo Border (solid white for winner, semi-white for other)
            ctx.strokeStyle = isWinner ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = isWinner ? 3.5 : 2;
            this.roundRect(ctx, photoX, photoY, photoSize, photoSize, 12);
            ctx.stroke();

            // Winner Badge if winner
            if (isWinner) {
                const bw = 105;
                const bh = 30;
                const bx = photoX + 10;
                const by = photoY + 10;
                ctx.fillStyle = '#c41e2a';
                this.roundRect(ctx, bx, by, bw, bh, 5);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px "Resolve", "Open Sans", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('WINNER', bx + bw / 2, by + bh / 2 + 1);
            }

            // Player Name below photo
            ctx.fillStyle = '#ffffff';
            ctx.font = 'normal 32px "Subsoccer", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const cleanName = name.length > 12 ? name.slice(0, 11) + '…' : name;
            ctx.fillText(cleanName.toUpperCase(), cx, photoY + photoSize + 22);

            // ELO Pill Box
            const pillW = 240;
            const pillH = 54;
            const pillX = cx - pillW / 2;
            const pillY = photoY + photoSize + 70;

            ctx.fillStyle = isWinner ? 'rgba(0, 60, 20, 0.7)' : 'rgba(0, 0, 0, 0.6)';
            this.roundRect(ctx, pillX, pillY, pillW, pillH, 8);
            ctx.fill();
            ctx.strokeStyle = isWinner ? 'rgba(40, 200, 100, 0.4)' : 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1.5;
            this.roundRect(ctx, pillX, pillY, pillW, pillH, 8);
            ctx.stroke();

            const eloDiff = eloAfter - eloBefore;
            const diffSign = eloDiff >= 0 ? `+${eloDiff}` : `${eloDiff}`;

            ctx.font = 'bold 22px "Open Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = eloDiff >= 0 ? '#4ade80' : '#f87171';
            ctx.fillText(`${eloBefore} → ${eloAfter} (${diffSign})`, cx, pillY + pillH / 2);
        };

        // Draw Player 1 (Left Navy Side: CX = 270)
        drawPlayerSide(270, p1Name, p1Img, p1EloBefore, p1EloAfter, p1Won);

        // Draw Player 2 (Right Red Side: CX = 810)
        drawPlayerSide(810, p2Name, p2Img, p2EloBefore, p2EloAfter, !p1Won);

        // Center "VS"
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = 'bold 24px "Resolve", "Open Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VS', W / 2, 555);

        // 6. FOOTER STATS & BRANDING
        const footerY = 900;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 18px "Resolve", "Open Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`MATCH TIME: ${durationStr}`, W / 2, footerY);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = 'bold 15px "Resolve", "Open Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SUBSOCCER.PRO // THE OFFICIAL BENCH SOCCER APP', W / 2, footerY + 38);

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
