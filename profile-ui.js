import { state, _supabase } from './config.js';
import { fetchMyGames } from './game-service.js';
import { populateCountries } from './auth.js';
import { showNotification } from './ui-utils.js';
import { initTiltEffect } from './ui.js';
import { initTeamUI } from './team-service.js';
import { loadHardwareGarage } from './hardware-service.js';

/**
 * Lataa ja näyttää käyttäjän profiilin tiedot
 */
export async function loadUserProfile() {
    if (!state.user || !state.user.id) return;

    // Lataa rekisteröidyt laitteet
    try { await loadHardwareGarage(); } catch (e) { console.error('Garage load error:', e); }

    // Päivitä avatar
    const avatarEl = document.getElementById('profile-avatar-display');
    const previewEl = document.getElementById('avatar-preview');
    if (avatarEl && state.user.avatar_url) {
        avatarEl.src = state.user.avatar_url;
    }
    if (previewEl && state.user.avatar_url) {
        previewEl.src = state.user.avatar_url;
    }

    // Päivitä nimi
    const usernameEl = document.getElementById('profile-username');
    if (usernameEl) {
        usernameEl.innerText = state.user.username || 'Player';
    }

    // Päivitä nimi headeriin
    const headerNameEl = document.getElementById('user-display-name');
    if (headerNameEl) {
        headerNameEl.innerText = state.user.username || 'Player';
    }

    // Päivitä maa
    const countryEl = document.getElementById('profile-country');
    if (countryEl && state.user.country) {
        countryEl.innerText = '🌍 ' + state.user.country.toUpperCase();
    } else if (countryEl) {
        countryEl.innerText = '🌍 Set your country';
    }

    // Päivitä ELO
    const eloEl = document.getElementById('profile-elo');
    if (eloEl) {
        eloEl.innerText = state.user.elo || 1000;
    }

    // Hae otteluiden määrä
    const matchesEl = document.getElementById('profile-matches');
    if (matchesEl && state.user.id !== 'guest') {
        try {
            const { count } = await _supabase
                .from('matches')
                .select('*', { count: 'exact', head: true })
                .or(`player1.eq.${state.user.username}, player2.eq.${state.user.username} `);
            matchesEl.innerText = count || 0;
        } catch (e) {
            matchesEl.innerText = '0';
        }
    }

    // Lataa pelit ja tiimi
    fetchMyGames();
    initTeamUI();
}

/**
 * Näyttää profiilin muokkauslomakkeen
 */
export function showEditProfile() {
    const fields = document.getElementById('profile-edit-fields');
    if (!fields) return;
    fields.style.display = 'block';
    document.getElementById('profile-dashboard-ui').style.display = 'none'; // Piilota napit

    // Näytetään pelipöydät vain muokkaustilassa
    const profileGamesUi = document.getElementById('profile-games-ui');
    if (profileGamesUi) profileGamesUi.style.display = state.user?.id === 'guest' ? 'none' : 'block';

    populateCountries();

    // Haetaan arvot state.userista (joka on nyt ladattu auth.js:ssä)
    const mapping = {
        'edit-full-name': state.user.full_name,
        'edit-email': state.user.email,
        'edit-phone': state.user.phone,
        'edit-city': state.user.city,
        'country-input': state.user.country,
        'edit-password': '' // Tyhjennetään salasanakenttä aina avattaessa
    };

    Object.entries(mapping).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    });
}

/**
 * Piilottaa profiilin muokkauslomakkeen
 */
export function cancelEditProfile() {
    const editFields = document.getElementById('profile-edit-fields');
    if (editFields) {
        editFields.style.display = 'none';
    }
    document.getElementById('profile-dashboard-ui').style.display = 'block'; // Tuo napit takaisin

    // Piilotetaan pelipöydät kun poistutaan muokkaustilasta
    const profileGamesUi = document.getElementById('profile-games-ui');
    if (profileGamesUi) profileGamesUi.style.display = 'none';
}

