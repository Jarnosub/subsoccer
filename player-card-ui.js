import { state, _supabase } from './config.js';
import { showModal, closeModal, showNotification, handleAsync } from './ui-utils.js';
import { CardGenerator } from './card-generator.js';
import { initTiltEffect } from './ui.js';

export async function viewPlayerCard(targetUsername) {
    showModal('Player Card', '<p style="font-family:\'Resolve\'">LOADING CARD...</p>', { id: 'card-modal', maxWidth: '400px' });

    let { data: p } = await _supabase.from('players').select('*, team_data:teams!players_team_id_fkey(*)').eq('username', targetUsername).maybeSingle();

    if (!p) {
        // Fallback for unregistered / guest players
        p = {
            username: targetUsername,
            elo: 1000,
            wins: 0,
            losses: 0,
            country: 'fi',
            avatar_url: 'placeholder-silhouette-5-wide.png'
        };
    }

    // Fetch Tournament History (Podiums)
    const { data: tournaments } = await _supabase
        .from('tournament_history')
        .select('tournament_name, winner_name, second_place_name, third_place_name, created_at')
        .or(`winner_name.eq.${targetUsername},second_place_name.eq.${targetUsername},third_place_name.eq.${targetUsername}`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

    // NEW: Fetch Recent Matches (Last 10 games played)
    const { data: recentMatches } = await _supabase
        .from('matches')
        .select('*')
        .or(`player1.eq.${targetUsername},player2.eq.${targetUsername}`)
        .order('created_at', { ascending: false })
        .limit(10);

    const wins = p.wins || 0;
    const losses = p.losses || 0;
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const rank = p.elo > 1600 ? "PRO" : "ROOKIE";
    const cardHeader = state.brand ? "PARTNER" : rank;
    const avatarUrl = (p.avatar_url && p.avatar_url.trim() !== '') ? p.avatar_url : 'placeholder-silhouette-5-wide.png';
    const rookieClass = (wins + losses) < 5 ? 'status-rookie' : '';

    let historyHtml = '';
    if (tournaments && tournaments.length > 0) {
        historyHtml = `
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
                <div style="font-family:var(--sub-name-font); color:#888; font-size:0.7rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase;">🏆 Trophy Room</div>
                <div style="max-height: 150px; overflow-y: auto; padding-right:5px;">
                    ${tournaments.map(t => {
            let place = '';
            let color = '#666';
            let icon = '';
            if (t.winner_name === targetUsername) { place = 'WINNER'; color = 'var(--sub-gold)'; icon = '🥇'; }
            else if (t.second_place_name === targetUsername) { place = 'FINALIST'; color = '#C0C0C0'; icon = '🥈'; }
            else if (t.third_place_name === targetUsername) { place = '3RD PLACE'; color = '#CD7F32'; icon = '🥉'; }

            const date = new Date(t.created_at).toLocaleDateString();
            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#111; margin-bottom:5px; border-radius:4px; border-left:2px solid ${color};">
                                <div>
                                    <div style="color:#fff; font-size:0.8rem; font-family:var(--sub-name-font); text-transform:uppercase;">${t.tournament_name || 'Tournament'}</div>
                                    <div style="color:#666; font-size:0.6rem;">${date}</div>
                                </div>
                                <div style="color:${color}; font-size:0.7rem; font-weight:bold; font-family:var(--sub-name-font);">${icon} ${place}</div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    } else {
        historyHtml = `
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px; text-align:center;">
                <div style="font-family:var(--sub-name-font); color:#444; font-size:0.7rem; letter-spacing:1px;">NO TOURNAMENT TROPHIES YET</div>
            </div>
        `;
    }

    let matchesHtml = '';
    if (recentMatches && recentMatches.length > 0) {
        matchesHtml = `
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
                <div style="font-family:var(--sub-name-font); color:#888; font-size:0.7rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase;">📜 Recent Matches</div>
                <div style="max-height: 200px; overflow-y: auto; padding-right:5px;">
                    ${recentMatches.map(m => {
            const isP1 = m.player1 === targetUsername;
            const opponent = isP1 ? m.player2 : m.player1;
            const isWinner = m.winner === targetUsername;
            const resultColor = isWinner ? 'var(--sub-gold)' : '#666';
            const score = (m.player1_score !== null && m.player2_score !== null)
                ? (isP1 ? `${m.player1_score}-${m.player2_score}` : `${m.player2_score}-${m.player1_score}`)
                : (isWinner ? 'WIN' : 'LOSS');

            const date = new Date(m.created_at).toLocaleDateString();

            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#111; margin-bottom:4px; border-radius:4px; border-left:2px solid ${resultColor};">
                                <div style="display:flex; flex-direction:column;">
                                    <div style="color:#fff; font-size:0.75rem; font-family:var(--sub-name-font);">vs ${opponent}</div>
                                    <div style="color:#666; font-size:0.6rem;">${date} • ${m.tournament_name || 'Quick Match'}</div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="color:${resultColor}; font-size:0.8rem; font-weight:bold; font-family:'Russo One';">${score}</div>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    const html = `
    <style>
        .pro-card-force-sharp { border-radius: 0 !important; }
        .card-bleed-edge { position: absolute; inset: 0; background: radial-gradient(circle, rgba(0,0,0,0.15) 1.5px, transparent 1.5px) 0 0, #00FFCC; background-size: 8px 8px; border: 1px solid #00ccaa; }
        .card-safe-zone { position: absolute; inset: 16px; border: 1px solid #999; border-top: 2px solid #fff; border-bottom: 2px solid #555; background: #050505; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        .card-serial { position: absolute; top: 10px; right: 10px; background: transparent; color: #444; font-family: 'Open Sans', sans-serif; font-size: 0.55rem; font-weight: bold; z-index: 10; letter-spacing: 1px; }
        .card-rc-badge { position: absolute; top: 10px; left: 10px; background: transparent; color: #E30613; font-family: 'Russo One', sans-serif; font-size: 1rem; z-index: 10; font-style: italic; text-shadow: 1px 1px 0 #fff; }
        .card-image-box { height: 65%; width: 100%; position: relative; border-bottom: 2px solid #E30613; background: #111; }
        .card-nameplate { position: absolute; bottom: 0; width: 100%; padding: 30px 10px 10px 10px; background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%); display: flex; flex-direction: column; justify-content: flex-end; }
        .card-data-box { height: 35%; width: 100%; background: #1a1a1a; padding: 10px 15px; display: flex; flex-direction: column; justify-content: space-between; }
        .pro-card.flipped .card-flipper { transform: rotateY(180deg) scale(1.05); }
        .card-front, .card-back { padding: 0 !important; }
    </style>
    <div class="pro-card pro-card-force-sharp ${rookieClass}" style="margin:0; width:100% !important; background:transparent; box-shadow:none; cursor:pointer;" onclick="this.classList.toggle('flipped')">
        <div class="card-flipper" style="width: 100%; height: 100%; position: relative; transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform-style: preserve-3d; border-radius: 0; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.6);">
            <!-- FRONT SIDE -->
            <div class="card-front" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 0; background: transparent;">
                <div class="card-bleed-edge">
                    <div class="card-safe-zone">
                        ${wins+losses < 5 ? '<div class="card-rc-badge">RC</div>' : ''}
                        <div class="card-serial">NO. 1</div>
                        
                        <div class="card-image-box">
                            <img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">
                            <div class="card-nameplate">
                                ${p.team_data ? `<div style="font-family:'Open Sans', sans-serif; color:#FFD700; font-size:0.6rem; font-weight:bold; margin-bottom:2px; letter-spacing:1px; text-transform:uppercase;">${p.team_data.tag}</div>` : ''}
                                <div style="font-family:'Russo One', sans-serif; color:#fff; font-size:1.6rem; line-height:1; text-transform:uppercase;">${p.username}</div>
                            </div>
                        </div>

                        <div class="card-data-box">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-family:'Open Sans', sans-serif; color:#888; font-size:0.5rem; font-weight:800; letter-spacing:1px;">GLOBAL RANKING</div>
                                    <div style="font-family:'Russo One', sans-serif; color:#fff; font-size:1.2rem;">${p.elo}</div>
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
                                    <img src="https://flagcdn.com/w20/${(p.country || 'fi').toLowerCase()}.png" width="20" style="border:1px solid #555;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="position:absolute; bottom:-25px; width:100%; text-align:center; color:#666; font-size:0.6rem; font-family:'Open Sans', sans-serif; pointer-events:none;"><i class="fa-solid fa-rotate-right"></i> TAP TO FLIP</div>
            </div>
            
            <!-- BACK SIDE -->
            <div class="card-back" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; transform: rotateY(180deg); border-radius: 0; background-color: #0a0a0a; background-image: radial-gradient(circle at center, #1a0000 0%, #000 100%); border: 1px solid #333; overflow-y: auto; overflow-x: hidden;">
                <div class="card-inner-frame" style="padding:15px; display:block; text-align:left; overflow-y:auto; overflow-x:hidden;">
                    <div style="text-align:center; padding-bottom:5px; border-bottom:1px solid #333; margin-bottom:5px;">
                        <h4 style="color:var(--sub-gold); font-family:'Russo One'; margin:0; letter-spacing:2px; font-size:1.1rem;">PLAYER DOSSIER</h4>
                        <div style="color:#fff; font-size:0.75rem; font-family:'Resolve'; margin-top:5px; text-transform:uppercase;">${p.username}</div>
                    </div>
                    ${historyHtml}
                    ${matchesHtml}
                </div>
                <div class="flip-hint" style="position:absolute; bottom:8px; width:100%; text-align:center; left:0; color:rgba(255,255,255,0.3); font-size:0.6rem; font-weight:bold; letter-spacing:1.5px; z-index:2; pointer-events:none;"><i class="fa-solid fa-rotate-left"></i> TAP TO FLIP</div>
            </div>
        </div>
    </div>`;

    const body = document.querySelector('#card-modal .modal-body');
    if (body) body.innerHTML = html;
    initTiltEffect(body.querySelector('.pro-card'));
}

export function closeCardModal() { closeModal('card-modal'); }

export async function showLevelUpCard(playerName, newElo) {
    const isPro = newElo >= 1600;
    const title = isPro ? "⭐ NEW PRO RANK REACHED!" : "📈 RANK UP!";

    const content = `
        <div id="level-up-container" class="level-up-anim" style="text-align:center;">
            
            <div style="font-family:'Russo One'; color:var(--sub-gold); font-size:1.5rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase; animation: pulse 1.5s infinite;">
                RANK CAP CROSSED
            </div>
            <p style="color:#aaa; font-size:0.85rem; margin-bottom:20px;">Your Official Pro Card has been updated.</p>

            <div id="level-up-card-preview" style="transform:scale(0.8); margin:-40px 0;">
                <p style="text-align:center; color:#888;">Updating Identity...</p>
            </div>
            
            <div style="margin-top:0; display:flex; flex-direction:column; gap:12px;">
                <button class="btn-red" style="background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:1.1rem; padding:18px; box-shadow:0 0 20px rgba(255,215,0,0.4);" data-action="share-story" data-player="${playerName}">
                    <i class="fa-brands fa-instagram" style="margin-right:8px; font-size:1.2rem;"></i> SHARE TO STORY
                    <div style="font-family:'Resolve'; font-size:0.6rem; letter-spacing:1px; margin-top:5px; color:#444;">UNLOCK 'GOLD' BORDER</div>
                </button>
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:#222; border:1px solid var(--sub-gold); color:var(--sub-gold); font-size:0.8rem; padding:12px;" data-action="order-physical-card">
                        <i class="fa-solid fa-gem"></i> ORDER PREMIUM CARD
                    </button>
                    <button class="btn-red" style="flex:1; background:#111; color:#666; font-size:0.8rem; padding:12px; border:1px solid #333;" onclick="closeModal('level-up-modal')">
                        CLOSE
                    </button>
                </div>
            </div>
        </div>
    `;

    showModal(title, content, { id: 'level-up-modal', maxWidth: '400px', borderColor: 'var(--sub-gold)' });

    // Render the card inside the modal
    await viewPlayerCard(playerName);
    const cardHtml = document.querySelector('#card-modal .modal-body').innerHTML;
    document.getElementById('level-up-card-preview').innerHTML = cardHtml;
    closeModal('card-modal');

    const previewCard = document.getElementById('level-up-card-preview').querySelector('.pro-card');
    if (previewCard) initTiltEffect(previewCard);
}

export function showPhysicalOrderDialog() {
    const html = `
    <div style="text-align:center; padding:10px;">
        <i class="fa-solid fa-truck-fast" style="font-size:3rem; color:var(--sub-gold); margin-bottom:20px;"></i>
        <h3 style="font-family:'Russo One'; margin-bottom:10px;">PREMIUM COLLECTIBLE</h3>
        <p style="color:#888; font-size:0.85rem; line-height:1.5; margin-bottom:20px;">
            Order your official high-quality PVC printed **Pro Card** delivered to your door. Includes NFC chip for instant login at Verified Arenas.
        </p>
        <div style="background:#111; padding:15px; border-radius:12px; border:1px solid #333; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; color:#fff;">
                <span>Pro Membership Edition</span>
                <span style="color:var(--sub-gold); font-weight:bold;">19.90 €</span>
            </div>
            <div style="font-size:0.7rem; color:#666; text-align:left; margin-top:5px;">+ Free shipping inside EU</div>
        </div>
        <button class="btn-red" style="width:100%; padding:15px; font-family:'Russo One';" onclick="showNotification('Store integration coming soon!', 'info')">
            SUBSCRIBE & ORDER NOW
        </button>
    </div>
    `;
    showModal('ORDER TO HOME', html, { maxWidth: '400px' });
}

export async function downloadFanCard() {
    const dataUrl = await CardGenerator.capture('profile-card-container');
    if (dataUrl) CardGenerator.share(dataUrl, state.user.username);
}

export function showCardShop() {
    const editions = [
        { id: 'elite', name: 'Elite Series Edition', price: '4.99€', color: '#003399' },
        { id: 'global', name: 'Global Pro Edition', price: '4.99€', color: '#006400' },
        { id: 'legendary-gold', name: 'Legendary Gold Edition', price: '9.99€', color: 'var(--sub-gold)' }
    ];

    const html = `
    <div style="display:grid; gap:15px;">
        ${editions.map(e => `
                <div class="sub-card" style="border-left: 4px solid ${e.color}; display:flex; justify-content:space-between; align-items:center; padding:15px;">
                    <div>
                        <div style="font-family:var(--sub-name-font); color:#fff;">${e.name}</div>
                        <div style="color:var(--sub-gold); font-size:0.9rem; font-weight:bold;">${e.price}</div>
                    </div>
                    <button class="btn-red" style="width:auto; padding:8px 15px; font-size:0.8rem;" data-edition-id="${e.id}">
                        BUY NOW
                    </button>
                </div>
            `).join('')
        }
        </div>
    `;

    showModal('SUBSOCCER COLLECTIBLE SHOP', html, { maxWidth: '450px' });
}

export function showAppConcept() {
    const html = `
    <div style="color: #fff; font-family: 'Resolve'; max-height: 75vh; overflow-y: auto; padding-right: 15px; scrollbar-width: thin;">
        <h2 style="color: var(--sub-gold); font-size: 1.1rem; margin-bottom: 25px; line-height: 1.4; font-family: 'Russo One'; text-transform: uppercase;">
            From Living Room to Virtual Arena
        </h2>

        <div style="margin-bottom: 25px; display: grid; gap: 20px;">
            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-bolt"></i> 1. ZERO FRICTION
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Scan the QR code, click play, and the AI-referee starts instantly. No apps, no registration required.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-id-card"></i> 2. IDENTITY: THE PRO CARD
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Your Subsoccer Pro Card is a collectible identity storing your ELO, titles, and match legacy.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-earth-europe"></i> 3. THE BALANCED ECOSYSTEM
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Practice at home (B2C), but rank up to "Legend" (1600+ ELO) by playing at official Verified Arenas (B2B).
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-shield-halved"></i> 4. ANTI-CHEAT & AUTHENTICITY
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Verified Equipment ensures the Global Leaderboard is honest. True pros prove their skills on official tables.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-share-nodes"></i> 5. VIRAL ENGAGEMENT
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Every result is a shareable moment. The journey generates social currency for the player and the community.
                </div>
            </div>
        </div>

        <button onclick="closeModal()" class="btn-red" style="width: 100%; font-family: 'Russo One'; padding: 15px; margin-top: 10px; border-radius: 8px;">UNDERSTOOD</button>
    </div>
    `;
    showModal('DIGITAL CONCEPT', html, { maxWidth: '450px', borderColor: 'var(--sub-gold)' });
}

export async function purchaseEdition(editionId) {
    await handleAsync(new Promise(resolve => {
        setTimeout(() => {
            state.activeCardEdition = editionId;
            state.inventory = [...state.inventory, editionId];
            closeModal();
            resolve(true);
        }, 1500);
    }), 'Edition purchased successfully!');
}

window.showAppConcept = showAppConcept;
window.showLevelUpCard = showLevelUpCard;
window.viewPlayerCard = viewPlayerCard;

export function setupPlayerCardListeners() {
    document.addEventListener('click', (e) => {
        // Player Cards (Leaderboard, Podium)
        const playerTrigger = e.target.closest('[data-username]');
        if (playerTrigger) {
            viewPlayerCard(playerTrigger.dataset.username);
            return;
        }
    });
}
