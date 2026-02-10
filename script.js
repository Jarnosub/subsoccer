// ============================================================
// script.js — PUHDAS PELIMOOTTORI
// Ei Supabase-configia (config.js), ei authia (auth.js), ei UI-perusfunktioita (ui.js)
// ============================================================

// --- Turnausmuuttujat ---
let rP = [], rW = [], finalists = [], bronzeContenders = [], bronzeWinner = null, currentTournamentId = null, initialPlayerCount = 0;
let quickP1 = null, quickP2 = null;

// ============================================================
// 1. PELIEN HAKU
// ============================================================

async function fetchAllGames() {
    try {
        const { data } = await _supabase.from('games').select('id, game_name');
        allGames = data || [];
        populateGameSelect();
    } catch (e) {
        console.error(e);
    }
}

function toggleAuth(s) {
    document.getElementById('login-form').style.display = s ? 'none' : 'block';
    document.getElementById('signup-form').style.display = s ? 'block' : 'none';
}

// ============================================================
// 2. PELAAJAPOOLIN HALLINTA (haku, lisäys, poisto)
// ============================================================

function handleSearch(v) {
    const r = document.getElementById('search-results');
    if (!v) { r.style.display = 'none'; return; }
    const q = v.toUpperCase(), combined = [...new Set([...allDbNames, ...sessionGuests])], f = combined.filter(n => n.includes(q) && !pool.includes(n));
    r.innerHTML = f.map(n => `<div class="search-item" onclick="directAdd('${n}')">${n}</div>`).join('') + `<div class="search-item" onclick="directAdd('${q}')">Add: "${q}"</div>`;
    r.style.display = 'block';
}

function addP() {
    const i = document.getElementById('add-p-input');
    const n = i.value.trim().toUpperCase();
    if (n && !pool.includes(n)) { pool.push(n); updatePoolUI(); showNotification(`${n} added to pool`, 'success'); }
    i.value = '';
    document.getElementById('search-results').style.display = 'none';
}

function directAdd(n) {
    if (!pool.includes(n)) { pool.push(n); updatePoolUI(); showNotification(`${n} added to pool`, 'success'); }
    document.getElementById('add-p-input').value = '';
    document.getElementById('search-results').style.display = 'none';
}

