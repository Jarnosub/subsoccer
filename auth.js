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
    if (typeof initProModeUI === 'function') initProModeUI(); 
    showPage('tournament'); 
}

async function showEditProfile() { 
    const fields = document.getElementById('profile-edit-fields'); 
    if(!fields) return;
    
    if(fields.style.display === 'none' || fields.style.display === '') {
        fields.style.display = 'block';
        
        // Show current avatar
        if (typeof updateAvatarPreview === 'function') {
            updateAvatarPreview(user.avatar_url || '');
        }
        
        // Set country dropdown
        document.getElementById('country-input').value = user.country || 'fi';
        
        // Clear file input
        const fileInput = document.getElementById('avatar-file-input');
        if (fileInput) fileInput.value = '';
        const fileNameDiv = document.getElementById('avatar-file-name');
        if (fileNameDiv) fileNameDiv.textContent = '';
        
        // Varmistetaan että maat on ladattu
        if (typeof populateCountries === 'function') await populateCountries();
    } else {
        fields.style.display = 'none';
    }
}

/**
 * Preview avatar file before upload
 */
function previewAvatarFile(input) {
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
        const fileName = `${user.id}_${Date.now()}.${fileExt}`;
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

async function saveProfile() {
    const btn = event?.target;
    const originalText = btn ? btn.textContent : '';
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Uploading...';
        }
        
        const fileInput = document.getElementById('avatar-file-input');
        const file = fileInput?.files[0];
        const countryCode = document.getElementById('country-input')?.value.trim().toLowerCase();
        
        let avatarUrl = user.avatar_url; // Keep existing if no new file
        
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
        
        // Prepare updates
        const updates = {};
        if (avatarUrl && avatarUrl !== user.avatar_url) updates.avatar_url = avatarUrl;
        if (countryCode && countryCode !== user.country) updates.country = countryCode;

        if (Object.keys(updates).length === 0) {
            showNotification("Nothing to update", "error");
            return;
        }

        if (btn) btn.textContent = 'Saving...';
        
        const { error } = await _supabase.from('players').update(updates).eq('id', user.id);

        if (error) {
            showNotification("Error updating profile: " + error.message, "error");
        } else {
            // Update local user object
            if (avatarUrl) user.avatar_url = avatarUrl;
            if (countryCode) user.country = countryCode;
            
            // Update UI
            if (typeof updateProfileCard === 'function') updateProfileCard();
            if (typeof updateAvatarPreview === 'function') updateAvatarPreview(user.avatar_url);
            
            showNotification("Profile updated!", "success");
            
            // Clear file input
            if (fileInput) fileInput.value = '';
            const fileNameDiv = document.getElementById('avatar-file-name');
            if (fileNameDiv) fileNameDiv.textContent = '';
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

// Globaalit kytkennät
window.handleAuth = handleAuth;
window.handleSignUp = handleSignUp;
window.handleGuest = handleGuest;
window.saveProfile = saveProfile;
window.showEditProfile = showEditProfile;
window.previewAvatarFile = previewAvatarFile;
window.initApp = initApp;