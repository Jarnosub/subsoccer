import { _supabase, state } from './config.js';
import { showNotification } from './ui-utils.js';
import { fetchAllGames } from './game-service.js';
import { startQuickMatch } from './quick-match.js';

export async function initApp() {
    try {
        setupAuthListeners();
        const { data: players } = await _supabase.from('players').select('username');
        state.allDbNames = players ? players.map(p => p.username) : [];
        
        if (typeof fetchAllGames === 'function') await fetchAllGames();
        if (window.populateCountries) window.populateCountries();
    } catch (e) {
        console.error("Virhe alustuksessa:", e);
    }
}

export function toggleAuth(s) {
    document.getElementById('login-form').style.display = s ? 'none' : 'block';
    document.getElementById('signup-form').style.display = s ? 'block' : 'none';
}

/**
 * Luo turvallisen SHA-256 tiivisteen salasanasta.
 */
async function hashPassword(password) {
    if (!window.crypto || !crypto.subtle) {
        console.error("SHA-256 hashing requires a secure context (HTTPS or localhost).");
        throw new Error("Insecure context: Hashing failed");
    }
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
    const hashedPassword = await hashPassword(p);
    
    const userData = { 
        username: u, 
        password: hashedPassword, 
        elo: 1300, wins: 0, losses: 0,
        acquired_via: state.brand // Tallennetaan brändi, jonka kautta käyttäjä tuli
    };

    const { error } = await _supabase.from('players').insert([userData]);
    if(error) showNotification("Error: " + error.message, "error"); 
    else { 
        showNotification("Account created!", "success"); 
        toggleAuth(false); 
        initApp(); 
    }
}

export async function handleAuth(event) {
    if (event && event.preventDefault) event.preventDefault();
    const u = document.getElementById('auth-user').value.trim().toUpperCase();
    const p = document.getElementById('auth-pass').value;
    
    try {
        // Käytetään ilike-hakua, jotta kirjainkoko ei estä vanhojen käyttäjien löytymistä
        let { data, error } = await _supabase.from('players').select('*').ilike('username', u).maybeSingle();
        
        if (error) {
            console.error("Supabase error:", error);
            showNotification("Connection error. Please try again.", "error");
            return;
        }

        if (!data) {
            showNotification("User not found.", "error");
            return;
        }

        const hashedPassword = await hashPassword(p);

        // Tarkistetaan täsmääkö tiiviste TAI selväkielinen salasana (migraatiotuki)
        if(data.password === hashedPassword || data.password === p) { 
            // Jos käyttäjä kirjautui vielä vanhalla selväkielisellä salasanalla, päivitetään se tiivisteeksi
            if (data.password === p) {
                await _supabase.from('players').update({ password: hashedPassword }).eq('id', data.id);
                data.password = hashedPassword;
            }
            state.user = data; 
            // UI päivittyy automaattisesti ui.js:n subscribe-kuuntelijan kautta
        } else {
            showNotification("Login failed. Check username or password.", "error");
        }
    } catch (e) {
        console.error("Login error:", e);
        showNotification("Login error: " + e.message, "error");
    }
}

export function handleGuest() {
    const g = document.getElementById('guest-nick').value.toUpperCase() || "GUEST"; state.user = { username: g, id: 'guest', elo: 1300, wins: 0, losses: 0 };
    if(!state.sessionGuests.includes(g)) state.sessionGuests.push(g);
    // UI päivittyy automaattisesti
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
        if (window.updateAvatarPreview) {
            window.updateAvatarPreview(e.target.result);
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

/**
 * Generoi AI-avatar (Placeholder tulevaa integraatiota varten)
 */
async function generateAiAvatar(imageUrl) {
    console.log("AI Stylizing image:", imageUrl);
    // Tähän tulee myöhemmin kutsu AI-rajapintaan
    return imageUrl;
}

export async function saveProfile(e) {
    const btn = e?.target || (window.event ? window.event.target : null);
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
        const newPassword = document.getElementById('edit-password')?.value.trim();
        
        let avatarUrl = state.user.avatar_url; // Keep existing if no new file
        const useAiStylize = document.getElementById('use-ai-style-checkbox')?.checked;
        
        // Upload new avatar if file selected
        if (file) {
            try {
                if (btn) btn.textContent = 'Uploading photo...';
                const uploadedUrl = await uploadPlayerAvatar(file);
                
                if (useAiStylize) {
                    if (btn) btn.textContent = 'AI Stylizing...';
                    avatarUrl = await generateAiAvatar(uploadedUrl);
                } else {
                    avatarUrl = uploadedUrl;
                }
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

        // Jos uusi salasana on annettu, tiivistetään se
        if (newPassword) {
            if (btn) btn.textContent = 'Securing...';
            updates.password = await hashPassword(newPassword);
        }

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
            localStorage.setItem('subsoccer-user', JSON.stringify(state.user));

            // UI päivittyy automaattisesti state.user muutoksesta
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

/**
 * Programmatic event listeners. 
 * Removes the need for 'window.xxx' and inline 'onclick' in HTML.
 */
export function setupAuthListeners() {
    const loginForm = document.getElementById('auth-form-wrapper');
    if (loginForm) loginForm.addEventListener('submit', handleAuth);
    document.getElementById('btn-show-signup')?.addEventListener('click', () => toggleAuth(true));
    document.getElementById('btn-register')?.addEventListener('click', handleSignUp);
    document.getElementById('link-back-to-login')?.addEventListener('click', () => toggleAuth(false));
    document.getElementById('btn-guest-login')?.addEventListener('click', handleGuest);
    document.getElementById('btn-logout')?.addEventListener('click', () => location.reload());

    const signupForm = document.getElementById('signup-form');
    if (signupForm) signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSignUp();
    });
}