function updatePoolUI() {
    const list = document.getElementById('pool-list');
    const countSpan = document.getElementById('pool-count');
    list.innerHTML = '';
    if (pool.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.innerText = "No players added.";
        list.appendChild(emptyMessage);
        if (countSpan) countSpan.innerText = 0;
        return;
    }
    pool.forEach((name, index) => {
        const div = document.createElement('div');
        div.style = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; background: #111; padding: 8px; border-radius: 8px; border: 1px solid #222;";
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: var(--sub-red); font-weight: bold; width: 20px;">${index + 1}.</span>
                <span style="color: white; text-transform: uppercase; font-size: 0.8rem; font-family: 'Russo One';">${name}</span>
            </div>
            <button onclick="removeFromPool(${index})" style="background: #333; color: #888; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-weight: bold;">-</button>
        `;
        list.appendChild(div);
    });
    if (countSpan) countSpan.innerText = pool.length;
}

function removeFromPool(index) {
    const removedPlayer = pool[index];
    pool.splice(index, 1);
    updatePoolUI();
    showNotification(`${removedPlayer} removed from pool`, 'error');
}

function clearPool() {
    pool = [];
    updatePoolUI();
    showNotification('Player pool cleared', 'error');
}

function updateGuestUI() {
    document.getElementById('active-guests').innerHTML = sessionGuests.map(g => `<span class="guest-badge" style="background:#333; padding:5px 10px; border-radius:15px; font-size:0.7rem; cursor:pointer; margin:4px; display:inline-block; border:1px solid #444;" onclick="directAdd('${g}')">${g}</span>`).join('');
}

// ============================================================
// 3. PROFIILIKORTTI & AVATAR
// ============================================================

async function updateProfileCard() {
    const container = document.getElementById('section-profile');
    if (!container) return;
    const wins = user.wins || 0;
    let totalGames = 0;
    const { count } = await _supabase.from('matches').select('*', { count: 'exact', head: true }).or(`player1.eq.${user.username},player2.eq.${user.username}`);
    if (count) totalGames = count;
    const losses = Math.max(0, totalGames - wins);
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const rank = user.elo > 1500 ? "PRO" : "ROOKIE";
    const avatarUrl = user.avatar_url ? user.avatar_url : 'placeholder-silhouette-5-wide.png';
    container.innerHTML = `
        <div class="pro-card">
            <div class="card-inner-frame">
                <div class="card-header-stripe">${rank} CARD</div>
                <div class="card-image-area">
                    <img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">
                </div>
                <div class="card-name-strip">${user.username}</div>
                <div class="card-info-area">
                    <div class="card-stats-row">
                        <div class="card-stat-item"><div class="card-stat-label">RANK</div><div class="card-stat-value">${user.elo}</div></div>
                        <div class="card-stat-item"><div class="card-stat-label">WINS</div><div class="card-stat-value">${wins}</div></div>
                        <div class="card-stat-item"><div class="card-stat-label">LOSS</div><div class="card-stat-value">${losses}</div></div>
                        <div class="card-stat-item"><div class="card-stat-label">W/L</div><div class="card-stat-value">${ratio}</div></div>
                    </div>
                    <div class="card-bottom-row" style="border-top: 1px solid #222; padding-top: 4px; display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:5px;">
                            <img src="https://flagcdn.com/w80/${(user.country || 'fi').toLowerCase()}.png" width="16">
                            <span style="color:#888; font-size:0.55rem; font-family:'Russo One';">REPRESENTING</span>
                        </div>
                        <div style="color:var(--sub-gold); font-size:0.55rem; font-family:'Russo One';">CLUB: PRO</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    container.innerHTML += `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 20px;">
        <button class="btn-red" onclick="downloadFanCard()" style="background:var(--sub-gold) !important; color:#000 !important; font-family:'Resolve'; font-weight:bold; border:none; width:320px; height:50px; border-radius:12px; display:flex; align-items:center; justify-content:center; gap:10px;">
            <i class="fa-solid fa-camera" style="font-size:1.2rem;"></i> DOWNLOAD OFFICIAL FAN CARD
        </button>
    </div>
    `;
}

function updateAvatarPreview(url) {
    const img = document.getElementById('avatar-preview');
    if (img) {
        img.src = url || 'placeholder-silhouette-5-wide.png';
        img.onerror = () => { img.src = 'placeholder-silhouette-5-wide.png'; };
    }
}

async function viewPlayerCard(targetUsername) {
    const modal = document.getElementById('card-modal');
    const container = document.getElementById('modal-card-container');
    modal.style.display = 'flex';
    container.innerHTML = '<p style="font-family:\'Russo One\'">LOADING CARD...</p>';
    const { data: p } = await _supabase.from('players').select('*').eq('username', targetUsername).single();
    const { count: totalGames } = await _supabase.from('matches').select('*', { count: 'exact', head: true }).or(`player1.eq.${targetUsername},player2.eq.${targetUsername}`);
    if (!p) return;
    const wins = p.wins || 0;
    const losses = Math.max(0, (totalGames || 0) - wins);
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const rank = p.elo > 1600 ? "PRO" : "ROOKIE";
    const avatarUrl = p.avatar_url ? p.avatar_url : 'placeholder-silhouette-5-wide.png';
    container.innerHTML = `
        <div class="pro-card" style="margin:0;">
            <div class="card-inner-frame">
                <div class="card-header-stripe">${rank} CARD</div>
                <div class="card-image-area">
                    <img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">
                </div>
                <div class="card-name-strip">${p.username}</div>
                <div class="card-info-area">
                    <div class="card-stats-row">
                        <div class="card-stat-item"><div class="card-stat-label">RANK</div><div class="card-stat-value">${p.elo}</div></div>
                        <div class="card-stat-item"><div class="card-stat-label">WINS</div><div class="card-stat-value">${wins}</div></div>
                        <div class="card-stat-item"><div class="card-stat-label">LOSS</div><div class="card-stat-value">${losses}</div></div>
                        <div class="card-stat-item"><div class="card-stat-label">W/L</div><div class="card-stat-value">${ratio}</div></div>
                    </div>
                    <div class="card-bottom-row" style="border-top: 1px solid #222; padding-top: 4px; display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:5px;">
                            <img src="https://flagcdn.com/w20/${(p.country || 'fi').toLowerCase()}.png" width="16">
                            <span style="color:#888; font-size:0.55rem; font-family:'Russo One';">REPRESENTING</span>
                        </div>
                        <div style="color:var(--sub-gold); font-size:0.55rem; font-family:'Russo One';">CLUB: PRO</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function closeCardModal() { document.getElementById('card-modal').style.display = 'none'; }

async function downloadFanCard() {
    const cardElement = document.querySelector('.pro-card');
    if (!cardElement) return showNotification("Card element not found", "error");
    await document.fonts.load('1em Resolve');
    showNotification("Generating high-res card...", "success");
    try {
        const canvas = await html2canvas(cardElement, { useCORS: true, allowTaint: true, backgroundColor: "#000000", scale: 4, logging: false });
        const link = document.createElement('a');
        link.download = `Subsoccer_ProCard_${user.username}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        showNotification("Card saved to your device!", "success");
    } catch (err) {
        console.error("Canvas error:", err);
        showNotification("Download failed. Check image permissions.", "error");
    }
}

// ============================================================
// 4. KARTTA & PELIPÖYTIEN HALLINTA
// ============================================================

function initGameMap() {
    gameMap = L.map('map-picker').setView([60.1699, 24.9384], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(gameMap);
    gameMap.on('click', async function(e) {
        setMapLocation(e.latlng.lat, e.latlng.lng);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`);
            const data = await res.json();
            if (data && data.display_name) document.getElementById('game-address-input').value = data.display_name;
        } catch(e) {}
    });
}

function setMapLocation(lat, lng, name) {
    selLat = lat; selLng = lng;
    if (gameMarker) gameMap.removeLayer(gameMarker);
    gameMarker = L.marker([lat, lng]).addTo(gameMap);
    gameMap.setView([lat, lng], 13);
    const txt = name ? `${name} (${lat.toFixed(2)}, ${lng.toFixed(2)})` : `Selected: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    document.getElementById('location-confirm').innerText = "Location set to " + txt;
}

async function fetchPublicGamesMap() {
    if (!publicMap) {
        publicMap = L.map('public-game-map').setView([60.1699, 24.9384], 11);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(publicMap);
    } else {
        setTimeout(() => publicMap.invalidateSize(), 200);
    }
    const subsoccerIcon = L.divIcon({ className: 'custom-div-icon', html: "<div style='background-color:var(--sub-red); width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);'></div>", iconSize: [16, 16], iconAnchor: [8, 8] });
    const { data } = await _supabase.from('games').select('*').eq('is_public', true);
    if (data) {
        publicMap.eachLayer((layer) => { if (layer instanceof L.Marker) publicMap.removeLayer(layer); });
        data.forEach(g => {
            if (g.latitude && g.longitude) {
                L.marker([g.latitude, g.longitude], { icon: subsoccerIcon }).addTo(publicMap).bindPopup(`<div style="color:#000; font-family:'Resolve Sans';"><b>${g.game_name}</b><br>${g.location}</div>`);
            }
        });
    }
}

async function searchLocation() {
    const q = document.getElementById('game-address-input').value;
    if (!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && data.length > 0) setMapLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name.split(',')[0]);
        else showNotification("Location not found", "error");
    } catch(e) { showNotification("Search error", "error"); }
}

async function registerGame() {
    const btn = event?.target;
    const originalText = btn ? btn.textContent : '';
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Registering...';
        }
        
        const uniqueCode = document.getElementById('game-code-input').value.trim();
        const gameName = document.getElementById('game-name-input').value.trim();
        const location = document.getElementById('game-address-input').value.trim();
        const isPublic = document.getElementById('game-public-input').checked;
        
        if (!uniqueCode || !gameName || !location || !selLat) {
            showNotification("Please fill all fields and select location on map.", "error");
            return;
        }
        if (user.id === 'guest') {
            showNotification("Guests cannot register games. Please create an account.", "error");
            return;
        }
        
        const { data, error } = await _supabase.from('games').insert([{ unique_code: uniqueCode, game_name: gameName, location: location, owner_id: user.id, latitude: selLat, longitude: selLng, is_public: isPublic }]);
        if (error) throw error;
        
        showNotification(`Game "${gameName}" registered successfully!`, "success");
        document.getElementById('game-code-input').value = '';
        document.getElementById('game-name-input').value = '';
        document.getElementById('game-address-input').value = '';
        selLat = null; selLng = null;
        if (gameMarker) gameMap.removeLayer(gameMarker);
        document.getElementById('location-confirm').innerText = '';
        await fetchAllGames();
        fetchMyGames();
    } catch (error) {
        console.error('Error registering game:', error);
        showNotification("Failed to register game: " + error.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

function initEditGame(id) {
    const game = myGames.find(g => g.id === id);
    if (!game) return;
    editingGameId = id;
    document.getElementById('game-code-input').value = game.unique_code;
    document.getElementById('game-name-input').value = game.game_name;
    document.getElementById('game-address-input').value = game.location;
    document.getElementById('game-public-input').checked = game.is_public;
    if (game.latitude && game.longitude) setMapLocation(game.latitude, game.longitude, game.location);
    document.getElementById('btn-reg-game').style.display = 'none';
    document.getElementById('btn-edit-group').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    editingGameId = null;
    document.getElementById('game-code-input').value = '';
    document.getElementById('game-name-input').value = '';
    document.getElementById('game-address-input').value = '';
    document.getElementById('game-public-input').checked = false;
    document.getElementById('location-confirm').innerText = '';
    selLat = null; selLng = null;
    if (gameMarker) gameMap.removeLayer(gameMarker);
    document.getElementById('btn-reg-game').style.display = 'block';
    document.getElementById('btn-edit-group').style.display = 'none';
}

async function updateGame() {
    if (!editingGameId) return;
    
    const btn = event?.target;
    const originalText = btn ? btn.textContent : '';
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Updating...';
        }
        
        const gameName = document.getElementById('game-name-input').value.trim();
        const location = document.getElementById('game-address-input').value.trim();
        const isPublic = document.getElementById('game-public-input').checked;
        
        if (!gameName || !location || !selLat) {
            showNotification("Please fill fields and location.", "error");
            return;
        }
        
        const { error } = await _supabase.from('games').update({ game_name: gameName, location: location, latitude: selLat, longitude: selLng, is_public: isPublic }).eq('id', editingGameId);
        if (error) throw error;
        
        showNotification("Game updated!", "success");
        cancelEdit();
        fetchMyGames();
        await fetchAllGames();
    } catch (error) {
        showNotification("Update failed: " + error.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function deleteGame(id) {
    if (!confirm("Are you sure you want to delete this game table? It will also be removed from past tournament results.")) return;
    try {
        const { error: updateError } = await _supabase.from('tournament_history').update({ game_id: null }).eq('game_id', id);
        if (updateError) throw updateError;
        const { error: deleteError } = await _supabase.from('games').delete().eq('id', id);
        if (deleteError) throw deleteError;
        showNotification("Game deleted successfully", "success");
        fetchMyGames();
        fetchAllGames();
    } catch (e) {
        console.error("Deletion error:", e);
        showNotification("Deletion failed: " + e.message, "error");
    }
}

async function fetchMyGames() {
    if (user.id === 'guest') { document.getElementById('my-games-list').innerHTML = '<p>Login to see your registered games.</p>'; return; }
    const { data, error } = await _supabase.from('games').select('*').eq('owner_id', user.id);
    if (error) { console.error('Error fetching games:', error); return; }
    const list = document.getElementById('my-games-list');
    myGames = data || [];
    if (data && data.length > 0) {
        list.innerHTML = data.map(game => `
            <div style="background:#111; padding:15px; border-radius:8px; margin-bottom:10px; border-left: 3px solid var(--sub-red); position: relative;">
                <div style="position: absolute; top: 10px; right: 10px;">
                    <button onclick="initEditGame('${game.id}')" style="background: none; border: none; cursor: pointer; font-size: 1rem; margin-right: 5px; color: #ccc;">✏️</button>
                    <button onclick="deleteGame('${game.id}')" style="background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--sub-red);">🗑️</button>
                </div>
                <div style="font-family: 'Russo One'; font-size: 1rem; padding-right: 60px;">${game.game_name}</div>
                <small style="color:#888;">${game.location}</small><br>
                <small style="color:#666; font-size:0.6rem;">CODE: ${game.unique_code}</small>
            </div>
        `).join('');
    } else {
        list.innerHTML = '<p>You have not registered any games yet.</p>';
    }
}

// ============================================================
// 5. ELO-LASKENTA
// ============================================================

function calculateNewElo(playerA, playerB, winner) {
    const eloA = playerA.elo, eloB = playerB.elo, kFactor = 32;
    const expectedScoreA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const expectedScoreB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));
    const actualScoreA = winner.id === playerA.id ? 1 : 0;
    const actualScoreB = winner.id === playerB.id ? 1 : 0;
    const newEloA = Math.round(eloA + kFactor * (actualScoreA - expectedScoreA));
    const newEloB = Math.round(eloB + kFactor * (actualScoreB - expectedScoreB));
    return { newEloA, newEloB };
}

// ============================================================
// 6. TILASTOT: LEADERBOARD & HISTORIA
// ============================================================

async function fetchLB() {
    const { data } = await _supabase.from('players').select('*').order('elo', { ascending: false });
    document.getElementById('lb-data').innerHTML = data ? data.map((p, i) => {
        const flag = p.country ? p.country.toLowerCase() : 'fi';
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:15px 10px; border-bottom:1px solid #222;"><span><span style="color:#666; margin-right:10px; font-size:0.8rem;">#${i+1}</span> <img src="https://flagcdn.com/w40/${flag}.png" style="height:14px; width:auto; margin-right:10px; vertical-align:middle; border-radius:2px; opacity:0.9;"> <span class="lb-name" onclick="viewPlayerCard('${p.username}')" style="cursor:pointer; text-decoration:none; color:#fff;">${p.username}</span></span><span class="lb-elo">${p.elo}</span></div>`;
    }).join('') : "";
}

async function fetchHist() {
    const { data: tourData } = await _supabase.from('tournament_history').select('*').order('created_at', { ascending: false });
    const { data: matchData } = await _supabase.from('matches').select('*').order('created_at', { ascending: false });
    if (allGames.length === 0) await fetchAllGames();
    if (!tourData || tourData.length === 0) { document.getElementById('hist-list').innerHTML = "No history."; return; }

    const events = tourData.reduce((acc, h) => {
        const eventName = h.event_name || 'Individual Tournaments';
        if (!acc[eventName]) acc[eventName] = [];
        acc[eventName].push(h);
        return acc;
    }, {});

    let html = "";
    for (const eventName in events) {
        html += `<div class="event-group"><h2 class="event-title">${eventName}</h2>`;
        html += events[eventName].map((h) => {
            const tourMatches = matchData ? matchData.filter(m => m.tournament_id === h.tournament_id) : [];
            const tourPlayers = [...new Set(tourMatches.flatMap(m => [m.player1, m.player2]))];
            if (h.winner_name && !tourPlayers.includes(h.winner_name)) tourPlayers.push(h.winner_name);
            if (h.second_place_name && !tourPlayers.includes(h.second_place_name)) tourPlayers.push(h.second_place_name);
            if (h.third_place_name && !tourPlayers.includes(h.third_place_name)) tourPlayers.push(h.third_place_name);
            const playersJsonString = JSON.stringify([...new Set(tourPlayers)]);
            const matchesHtml = tourMatches.map(m => `<div style="background:#111; padding:10px; border-radius:5px; margin-top:5px; font-size:0.8rem;"><b>${m.winner}</b> defeated ${m.winner === m.player1 ? m.player2 : m.player1}</div>`).join('');
            let secondPlace = h.second_place_name ? `<br><small>🥈 ${h.second_place_name}</small>` : '';
            let thirdPlace = h.third_place_name ? `<br><small>🥉 ${h.third_place_name}</small>` : '';
            const date = new Date(h.created_at);
            const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            const gameName = h.game_id ? (allGames.find(g => g.id === h.game_id)?.game_name || '') : '';
            const uniqueTourId = `${eventName.replace(/\s+/g, '-')}-${h.tournament_id}`;
            const safeEventName = h.event_name ? h.event_name.replace(/"/g, '&quot;') : '';
            const safeGameId = h.game_id || '';
            return `
                <div style="background:#000; padding:15px; border-radius:10px; border-left:4px solid var(--sub-gold); margin-bottom:10px; position: relative;">
                    <div style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 1.2rem; z-index: 5;" onclick='event.stopPropagation(); replayTournament(${playersJsonString}, "${h.tournament_name}", "${safeEventName}", "${safeGameId}")'>🔄</div>
                    <div style="cursor:pointer;" onclick="document.getElementById('tour-matches-${uniqueTourId}').style.display = document.getElementById('tour-matches-${uniqueTourId}').style.display === 'none' ? 'block' : 'none';">
                        <div style="font-family: 'Russo One', sans-serif; font-size: 1.1rem; margin-bottom: 8px; padding-right: 25px;">${h.tournament_name} <span style="font-size:0.7rem; color:#888; font-weight:normal;">${gameName ? '@ ' + gameName : ''}</span></div>
                        <small>🏆 ${h.winner_name}</small>
                        ${secondPlace}
                        ${thirdPlace}
                    </div>
                    <div id="tour-matches-${uniqueTourId}" style="display:none; margin-top:10px;">${matchesHtml}</div>
                    <div style="position: absolute; bottom: 10px; right: 10px; font-size: 0.6rem; color: #666;">${formattedDate}</div>
                </div>`;
        }).join('');
        html += `</div>`;
    }
    document.getElementById('hist-list').innerHTML = html;
}

// ============================================================
// 7. OTTELUN TALLENNUS
// ============================================================

async function saveMatch(p1, p2, winner, tourName) {
    try {
        const { data: p1Data } = await _supabase.from('players').select('*').eq('username', p1).single();
        const { data: p2Data } = await _supabase.from('players').select('*').eq('username', p2).single();
        
        if (p1Data && p2Data) {
            const winnerData = winner === p1 ? p1Data : p2Data;
            const { newEloA, newEloB } = calculateNewElo(p1Data, p2Data, winnerData);
            
            const { error: e1 } = await _supabase.from('players').update({ elo: newEloA }).eq('id', p1Data.id);
            const { error: e2 } = await _supabase.from('players').update({ elo: newEloB }).eq('id', p2Data.id);
            if (e1 || e2) throw (e1 || e2);
            
            const { data: winnerDb } = await _supabase.from('players').select('wins').eq('username', winner).single();
            if (winnerDb) {
                const { error: e3 } = await _supabase.from('players').update({ wins: (winnerDb.wins || 0) + 1 }).eq('username', winner);
                if (e3) throw e3;
            }
        }
        
        const matchData = { player1: p1, player2: p2, winner: winner, tournament_name: tourName || null, tournament_id: currentTournamentId };
        const { error } = await _supabase.from('matches').insert([matchData]);
        if (error) throw error;
    } catch (error) {
        console.error('Error saving match:', error);
        showNotification('Failed to save match: ' + error.message, 'error');
        throw error;
    }
}

// ============================================================
// 8. TURNAUSMOOTTORI
// ============================================================

function startTournament() {
    if (pool.length < 2) return showNotification("Min 2 players for a tournament!", "error");
    try {
        currentTournamentId = uuid.v4();
        initialPlayerCount = pool.length;
        document.getElementById('tour-setup').style.display = 'none';
        document.getElementById('tour-engine').style.display = 'flex';
        document.getElementById('save-btn').style.display = 'none';
        const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(pool.length)));
        const byes = nextPowerOfTwo - pool.length;
        let shuffledPlayers = [...pool].sort(() => Math.random() - 0.5);
        rP = shuffledPlayers;
        rW = []; finalists = []; bronzeContenders = []; bronzeWinner = null;
        drawRound(byes);
    } catch (e) {
        showNotification("Error starting tournament: " + e.message, "error");
        console.error(e);
    }
}

function drawRound(byes = 0) {
    const a = document.getElementById('bracket-area'); a.innerHTML = "";
    if (finalists.length === 0) rW = [];

    if (finalists.length === 2) {
        a.innerHTML += `<h3 style="font-family:'Russo One'; text-transform:uppercase; margin-bottom:10px;">Bronze Match</h3>`;
        const bMatch = document.createElement('div');
        bMatch.className = "bracket-match";
        bMatch.style = "background:#111; border:1px solid #222; border-radius:10px; margin-bottom:20px; width:100%; overflow:hidden;";
        bMatch.innerHTML = `<div style="padding:15px; cursor:pointer; font-family:'Russo One';" onclick="pickBronzeWinner('${bronzeContenders[0]}', this)">${bronzeContenders[0]}</div><div style="padding:15px; cursor:pointer; font-family:'Russo One'; border-top:1px solid #222;" onclick="pickBronzeWinner('${bronzeContenders[1]}', this)">${bronzeContenders[1]}</div>`;
        a.appendChild(bMatch);
        a.innerHTML += `<h3 style="font-family:'Russo One'; text-transform:uppercase; margin-bottom:10px;">Final</h3>`;
        const fMatch = document.createElement('div');
        fMatch.className = "bracket-match";
        fMatch.style = "background:#111; border:1px solid #222; border-radius:10px; width:100%; overflow:hidden;";
        fMatch.innerHTML = `<div style="padding:15px; cursor:pointer; font-family:'Russo One';" onclick="pickWin(0, '${finalists[0]}', this)">${finalists[0]}</div><div style="padding:15px; cursor:pointer; font-family:'Russo One'; border-top:1px solid #222;" onclick="pickWin(0, '${finalists[1]}', this)">${finalists[1]}</div>`;
        a.appendChild(fMatch);
        checkCompletion();
        return;
    }

    if (rP.length === 1 && finalists.length === 0) {
        a.innerHTML = `<div class="container" style="text-align:center;"><h2>🏆 WINNER: ${rP[0]}</h2></div>`;
        if (bronzeWinner) a.innerHTML += `<div class="container" style="text-align:center; margin-top:10px;"><h3>🥉 Bronze: ${bronzeWinner}</h3></div>`;
        document.getElementById('save-btn').style.display = 'block';
        document.getElementById('next-rd-btn').style.display = 'none';
        return;
    }

    const matches = [];
    const playersWithBye = rP.slice(0, byes);
    const playersInMatches = rP.slice(byes);
    playersWithBye.forEach(p => rW.push(p));
    for (let i = 0; i < playersInMatches.length; i += 2) matches.push([playersInMatches[i], playersInMatches[i+1]]);

    matches.forEach((match, index) => {
        const [p1, p2] = match;
        const m = document.createElement('div');
        m.className = "bracket-match";
        m.style.background = "#111"; m.style.border = "1px solid #222"; m.style.borderRadius = "10px"; m.style.marginBottom = "10px"; m.style.width = "100%"; m.style.overflow = "hidden";
        const winnerIndex = byes + index;
        if (!p2) { m.innerHTML = `<div style="padding:15px; opacity:0.5; font-family:'Russo One';">${p1} (BYE)</div>`; rW[winnerIndex] = p1; }
        else { m.innerHTML = `<div style="padding:15px; cursor:pointer; font-family:'Russo One';" onclick="pickWin(${winnerIndex}, '${p1}', this)">${p1}</div><div style="padding:15px; cursor:pointer; font-family:'Russo One'; border-top:1px solid #222;" onclick="pickWin(${winnerIndex}, '${p2}', this)">${p2}</div>`; }
        a.appendChild(m);
    });

    if (playersWithBye.length > 0) {
        a.innerHTML += `<h4 style="font-family:'Russo One'; text-transform:uppercase; margin: 20px 0 10px 0; opacity: 0.7;">Byes (Next Round)</h4>`;
        playersWithBye.forEach(p => {
            const byeEl = document.createElement('div');
            byeEl.innerHTML = `<div style="padding:10px 15px; background: #0a0a0a; border:1px solid #222; border-radius:10px; margin-bottom:10px; width:100%; font-family:'Russo One'; opacity:0.7;">${p}</div>`;
            a.appendChild(byeEl);
        });
    }
    checkCompletion();
}

function pickWin(idx, n, e) {
    let p1, p2;
    if (finalists.length === 2) { p1 = finalists[0]; p2 = finalists[1]; }
    else {
        const playersInMatches = rP.slice(Math.pow(2, Math.ceil(Math.log2(rP.length))) - rP.length);
        const matchIndex = idx - (Math.pow(2, Math.ceil(Math.log2(rP.length))) - rP.length);
        p1 = playersInMatches[matchIndex * 2]; p2 = playersInMatches[matchIndex * 2 + 1];
    }
    if (p1 && p2) { const tournamentName = document.getElementById('tour-name-input').value || "Tournament"; saveMatch(p1, p2, n, tournamentName); }
    rW[idx] = n;
    e.parentElement.querySelectorAll('div').forEach(d => { d.style.background = "transparent"; d.style.opacity = "0.5"; });
    e.style.background = "rgba(227, 6, 19, 0.4)"; e.style.opacity = "1";
    checkCompletion();
}

function pickBronzeWinner(n, e) {
    const tournamentName = document.getElementById('tour-name-input').value || "Tournament";
    saveMatch(bronzeContenders[0], bronzeContenders[1], n, tournamentName + " (Bronze)");
    bronzeWinner = n;
    e.parentElement.querySelectorAll('div').forEach(d => { d.style.background = "transparent"; d.style.opacity = "0.5"; });
    e.style.background = "rgba(255, 215, 0, 0.3)"; e.style.opacity = "1";
    checkCompletion();
}

function checkCompletion() {
    const nextBtn = document.getElementById('next-rd-btn');
    const byes = Math.pow(2, Math.ceil(Math.log2(rP.length))) - rP.length;
    const matchesToPlay = (rP.length - byes) / 2;
    const expectedWinners = byes + matchesToPlay;
    const pickedWinners = rW.filter(w => w).length;
    if (finalists.length === 2) {
        if (rW[0] && bronzeWinner) { nextBtn.innerText = 'FINISH TOURNAMENT'; nextBtn.style.display = 'block'; }
        else { nextBtn.style.display = 'none'; }
    } else if (pickedWinners === expectedWinners && matchesToPlay > 0) { nextBtn.innerText = 'NEXT ROUND'; nextBtn.style.display = 'block'; }
    else { nextBtn.style.display = 'none'; }
}

function advanceRound() {
    const nextBtn = document.getElementById('next-rd-btn');
    if (nextBtn.innerText === 'FINISH TOURNAMENT') { rP = rW.filter(w => w); saveTour(); return; }
    if (rP.length === 4) {
        const losers = rP.filter(p => !rW.includes(p));
        bronzeContenders = [...losers];
        finalists = [...rW.filter(w => w)];
        drawRound(); return;
    }
    rP = rW.filter(w => w);
    const nextByes = Math.pow(2, Math.ceil(Math.log2(rP.length))) - rP.length;
    document.getElementById('next-rd-btn').style.display = 'none';
    drawRound(nextByes);
}

async function saveTour() {
    try {
        const winnerName = rP[0];
        const tournamentName = document.getElementById('tour-name-input').value || "Tournament";
        const eventName = document.getElementById('event-name-input').value.trim().toUpperCase() || null;
        const gameId = document.getElementById('tournament-game-select').value || null;
        let secondPlaceName = null;
        
        if (initialPlayerCount >= 2) {
            const allFinalists = rP.length > 0 ? rP : finalists;
            if (allFinalists.length > 0) {
                const winner = allFinalists[0];
                const allParticipantsInFinalRound = (initialPlayerCount === 4) ? finalists : pool;
                secondPlaceName = allParticipantsInFinalRound.find(p => p !== winner) || null;
            }
        }
        
        const dataToInsert = { tournament_name: tournamentName, winner_name: winnerName, second_place_name: secondPlaceName, tournament_id: currentTournamentId, event_name: eventName, game_id: gameId };
        if (bronzeWinner) dataToInsert.third_place_name = bronzeWinner;
        
        const { error } = await _supabase.from('tournament_history').insert([dataToInsert]);
        if (error) throw error;
        
        pool = []; 
        updatePoolUI();
        document.getElementById('tour-engine').style.display = 'none';
        document.getElementById('tour-setup').style.display = 'block';
        showPage('history');
        showNotification('Tournament saved successfully!', 'success');
        
        if (winnerName === user.username) {
            const { data } = await _supabase.from('players').select('*').eq('id', user.id).single();
            if (data) { user = data; updateProfileCard(); }
        }
    } catch (error) {
        console.error('Error saving tournament:', error);
        showNotification('Failed to save tournament: ' + error.message, 'error');
    }
}

function replayTournament(players, tourName, eventName, gameId) {
    pool = [...players];
    showPage('tournament');
    document.getElementById('tour-name-input').value = tourName + " (Rematch)";
    document.getElementById('event-name-input').value = eventName || '';
    document.getElementById('tournament-game-select').value = gameId || '';
    updatePoolUI();
    showNotification(`Players for "${tourName}" loaded!`, 'success');
}

// ============================================================
// 9. QUICK MATCH
// ============================================================

/**
 * Handle acoustic goal detection from audio-engine.js
 * Called automatically when goal sound is detected
 * @param {number} playerNumber - 1 or 2, which player scored
 */
function handleGoalDetected(playerNumber) {
    // PRO MODE - Route to Pro Mode handler if active
    if (proModeActive) {
        handleGoalDetectedPro(playerNumber);
        return;
    }
    
    // Regular Quick Match flow
    // Check if Quick Match is active
    const overlay = document.getElementById('active-winner-selection');
    if (!overlay) {
        console.log('Goal detected but Quick Match not active');
        return;
    }
    
    // Determine winner based on player number
    const winnerName = playerNumber === 1 ? quickP1 : quickP2;
    
    if (!winnerName) {
        console.error('Winner name not found for player', playerNumber);
        return;
    }
    
    console.log(`🎯 Acoustic goal detected! Player ${playerNumber} (${winnerName}) scores!`);
    showNotification(`🚨 GOAL! ${winnerName} scores!`, 'success');
    
    // Find and click the winner's button
    const buttons = overlay.querySelectorAll('button.btn-red');
    for (let btn of buttons) {
        if (btn.textContent.trim() === winnerName) {
            // Simulate click after short delay for visual feedback
            setTimeout(() => {
                btn.click();
            }, 800);
            break;
        }
    }
}

function handleQuickSearch(input, slot) {
    const v = input.value.toUpperCase();
    const resDiv = document.getElementById(`${slot}-results`);
    if (!v) { resDiv.style.display = 'none'; return; }
    const combined = [...new Set([...allDbNames, ...sessionGuests])];
    const filtered = combined.filter(n => n.includes(v)).slice(0, 5);
    resDiv.innerHTML = filtered.map(n => `<div class="search-item" onclick="selectQuickPlayer('${n}', '${slot}')">${n}</div>`).join('');
    resDiv.style.display = 'block';
}

async function selectQuickPlayer(name, slot) {
    document.getElementById(`${slot}-quick-search`).value = name;
    document.getElementById(`${slot}-results`).style.display = 'none';
    if (slot === 'p1') quickP1 = name; else quickP2 = name;
    if (quickP1 && quickP2) {
        updateEloPreview();
        // Show audio detection panels when both players selected
        document.getElementById('audio-status-panel').style.display = 'block';
        document.getElementById('audio-test-panel').style.display = 'block';
    }
}

async function updateEloPreview() {
    if (!quickP1 || !quickP2) return;
    const { data: p1 } = await _supabase.from('players').select('id, elo').eq('username', quickP1).single();
    const { data: p2 } = await _supabase.from('players').select('id, elo').eq('username', quickP2).single();
    const elo1 = p1 ? p1.elo : 1300, elo2 = p2 ? p2.elo : 1300;
    const id1 = p1 ? p1.id : 'guest1', id2 = p2 ? p2.id : 'guest2';
    const result = calculateNewElo({ id: id1, elo: elo1 }, { id: id2, elo: elo2 }, { id: id1 });
    const gain = result.newEloA - elo1;
    document.getElementById('elo-prediction-text').innerHTML = `<span class="highlight">${quickP1}</span> gains <span class="highlight">+${gain} ELO</span> if they win`;
    document.getElementById('elo-preview').style.display = 'block';
}

async function startQuickMatch() {
    document.querySelectorAll('input').forEach(input => input.blur());
    const p1Val = document.getElementById('p1-quick-search').value.trim().toUpperCase();
    const p2Val = document.getElementById('p2-quick-search').value.trim().toUpperCase();
    quickP1 = p1Val; quickP2 = p2Val;
    if (!quickP1 || !quickP2) return showNotification("Select both players!", "error");
    if (quickP1 === quickP2) return showNotification("Select different players!", "error");
    
    // PRO MODE CHECK - Route to Pro Mode if enabled
    if (proModeEnabled) {
        startProMatch();
        return;
    }
    
    // Regular Quick Match flow
    // Start acoustic goal detection
    if (window.audioEngine && typeof window.audioEngine.startListening === 'function') {
        const result = await window.audioEngine.startListening();
        if (result.success) {
            showNotification("🎙️ Audio detection active", "success");
        }
    }
    
    document.getElementById('app-content').style.display = 'none';
    const overlay = document.createElement('div');
    overlay.id = "active-winner-selection";
    overlay.style = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:#0a0a0a; z-index:9999999; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px;";
    overlay.innerHTML = `
        <h2 style="font-family:'Russo One'; color:#fff; margin-bottom:10px;">WHO WON?</h2>
        <button class="btn-red" style="width:280px; height:80px; font-size:1.5rem;" onclick="handleQuickWinner('${quickP1}', this)">${quickP1}</button>
        <div style="color:var(--sub-gold); font-family:'Russo One';">OR</div>
        <button class="btn-red" style="width:280px; height:80px; font-size:1.5rem; background:#333;" onclick="handleQuickWinner('${quickP2}', this)">${quickP2}</button>
        <button onclick="cancelQuickMatch()" style="margin-top:20px; background:none; border:none; color:#666; text-decoration:underline; cursor:pointer;">Cancel</button>`;
    document.body.appendChild(overlay);
}

function cancelQuickMatch() {
    // Stop audio detection
    if (window.audioEngine && typeof window.audioEngine.stopListening === 'function') {
        window.audioEngine.stopListening();
    }
    
    const overlay = document.getElementById('active-winner-selection');
    if (overlay) overlay.remove();
    document.getElementById('app-content').style.display = 'flex';
}

function handleQuickWinner(winnerName, btn) {
    btn.parentElement.remove();
    finalizeQuickMatch(winnerName);
}

async function finalizeQuickMatch(winnerName) {
    try {
        const loserName = (winnerName === quickP1) ? quickP2 : quickP1;
        let { data: p1Data } = await _supabase.from('players').select('*').eq('username', winnerName).single();
        let { data: p2Data } = await _supabase.from('players').select('*').eq('username', loserName).single();
        
        if (!p1Data) p1Data = { username: winnerName, elo: 1300, id: 'guest_' + winnerName, isGuest: true };
        if (!p2Data) p2Data = { username: loserName, elo: 1300, id: 'guest_' + loserName, isGuest: true };
        
        const result = calculateNewElo(p1Data, p2Data, p1Data);
        const gain = result.newEloA - p1Data.elo;
        
        if (!p1Data.isGuest) {
            const { error: e1 } = await _supabase.from('players').update({ elo: result.newEloA, wins: (p1Data.wins || 0) + 1 }).eq('id', p1Data.id);
            if (e1) throw e1;
        }
        if (!p2Data.isGuest) {
            const { error: e2 } = await _supabase.from('players').update({ elo: result.newEloB }).eq('id', p2Data.id);
            if (e2) throw e2;
        }
        
        const { error: matchError } = await _supabase.from('matches').insert([{ player1: winnerName, player2: loserName, winner: winnerName }]);
        if (matchError) throw matchError;
        
        // Stop audio detection
        if (window.audioEngine && typeof window.audioEngine.stopListening === 'function') {
            window.audioEngine.stopListening();
        }
        
        showVictory(winnerName, result.newEloA, gain, p1Data.isGuest);
    } catch (error) {
        console.error('Error finalizing Quick Match:', error);
        showNotification('Failed to save match results: ' + error.message, 'error');
        cancelQuickMatch();
    }
}

function showVictory(name, newElo, gain, isGuest = false) {
    document.querySelectorAll('input').forEach(input => input.blur());
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.style.display = 'none';
    document.getElementById('victory-player-name').innerText = name;
    document.getElementById('victory-elo-count').innerText = newElo;
    document.getElementById('victory-elo-gain').innerText = `+${gain} POINTS`;
    const overlay = document.getElementById('victory-overlay');
    const oldMsg = document.getElementById('guest-upsell');
    if (oldMsg) oldMsg.remove();
    if (isGuest) {
        const msg = document.createElement('div');
        msg.id = 'guest-upsell';
        msg.style = "margin-top: 20px; color: var(--sub-gold); font-family: 'Open Sans'; font-size: 0.85rem; max-width: 250px; background: rgba(255,215,0,0.1); padding: 10px; border-radius: 8px; border: 1px dashed var(--sub-gold);";
        msg.innerHTML = "🔥 <strong>Great win!</strong> Create a free account to start climbing the official Global Leaderboard.";
        const btn = overlay.querySelector('button');
        overlay.insertBefore(msg, btn);
    }
    overlay.style.display = 'flex';
}

function closeVictoryOverlay() {
    document.getElementById('victory-overlay').style.display = 'none';
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.style.display = 'flex';
    document.getElementById('p1-quick-search').value = '';
    document.getElementById('p2-quick-search').value = '';
    quickP1 = null; quickP2 = null;
    document.getElementById('elo-preview').style.display = 'none';
    document.getElementById('audio-status-panel').style.display = 'none';
    document.getElementById('audio-test-panel').style.display = 'none';
    if (typeof fetchLB === "function") fetchLB();
    if (typeof fetchHist === "function") fetchHist();
    showPage('tournament');
    showNotification("Match saved!", "success");
}

// ============================================================
// 9B. AUDIO DETECTION UI CONTROLS
// ============================================================

/**
 * Manual toggle for audio detection
 */
async function toggleAudioDetection() {
    if (!window.audioEngine) {
        showNotification('Audio engine not loaded', 'error');
        return;
    }
    
    const status = window.audioEngine.getStatus();
    const btn = document.getElementById('toggle-audio-btn');
    const indicator = document.getElementById('audio-indicator');
    
    if (status.isListening) {
        // Stop detection
        window.audioEngine.stopListening();
        btn.textContent = 'ACTIVATE';
        btn.style.background = '#333';
        indicator.style.background = '#666';
        indicator.style.boxShadow = 'none';
        document.getElementById('audio-frequency-display').style.display = 'none';
        showNotification('Audio detection stopped', 'info');
    } else {
        // Start detection
        const result = await window.audioEngine.startListening();
        if (result.success) {
            btn.textContent = 'DEACTIVATE';
            btn.style.background = 'var(--sub-red)';
            indicator.style.background = '#4CAF50';
            indicator.style.boxShadow = '0 0 10px #4CAF50';
            document.getElementById('audio-frequency-display').style.display = 'block';
            showNotification('🎙️ Audio detection active', 'success');
            // Start real-time frequency display
            startFrequencyMonitor();
        } else {
            showNotification(result.message, 'error');
        }
    }
}

/**
 * Real-time frequency monitor (for testing)
 */
let frequencyMonitorInterval = null;
function startFrequencyMonitor() {
    if (frequencyMonitorInterval) clearInterval(frequencyMonitorInterval);
    
    frequencyMonitorInterval = setInterval(() => {
        if (!window.audioEngine || !window.audioEngine.getStatus().isListening) {
            clearInterval(frequencyMonitorInterval);
            return;
        }
        
        // This is a simplified display - actual detection happens in audio-engine.js
        // For real frequency display, we'd need to expose analyser data from audio-engine
        const status = window.audioEngine.getStatus();
        document.getElementById('freq-goal1').textContent = status.settings.goal1Frequency;
        document.getElementById('freq-goal2').textContent = status.settings.goal2Frequency;
    }, 100);
}

/**
 * Record goal sound for testing and analysis
 * @param {number} goalNumber - 1 or 2
 */
let mediaRecorder = null;
let recordedChunks = [];

async function recordGoalSound(goalNumber) {
    const statusDiv = document.getElementById('recording-status');
    
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recordedChunks = [];
            
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                
                // Download the recording
                const a = document.createElement('a');
                a.href = url;
                a.download = `goal${goalNumber}_sound_${Date.now()}.webm`;
                a.click();
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
                
                statusDiv.textContent = `✅ Goal ${goalNumber} sound saved!`;
                statusDiv.style.color = '#4CAF50';
                
                // Analyze the recording
                analyzeRecording(blob, goalNumber);
                
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 3000);
            };
            
            mediaRecorder.start();
            statusDiv.textContent = `🔴 Recording Goal ${goalNumber} sound... (3 sec)`;
            statusDiv.style.color = 'var(--sub-red)';
            
            // Auto-stop after 3 seconds
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, 3000);
            
        } catch (error) {
            console.error('Recording failed:', error);
            statusDiv.textContent = '❌ Microphone access required';
            statusDiv.style.color = '#f44336';
        }
    } else {
        // Stop recording manually
        mediaRecorder.stop();
    }
}