function updateRankProgress() {
    const container = document.getElementById('rank-progress-container');
    if (!container || !state.user || state.user.id === 'guest') {
        if (container) container.innerHTML = '';
        return;
    }

    const elo = state.user.elo || 1000;

    let currentRank = "ROOKIE";
    let nextRank = "AMATEUR";
    let minElo = 0;
    let maxElo = 1200;
    let rankColor = "#C0C0C0";

    if (elo >= 1200 && elo < 1600) {
        currentRank = "AMATEUR";
        nextRank = "PRO";
        minElo = 1200;
        maxElo = 1600;
        rankColor = "#CD7F32";
    } else if (elo >= 1600 && elo < 2000) {
        currentRank = "PRO";
        nextRank = "ELITE";
        minElo = 1600;
        maxElo = 2000;
        rankColor = "var(--sub-gold)";
    } else if (elo >= 2000) {
        currentRank = "ELITE";
        nextRank = "ELITE";
        minElo = 2000;
        maxElo = 3000;
        rankColor = "#00FFCC";
    }

    const progress = Math.min(100, Math.max(0, ((elo - minElo) / (maxElo - minElo)) * 100));
    const pointsNeeded = maxElo - elo;

    container.innerHTML = `
        <div style="background: rgba(10,10,10,0.6); border: 1px solid rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; width:100%; box-sizing:border-box;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px;">
                <div style="text-align: left;">
                    <div style="font-family:'Open Sans', sans-serif; font-size:0.6rem; color:#666; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">Current ELO: <span style="color:#fff;">${elo}</span></div>
                    <div style="font-family:'SubsoccerLogo', sans-serif; font-size:1.0rem; color:${rankColor}; text-shadow:0 0 10px ${rankColor}66; margin-top:2px; letter-spacing:1px;">${currentRank}</div>
                </div>
                <div style="text-align: right;">
                    ${currentRank !== 'ELITE' ?
            `<div style="font-family:'Open Sans', sans-serif; font-size:0.55rem; color:#888; font-weight:bold; letter-spacing:1px; text-transform:uppercase;"><span style="color:#fff;">${pointsNeeded} PTS</span> TO ${nextRank}</div>
                    <div style="font-family:'Russo One', sans-serif; font-size:0.9rem; color:#fff; margin-top:2px;">${Math.round(progress)}%</div>` :
            `<div style="font-family:'Open Sans', sans-serif; font-size:0.55rem; color:#888; font-weight:bold; letter-spacing:1px; text-transform:uppercase;">MAX STATUS UNLOCKED</div>
                    <div style="font-family:'Russo One', sans-serif; font-size:0.9rem; color:${rankColor}; margin-top:2px;">MAX</div>`
        }
                </div>
            </div>
            
            <div style="width: 100%; height: 6px; background: #1a1a1a; border-radius: 3px; overflow: hidden; position: relative;">
                <div id="rank-progress-fill" style="position: absolute; left: 0; top: 0; height: 100%; width: 0%; background: linear-gradient(90deg, rgba(255,255,255,0.1), ${rankColor}); border-radius: 3px; transition: width 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-shadow: 0 0 10px ${rankColor}66;"></div>
            </div>
        </div>
    `;

    const fillBar = container.querySelector('#rank-progress-fill');
    if (fillBar) {
        setTimeout(() => {
            fillBar.style.width = `${progress}%`;
        }, 150);
    }
}

/**
 * Päivittää profiilin näkymän (Dashboard kortti)
 */
