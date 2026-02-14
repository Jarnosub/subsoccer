import { showNotification, showPage, loadUserProfile, populateCountries, cancelEditProfile, updateGuestUI, updateProfileCard } from './ui.js';
import { _supabase, state } from './config.js';
import { fetchAllGames } from './game-service.js';
import { initProModeUI, initClaimResult, startQuickMatch } from './quick-match.js';

export async function initApp() {
    try {
        const { data: players } = await _supabase.from('players').select('username');
        state.allDbNames = players ? players.map(p => p.username) : [];
        
        if (typeof fetchAllGames === 'function') await fetchAllGames();
        if (typeof populateCountries === 'function') await populateCountries();
    } catch (e) {
        console.error("Virhe alustuksessa:", e);
    }
}

export function toggleAuth(s) {
    document.getElementById('login-form').style.display = s ? 'none' : 'block';
    document.getElementById('signup-form').style.display = s ? 'block' : 'none';
}

export async function handleSignUp() {
    const u = document.getElementById('reg-user').value.trim().toUpperCase();
    const p = document.getElementById('reg-pass').value.trim();
    
    if(!u || !p) return showNotification("Fill all fields", "error");
    // TARKISTUS: Onko nimi jo varattu?
    const { data: existing } = await _supabase.from('players').select('id').eq('username', u).maybeSingle();
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

export async function handleAuth(event) {
    event.preventDefault();
    const u = document.getElementById('auth-user').value.trim().toUpperCase();
    const p = document.getElementById('auth-pass').value;
    
    try {
        // Haetaan kaikki sarakkeet mukaan lukien uudet full_name, email, phone, city
        let { data, error } = await _supabase.from('players').select('*').eq('username', u).maybeSingle();
        
        if (error) {
            console.error("Supabase error:", error);
            showNotification("Connection error. Please try again.", "error");
            return;
        }

        if(data && data.password === p) { 
            state.user = data; // Nyt state.user sisältää kaikki henkilötiedot
            startSession(); 
        } else {
            showNotification("Login failed. Check username or password.", "error");
        }
    } catch (e) {
        console.error("Login error:", e);
        showNotification("Login error: " + e.message, "error");
    }
}

export function handleGuest() {
    const g = document.getElementById('guest-nick').value.toUpperCase() || "GUEST"; state.user = { username: g, id: 'guest', elo: 1300, wins: 0 };
    if(!state.sessionGuests.includes(g)) state.sessionGuests.push(g); startSession();
}

export async function handleLogout() {
    if (_supabase) {
        const { error } = await _supabase.auth.signOut();
        if (error) console.error('Error logging out:', error);
        window.location.reload();
    } else {
        window.location.reload();
    }
}

function startSession() { 
    // Reset Quick Match UI to default state
    const startBtn = document.getElementById('start-quick-match');
    if (startBtn) {
        startBtn.textContent = 'START GAME';
        startBtn.style.background = ''; // Restore default CSS
        startBtn.onclick = startQuickMatch; // Restore original function
    }

    document.getElementById('auth-page').style.display = 'none'; 
    document.getElementById('app-content').style.display = 'flex'; 
    document.getElementById('nav-tabs').style.display = 'flex'; 
    const menuBtn = document.getElementById('menu-toggle-btn');
    if (menuBtn) {
        menuBtn.style.display = 'block';
    }
    
    // Contextual UI for Guests
    const eventsTab = document.getElementById('tab-events');
    if (state.user.id === 'guest') {
        if (eventsTab) eventsTab.style.display = 'none';
    } else {
        if (eventsTab) eventsTab.style.display = 'flex';
    }
    
    // Show Pro Mode only for developer (Jarno Saarinen)
    const proModeSection = document.getElementById('pro-mode-section');
    if (proModeSection && state.user.username === 'JARNO SAARINEN') {
        proModeSection.style.display = 'block';
    }
    
    if (typeof updateProfileCard === 'function') updateProfileCard(); 
    if (typeof updateGuestUI === 'function') updateGuestUI(); 
    if (typeof initProModeUI === 'function') initProModeUI(); 
    
    // Check for claim result params
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'claim_result') {
        const p1 = parseInt(params.get('p1_score')) || 0;
        const p2 = parseInt(params.get('p2_score')) || 0;
        const gameId = params.get('game_id');
        initClaimResult(p1, p2, gameId);
    } else {
        showPage('tournament'); 
    }
}