/**
 * Analyze recorded audio to find dominant frequency
 * @param {Blob} audioBlob - Recorded audio blob
 * @param {number} goalNumber - Which goal was recorded
 */
async function analyzeRecording(audioBlob, goalNumber) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create offline analysis
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 4096; // High resolution for accurate frequency detection
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        // Find peak frequency
        let maxValue = 0;
        let maxIndex = 0;
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] > maxValue) {
                maxValue = dataArray[i];
                maxIndex = i;
            }
        }
        
        const frequency = Math.round(maxIndex * audioContext.sampleRate / analyser.fftSize);
        
        console.log(`🎵 Goal ${goalNumber} dominant frequency: ${frequency} Hz (intensity: ${maxValue})`);
        showNotification(`Goal ${goalNumber}: ~${frequency} Hz detected`, 'info');
        
        audioContext.close();
    } catch (error) {
        console.error('Audio analysis failed:', error);
    }
}

// ============================================================
// 9C. PRO MODE - ACOUSTIC LIVE SCORING (MODULAR)
// This entire section can be removed for basic version
// ============================================================

let proModeActive = false;
let proModeEnabled = false;
let proScoreP1 = 0;
let proScoreP2 = 0;
let proGoalHistory = []; // Track goals for undo: [{player: 1}, {player: 2}, ...]
const PRO_MODE_WIN_SCORE = 3; // First to 3 goals wins

