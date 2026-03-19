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
        .card-bleed-edge { position: absolute; inset: 0; background: linear-gradient(135deg, #181818, #2a2a2a); overflow: hidden; border-radius: 10px; }
        .card-safe-zone { position: absolute; inset: 15px; border: 3px solid var(--sub-gold, #FFD700); background: #0a0a0a; display: flex; flex-direction: column; overflow: hidden; box-shadow: inset 0 0 30px rgba(0,0,0,0.9); }
        .holo-overlay { position: absolute; top: -100%; left: -100%; width: 300%; height: 300%; background: linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.5) 45%, rgba(0,255,204,0.4) 50%, rgba(255,0,102,0.4) 55%, transparent 60%); mix-blend-mode: color-dodge; pointer-events: none; transition: transform 0.4s ease-out; z-index: 20; transform: translate(-30%, -30%); }
        .pro-card:hover .holo-overlay { transform: translate(30%, 30%); }
        .card-serial { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: var(--sub-gold); border: 1px solid var(--sub-gold); padding: 2px 6px; font-family: 'Russo One'; font-size: 0.55rem; z-index: 10; border-radius: 2px; }
        .card-rc-badge { position: absolute; top: 10px; left: 10px; background: linear-gradient(45deg, silver, #fff, silver); color: #000; border: 1px solid #555; padding: 3px 6px; font-family: 'Russo One'; font-size: 0.65rem; z-index: 10; border-radius: 3px; transform: rotate(-5deg); box-shadow: 2px 2px 5px rgba(0,0,0,0.5); }
        .card-image-box { height: 60%; width: 100%; position: relative; border-bottom: 2px solid var(--sub-gold); background: #000; }
        .card-signature { position: absolute; bottom: 10px; width: 100%; text-align: center; color: rgba(255,255,255,0.9); font-family: 'Brush Script MT', 'Great Vibes', cursive; font-size: 2.2rem; transform: rotate(-8deg); z-index: 5; text-shadow: 0 0 10px rgba(0,100,255,0.8); }
        .card-data-box { height: 40%; width: 100%; background: linear-gradient(180deg, #111, #000); padding: 10px; display: flex; flex-direction: column; justify-content: space-between; }
    </style>
    <div class="pro-card ${editionClass} ${rookieClass}" style="margin:0 auto; background:transparent; box-shadow:none; cursor:pointer;" onclick="this.classList.toggle('flipped')">
        <div class="card-flipper" style="width: 100%; height: 100%; position: relative; transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform-style: preserve-3d; border-radius: 10px; box-shadow: 0 15px 30px rgba(0, 0, 0, 0.6), inset 0 0 20px rgba(212, 175, 55, 0.15);">
            <!-- FRONT SIDE -->
            <div class="card-front" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 10px; background: transparent; border: none;">
                <div class="card-bleed-edge">
                    <!-- The outer bleed edge area -->
                    <div class="holo-overlay"></div>
                    <div class="card-safe-zone">
                        ${wins+losses < 5 ? '<div class="card-rc-badge">RC</div>' : ''}
                        <div class="card-serial"># 1 OF 1</div>
                        
                        <!-- Player Image Area -->
                        <div class="card-image-box">
                            <img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover; filter: contrast(1.1) saturate(1.1);" onerror="this.src='placeholder-silhouette-5-wide.png'">
                            <div class="card-signature">${(u.username||'').substring(0, 10)}${(u.username||'').length > 10 ? '.' : ''}</div>
                        </div>

                        <!-- Data Area -->
                        <div class="card-data-box">
                            <div style="text-align: center; margin-bottom: 5px;">
                                <div style="font-family:'Russo One'; color:#fff; font-size: 1.2rem; letter-spacing: 1px; text-transform: uppercase; text-shadow: 1px 1px 0 #000;">
                                    ${u.team_data ? `<span style="color:var(--sub-gold); font-size:0.6em; vertical-align:middle; margin-right:4px;">[${u.team_data.tag}]</span>` : ''}${u.username}
                                </div>
                                <div style="font-family:'Resolve'; color:var(--sub-gold); font-size: 0.6rem; letter-spacing: 2px;">OFFICIAL ${editionLabel}</div>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; background: rgba(0,0,0,0.5); border: 1px solid #333; border-radius: 4px; padding: 5px 10px;">
                                <div style="text-align:center;"><div style="color:#666; font-size:0.55rem; font-family:'Resolve';">ELO</div><div style="color:#fff; font-family:'Russo One'; font-size:1rem;">${u.elo || 1000}</div></div>
                                <div style="text-align:center;"><div style="color:#666; font-size:0.55rem; font-family:'Resolve';">W</div><div style="color:#4CAF50; font-family:'Russo One'; font-size:1rem;">${wins}</div></div>
                                <div style="text-align:center;"><div style="color:#666; font-size:0.55rem; font-family:'Resolve';">L</div><div style="color:#E30613; font-family:'Russo One'; font-size:1rem;">${losses}</div></div>
                                <div style="text-align:center;"><div style="color:#666; font-size:0.55rem; font-family:'Resolve';">RATIO</div><div style="color:#00FFCC; font-family:'Russo One'; font-size:1rem;">${ratio}</div></div>
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 5px;">
                                <img src="https://flagcdn.com/w20/${(u.country || 'fi').toLowerCase()}.png" width="20" style="border-radius:2px; border:1px solid #333;">
                                ${state.brandLogo ? `<img src="${state.brandLogo}" style="height:18px; object-fit:contain;">` : `<div style="color:#555; font-size:0.5rem; font-family:'Russo One';">SUBSOCCER THE FORGE</div>`}
                            </div>
                        </div>
                    </div>
                </div>
                <div style="position:absolute; bottom:-25px; width:100%; text-align:center; color:#666; font-size:0.6rem; font-family:'Resolve'; pointer-events:none;"><i class="fa-solid fa-rotate-right"></i> TAP TO FLIP</div>
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
