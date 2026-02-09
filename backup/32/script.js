const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co', _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const _supabase = window.supabase.createClient(_URL, _KEY);
let user = null, pool = [], sessionGuests = [], allDbNames = [], allGames = [], myGames = [];
let gameMap = null, gameMarker = null, selLat = null, selLng = null;
let publicMap = null;
let editingGameId = null;

// UUSI ILMOITUSFUNKTIO
function showNotification(message, type = 'error') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `toast-notification ${type}`;
    notification.innerText = message;
    container.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 4000); // Ilmoitus poistuu 4 sekunnin kuluttua
}

async function initApp() { 
    const { data } = await _supabase.from('players').select('username');
    allDbNames = data ? data.map(p => p.username) : [];
    await fetchAllGames();
}   

async function fetchAllGames() {
    const { data } = await _supabase.from('games').select('id, game_name');
    allGames = data || [];
    populateGameSelect();
}

function populateGameSelect() {
    const sel = document.getElementById('tournament-game-select');
    if(!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select Game Table</option>';
    if(allGames.length === 0) {
        sel.innerHTML += '<option value="" disabled>No tables available</option>';
        return;
    }
    allGames.forEach(g => {
        sel.innerHTML += `<option value="${g.id}">${g.game_name}</option>`;
    });
}

function toggleAuth(s) { document.getElementById('login-form').style.display = s ? 'none' : 'block'; document.getElementById('signup-form').style.display = s ? 'block' : 'none'; }

async function handleSignUp() {
    const u = document.getElementById('reg-user').value.trim().toUpperCase();
    const p = document.getElementById('reg-pass').value.trim();
    
    if(!u || !p) return showNotification("Fill all fields", "error");
    // TARKISTUS: Onko nimi jo varattu?
    const { data: existing } = await _supabase.from('players').select('id').eq('username', u).single();
    if (existing) {
        return showNotification("Username already taken!", "error");
    }
    const { error } = await _supabase.from('players').insert([{ username: u, password: p, elo: 1300, wins: 0 }]);
    if(error) showNotification("Error: " + error.message, "error"); 
    else { 
        showNotification("Account created!", "success"); 
        toggleAuth(false); 
        initApp(); 
    }
}

async function handleAuth() {
    const u = document.getElementById('auth-user').value.trim().toUpperCase(), p = document.getElementById('auth-pass').value;
    let { data } = await _supabase.from('players').select('*').eq('username', u).single();
    if(data && data.password === p) { user = data; startSession(); } else showNotification("Login failed.", "error");
}

function handleGuest() {
    const g = document.getElementById('guest-nick').value.toUpperCase() || "GUEST"; user = { username: g, id: 'guest', elo: 1300, wins: 0 };
    if(!sessionGuests.includes(g)) sessionGuests.push(g); startSession();
}

function startSession() { document.getElementById('auth-page').style.display = 'none'; document.getElementById('app-content').style.display = 'flex'; document.getElementById('label-user').innerText = user.username; updateProfileCard(); updateGuestUI(); showPage('tournament'); }

// AUTOMATIC SEARCH / AUTOCOMPLETE LOGIC
function handleSearch(v) {
    const r = document.getElementById('search-results'); if(!v) { r.style.display = 'none'; return; }
    const q = v.toUpperCase(), combined = [...new Set([...allDbNames, ...sessionGuests])], f = combined.filter(n => n.includes(q) && !pool.includes(n));
    r.innerHTML = f.map(n => `<div class="search-item" onclick="directAdd('${n}')">${n}</div>`).join('') + `<div class="search-item" onclick="directAdd('${q}')">Add: "${q}"</div>`;
    r.style.display = 'block';
}

function addP() { 
    const i = document.getElementById('add-p-input'); 
    const n = i.value.trim().toUpperCase(); 
    if(n && !pool.includes(n)) { 
        pool.push(n); 
        updatePoolUI(); 
        showNotification(`${n} added to pool`, 'success');
    } 
    i.value = ''; 
    document.getElementById('search-results').style.display = 'none'; 
}

function directAdd(n) { 
    if(!pool.includes(n)) { 
        pool.push(n); 
        updatePoolUI(); 
        showNotification(`${n} added to pool`, 'success');
    } 
    document.getElementById('add-p-input').value = ''; 
    document.getElementById('search-results').style.display = 'none'; 
}

function updateGuestUI() { 
    document.getElementById('active-guests').innerHTML = sessionGuests.map(g => `<span class="guest-badge" style="background:#333; padding:5px 10px; border-radius:15px; font-size:0.7rem; cursor:pointer; margin:4px; display:inline-block; border:1px solid #444;" onclick="directAdd('${g}')">${g}</span>`).join(''); 
}

async function updateProfileCard() { 
    const container = document.getElementById('section-profile');
    if (!container) return;
    // Tilastojen laskenta (wins, losses, ratio jne.) säilyy samana
    const wins = user.wins || 0;
    let totalGames = 0;
    const { count } = await _supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .or(`player1.eq.${user.username},player2.eq.${user.username}`);
    if(count) totalGames = count;
    const losses = Math.max(0, totalGames - wins);
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    
    const rank = user.elo > 1500 ? "PRO" : "ROOKIE";
    const avatarUrl = user.avatar_url ? user.avatar_url : 'placeholder-silhouette-5-wide.png';

    container.innerHTML = `
        <div class="pro-card">
            <div class="card-header-stripe">${rank} CARD</div>
            
            <div class="card-image-area">
                <img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">
            </div>
            <div class="card-name-strip">${user.username}</div>
            <div class="card-info-area">
                <div class="card-stats-row">
                    <div class="card-stat-item">
                        <div class="card-stat-label">RANK</div>
                        <div class="card-stat-value">${user.elo}</div>
                    </div>
                    <div class="card-stat-item">
                        <div class="card-stat-label">WINS</div>
                        <div class="card-stat-value">${wins}</div>
                    </div>
                    <div class="card-stat-item">
                        <div class="card-stat-label">LOSS</div>
                        <div class="card-stat-value">${losses}</div>
                    </div>
                    <div class="card-stat-item">
                        <div class="card-stat-label">W/L</div>
                        <div class="card-stat-value">${ratio}</div>
                    </div>
                </div>
                
                <div class="card-bottom-row" style="border-top: 1px solid #222; padding-top: 4px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <img src="https://flagcdn.com/w20/${(user.country || 'fi').toLowerCase()}.png" width="16">
                        <span style="color:#888; font-size:0.55rem; font-family:'Russo One';">REPRESENTING</span>
                    </div>
                    <div style="color:var(--sub-gold); font-size:0.55rem; font-family:'Russo One';">CLUB: PRO</div>
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

function showEditProfile() { const fields = document.getElementById('profile-edit-fields'); if(fields) fields.style.display = fields.style.display === 'none' ? 'block' : 'none'; }

async function saveProfile() {
    const avatarUrl = document.getElementById('avatar-url-input').value.trim();
    const countryCode = document.getElementById('country-input').value.trim().toLowerCase();
    
    const updates = {};
    if (avatarUrl) updates.avatar_url = avatarUrl;
    if (countryCode) updates.country = countryCode;

    if (Object.keys(updates).length === 0) return showNotification("Nothing to update", "error");

    // Update Supabase
    const { error } = await _supabase.from('players').update(updates).eq('id', user.id);

    if (error) {
        showNotification("Error updating profile: " + error.message, "error");
    } else {
        if (avatarUrl) user.avatar_url = avatarUrl;
        if (countryCode) user.country = countryCode;
        updateProfileCard(); // Refresh card immediately
        showNotification("Profile updated!", "success");
        document.getElementById('avatar-url-input').value = '';
    }
}

function updatePoolUI() {
    const list = document.getElementById('pool-list');
    const countSpan = document.getElementById('pool-count');
    list.innerHTML = ''; // Clear previous content

    if (pool.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.innerText = "No players added.";
        list.appendChild(emptyMessage);
        if(countSpan) countSpan.innerText = 0;
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
    
    if(countSpan) countSpan.innerText = pool.length;
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

function showPage(p) { 
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); 
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
    document.getElementById('section-' + p).classList.add('active'); 
    const t = document.getElementById('tab-' + p);
    if(t) {
        t.classList.add('active'); 
    } else if (p === 'history' || p === 'games') {
        const tm = document.getElementById('tab-more');
        if(tm) tm.classList.add('active');
    }
    if(p === 'leaderboard') fetchLB(); 
    if(p === 'history') fetchHist();
    if(p === 'games') fetchMyGames();
    if(p !== 'games') cancelEdit(); // Reset edit mode when leaving tab
    if(p === 'map') fetchPublicGamesMap();
    
    // Initialize Map if on games tab
    if(p === 'games') {
        setTimeout(() => {
            if(!gameMap) initGameMap();
            else gameMap.invalidateSize();
        }, 200);
    }
}

function initGameMap() {
    gameMap = L.map('map-picker').setView([60.1699, 24.9384], 10); // Default Helsinki
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(gameMap);
    gameMap.on('click', async function(e) {
        setMapLocation(e.latlng.lat, e.latlng.lng);
        // Reverse Geocode for UX
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`);
            const data = await res.json();
            if(data && data.display_name) document.getElementById('game-address-input').value = data.display_name;
        } catch(e){}
    });
}