/**
 * Handle Pro Mode click (restricted to Jarno Saarinen only)
 */
function handleProModeClick() {
    // Check if user is Jarno Saarinen
    if (!user || user.username !== 'JARNO SAARINEN') {
        showNotification('Pro Mode is currently in beta - Available for authorized users only', 'error');
        return;
    }
    
    toggleProMode();
}

/**
 * Initialize Pro Mode UI based on user
 */
function initProModeUI() {
    const proSection = document.getElementById('pro-mode-section');
    if (!proSection) return;
    
    // If not Jarno Saarinen, add disabled class
    if (!user || user.username !== 'JARNO SAARINEN') {
        proSection.classList.add('disabled');
    } else {
        proSection.classList.remove('disabled');
    }
}

/**
 * Toggle Pro Mode checkbox
 */
function toggleProMode() {
    const checkbox = document.getElementById('pro-mode-toggle');
    const proSection = document.getElementById('pro-mode-section');
    
    // Toggle checkbox
    checkbox.checked = !checkbox.checked;
    proModeEnabled = checkbox.checked;
    
    const startBtn = document.getElementById('start-quick-match');
    const audioPanels = document.getElementById('pro-mode-audio-panels');
    
    if (proModeEnabled) {
        startBtn.textContent = '⚡ START PRO MATCH';
        startBtn.style.background = 'linear-gradient(135deg, var(--sub-gold), #d4a017)';
        startBtn.style.color = '#000';
        audioPanels.style.display = 'block';
        proSection.style.borderColor = 'var(--sub-gold)';
        proSection.style.borderStyle = 'solid';
        showNotification('Pro Mode enabled! First to 3 goals wins', 'success');
    } else {
        startBtn.textContent = 'START MATCH';
        startBtn.style.background = '';
        startBtn.style.color = '';
        audioPanels.style.display = 'none';
        proSection.style.borderColor = '#444';
        proSection.style.borderStyle = 'dashed';
    }
}

