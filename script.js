const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co', _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const _supabase = window.supabase.createClient(_URL, _KEY);
let user = null, pool = [], sessionGuests = [], allDbNames = [];

async function initApp() { 
    const { data } = await _supabase.from('players').select('username');
    allDbNames = data ? data.map(p => p.username) : [];
}

function toggleAuth(s) { document.getElementById('login-form').style.display = s ? 'none' : 'block'; document.getElementById('signup-form').style.display = s ? 'block' : 'none'; }

async function handleSignUp() {
    const u = document.getElementById('reg-user').value.trim().toUpperCase(), p = document.getElementById('reg-pass').value.trim();
    if(!u || !p) return alert("Fill all fields");
    const { error } = await _supabase.from('players').insert([{ username: u, password: p, elo: 1300, wins: 0 }]);
    if(error) alert("Error: " + error.message); else { alert("Account created!"); toggleAuth(false); initApp(); }
}

async function handleAuth() {
    const u = document.getElementById('auth-user').value.trim().toUpperCase(), p = document.getElementById('auth-pass').value;
    let { data } = await _supabase.from('players').select('*').eq('username', u).single();
    if(data && data.password === p) { user = data; startSession(); } else alert("Login failed.");
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
    if(n && !pool.includes(n)) { pool.push(n); updatePoolUI(); } 
    i.value = ''; 
    document.getElementById('search-results').style.display = 'none'; 
}

function directAdd(n) { 
    if(!pool.includes(n)) { pool.push(n); updatePoolUI(); } 
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
    pool.splice(index, 1);
    updatePoolUI();
}

function clearPool() { pool = []; updatePoolUI(); }

function showPage(p) { document.querySelectorAll('.section').forEach(s => s.classList.remove('active')); document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.getElementById('section-' + p).classList.add('active'); document.getElementById('tab-' + p).classList.add('active'); if(p === 'leaderboard') fetchLB(); if(p === 'history') fetchHist(); }
async function fetchLB() { const { data } = await _supabase.from('players').select('*').order('elo', {ascending: false}); document.getElementById('lb-data').innerHTML = data ? data.map((p, i) => `<div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #222;"><span>#${i+1} ${p.username}</span><span>${p.elo} ELO</span></div>`).join('') : ""; }
async function fetchHist() { const { data } = await _supabase.from('tournament_history').select('*').order('created_at', {ascending: false}); document.getElementById('hist-list').innerHTML = data ? data.map(h => `<div style="background:#000; padding:15px; border-radius:10px; border-left:4px solid var(--sub-gold); margin-bottom:10px;">🏆 ${h.winner_name}<br><small>${h.tournament_name}</small></div>`).join('') : "No history."; }

let rP = [], rW = [];
function startTournament() { if(pool.length < 2) return alert("Min 2 players!"); document.getElementById('tour-setup').style.display = 'none'; document.getElementById('tour-engine').style.display = 'flex'; rP = [...pool]; rW = []; drawRound(); }

function drawRound() {
    const area = document.getElementById('bracket-area');
    area.innerHTML = '';

    // Jos vain yksi pelaaja jäljellä, hän on voittaja.
    if (rP.length === 1) {
        area.innerHTML = `<div class='winner-display'>WINNER: ${rP[0]}</div>`;
        document.getElementById('save-btn').style.display = 'block';
        document.getElementById('next-rd-btn').style.display = 'none';
        return;
    }

    // Jos pelaajia on pariton määrä, yksi saa vapaalipun.
    if (rP.length % 2 !== 0) {
        const lucky = rP.pop();
        rW.push(lucky);
        area.innerHTML += `<div class='match-bye'>${lucky} (BYE)</div>`;
    }

    // Arvo loput otteluparit.
    for (let i = 0; i < rP.length; i += 2) {
        area.innerHTML += `
            <div class='match'>
                <div class='p-name' onclick='pickWin(this, "${rP[i+1]}")'>${rP[i]}</div>
                <div class='p-name' onclick='pickWin(this, "${rP[i]}")'>${rP[i+1]}</div>
            </div>`;
    }

    document.getElementById('next-rd-btn').style.display = 'block';
    document.getElementById('save-btn').style.display = 'none';

function pickWin(elem, loserName) {
    const match = elem.parentElement;
    const winnerName = elem.innerText;

    // Estä tuplaklikkaukset
    if (match.dataset.locked) return;
    match.dataset.locked = 'true';

    // Visuaalinen palaute
    elem.style.backgroundColor = 'var(--sub-red)';
    elem.style.color = 'var(--sub-white)';
    
    Array.from(match.children).forEach(child => {
        if (child !== elem) {
            child.style.opacity = '0.5';
            child.style.backgroundColor = '#111';
        }
    });

    // Lisää voittaja listaan
    rW.push(winnerName);
}
function advanceRound() { rP = rW.filter(w => w); document.getElementById('next-rd-btn').style.display = 'none'; drawRound(); }

async function saveTour() {
    const winnerName = rP[0];
    if (!winnerName) {
        console.error("Winner could not be determined.");
        alert("Error saving tournament: Winner not found.");
        // Reset UI to a safe state
        pool = [];
        rP = [];
        rW = [];
        updatePoolUI();
        document.getElementById('tour-engine').style.display = 'none';
        document.getElementById('tour-setup').style.display = 'block';
        return;
    }
    
    pool = []; // Tyhjennetään heti

    const tournamentName = document.getElementById('tour-name-input').value || "Tournament";
    
    try {
        // Tallenna turnauksen historia
        await _supabase.from('tournament_history').insert([{ 
            tournament_name: tournamentName, 
            winner_name: winnerName,
            user_id: user.id,
            created_at: new Date().toISOString()
        }]);

        // Päivitä voittajan statistiikat
        const { data: dbWinner } = await _supabase.from('players').select('*').eq('username', winnerName).single();
        if (dbWinner) {
            const newElo = (dbWinner.elo || 1300) + 25;
            const newWins = (dbWinner.wins || 0) + 1;
            await _supabase.from('players').update({ elo: newElo, wins: newWins }).eq('id', dbWinner.id);
            if (user && user.id === dbWinner.id) { 
                user.elo = newElo; 
                user.wins = newWins; 
                updateProfileCard(); 
            }
        }

        // Nollaa ja päivitä käyttöliittymä
        updatePoolUI();
        document.getElementById('tour-engine').style.display = 'none';
        document.getElementById('tour-setup').style.display = 'block';
        showPage('history');

    } catch (error) {
        console.error("Error in saveTour:", error);
        alert("An error occurred while saving the tournament. Please check the console for details.");
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