function setMapLocation(lat, lng, name) {
    selLat = lat; selLng = lng;
    if(gameMarker) gameMap.removeLayer(gameMarker);
    gameMarker = L.marker([lat, lng]).addTo(gameMap);
    gameMap.setView([lat, lng], 13);
    const txt = name ? `${name} (${lat.toFixed(2)}, ${lng.toFixed(2)})` : `Selected: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    document.getElementById('location-confirm').innerText = "Location set to " + txt;
}

async function fetchPublicGamesMap() {
    // script.js: Kartan alustus harmaalla teemalla brändin mukaisesti
    if(!publicMap) {
        publicMap = L.map('public-game-map').setView([60.1699, 24.9384], 11); // Default Helsinki
        
        // HARMAA TEEMA (Positron / Light Gray)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(publicMap);
    } else {
        setTimeout(() => publicMap.invalidateSize(), 200);
    }

    // script.js: Kustomoitu ikoni käyttää CSS-muuttujaa --sub-red
    // Luodaan kustomoitu ikoni (Subsoccer-pallo)
    const subsoccerIcon = L.divIcon({
        className: 'custom-div-icon',
        html: "<div style='background-color:var(--sub-red); width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);'></div>",
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    // Fetch Public Games
    const { data, error } = await _supabase.from('games').select('*').eq('is_public', true);
    
    if(data) {
        // Clear existing markers (simple approach: remove all layers that are markers)
        publicMap.eachLayer((layer) => {
            if (layer instanceof L.Marker) publicMap.removeLayer(layer);
        });

        data.forEach(g => {
            if(g.latitude && g.longitude) {
                L.marker([g.latitude, g.longitude], { icon: subsoccerIcon }).addTo(publicMap)
                    .bindPopup(`<div style="color:#000; font-family:'Resolve Sans';"><b>${g.game_name}</b><br>${g.location}</div>`);
            }
        });
    }
}

async function searchLocation() {
    const q = document.getElementById('game-address-input').value;
    if(!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if(data && data.length > 0) setMapLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name.split(',')[0]);
        else showNotification("Location not found", "error");
    } catch(e) { showNotification("Search error", "error"); }
}
async function fetchLB() { 
    const { data } = await _supabase.from('players').select('*').order('elo', {ascending: false}); 
    document.getElementById('lb-data').innerHTML = data ? data.map((p, i) => {
        const flag = p.country ? p.country.toLowerCase() : 'fi';
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #222;"><span><span style="color:#666; margin-right:10px; font-size:0.8rem;">#${i+1}</span> <img src="https://flagcdn.com/w20/${flag}.png" style="width:16px; margin-right:6px; vertical-align:middle; opacity:0.8;"> <span class="lb-name" onclick="viewPlayerCard('${p.username}')" style="cursor:pointer; text-decoration:underline;">${p.username}</span></span><span class="lb-elo">${p.elo}</span></div>`;
    }).join('') : ""; 
}