/**
 * Start Pro Mode match
 */
async function startProMatch() {
    if (!quickP1 || !quickP2) {
        showNotification("Select both players!", "error");
        return;
    }
    
    // Initialize scores
    proScoreP1 = 0;
    proScoreP2 = 0;
    proGoalHistory = [];
    proModeActive = true;
    
    // Update Pro Mode view
    document.getElementById('pro-p1-name').textContent = quickP1;
    document.getElementById('pro-p2-name').textContent = quickP2;
    updateProScore();
    
    // Hide main app, show Pro Mode view
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('pro-mode-view').style.display = 'flex';
    
    // Start audio detection automatically
    if (window.audioEngine && typeof window.audioEngine.startListening === 'function') {
        const result = await window.audioEngine.startListening();
        if (result.success) {
            console.log('🎙️ Pro Mode: Audio detection active');
        } else {
            showNotification('Audio detection failed: ' + result.message, 'error');
        }
    } else {
        showNotification('⚠️ Audio engine not available - manual scoring only', 'error');
    }
    
    // Request landscape orientation hint
    if (screen.orientation && screen.orientation.lock) {
        try {
            await screen.orientation.lock('landscape');
        } catch (e) {
            // Landscape lock not supported or failed, continue anyway
        }
    }
}

/**
 * Handle goal detected in Pro Mode
 * @param {number} playerNumber - 1 or 2
 */
