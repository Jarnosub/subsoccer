const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co', _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const _supabase = window.supabase.createClient(_URL, _KEY);
let user = null, pool = [], sessionGuests = [], allDbNames = [];

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
}

function toggleAuth(s) { document.getElementById('login-form').style.display = s ? 'none' : 'block'; document.getElementById('signup-form').style.display = s ? 'block' : 'none'; }

async function handleSignUp() {
    const u = document.getElementById('reg-user').value.trim().toUpperCase(), p = document.getElementById('reg-pass').value.trim();
    if(!u || !p) return showNotification("Fill all fields", "error");
    const { error } = await _supabase.from('players').insert([{ username: u, password: p, elo: 1300, wins: 0 }]);
    if(error) showNotification("Error: " + error.message, "error"); else { showNotification("Account created!", "success"); toggleAuth(false); initApp(); }
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

function updateProfileCard() { 
    document.getElementById('card-name').innerText = user.username; 
    document.getElementById('card-wins').innerText = user.wins; 
    document.getElementById('card-elo').innerText = user.elo; 
}

function updatePoolUI() {
    const list = document.getElementById('pool-list');
    list.innerHTML = ''; // Tyhjennetään vanha teksti
    
    if (pool.length === 0) {
        list.innerText = "No players added.";
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
    
    if(document.getElementById('pool-count')) document.getElementById('pool-count').innerText = pool.length;
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

function showPage(p) { document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.getElementById('section-' + p).classList.add('active'); document.getElementById('tab-' + p).classList.add('active'); if(p === 'leaderboard') fetchLB(); if(p === 'history') fetchHist(); }
async function fetchLB() { const { data } = await _supabase.from('players').select('*').order('elo', {ascending: false}); document.getElementById('lb-data').innerHTML = data ? data.map((p, i) => `<div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #222;"><span>#${i+1} ${p.username}</span><span>${p.elo} ELO</span></div>`).join('') : ""; }
async function fetchHist() { const { data } = await _supabase.from('tournament_history').select('*').order('created_at', {ascending: false}); document.getElementById('hist-list').innerHTML = data ? data.map(h => `<div style="background:#000; padding:15px; border-radius:10px; border-left:4px solid var(--sub-gold); margin-bottom:10px;">🏆 ${h.winner_name}<br><small>${h.tournament_name}</small></div>`).join('') : "No history."; }

let rP = [], rW = [];
function startTournament() { 
    if(pool.length < 2) return showNotification("Min 2 players!", "error"); 
    document.getElementById('tour-setup').style.display = 'none'; 
    document.getElementById('tour-engine').style.display = 'flex'; 
    document.getElementById('save-btn').style.display = 'none'; // Piilota tallennusnappi uuden turnauksen alussa
    rP = [...pool]; 
    rW = []; 
    drawRound(); 
}

function drawRound() {
    const a = document.getElementById('bracket-area'); a.innerHTML = ""; rW = []; 
    if(rP.length === 1 && pool.length > 1) { 
        a.innerHTML = `<div class="container" style="text-align:center;"><h2>🏆 WINNER: ${rP[0]}</h2></div>`; 
        document.getElementById('save-btn').style.display = 'block'; 
        document.getElementById('next-rd-btn').style.display = 'none';
        return; 
    }
    for(let i=0; i < rP.length; i += 2) {
        const p1 = rP[i], p2 = rP[i+1], m = document.createElement('div'); m.className = "bracket-match"; m.style.background="#111"; m.style.border="1px solid #222"; m.style.borderRadius="10px"; m.style.marginBottom="10px"; m.style.width="100%"; m.style.overflow="hidden";
        if(!p2) { m.innerHTML = `<div style="padding:15px; opacity:0.5; font-family:'Russo One';">${p1} (BYE)</div>`; rW[i/2] = p1; } else { m.innerHTML = `<div style="padding:15px; cursor:pointer; font-family:'Russo One';" onclick="pickWin(${i/2}, '${p1}', this)">${p1}</div><div style="padding:15px; cursor:pointer; font-family:'Russo One'; border-top:1px solid #222;" onclick="pickWin(${i/2}, '${p2}', this)">${p2}</div>`; }
        a.appendChild(m);
    }
    if (rW.filter(w => w).length === Math.ceil(rP.length / 2)) {
        document.getElementById('next-rd-btn').style.display = 'block';
    }
}

function pickWin(idx, n, e) { rW[idx] = n; e.parentElement.querySelectorAll('div').forEach(d => d.style.background="transparent"); e.style.background = "rgba(227, 6, 19, 0.4)"; if(rW.filter(w => w).length === Math.ceil(rP.length/2)) document.getElementById('next-rd-btn').style.display = 'block'; }
function advanceRound() { rP = rW.filter(w => w); document.getElementById('next-rd-btn').style.display = 'none'; drawRound(); }

async function saveTour() {
    const winnerName = rP[0];
    const tournamentName = document.getElementById('tour-name-input').value || "Tournament";
    await _supabase.from('tournament_history').insert([{ tournament_name: tournamentName, winner_name: winnerName }]);

    const { data: dbWinner } = await _supabase.from('players').select('*').eq('username', winnerName).single();
    if (dbWinner) {
        const newElo = (dbWinner.elo || 1300) + 25;
        const newWins = (dbWinner.wins || 0) + 1;
        await _supabase.from('players').update({ elo: newElo, wins: newWins }).eq('id', dbWinner.id);
        if (user && user.id === dbWinner.id) { user.elo = newElo; user.wins = newWins; updateProfileCard(); }
    }

    pool = []; updatePoolUI();
    document.getElementById('tour-engine').style.display = 'none';
    document.getElementById('tour-setup').style.display = 'block';
    showPage('history');
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