export function updateProfileCard() {
    const container = document.getElementById('profile-card-container');
    if (!container || !state.user) return;
    const u = state.user;
    const editionClass = state.activeCardEdition !== 'standard' ? `card-${state.activeCardEdition}-edition` : '';
    const rookieClass = ((u.wins || 0) + (u.losses || 0)) < 5 ? 'status-rookie' : '';

    const labels = {
        'standard': 'PRO CARD',
        'elite': 'ELITE SERIES',
        'global': 'GLOBAL PRO',
        'legendary-gold': 'LEGENDARY GOLD'
    };
    const editionLabel = state.brand ? 'PARTNER EDITION' : (labels[state.activeCardEdition] || 'PRO CARD');
    const overlayBg = state.brand ? 'var(--sub-red)' : '#000';
    const overlayHeight = state.brand ? '30%' : '40%';

    // Game Ownership Badges
    const myGames = state.myGames || [];
    const badges = [];
    const checkGame = (g, type) => {
        const name = (g.game_name || '').toUpperCase();
        const serial = (g.serial_number || '').toUpperCase();
        return name.includes(type) || serial.includes(type);
    };

    if (myGames.some(g => checkGame(g, 'ARCADE'))) {
        badges.push({ icon: 'fa-crown', color: '#FFD700', title: 'ARCADE OWNER' }); // Gold
    }
    if (myGames.some(g => checkGame(g, 'S7') || checkGame(g, 'SUBSOCCER 7'))) {
        badges.push({ icon: 'fa-medal', color: '#C0C0C0', title: 'S7 OWNER' }); // Silver
    }
    if (myGames.some(g => checkGame(g, 'S3') || checkGame(g, 'SUBSOCCER 3'))) {
        badges.push({ icon: 'fa-shield', color: '#CD7F32', title: 'S3 OWNER' }); // Bronze
    }

    const wins = u.wins || 0;
    const losses = u.losses || 0;
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const avatarUrl = (u.avatar_url && u.avatar_url.trim() !== '') ? u.avatar_url : 'placeholder-silhouette-5-wide.png';

    container.innerHTML = `
    <style>
        .pro-card-force-sharp { border-radius: 0 !important; }
        .card-bleed-edge { position: absolute; inset: 0; background: radial-gradient(circle, rgba(0,0,0,0.15) 1.5px, transparent 1.5px) 0 0, #00FFCC; background-size: 8px 8px; border: 1px solid #00ccaa; }
        .card-safe-zone { position: absolute; inset: 16px; border: 1px solid #999; border-top: 2px solid #fff; border-bottom: 2px solid #555; background: #050505; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        .card-serial { position: absolute; top: 10px; right: 10px; background: transparent; color: #444; font-family: 'Open Sans', sans-serif; font-size: 0.55rem; font-weight: bold; z-index: 10; letter-spacing: 1px; }
        .card-rc-badge { position: absolute; top: 10px; left: 10px; background: transparent; color: #E30613; font-family: 'Russo One', sans-serif; font-size: 1rem; z-index: 10; font-style: italic; text-shadow: 1px 1px 0 #fff; }
        .card-image-box { height: 65%; width: 100%; position: relative; border-bottom: 2px solid #E30613; background: #111; }
        .card-nameplate { position: absolute; bottom: 0; width: 100%; padding: 30px 10px 10px 10px; background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%); display: flex; flex-direction: column; justify-content: flex-end; }
        .card-data-box { height: 35%; width: 100%; position: relative; background-color: #111111; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Cpath fill='%231e1e1e' d='M0 0h2v2H0zM2 2h2v2H2z'/%3E%3C/svg%3E"); padding: 10px 15px; display: flex; flex-direction: column; justify-content: space-between; }
        .pro-stamp { position: absolute; top: 6px; right: 6px; left: auto; width: 62px; height: auto; z-index: 50; transform: rotate(12deg); pointer-events: none; }
        .pro-card.flipped .card-flipper { transform: rotateY(180deg) scale(1.05); }
        .card-front, .card-back { padding: 0 !important; }
        
        .holo-glow { position: absolute; inset: 0; background: radial-gradient(circle at calc(var(--gx, 50) * 1%) calc(var(--gy, -20) * 1%), rgba(255, 230, 100, 0.45) 0%, rgba(255, 255, 255, 0.1) 30%, transparent 60%); mix-blend-mode: color-dodge; z-index: 40; pointer-events: none; opacity: 1; transition: opacity 0.3s; }
    </style>
    <div class="pro-card pro-card-force-sharp ${editionClass} ${rookieClass}" style="margin:0 auto; width:100%; max-width:320px; aspect-ratio:2.5/3.5; background:transparent; box-shadow:none; cursor:pointer; perspective: 1000px;">
        <div class="card-flipper" style="width: 100%; height: 100%; position: relative; transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform-style: preserve-3d; border-radius: 0; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.6);">
            <!-- FRONT SIDE -->
            <div class="card-front" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 0; background: transparent;">
                <div class="card-bleed-edge">
                    <div class="card-safe-zone">
                        ${wins + losses < 5 ? '<div class="card-rc-badge">RC</div>' : ''}
                        <div class="card-serial">${editionLabel}</div>
                        
                        <div class="card-image-box">
                            <img src="subsoccer_logo.svg" alt="Subsoccer" width="69" height="24" style="position:absolute; top:0; left:12px; z-index:20;">
                            <img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">
                            <div class="holo-glow"></div>
                            <div class="card-nameplate">
                                ${u.team_data ? `<div style="font-family:'Open Sans', sans-serif; color:#FFD700; font-size:0.6rem; font-weight:bold; margin-bottom:2px; letter-spacing:1px; text-transform:uppercase;">${u.team_data.tag}</div>` : ''}
                                <div style="font-family:'Russo One', sans-serif; color:#fff; font-size:1.6rem; line-height:1; text-transform:uppercase;">${u.username}</div>
                            </div>
                        </div>

                        <div class="card-data-box">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-family:'Open Sans', sans-serif; color:#888; font-size:0.5rem; font-weight:800; letter-spacing:1px;">GLOBAL RANKING</div>
                                    <div style="font-family:'Russo One', sans-serif; color:#fff; font-size:1.2rem;">${u.elo || 1000}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-family:'Open Sans', sans-serif; color:#888; font-size:0.5rem; font-weight:800; letter-spacing:1px;">WIN RATIO</div>
                                    <div style="font-family:'Russo One', sans-serif; color:#00FFCC; font-size:1.2rem;">${ratio}</div>
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 15px; margin-top: 5px; border-top: 1px solid #333; padding-top: 8px;">
                                <div style="text-align:left;"><div style="color:#666; font-size:0.5rem; font-family:'Open Sans', sans-serif; font-weight:bold;">WINS</div><div style="color:#fff; font-family:'Russo One', sans-serif; font-size:0.9rem;">${wins}</div></div>
                                <div style="text-align:left;"><div style="color:#666; font-size:0.5rem; font-family:'Open Sans', sans-serif; font-weight:bold;">LOSSES</div><div style="color:#fff; font-family:'Russo One', sans-serif; font-size:0.9rem;">${losses}</div></div>
                                <div style="margin-left:auto; display:flex; align-items:center;">
                                    <img src="https://flagcdn.com/w20/${(u.country || 'fi').toLowerCase()}.png" width="20" style="border:1px solid #555;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ${u.elo >= 1600 ? `<img src="stamp.png" class="pro-stamp">` : ''}
                <div class="flip-hint" style="position:absolute; bottom:-25px; width:100%; text-align:center; color:#666; font-size:0.6rem; font-family:'Open Sans', sans-serif; pointer-events:none;"><i class="fa-solid fa-rotate-right"></i> TAP TO FLIP</div>
            </div>
            
            <!-- BACK SIDE -->
            <div class="card-back" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 0; background-color: #0a0a0a; background-image: radial-gradient(circle at center, #1a0000 0%, #000 100%); transform: rotateY(180deg); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #333;">
                <div style="text-align:center; padding-bottom:5px; border-bottom:1px solid #333; margin-bottom:15px; padding:20px 20px 0 20px;">
                    <h4 style="color:#D4AF37; font-family:'Russo One', sans-serif; margin:0; letter-spacing:2px; font-size:1.1rem;">PLAYER DOSSIER</h4>
                    <div style="color:#fff; font-size:0.75rem; font-family:'Open Sans', sans-serif; margin-top:5px; text-transform:uppercase;">${u.username}</div>
                </div>
                <!-- Premium Stats Content appended asynchronously below -->
                <div id="profile-card-back-content" style="flex:1; padding:0 20px; overflow-y:auto; overflow-x:hidden; width:100%; box-sizing:border-box;">
                    <!-- Async content loads here, spinner removed for cleaner static state -->
                </div>
                <!-- Bottom edge "TAP TO FLIP" -->
                <div class="flip-hint" style="position: absolute; bottom: 8px; width: 100%; left: 0; text-align: center; color: rgba(255,255,255,0.3); font-size: 0.6rem; font-weight: bold; letter-spacing: 1.5px; z-index: 2;">
                    <i class="fa-solid fa-rotate-left" style="margin-right: 3px;"></i> TAP TO FLIP
                </div>
            </div>
        </div>
    </div>
    `;

    // Fetch and populate back side data asynchronously (Premium Stats Layout)
    Promise.all([
        _supabase.from('tournament_history')
            .select('*')
            .or(`winner_name.eq.${u.username},second_place_name.eq.${u.username},third_place_name.eq.${u.username}`)
            .eq('status', 'completed')
    ]).then(([{ data: tournaments }]) => {
        const backContent = document.getElementById('profile-card-back-content');
        if (!backContent) return;

        const rankStatus = u.elo > 1600 ? 'PRO' : (u.elo > 1400 ? 'AMATEUR' : 'ROOKIE');
        const rankColor = u.elo > 1600 ? 'var(--sub-gold)' : (u.elo > 1400 ? '#C0C0C0' : '#CD7F32');

        let totalWins = tournaments ? tournaments.filter(t => t.winner_name === u.username).length : 0;
        let totalPodiums = tournaments ? tournaments.length : 0;

        let majorWins = 0;
        let arenaChamps = 0;

        // Fallback for players with high wins but no tournament history (like AXEL demo)
        if (totalWins === 0 && u.wins > 10) {
            totalWins = Math.floor(u.wins / 10);
            totalPodiums = Math.floor(u.wins / 4);
            majorWins = u.elo > 1600 ? Math.floor(u.wins / 30) : 0;
            arenaChamps = u.elo > 1400 ? Math.floor(u.wins / 20) : 0;
        }

        let html = `
            <div style="text-align:center; padding: 15px 0;">
                <div style="font-family:'Resolve'; color:#888; font-size:0.6rem; letter-spacing:2px; margin-bottom:5px;">CURRENT STATUS</div>
                <div style="font-family:'Russo One'; color:${rankColor}; font-size:1.6rem; letter-spacing:3px;">${rankStatus}</div>
            </div>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.5rem; font-family:'Russo One'; color:#fff;">${totalWins}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Tournament<br>VictorIES</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.5rem; font-family:'Russo One'; color:#fff;">${totalPodiums}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Total<br>Podiums</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center; opacity:0.5;">
                    <div style="font-size:1.2rem; font-family:'Russo One'; color:#fff;">${arenaChamps}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Global<br>Titles</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center; opacity:0.5;">
                    <div style="font-size:1.2rem; font-family:'Russo One'; color:#fff;">${majorWins}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Major<br>Titles</div>
                </div>
            </div>
        `;

        backContent.innerHTML = html;
    }).catch(err => {
        console.error("Error fetching card dossier stats:", err);
    });

    const cardEl = container.querySelector('.pro-card');
    const flipper = container.querySelector('.card-flipper');

    if (cardEl && flipper) {
        let isFlipping = false;

        cardEl.addEventListener('click', () => {
            isFlipping = true;
            cardEl.classList.toggle('flipped');
            if (cardEl.classList.contains('flipped')) {
                flipper.style.transform = `rotateY(180deg) scale(1.05)`;
            } else {
                flipper.style.transform = `rotateX(0deg) rotateY(0deg)`;
                cardEl.style.setProperty('--gx', 50);
                cardEl.style.setProperty('--gy', -20);
            }
            setTimeout(() => isFlipping = false, 600);
        });

        // Mouse Hover Engine (Desktop)
        cardEl.addEventListener('mousemove', (e) => {
            if (isFlipping) return;
            const rect = cardEl.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const gx = (x / rect.width) * 100;
            const gy = (y / rect.height) * 100;

            const rx = ((y / rect.height) - 0.5) * -20;
            const ry = ((x / rect.width) - 0.5) * 20;

            cardEl.style.setProperty('--gx', gx);
            cardEl.style.setProperty('--gy', gy);

            if (!cardEl.classList.contains('flipped')) {
                flipper.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02, 1.02, 1.02)`;
            }
        });

        cardEl.addEventListener('mouseleave', () => {
            if (isFlipping) return;
            cardEl.style.setProperty('--gx', 50);
            cardEl.style.setProperty('--gy', -20);
            if (!cardEl.classList.contains('flipped')) {
                flipper.style.transform = `rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            }
        });

        // Device Orientation Engine (Mobile Gyroscope)
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (e) => {
                if (isFlipping || !document.contains(cardEl)) return;

                let gamma = e.gamma || 0;
                let beta = e.beta || 0;

                gamma = Math.max(-45, Math.min(45, gamma));
                beta = Math.max(0, Math.min(90, beta));

                const gx = ((gamma + 45) / 90) * 100;
                const gy = (beta / 90) * 100;

                const rx = ((beta - 45) / 45) * -15;
                const ry = (gamma / 45) * 15;

                cardEl.style.setProperty('--gx', gx);
                cardEl.style.setProperty('--gy', gy);

                if (!cardEl.classList.contains('flipped')) {
                    flipper.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
                }
            }, true);
        }
    }

    updateRankProgress();
}

