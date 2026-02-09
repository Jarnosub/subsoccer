async function initApp() {
    try {
        const { data: players } = await _supabase.from('players').select('username');
        allDbNames = players ? players.map(p => p.username) : [];
        
        if (typeof fetchAllGames === 'function') await fetchAllGames();
        if (typeof populateCountries === 'function') await populateCountries();
    } catch (e) {
        console.error("Virhe alustuksessa:", e);
    }
}

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
        if (typeof toggleAuth === 'function') toggleAuth(false); 
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

function startSession() { 
    document.getElementById('auth-page').style.display = 'none'; 
    document.getElementById('app-content').style.display = 'flex'; 
    document.getElementById('label-user').innerText = user.username; 
    if (typeof updateProfileCard === 'function') updateProfileCard(); 
    if (typeof updateGuestUI === 'function') updateGuestUI(); 
    showPage('tournament'); 
}

async function showEditProfile() { 
    const fields = document.getElementById('profile-edit-fields'); 
    if(!fields) return;
    
    if(fields.style.display === 'none' || fields.style.display === '') {
        fields.style.display = 'block';
        // Populate fields
        document.getElementById('avatar-url-input').value = user.avatar_url || '';
        if (typeof updateAvatarPreview === 'function') updateAvatarPreview(user.avatar_url || '');
        document.getElementById('country-input').value = user.country || 'fi';
        
        // Varmistetaan että maat on ladattu
        if (typeof populateCountries === 'function') await populateCountries();
    } else {
        fields.style.display = 'none';
    }
}

async function saveProfile() {
    const btn = event?.target;
    const originalText = btn ? btn.textContent : '';
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
        }
        
        const avatarUrl = document.getElementById('avatar-url-input').value.trim();
        const countryCode = document.getElementById('country-input').value.trim().toLowerCase();
        
        const updates = {};
        if (avatarUrl) updates.avatar_url = avatarUrl;
        if (countryCode) updates.country = countryCode;

        if (Object.keys(updates).length === 0) {
            showNotification("Nothing to update", "error");
            return;
        }

        const { error } = await _supabase.from('players').update(updates).eq('id', user.id);

        if (error) {
            showNotification("Error updating profile: " + error.message, "error");
        } else {
            if (avatarUrl) user.avatar_url = avatarUrl;
            if (countryCode) user.country = countryCode;
            if (typeof updateProfileCard === 'function') updateProfileCard();
            showNotification("Profile updated!", "success");
            document.getElementById('avatar-url-input').value = '';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

// Globaalit kytkennät
window.handleAuth = handleAuth;
window.handleSignUp = handleSignUp;
window.handleGuest = handleGuest;
window.saveProfile = saveProfile;
window.showEditProfile = showEditProfile;
window.initApp = initApp;