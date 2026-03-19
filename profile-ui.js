import { state, _supabase } from './config.js';
import { fetchMyGames } from './game-service.js';
import { populateCountries } from './auth.js';
import { showNotification } from './ui-utils.js';
import { initTiltEffect } from './ui.js';
import { initTeamUI } from './team-service.js';

/**
 * Lataa ja näyttää käyttäjän profiilin tiedot
 */
export async function loadUserProfile() {
    if (!state.user || !state.user.id) return;

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
        .card-data-box { height: 35%; width: 100%; background: #1a1a1a; padding: 10px 15px; display: flex; flex-direction: column; justify-content: space-between; }
    </style>
    <div class="pro-card pro-card-force-sharp ${editionClass} ${rookieClass}" style="margin:0 auto; background:transparent; box-shadow:none; cursor:pointer;" onclick="this.classList.toggle('flipped')">
        <div class="card-flipper" style="width: 100%; height: 100%; position: relative; transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform-style: preserve-3d; border-radius: 0; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.6);">
            <!-- FRONT SIDE -->
            <div class="card-front" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 0; background: transparent;">
                <div class="card-bleed-edge">
                    <div class="card-safe-zone">
                        ${wins+losses < 5 ? '<div class="card-rc-badge">RC</div>' : ''}
                        <div class="card-serial">${editionLabel}</div>
                        

                        <div class="card-image-box">
                            <img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">
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
                <div style="position:absolute; bottom:-25px; width:100%; text-align:center; color:#666; font-size:0.6rem; font-family:'Open Sans', sans-serif; pointer-events:none;"><i class="fa-solid fa-rotate-right"></i> TAP TO FLIP</div>
            </div>
            
            <!-- BACK SIDE -->
            <div class="card-back" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 10px; background-color: #0a0a0a; background-image: radial-gradient(circle at center, #1a0000 0%, #000 100%); transform: rotateY(180deg); display: flex; flex-direction: column; overflow: hidden; border: 2px solid #333;">
                <div style="text-align:center; padding-bottom:5px; border-bottom:1px solid #333; margin-bottom:15px; padding:20px 20px 0 20px;">
                    <h4 style="color:#D4AF37; font-family:'Russo One', sans-serif; margin:0; letter-spacing:2px; font-size:1.1rem;">PLAYER DOSSIER</h4>
                    <div style="color:#fff; font-size:0.75rem; font-family:'Open Sans', sans-serif; margin-top:5px; text-transform:uppercase;">${u.username}</div>
                </div>
                <!-- Premium Stats Content appended asynchronously below -->
                <div id="profile-card-back-content" style="flex:1; padding:0 20px; overflow-y:auto; overflow-x:hidden; width:100%; box-sizing:border-box;">
                    <!-- Async content loads here, spinner removed for cleaner static state -->
                </div>
                <!-- Bottom edge "TAP TO FLIP" -->
                <div style="position: absolute; bottom: 8px; width: 100%; left: 0; text-align: center; color: rgba(255,255,255,0.3); font-size: 0.6rem; font-weight: bold; letter-spacing: 1.5px; z-index: 2;">
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

        const totalWins = tournaments ? tournaments.filter(t => t.winner_name === u.username).length : 0;
        const totalPodiums = tournaments ? tournaments.length : 0;
        // Mocking Majors/Arena Champs for now (e.g. tracking size or specific tags in tournament names later)
        const majorWins = 0;
        const arenaChamps = 0;

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
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Arena<br>Champs</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center; opacity:0.5;">
                    <div style="font-size:1.2rem; font-family:'Russo One'; color:#fff;">${majorWins}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Major<br>Titles</div>
                </div>
            </div>
        `;

        if (totalWins === 0 && rankStatus === 'ROOKIE') {
            html += `
                <div style="margin-top:20px; text-align:center; padding:15px; border-top:1px dashed #333;">
                    <div style="color:var(--sub-gold); font-size:0.8rem; font-family:'Resolve'; margin-bottom:5px;"><i class="fa fa-route"></i> YOUR PATH BEGINS</div>
                    <div style="color:#666; font-size:0.65rem; line-height:1.4;">Compete in official arenas and tournaments to earn your first titles and unlock Pro status.</div>
                </div>
            `;
        }

        backContent.innerHTML = html;
    }).catch(err => {
        console.error("Error fetching card dossier stats:", err);
    });

    const card = container.querySelector('.topps-collectible-card');
    if (card) initTiltEffect(card);
}

window.loadUserProfile = loadUserProfile;
window.showEditProfile = showEditProfile;
window.cancelEditProfile = cancelEditProfile;
window.updateProfileCard = updateProfileCard;