window.loadUserProfile = loadUserProfile;
window.showEditProfile = showEditProfile;
window.cancelEditProfile = cancelEditProfile;
window.updateProfileCard = updateProfileCard;

/**
 * 300 DPI -luokan PDF Export-työkalu fyysiselle Vault Assetille.
 * Renderöi tallennetun korttimuistin Canvas-kirjastoilla painokelpoiseksi.
 */
export async function exportPhysicalCardToPDF(shippingInfo) {
    const originalCard = document.querySelector('#profile-card-container .pro-card');
    if (!originalCard) return alert("Pro Card ei ole vielä latautunut!");

    if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        alert("Odota hetki, tallennuskirjastoja ladataan...");
        return;
    }

    const loader = document.createElement('div');
    loader.innerHTML = '<div style="background:rgba(0,0,0,0.9); color:#fff; position:fixed; inset:0; z-index:999999; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:\'Russo One\',sans-serif; font-size:1.5rem;"><i class="fa-solid fa-spinner fa-spin" style="margin-bottom:20px; color:var(--sub-gold); font-size:3rem;"></i>MINTING PRO CARD...<div id="pdf-mint-status" style="font-family:\'Open Sans\'; font-size:0.8rem; color:#888; margin-top:10px;">GENERATING 300 DPI PRINT ASSET</div></div>';
    document.body.appendChild(loader);
    const statusText = document.getElementById('pdf-mint-status');

    const staging = document.createElement('div');
    staging.style.position = 'absolute';
    staging.style.left = '0'; // Keep in viewport but hide with opacity
    staging.style.top = '0';
    staging.style.opacity = '0.01';
    staging.style.pointerEvents = 'none';
    staging.style.zIndex = '-99';
    staging.style.width = '800px';
    staging.style.height = '600px';
    staging.style.display = 'flex';
    staging.style.alignItems = 'flex-start';
    staging.style.justifyContent = 'flex-start';
    staging.style.background = '#ffffff';
    document.body.appendChild(staging);

    try {
        const clone = originalCard.cloneNode(true);
        clone.style.transform = 'none';
        clone.style.boxShadow = 'none';
        clone.style.margin = '0';
        clone.style.padding = '0';
        clone.style.maxWidth = 'none';
        clone.style.aspectRatio = 'auto';
        clone.style.width = '340px';
        clone.style.height = '465px';
        clone.className = clone.className.replace('flipped', '');

        const flipper = clone.querySelector('.card-flipper') || clone.querySelector('.pro-card-flipper');
        flipper.style.transform = 'none';
        flipper.style.display = 'block';
        flipper.style.width = '340px';
        flipper.style.height = '465px';
        flipper.style.boxShadow = 'none';

        const front = clone.querySelector('.card-front') || clone.querySelector('.pro-card-front');
        const back = clone.querySelector('.card-back') || clone.querySelector('.pro-card-back');

        [front, back].forEach(side => {
            side.style.position = 'absolute';
            side.style.top = '0';
            side.style.left = '0';
            side.style.transform = 'none';
            side.style.backfaceVisibility = 'visible';
            side.style.width = '340px';
            side.style.height = '465px';
            side.style.border = 'none'; // No border line -> clean bleeds
            side.style.padding = '0';
            side.style.margin = '0';
        });

        // Setup Bleed and Safe Zones for the exact 2mm physical cut margin
        // 1mm = 5px on this scale. 2mm bleed = 10px inset.
        clone.querySelectorAll('.card-bleed-edge').forEach(el => {
            el.style.border = 'none'; // pure bleed visual
            el.style.inset = '0px'; // FILL THE ENTIRE 340x465 WITH NEON!

            // Fix html2canvas radial-gradient issue by providing a reliable SVG
            el.style.backgroundColor = '#00FFCC';
            el.style.backgroundImage = `url("data:image/svg+xml,%3Csvg width='8' height='8' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='1.5' fill='rgba(0,0,0,0.15)'/%3E%3C/svg%3E")`;
            el.style.backgroundRepeat = 'repeat';
            el.style.backgroundSize = '8px 8px';
        });
        clone.querySelectorAll('.card-safe-zone').forEach(el => el.style.inset = '20px'); // 10px bleed + 10px internal rim = 20px from edge.

        // Stamp is now handled natively, no manual shift needed.

        // Fix html2canvas SVG scaling and filter bugs
        clone.querySelectorAll('img[src="subsoccer_logo.svg"]').forEach(el => {
            el.style.filter = 'none'; // html2canvas struggles with drop-shadows on SVGs
            el.style.width = '69.4px';
            el.style.maxWidth = '69.4px';
            el.style.height = '24px';
        });

        // Strip holo-glow and flip hints to get pure printed ink look
        clone.querySelectorAll('.holo-glow, .flip-hint').forEach(el => el.remove());

        // Hide back initially
        back.style.display = 'none';

        staging.appendChild(clone);

        // Wait for DOM
        await new Promise(r => setTimeout(r, 200));

        // Capture PAGE 1 (FRONT) at 3x scale (~390 DPI)
        const frontCanvas = await html2canvas(front, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
        const frontImg = frontCanvas.toDataURL('image/jpeg', 1.0);

        // Hide front, show back
        front.style.display = 'none';
        back.style.display = 'flex';
        await new Promise(r => setTimeout(r, 100));

        // Capture PAGE 2 (BACK) at 3x scale
        const backCanvas = await html2canvas(back, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
        const backImg = backCanvas.toDataURL('image/jpeg', 1.0);

        // Create PDF that exactly matches the print format
        // Request: 64x89mm card + 2mm bleed = 68x93mm total doc size
        const cardW = 68;
        const cardH = 93;

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [cardW, cardH] // Exactly the size of a single bleeding card
        });

        // Page 1: Front
        pdf.addImage(frontImg, 'JPEG', 0, 0, cardW, cardH);

        // Page 2: Back
        pdf.addPage([cardW, cardH], 'portrait');
        pdf.addImage(backImg, 'JPEG', 0, 0, cardW, cardH);

        const username = state.user?.username || 'Player';
        const safeName = username.replace(/[^a-zA-Z0-9]/g, '_');

        statusText.innerText = "UPLOADING ASSET TO FACTORY...";

        // Convert PDF to Blob
        const pdfBlob = pdf.output('blob');
        const fileName = `${state.user.id}/${safeName}_Card_${Date.now()}.pdf`;

        const { error: uploadError } = await _supabase.storage
            .from('print_assets')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });

        if (uploadError) {
            console.error("Upload error:", uploadError);
            throw new Error("Failed to secure PDF to cloud: " + uploadError.message);
        }

        const { data } = _supabase.storage.from('print_assets').getPublicUrl(fileName);
        const pdfUrl = data.publicUrl;

        statusText.innerText = "SECURING PRINT ORDER...";

        if (shippingInfo) {
            const { error: dbError } = await _supabase.from('card_orders').insert([{
                user_id: state.user.id,
                shipping_name: shippingInfo.name || safeName,
                shipping_street: shippingInfo.street || 'N/A',
                shipping_zip: shippingInfo.zip || 'N/A',
                shipping_city: shippingInfo.city || 'N/A',
                shipping_country: shippingInfo.country || 'N/A',
                pdf_url: pdfUrl,
                status: 'pending'
            }]);

            if (dbError) {
                console.error("DB Insert Error:", dbError);
                throw new Error("Order tracking failed: " + dbError.message);
            }
        }

        statusText.innerText = "REDIRECTING TO CHECKOUT...";
        await new Promise(r => setTimeout(r, 1000));

        // Simulate Shopify Cart Injection Redirect
        console.log("Redirecting to Shopify cart with PDF Link:", pdfUrl);
        alert(`Tilaustiedot ja PDF tallennettu onnistuneesti (Näkyvät nyt Moderator-työkalussa)!\n\nNormaalisti sinut ohjattaisiin nyt suoraan Shopify:n kassalle.\n(Cart Property: ${pdfUrl})`);

    } catch (e) {
        console.error("PDF Export failed:", e);
        alert("Kortin vienti epäonnistui moottorin virheen vuoksi: " + (e.message || String(e)));
    } finally {
        staging.remove();
        loader.remove();
    }
}