async function fetchHist() { 
    const { data: tourData } = await _supabase.from('tournament_history').select('*').order('created_at', {ascending: false}); 
    const { data: matchData } = await _supabase.from('matches').select('*').order('created_at', {ascending: false}); 
    // Ensure games are loaded for lookup
    if (allGames.length === 0) await fetchAllGames();

    if (!tourData || tourData.length === 0) {
        document.getElementById('hist-list').innerHTML = "No history.";
        return;
    }

    // Ryhmittele turnaukset tapahtuman nimen mukaan
    const events = tourData.reduce((acc, h) => {
        const eventName = h.event_name || 'Individual Tournaments';
        if (!acc[eventName]) {
            acc[eventName] = [];
        }
        acc[eventName].push(h);
        return acc;
    }, {});

    let html = "";
    for (const eventName in events) {
        html += `<div class="event-group">
                    <h2 class="event-title">${eventName}</h2>`;
        
        html += events[eventName].map((h, index) => {
            const tourMatches = matchData ? matchData.filter(m => m.tournament_id === h.tournament_id) : [];
            
            // Kerää kaikki uniikit pelaajat turnauksen matseista
            const tourPlayers = [...new Set(tourMatches.flatMap(m => [m.player1, m.player2]))];
            // Varmistetaan, että myös voittaja, 2. ja 3. sija ovat mukana
            if (h.winner_name && !tourPlayers.includes(h.winner_name)) tourPlayers.push(h.winner_name);
            if (h.second_place_name && !tourPlayers.includes(h.second_place_name)) tourPlayers.push(h.second_place_name);
            if (h.third_place_name && !tourPlayers.includes(h.third_place_name)) tourPlayers.push(h.third_place_name);
            
            const playersJsonString = JSON.stringify([...new Set(tourPlayers)]);

            const matchesHtml = tourMatches.map(m => 
                `<div style="background:#111; padding:10px; border-radius:5px; margin-top:5px; font-size:0.8rem;"><b>${m.winner}</b> defeated ${m.winner === m.player1 ? m.player2 : m.player1}</div>`
            ).join('');

            let secondPlace = h.second_place_name ? `<br><small>🥈 ${h.second_place_name}</small>` : '';
            let thirdPlace = h.third_place_name ? `<br><small>🥉 ${h.third_place_name}</small>` : '';
            
            const date = new Date(h.created_at);
            const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            
            // Resolve Game Name
            const gameName = h.game_id ? (allGames.find(g => g.id === h.game_id)?.game_name || '') : '';

            // Käytä uniikkia ID:tä jokaiselle turnaukselle
            const uniqueTourId = `${eventName.replace(/\s+/g, '-')}-${h.tournament_id}`;
            
            // Valmistele tiedot replay-toimintoa varten (käsitellään null-arvot tyhjiksi merkkijonoiksi)
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
                    <div id="tour-matches-${uniqueTourId}" style="display:none; margin-top:10px;">
                        ${matchesHtml}
                    </div>
                    <div style="position: absolute; bottom: 10px; right: 10px; font-size: 0.6rem; color: #666;">${formattedDate}</div>
                </div>`;
        }).join('');

        html += `</div>`;
    }

    document.getElementById('hist-list').innerHTML = html;
}

async function saveMatch(p1, p2, winner, tourName) {
    const { data: p1Data } = await _supabase.from('players').select('*').eq('username', p1).single();
    const { data: p2Data } = await _supabase.from('players').select('*').eq('username', p2).single();

    if (p1Data && p2Data) {
        const winnerData = winner === p1 ? p1Data : p2Data;
        const { newEloA, newEloB } = calculateNewElo(p1Data, p2Data, winnerData);

        await _supabase.from('players').update({ elo: newEloA }).eq('id', p1Data.id);
        await _supabase.from('players').update({ elo: newEloB }).eq('id', p2Data.id);

        const { data: winnerDb } = await _supabase.from('players').select('wins').eq('username', winner).single();
        if(winnerDb) {
            await _supabase.from('players').update({ wins: (winnerDb.wins || 0) + 1 }).eq('username', winner);
        }
    }

    const matchData = { player1: p1, player2: p2, winner: winner, tournament_name: tourName || null, tournament_id: currentTournamentId };
    const { error } = await _supabase.from('matches').insert([matchData]);
    if (error) {
        console.error('Error saving match:', error);
        showNotification('Error saving match result.', 'error');
    }
}

let rP = [], rW = [], finalists = [], bronzeContenders = [], bronzeWinner = null, currentTournamentId = null, initialPlayerCount = 0;
function startTournament() { 
    if(pool.length < 2) return showNotification("Min 2 players for a tournament!", "error"); 
    
    try {
        currentTournamentId = uuid.v4();
        initialPlayerCount = pool.length;
        document.getElementById('tour-setup').style.display = 'none'; 
        document.getElementById('tour-engine').style.display = 'flex'; 
        document.getElementById('save-btn').style.display = 'none';
        
        // UUSI LOGIIKKA: Järjestä pelaajat ja lisää vapaakierrokset (byes)
        const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(pool.length)));
        const byes = nextPowerOfTwo - pool.length;
        
        // Sekoita pelaajat satunnaisesti
        let shuffledPlayers = [...pool].sort(() => Math.random() - 0.5);
        
        // Aseta pelaajat ja byet
        rP = shuffledPlayers;
        
        rW = []; 
        finalists = [];
        bronzeContenders = [];
        bronzeWinner = null;
        drawRound(byes); // Välitä byes-määrä drawRound-funktiolle
    } catch (e) {
        showNotification("Error starting tournament: " + e.message, "error");
        console.error(e);
    }
}

function drawRound(byes = 0) {
    const a = document.getElementById('bracket-area'); a.innerHTML = ""; 
    
    // Tyhjennä voittajat vain, jos emme ole finaalivaiheessa
    if (finalists.length === 0) {
        rW = [];
    }

    // FINAL/BRONZE STAGE - This is triggered when finalists have been set
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
        checkCompletion(); // Tarkista tila heti
        return;
    }

    // WINNER ANNOUNCEMENT
    if(rP.length === 1 && finalists.length === 0) { 
        a.innerHTML = `<div class="container" style="text-align:center;"><h2>🏆 WINNER: ${rP[0]}</h2></div>`; 
        if (bronzeWinner) {
            a.innerHTML += `<div class="container" style="text-align:center; margin-top:10px;"><h3>🥉 Bronze: ${bronzeWinner}</h3></div>`;
        }
        document.getElementById('save-btn').style.display = 'block'; 
        document.getElementById('next-rd-btn').style.display = 'none';
        return; 
    }

    // Jaa pelaajat ottelupareihin ja vapaakierroksiin
    const matches = [];
    const playersWithBye = rP.slice(0, byes);
    const playersInMatches = rP.slice(byes);

    // Lisää vapaakierroksen saaneet suoraan voittajiksi
    playersWithBye.forEach(p => rW.push(p));

    // Muodosta otteluparit
    for (let i = 0; i < playersInMatches.length; i += 2) {
        matches.push([playersInMatches[i], playersInMatches[i+1]]);
    }

    // DRAWING REGULAR ROUNDS
    matches.forEach((match, index) => {
        const [p1, p2] = match;
        const m = document.createElement('div');
        m.className = "bracket-match";
        m.style.background="#111";
        m.style.border="1px solid #222";
        m.style.borderRadius="10px";
        m.style.marginBottom="10px";
        m.style.width="100%";
        m.style.overflow="hidden";
        
        // Laske oikea indeksi rW-taulukkoon vapaakierrokset huomioiden
        const winnerIndex = byes + index;

        if(!p2) { // Tätä ei pitäisi enää tapahtua uuden logiikan kanssa, mutta varmuuden vuoksi
             m.innerHTML = `<div style="padding:15px; opacity:0.5; font-family:'Russo One';">${p1} (BYE)</div>`; 
             rW[winnerIndex] = p1; 
        } else { 
            m.innerHTML = `<div style="padding:15px; cursor:pointer; font-family:'Russo One';" onclick="pickWin(${winnerIndex}, '${p1}', this)">${p1}</div><div style="padding:15px; cursor:pointer; font-family:'Russo One'; border-top:1px solid #222;" onclick="pickWin(${winnerIndex}, '${p2}', this)">${p2}</div>`; 
        }
        a.appendChild(m);
    });

    // Näytä vapaakierroksen saaneet pelaajat
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
    // Määritä vastustajat oikein
    let p1, p2;
    if (finalists.length === 2) {
        p1 = finalists[0];
        p2 = finalists[1];
    } else {
        const playersInMatches = rP.slice(Math.pow(2, Math.ceil(Math.log2(rP.length))) - rP.length);
        const matchIndex = idx - (Math.pow(2, Math.ceil(Math.log2(rP.length))) - rP.length);
        p1 = playersInMatches[matchIndex * 2];
        p2 = playersInMatches[matchIndex * 2 + 1];
    }
    
    if(p1 && p2) {
        const tournamentName = document.getElementById('tour-name-input').value || "Tournament";
        saveMatch(p1, p2, n, tournamentName);
    }

    rW[idx] = n; 
    
    e.parentElement.querySelectorAll('div').forEach(d => {
        d.style.background="transparent";
        d.style.opacity = "0.5";
    }); 
    e.style.background = "rgba(227, 6, 19, 0.4)"; 
    e.style.opacity = "1";

    checkCompletion();
}

function pickBronzeWinner(n, e) {
    const tournamentName = document.getElementById('tour-name-input').value || "Tournament";
    saveMatch(bronzeContenders[0], bronzeContenders[1], n, tournamentName + " (Bronze)");

    bronzeWinner = n;
    e.parentElement.querySelectorAll('div').forEach(d => {
        d.style.background="transparent";
        d.style.opacity = "0.5";
    }); 
    e.style.background = "rgba(255, 215, 0, 0.3)";
    e.style.opacity = "1";

    checkCompletion();
}

function checkCompletion() {
    const nextBtn = document.getElementById('next-rd-btn');
    
    // Laske montako voittajaa pitäisi olla valittuna
    const byes = Math.pow(2, Math.ceil(Math.log2(rP.length))) - rP.length;
    const matchesToPlay = (rP.length - byes) / 2;
    const expectedWinners = byes + matchesToPlay;

    // Filtteröi pois tyhjät paikat rW-taulukosta ennen pituuden tarkistusta
    const pickedWinners = rW.filter(w => w).length;

    if (finalists.length === 2) { // Finaali- ja pronssivaihe
        // Finaalin voittaja on rW[0] ja pronssivoittaja on erikseen
        if (rW[0] && bronzeWinner) {
            nextBtn.innerText = 'FINISH TOURNAMENT';
            nextBtn.style.display = 'block';
        } else {
            nextBtn.style.display = 'none';
        }
    } else if (pickedWinners === expectedWinners && matchesToPlay > 0) { // Normaali kierros valmis
        nextBtn.innerText = 'NEXT ROUND';
        nextBtn.style.display = 'block';
    } else {
        nextBtn.style.display = 'none';
    }
}

function advanceRound() {
    const nextBtn = document.getElementById('next-rd-btn');

    // Jos nappi on "FINISH TOURNAMENT", tallennetaan ja lopetetaan
    if (nextBtn.innerText === 'FINISH TOURNAMENT') {
        rP = rW.filter(w => w); // Varmista, että lopullinen voittaja on asetettu
        saveTour();
        return;
    }

    // Semifinaalivaiheen tunnistus (kun 4 pelaajaa jäljellä)
    if (rP.length === 4) {
        const losers = rP.filter(p => !rW.includes(p));
        bronzeContenders = [...losers];
        finalists = [...rW.filter(w => w)]; // Varmistetaan, ettei tyhjiä arvoja tule mukaan
        
        // Seuraavaksi piirretään finaali ja pronssiottelu
        drawRound();
        return;
    }
    
    // Normaali eteneminen seuraavalle kierrokselle
    rP = rW.filter(w => w);
    
    // Laske seuraavan kierroksen byet
    const nextByes = Math.pow(2, Math.ceil(Math.log2(rP.length))) - rP.length;

    document.getElementById('next-rd-btn').style.display = 'none'; 
    drawRound(nextByes); 
}

async function saveTour() {
    const winnerName = rP[0];
    const tournamentName = document.getElementById('tour-name-input').value || "Tournament";
    const eventName = document.getElementById('event-name-input').value.trim().toUpperCase() || null; // Lue tapahtuman nimi
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
    
    const dataToInsert = {
        tournament_name: tournamentName,
        winner_name: winnerName,
        second_place_name: secondPlaceName,
        tournament_id: currentTournamentId,
        event_name: eventName, // Lisää tapahtuman nimi tallennettaviin tietoihin
        game_id: gameId
    };
    if (bronzeWinner) {
        dataToInsert.third_place_name = bronzeWinner;
    }

    const { error } = await _supabase.from('tournament_history').insert([dataToInsert]);
    if (error) {
        console.error('Error saving tournament:', error);
        showNotification('Error saving results: ' + error.message, 'error');
        return;
    }

    pool = []; updatePoolUI();
    document.getElementById('tour-engine').style.display = 'none';
    document.getElementById('tour-setup').style.display = 'block';
    showPage('history');

    if (winnerName === user.username) {
        // Haetaan tuoreet tiedot DB:stä ennen kortin päivitystä
        const { data } = await _supabase.from('players').select('*').eq('id', user.id).single();
        if (data) {
            user = data;
            updateProfileCard();
        }
    }
}

// Connection Watchdog
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

// ELO Calculation
function calculateNewElo(playerA, playerB, winner) {
    const eloA = playerA.elo;
    const eloB = playerB.elo;
    const kFactor = 32;

    const expectedScoreA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const expectedScoreB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));

    const actualScoreA = winner.id === playerA.id ? 1 : 0;
    const actualScoreB = winner.id === playerB.id ? 1 : 0;

    const newEloA = Math.round(eloA + kFactor * (actualScoreA - expectedScoreA));
    const newEloB = Math.round(eloB + kFactor * (actualScoreB - expectedScoreB));

    return { newEloA, newEloB };
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

async function registerGame() {
    const uniqueCode = document.getElementById('game-code-input').value.trim();
    const gameName = document.getElementById('game-name-input').value.trim();
    const location = document.getElementById('game-address-input').value.trim();
    const isPublic = document.getElementById('game-public-input').checked;

    if (!uniqueCode || !gameName || !location || !selLat) {
        return showNotification("Please fill all fields and select location on map.", "error");
    }
    if (user.id === 'guest') {
        return showNotification("Guests cannot register games. Please create an account.", "error");
    }

    // Tässä voisi olla tarkistus, onko uniikki koodi jo käytössä, mutta jätetään se nyt pois yksinkertaisuuden vuoksi.

    const { data, error } = await _supabase.from('games').insert([{
        unique_code: uniqueCode,
        game_name: gameName,
        location: location,
        owner_id: user.id,
        latitude: selLat,
        longitude: selLng,
        is_public: isPublic
    }]);

    if (error) {
        console.error('Error registering game:', error);
        return showNotification("Error registering game: " + error.message, "error");
    }

    showNotification(`Game "${gameName}" registered successfully!`, "success");
    document.getElementById('game-code-input').value = '';
    document.getElementById('game-name-input').value = '';
    document.getElementById('game-address-input').value = '';
    selLat = null; selLng = null;
    if(gameMarker) gameMap.removeLayer(gameMarker);
    document.getElementById('location-confirm').innerText = '';
    await fetchAllGames(); // Refresh dropdown list
    fetchMyGames(); // Päivitä pelilista
}

function initEditGame(id) {
    const game = myGames.find(g => g.id === id);
    if(!game) return;

    editingGameId = id;
    document.getElementById('game-code-input').value = game.unique_code;
    document.getElementById('game-name-input').value = game.game_name;
    document.getElementById('game-address-input').value = game.location;
    document.getElementById('game-public-input').checked = game.is_public;

    // Update Map
    if(game.latitude && game.longitude) {
        setMapLocation(game.latitude, game.longitude, game.location);
    }

    // Toggle Buttons
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
    if(gameMarker) gameMap.removeLayer(gameMarker);

    document.getElementById('btn-reg-game').style.display = 'block';
    document.getElementById('btn-edit-group').style.display = 'none';
}

async function updateGame() {
    if(!editingGameId) return;
    
    const gameName = document.getElementById('game-name-input').value.trim();
    const location = document.getElementById('game-address-input').value.trim();
    const isPublic = document.getElementById('game-public-input').checked;

    if (!gameName || !location || !selLat) return showNotification("Please fill fields and location.", "error");

    const { error } = await _supabase.from('games').update({
        game_name: gameName,
        location: location,
        latitude: selLat,
        longitude: selLng,
        is_public: isPublic
    }).eq('id', editingGameId);

    if(error) showNotification("Update failed: " + error.message, "error");
    else {
        showNotification("Game updated!", "success");
        cancelEdit();
        fetchMyGames();
        await fetchAllGames();
    }
}

async function deleteGame(id) {
    if (!confirm("Are you sure you want to delete this game table? It will also be removed from past tournament results.")) return;
    try {
        // 1. Irrotetaan peli historiasta (asetetaan game_id nulliksi niissä turnauksissa, joissa se on ollut)
        const { error: updateError } = await _supabase
            .from('tournament_history')
            .update({ game_id: null })
            .eq('game_id', id);
        if (updateError) throw updateError;
        // 2. Poistetaan itse peli games-taulusta
        const { error: deleteError } = await _supabase
            .from('games')
            .delete()
            .eq('id', id);
        if (deleteError) throw deleteError;
        // 3. Päivitetään käyttöliittymä
        showNotification("Game deleted successfully", "success");
        if (typeof fetchMyGames === "function") fetchMyGames();
        if (typeof fetchAllGames === "function") fetchAllGames();
        
    } catch (e) {
        console.error("Deletion error:", e);
        showNotification("Deletion failed: " + e.message, "error");
    }
}

async function fetchMyGames() {
    if (user.id === 'guest') {
        document.getElementById('my-games-list').innerHTML = '<p>Login to see your registered games.</p>';
        return;
    }

    const { data, error } = await _supabase.from('games').select('*').eq('owner_id', user.id);

    if (error) {
        console.error('Error fetching games:', error);
        return;
    }

    const list = document.getElementById('my-games-list');
    myGames = data || []; // Store locally for editing

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

async function viewPlayerCard(targetUsername) {
    const modal = document.getElementById('card-modal');
    const container = document.getElementById('modal-card-container');
    modal.style.display = 'flex';
    container.innerHTML = '<p style="font-family:\'Russo One\'">LOADING CARD...</p>';
    // Haetaan pelaajan tiedot ja ottelutilastot
    const { data: p } = await _supabase.from('players').select('*').eq('username', targetUsername).single();
    const { count: totalGames } = await _supabase.from('matches').select('*', { count: 'exact', head: true }).or(`player1.eq.${targetUsername},player2.eq.${targetUsername}`);
    if (!p) return;
    const wins = p.wins || 0;
    const losses = Math.max(0, (totalGames || 0) - wins);
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const rank = p.elo > 1600 ? "PRO" : "ROOKIE";
    const avatarUrl = p.avatar_url ? p.avatar_url : 'placeholder-silhouette-5-wide.png';
    // Rakennetaan kortti (käytetään samaa Topps-geometriaa kuin profiilissa)
    container.innerHTML = `
        <div class="pro-card" style="margin:0;">
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
    `;
}

function closeCardModal() { document.getElementById('card-modal').style.display = 'none'; }

async function downloadFanCard() {
    const cardElement = document.querySelector('.pro-card');
    if (!cardElement) return showNotification("Card element not found", "error");
    
    // Varmistetaan, että Resolve on ladattu ennen kuvan luontia
    await document.fonts.load('1em Resolve');

    showNotification("Generating high-res card...", "success");
    try {
        const canvas = await html2canvas(cardElement, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#0a0a0a",
            scale: 3, // Tuplaresoluutio painolaatua varten
            logging: false
        });
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

// Quick Match pelaajien säilö
let quickP1 = null, quickP2 = null;

function handleQuickSearch(input, slot) {
    const v = input.value.toUpperCase();
    const resDiv = document.getElementById(`${slot}-results`);
    if(!v) { resDiv.style.display = 'none'; return; }

    const combined = [...new Set([...allDbNames, ...sessionGuests])];
    const filtered = combined.filter(n => n.includes(v)).slice(0, 5);

    resDiv.innerHTML = filtered.map(n => 
        `<div class="search-item" onclick="selectQuickPlayer('${n}', '${slot}')">${n}</div>`
    ).join('');
    resDiv.style.display = 'block';
}

async function selectQuickPlayer(name, slot) {
    document.getElementById(`${slot}-quick-search`).value = name;
    document.getElementById(`${slot}-results`).style.display = 'none';
    
    if(slot === 'p1') quickP1 = name;
    else quickP2 = name;

    if(quickP1 && quickP2) updateEloPreview();
}

async function updateEloPreview() {
    const { data: p1 } = await _supabase.from('players').select('id, elo').eq('username', quickP1).single();
    const { data: p2 } = await _supabase.from('players').select('id, elo').eq('username', quickP2).single();

    if(p1 && p2) {
        // Käytetään olemassa olevaa calculateNewElo -funktiota ennusteeseen
        const p1Win = calculateNewElo(p1, p2, p1); 
        const gain = p1Win.newEloA - p1.elo;
        
        const preview = document.getElementById('elo-preview');
        const text = document.getElementById('elo-prediction-text');
        // Käytetään highlight-luokkaa ja pidetään muu teksti tavallisena
        text.innerHTML = `<span class="highlight">${quickP1}</span> gains <span class="highlight">+${gain} ELO</span> if they win`;
        preview.style.display = 'block';
    }
}

async function startQuickMatch() {
    if(!quickP1 || !quickP2) return showNotification("Select both players!", "error");
    if(quickP1 === quickP2) return showNotification("Select different players!", "error");
    
    // Luodaan dynaaminen valintaikkuna promptin tilalle
    const overlay = document.createElement('div');
    overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:40000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px; animation: fadeIn 0.3s;";
    overlay.innerHTML = `<h2 style="font-family:'Russo One'; color:#fff; margin-bottom:10px;">WHO WON?</h2> <button class="btn-red" style="width:280px; height:80px; font-size:1.5rem;" onclick="handleQuickWinner('${quickP1}', this)">${quickP1}</button> <div style="color:var(--sub-gold); font-family:'Russo One';">OR</div> <button class="btn-red" style="width:280px; height:80px; font-size:1.5rem; background:#333;" onclick="handleQuickWinner('${quickP2}', this)">${quickP2}</button> <button onclick="this.parentElement.remove()" style="margin-top:20px; background:none; border:none; color:#666; text-decoration:underline; cursor:pointer;">Cancel</button>`;

    document.body.appendChild(overlay);
}

window.handleQuickWinner = function(winnerName, btn) { 
    btn.parentElement.remove(); 
    finalizeQuickMatch(winnerName); 
}

async function finalizeQuickMatch(winnerName) {
    const loserName = (winnerName === quickP1) ? quickP2 : quickP1;
    
    // Haetaan pelaajien tiedot
    let { data: p1Data } = await _supabase.from('players').select('*').eq('username', winnerName).single();
    let { data: p2Data } = await _supabase.from('players').select('*').eq('username', loserName).single();

    // Jos pelaajaa ei löydy DB:stä, luodaan vieras-objekti
    if (!p1Data) p1Data = { username: winnerName, elo: 1300, id: 'guest_' + winnerName, isGuest: true };
    if (!p2Data) p2Data = { username: loserName, elo: 1300, id: 'guest_' + loserName, isGuest: true };

    // Lasketaan uudet ELO-pisteet
    const result = calculateNewElo(p1Data, p2Data, p1Data); 
    const gain = result.newEloA - p1Data.elo;

    // Päivitetään DB vain rekisteröityneille
    if (!p1Data.isGuest) {
        await _supabase.from('players').update({ elo: result.newEloA, wins: (p1Data.wins || 0) + 1 }).eq('id', p1Data.id);
    }
    if (!p2Data.isGuest) {
        await _supabase.from('players').update({ elo: result.newEloB }).eq('id', p2Data.id);
    }
    
    await _supabase.from('matches').insert([{
        player1: winnerName, player2: loserName, winner: winnerName
    }]);

    // Aktivoitetaan hieno visualisointi
    showVictory(winnerName, result.newEloA, gain, p1Data.isGuest);
}

function showVictory(name, newElo, gain, isGuest = false) {
    document.getElementById('victory-player-name').innerText = name;
    document.getElementById('victory-elo-count').innerText = newElo;
    document.getElementById('victory-elo-gain').innerText = `+${gain} POINTS`;
    
    const overlay = document.getElementById('victory-overlay');
    
    // Poistetaan vanha vierasviesti jos sellainen oli
    const oldMsg = document.getElementById('guest-upsell');
    if(oldMsg) oldMsg.remove();

    if(isGuest) {
        const msg = document.createElement('div');
        msg.id = 'guest-upsell';
        msg.style = "margin-top: 20px; color: var(--sub-gold); font-family: 'Open Sans'; font-size: 0.85rem; max-width: 250px; background: rgba(255,215,0,0.1); padding: 10px; border-radius: 8px; border: 1px dashed var(--sub-gold);";
        msg.innerHTML = "🔥 <strong>Great win!</strong> Create a free account to start climbing the official Global Leaderboard.";
        // Lisätään viesti ennen Continue-nappia
        const btn = overlay.querySelector('button');
        overlay.insertBefore(msg, btn);
    }

    overlay.style.display = 'flex';
}

function closeVictoryOverlay() {
    // 1. Piilotetaan voittoilmoitus
    document.getElementById('victory-overlay').style.display = 'none';
    
    // 2. Nollataan Quick Match -kentät ilman sivun latausta
    document.getElementById('p1-quick-search').value = '';
    document.getElementById('p2-quick-search').value = '';
    quickP1 = null; 
    quickP2 = null;
    document.getElementById('elo-preview').style.display = 'none';

    // 3. Päivitetään leaderboard ja historia taustalla, jotta uudet pisteet näkyvät
    if (typeof fetchLB === "function") fetchLB();
    if (typeof fetchHist === "function") fetchHist();
    
    // 4. Varmistetaan, että pysytään turnaus-sivulla (missä Quick Match on)
    showPage('tournament'); 

    // POISTETTU: location.reload(); <-- Tämä aiheutti login-ruutuun hyppäämisen
    
    showNotification("Match saved!", "success");
}

function toggleTournamentMode() {
    const el = document.getElementById('advanced-tour-settings');
    if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}