function handleGoalDetectedPro(playerNumber) {
    if (!proModeActive) return;
    
    // Update score
    if (playerNumber === 1) {
        proScoreP1++;
    } else {
        proScoreP2++;
    }
    
    // Add to history for undo
    proGoalHistory.push({ player: playerNumber });
    
    // Update display
    updateProScore();
    
    // Visual feedback
    const side = playerNumber === 1 ? '.pro-player-left' : '.pro-player-right';
    const element = document.querySelector(side);
    element.classList.add('goal-flash');
    setTimeout(() => element.classList.remove('goal-flash'), 500);
    
    // Haptic feedback
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }
    
    // Check for winner
    if (proScoreP1 >= PRO_MODE_WIN_SCORE) {
        setTimeout(() => finishProMatch(quickP1), 1500);
    } else if (proScoreP2 >= PRO_MODE_WIN_SCORE) {
        setTimeout(() => finishProMatch(quickP2), 1500);
    }
}

/**
 * Update Pro Mode score display
 */
function updateProScore() {
    // Update scores
    document.getElementById('pro-p1-score').textContent = proScoreP1;
    document.getElementById('pro-p2-score').textContent = proScoreP2;
    
    // Update goal visualizations (●○○)
    const p1Goals = '●'.repeat(proScoreP1) + '○'.repeat(PRO_MODE_WIN_SCORE - proScoreP1);
    const p2Goals = '●'.repeat(proScoreP2) + '○'.repeat(PRO_MODE_WIN_SCORE - proScoreP2);
    document.getElementById('pro-p1-goals').textContent = p1Goals;
    document.getElementById('pro-p2-goals').textContent = p2Goals;
    
    // Show/hide undo button based on goal history
    const undoBtn = document.getElementById('pro-undo-btn');
    if (undoBtn) {
        undoBtn.style.display = proGoalHistory.length > 0 ? 'block' : 'none';
    }
    
    // Update status text
    const p1Status = document.getElementById('pro-p1-status');
    const p2Status = document.getElementById('pro-p2-status');
    
    if (proScoreP1 === proScoreP2) {
        p1Status.textContent = 'TIE';
        p2Status.textContent = 'TIE';
    } else if (proScoreP1 > proScoreP2) {
        p1Status.textContent = 'LEADING';
        p2Status.textContent = (proScoreP2 === PRO_MODE_WIN_SCORE - 1) ? 'MATCH POINT' : '';
    } else {
        p1Status.textContent = (proScoreP1 === PRO_MODE_WIN_SCORE - 1) ? 'MATCH POINT' : '';
        p2Status.textContent = 'LEADING';
    }
    
    // Match point highlight
    if (proScoreP1 === PRO_MODE_WIN_SCORE - 1 || proScoreP2 === PRO_MODE_WIN_SCORE - 1) {
        const matchPointStatus = proScoreP1 === PRO_MODE_WIN_SCORE - 1 ? p1Status : p2Status;
        matchPointStatus.style.color = 'var(--sub-gold)';
        matchPointStatus.style.fontSize = '1.1rem';
    }
}

