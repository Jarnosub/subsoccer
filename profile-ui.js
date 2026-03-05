import { state, _supabase } from './config.js';
import { fetchMyGames } from './game-service.js';
import { populateCountries } from './auth.js';
import { showNotification } from './ui-utils.js';
import { initTiltEffect } from './ui.js';

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

    // Lataa pelit
    fetchMyGames();
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

    container.innerHTML = `
    <div class="topps-collectible-card ${editionClass} ${rookieClass}" onclick="this.classList.toggle('flipped')">
        <div class="topps-flipper">
            <!-- FRONT SIDE -->
            <div class="topps-front" style="background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%); background-size: 8px 8px;">
                <img src="${(u.avatar_url && u.avatar_url.trim() !== '') ? u.avatar_url : 'placeholder-silhouette-5-wide.png'}" class="card-hero-image" referrerpolicy="no-referrer" onerror="this.src='placeholder-silhouette-5-wide.png'">
                <div class="card-overlay" style="background: ${overlayBg}; height: ${overlayHeight}; border-top: ${state.brand ? '3px solid var(--sub-gold)' : 'none'}; box-shadow: 0 -5px 15px rgba(0,0,0,0.3);"></div>
                <div style="position:absolute; top:15px; left:15px; z-index:11; font-family:'SubsoccerLogo'; font-size:0.8rem; color:var(--sub-gold); opacity:0.8;">${editionLabel} // 2026</div>
                <div style="position:absolute; top:15px; right:15px; z-index:11; display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
                    ${badges.map(b => `<div style="background:rgba(0,0,0,0.9); border:1px solid ${b.color}; color:${b.color}; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.9rem; box-shadow:0 0 10px ${b.color}40; backdrop-filter:blur(4px);" title="${b.title}"><i class="fa-solid ${b.icon}"></i></div>`).join('')}
                </div>
                <div class="card-content-bottom" style="z-index:12;">
                    <div style="color:var(--sub-gold); font-size:0.75rem; letter-spacing:2px; margin-bottom:4px; font-weight:bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);"><i class="fa-solid fa-location-dot"></i> ${u.city || 'HELSINKI'}</div>
                    <div class="card-player-name">${u.username}</div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:10px;">
                        <div class="card-elo-badge">${u.elo || 1300} ELO</div>
                        <div style="text-align:right;"><div style="color:white; font-size:0.6rem; text-transform:uppercase;">Win Ratio</div><div style="color:white; font-size:1rem;">${((u.wins / (Math.max(1, u.wins + (u.losses || 0)))) * 100).toFixed(0)}%</div></div>
                    </div>
                </div>
                ${state.brandLogo ? `
                    <img src="${state.brandLogo}" style="position:absolute; bottom: 80px; right: 15px; z-index: 11; max-width: 60px; max-height: 35px; object-fit: contain;">
                ` : `
                    <div style="position:absolute; bottom:15px; right:15px; width:30px; height:30px; background:radial-gradient(circle, #ffd700, #b8860b); border-radius:50%; opacity:0.3; z-index:11; filter:blur(1px);"></div>
                `}
                <div class="flip-hint" style="position:absolute; bottom:5px; right:50px; z-index:15; color:#888; font-size:0.55rem; font-family:'Resolve';"><i class="fa-solid fa-rotate-right"></i> TAP TO FLIP</div>
            </div>
            
            <!-- BACK SIDE -->
            <div class="topps-back" style="background-image: radial-gradient(circle at center, #1a0000 0%, #000 100%);">
                <div style="padding:20px; text-align:left; overflow-y:auto; overflow-x:hidden; height:100%;">
                    <div style="text-align:center; padding-bottom:5px; border-bottom:1px solid #333; margin-bottom:15px;">
                        <h4 style="color:var(--sub-gold); font-family:'Russo One'; margin:0; letter-spacing:2px; font-size:1.1rem;">PLAYER DOSSIER</h4>
                        <div style="color:#fff; font-size:0.75rem; font-family:'Resolve'; margin-top:5px; text-transform:uppercase;">${u.username}</div>
                    </div>
                    <div id="profile-card-back-content">
                        <p style="text-align:center; color:#666; font-size:0.8rem; margin-top:50px;"><i class="fa fa-spinner fa-spin"></i> Loading Data...</p>
                    </div>
                </div>
                <div class="flip-hint" style="position:absolute; bottom:15px; left:15px; color:#c0c0c0; font-size:0.55rem; font-family:'Resolve';"><i class="fa-solid fa-rotate-left"></i> TAP TO FLIP</div>
            </div>
        </div>
    </div>
    <div style="display:flex; gap:10px; margin-top:15px;">
        <button class="btn-red" style="flex:1; background:#222; font-size:0.7rem;" data-action="show-card-shop">
            <i class="fa fa-shopping-cart"></i> UPGRADE CARD
        </button>
        <button class="btn-red" style="flex:1; font-size:0.7rem;" data-action="download-card">
            <i class="fa fa-download"></i> SAVE IMAGE
        </button>
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