/**
 * Preview avatar file before upload
 */
export function previewAvatarFile(input) {
    const file = input.files[0];
    const fileNameDiv = document.getElementById('avatar-file-name');
    
    if (!file) {
        if (fileNameDiv) fileNameDiv.textContent = '';
        return;
    }
    
    // Show filename
    if (fileNameDiv) {
        fileNameDiv.textContent = `📷 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showNotification('Image too large (max 5MB)', 'error');
        input.value = '';
        if (fileNameDiv) fileNameDiv.textContent = '';
        return;
    }
    
    // Preview image
    const reader = new FileReader();
    reader.onload = (e) => {
        if (typeof updateAvatarPreview === 'function') {
            updateAvatarPreview(e.target.result);
        }
    };
    reader.readAsDataURL(file);
}

/**
 * Upload player avatar to Supabase Storage
 */
async function uploadPlayerAvatar(file) {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${state.user.id}_${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;
        
        console.log('Uploading avatar:', filePath);
        
        const { data, error } = await _supabase.storage
            .from('event-images')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });
        
        if (error) {
            console.error('Upload error:', error);
            throw error;
        }
        
        // Get public URL
        const { data: urlData } = _supabase.storage
            .from('event-images')
            .getPublicUrl(filePath);
        
        console.log('Avatar uploaded successfully:', urlData.publicUrl);
        return urlData.publicUrl;
        
    } catch (error) {
        console.error('Failed to upload avatar:', error);
        throw error;
    }
}

export async function saveProfile() {
    const btn = event?.target;
    const originalText = btn ? btn.textContent : '';
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Uploading...';
        }
        
        const fileInput = document.getElementById('avatar-file-input');
        const file = fileInput?.files[0];
        
        const fullName = document.getElementById('edit-full-name')?.value.trim();
        const email = document.getElementById('edit-email')?.value.trim();
        const phone = document.getElementById('edit-phone')?.value.trim();
        const city = document.getElementById('edit-city')?.value.trim();
        const countryCode = document.getElementById('country-input')?.value.trim().toLowerCase();
        
        let avatarUrl = state.user.avatar_url; // Keep existing if no new file
        
        // Upload new avatar if file selected
        if (file) {
            try {
                if (btn) btn.textContent = 'Uploading photo...';
                avatarUrl = await uploadPlayerAvatar(file);
            } catch (uploadError) {
                showNotification('Failed to upload photo: ' + uploadError.message, 'error');
                return;
            }
        }
        
        // Validate email if provided
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showNotification('Please enter a valid email address', 'error');
                return;
            }
        }
        
        // Prepare updates
        const updates = {
            full_name: fullName,
            email: email,
            phone: phone,
            city: city,
            country: countryCode,
            avatar_url: avatarUrl
        };

        if (Object.keys(updates).length === 0) {
            showNotification("Nothing to update", "error");
            return;
        }

        if (btn) btn.textContent = 'Saving...';
        
        const { error } = await _supabase.from('players').update(updates).eq('id', state.user.id);

        if (error) {
            showNotification("Error updating profile: " + error.message, "error");
        } else {
            // TÄRKEÄÄ: Päivitetään globaali tila, jotta sovellus 'muistaa' uudet tiedot
            state.user = { 
                ...state.user, 
                full_name: fullName, 
                email: email, 
                phone: phone, 
                city: city, 
                country: countryCode, 
                avatar_url: avatarUrl 
            };

            cancelEditProfile(); // Sulkee lomakkeen
            updateProfileCard(); // Päivittää visuaalisen kortin
            showNotification("Profile updated successfully!", "success");
        }
    } catch (error) {
        console.error('Save profile error:', error);
        showNotification('Error: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

// Globaalit kytkennät HTML:ää varten
window.handleAuth = handleAuth;
window.handleSignUp = handleSignUp;
window.handleGuest = handleGuest;
window.handleLogout = handleLogout;
window.initApp = initApp;
window.saveProfile = saveProfile;
window.previewAvatarFile = previewAvatarFile;
window.toggleAuth = toggleAuth;