/**
 * Finish Pro Mode match and save results
 * @param {string} winnerName - Name of the winner
 */
async function finishProMatch(winnerName) {
    proModeActive = false;
    
    // Stop audio detection
    if (window.audioEngine && typeof window.audioEngine.stopListening === 'function') {
        window.audioEngine.stopListening();
    }
    
    // Unlock orientation
    if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
    }
    
    // Hide Pro Mode view
    document.getElementById('pro-mode-view').style.display = 'none';
    
    // Finalize match (same as regular Quick Match)
    await finalizeQuickMatch(winnerName);
}

/**
 * Exit Pro Mode manually
 */
function exitProMode() {
    if (!confirm('Exit Pro Mode? Current match will not be saved.')) {
        return;
    }
    
    proModeActive = false;
    proGoalHistory = [];
    
    // Stop audio detection
    if (window.audioEngine && typeof window.audioEngine.stopListening === 'function') {
        window.audioEngine.stopListening();
    }
    
    // Unlock orientation
    if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
    }
    
    // Hide Pro Mode view, show main app
    document.getElementById('pro-mode-view').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    
    showNotification('Pro Mode exited - match not saved', 'info');
}

/**
 * Manual goal scoring - called when tapping player side
 * @param {number} playerNumber - 1 or 2
 */
function addManualGoal(playerNumber) {
    if (!proModeActive) return;
    handleGoalDetectedPro(playerNumber);
}

/**
 * Undo last goal in Pro Mode
 */
function undoLastGoal() {
    if (!proModeActive || proGoalHistory.length === 0) return;
    
    // Get last goal from history
    const lastGoal = proGoalHistory.pop();
    
    // Decrement score
    if (lastGoal.player === 1) {
        proScoreP1 = Math.max(0, proScoreP1 - 1);
    } else {
        proScoreP2 = Math.max(0, proScoreP2 - 1);
    }
    
    // Update display
    updateProScore();
    
    // Haptic feedback
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
    
    showNotification('Last goal undone', 'success');
}

// ============================================================
// END PRO MODE
// ============================================================

// ============================================================
// 10. CONNECTION WATCHDOG
// ============================================================

setInterval(async () => {
    const dot = document.getElementById('conn-dot');
    if (!dot) return;
    try {
        const { error } = await _supabase.from('players').select('username').limit(1);
        if (error) throw error;
        dot.classList.remove('dot-offline');
    } catch (e) {
        dot.classList.add('dot-offline');
    }
}, 30000);

// ============================================================
// 11. GLOBAALIT KYTKENNÄT (window-objekti)
// ============================================================

window.fetchAllGames = fetchAllGames;
window.toggleAuth = toggleAuth;
window.handleSearch = handleSearch;
window.addP = addP;
window.directAdd = directAdd;
window.updatePoolUI = updatePoolUI;
window.removeFromPool = removeFromPool;
window.clearPool = clearPool;
window.updateGuestUI = updateGuestUI;
window.updateProfileCard = updateProfileCard;
window.updateAvatarPreview = updateAvatarPreview;
window.viewPlayerCard = viewPlayerCard;
window.closeCardModal = closeCardModal;
window.downloadFanCard = downloadFanCard;
window.initGameMap = initGameMap;
window.setMapLocation = setMapLocation;
window.fetchPublicGamesMap = fetchPublicGamesMap;
window.searchLocation = searchLocation;
window.registerGame = registerGame;
window.initEditGame = initEditGame;
window.cancelEdit = cancelEdit;
window.updateGame = updateGame;
window.deleteGame = deleteGame;
window.fetchMyGames = fetchMyGames;
window.calculateNewElo = calculateNewElo;
window.fetchLB = fetchLB;
window.fetchHist = fetchHist;
window.saveMatch = saveMatch;
window.startTournament = startTournament;
window.drawRound = drawRound;
window.pickWin = pickWin;
window.pickBronzeWinner = pickBronzeWinner;
window.checkCompletion = checkCompletion;
window.advanceRound = advanceRound;
window.saveTour = saveTour;
window.replayTournament = replayTournament;
window.handleQuickSearch = handleQuickSearch;
window.selectQuickPlayer = selectQuickPlayer;
window.updateEloPreview = updateEloPreview;
window.startQuickMatch = startQuickMatch;
window.cancelQuickMatch = cancelQuickMatch;
window.handleQuickWinner = handleQuickWinner;
window.finalizeQuickMatch = finalizeQuickMatch;
window.showVictory = showVictory;
window.closeVictoryOverlay = closeVictoryOverlay;
window.handleGoalDetected = handleGoalDetected;
window.toggleAudioDetection = toggleAudioDetection;
window.recordGoalSound = recordGoalSound;
// PRO MODE window bindings
window.handleProModeClick = handleProModeClick;
window.initProModeUI = initProModeUI;
window.toggleProMode = toggleProMode;
window.startProMatch = startProMatch;
window.exitProMode = exitProMode;
window.addManualGoal = addManualGoal;
window.undoLastGoal = undoLastGoal;

// ============================================================
// 12. KÄYNNISTYS
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof initApp === 'function') await initApp();
});