import { _supabase, state } from './config.js';
import { showNotification } from './ui-utils.js';
import { fetchAllGames } from './game-service.js';
import { startQuickMatch } from './quick-match.js';

const isUuid = (val) => val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val));

export async function initApp() {
    try {
        setupAuthListeners();

        // Tarkistetaan onko olemassa oleva istunto
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            await refreshUserProfile(session.user.id);
        }

        // Kuunnellaan kirjautumistilan muutoksia
        _supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                await refreshUserProfile(session.user.id);
            } else if (event === 'SIGNED_OUT') {
                state.user = null;
                localStorage.removeItem('subsoccer-user');
            }
        });

        const { data: players } = await _supabase.from('players').select('username');
        state.allDbNames = players ? players.map(p => p.username) : [];
        
        if (typeof fetchAllGames === 'function') await fetchAllGames();
        await populateCountries();
    } catch (e) {
        console.error("Virhe alustuksessa:", e);
    }
}

export function toggleAuth(s) {
    document.getElementById('login-form').style.display = s ? 'none' : 'block';
    document.getElementById('signup-form').style.display = s ? 'block' : 'none';
}

/**
 * Luo SHA-256 tiivisteen vanhojen käyttäjien tarkistusta varten.
 */
async function hashPassword(password) {
    if (!window.crypto || !crypto.subtle) {
        console.warn("SHA-256 requires HTTPS or localhost. Falling back to plain text for legacy check.");
        return password;
    }
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper to fetch profile data and update state
 */
async function refreshUserProfile(userId) {
    try {
        const { data: profile, error } = await _supabase
            .from('players')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        
        if (error) {
            console.error("Tietokantavirhe profiilia haettaessa (406?):", error);
            return; // Älä kirjaudu ulos, jos kyseessä on yhteys/skeemavirhe
        }

        if (profile) {
            state.user = profile;
            localStorage.setItem('subsoccer-user', JSON.stringify(profile));
        } else {
            // Profiili puuttuu players-taulusta, mutta käyttäjä on Auth-istunnossa.
            // Luodaan profiili automaattisesti käyttäen Auth-metadatan tietoja.
            console.log("Profiili puuttuu, luodaan automaattisesti ID:lle:", userId);
            const { data: { user } } = await _supabase.auth.getUser();
            
            const newProfile = {
                id: userId,
                username: user?.user_metadata?.username || user?.email?.split('@')[0].toUpperCase() || 'PLAYER',
                email: user?.email,
                elo: 1300,
                wins: 0,
                losses: 0,
                is_admin: false
            };

            const { data: created, error: createErr } = await _supabase
                .from('players')
                .upsert(newProfile, { onConflict: 'email' })
                .select()
                .maybeSingle();

            if (!createErr && created) {
                state.user = created;
                localStorage.setItem('subsoccer-user', JSON.stringify(created));
            } else {
                console.error("Profiilin automaattinen luonti epäonnistui:", createErr);
                showNotification("Profiilin luonti epäonnistui: " + (createErr?.message || "RLS Error"), "error");
                // Odota 5 sekuntia ennen uloskirjausta, jotta ehdit lukea virheen
                setTimeout(() => handleLogout(), 5000);
            }
        }
    } catch (e) {
        console.error("Odottamaton virhe profiilin päivityksessä:", e);
    }
}

/**
 * Hakee maat Supabasesta ja täyttää pudotusvalikon.
 */
export async function populateCountries() {
    const select = document.getElementById('country-input');
    if (!select) return;

    try {
        const { data, error } = await _supabase.from('countries').select('name, code').order('name');
        if (error) throw error;

        if (data && data.length > 0) {
            select.innerHTML = '<option value="" disabled selected>Select Country</option>';
            data.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.code.toLowerCase();
                opt.innerText = c.name;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Maiden haku epäonnistui:", e);
        select.innerHTML = '<option value="fi">Finland</option>'; // Fallback
    }
}

export async function handleSignUp() {
    const u = document.getElementById('reg-user').value.replace(/\s+/g, ' ').trim().toUpperCase();
    const email = document.getElementById('reg-email')?.value.trim();
    const p = document.getElementById('reg-pass').value.trim();
    
    if(!u || !p || !email) return showNotification("Fill all fields including email", "error");
    
    // Tarkistetaan onko nimi jo varattu (huomioidaan eri välilyönnit)
    let { data: matches } = await _supabase.from('players').select('*').ilike('username', u);
    
    if (!matches || matches.length === 0) {
        const fuzzyName = u.replace(/\s+/g, '%');
        const { data: fuzzyMatches } = await _supabase
            .from('players')
            .select('*')
            .ilike('username', fuzzyName);
        matches = fuzzyMatches || [];
    }

    // Etsitään ensisijaisesti legacy-rivi (ei UUID:tä) tai jo migroitu rivi
    let existing = matches.find(m => !isUuid(m.id)) || matches[0];
    
    // Supabase Auth vaatii yleensä vähintään 6 merkkiä
    if (p.length < 6) {
        return showNotification("New security policy requires at least 6 characters. Please choose a longer password.", "error");
    }

    // 1. Luodaan Auth-käyttäjä Supabaseen
    let { data: authData, error: authError } = await _supabase.auth.signUp({
        email: email,
        password: p,
        options: { 
            data: { 
                username: u,
                full_name: u,      // Näkyy Supabase Dashboardissa
                display_name: u    // Yleinen standardi metadatalle
            } 
        }
    });

    // Tarkistetaan onko sähköposti jo varattu (huomioidaan eri virheviestit)
    const isAlreadyReg = authError && (
        authError.message.toLowerCase().includes("already registered") || 
        authError.message.toLowerCase().includes("already been registered") || 
        authError.status === 422 ||
        authError.code === 'user_already_exists'
    );
    if (isAlreadyReg) {
        console.log("Email already in Auth, attempting to verify password via sign-in...");
        const { data: signInData, error: signInError } = await _supabase.auth.signInWithPassword({
            email: email,
            password: p
        });

        if (signInError) {
            console.error("Migration sign-in failed:", signInError);
            return showNotification("This email is already in use. Please use the correct password or a different email.", "error");
        }
        
        authData = signInData;
        authError = null;
    }

    if (authError) return showNotification(authError.message, "error");

    // 2. Päivitetään vanha profiili tai luodaan uusi
    if (authData.user) {
        let profileError;
        
        if (existing) {
            console.log("Migrating existing record:", existing.username, "ID:", existing.id, "to UUID:", authData.user.id);
            
            const oldId = existing.id;
            const newId = authData.user.id;

            // Jos ID on jo sama (käyttäjä on jo migroitu mutta sähköposti puuttui players-taulusta)
            if (oldId === newId) {
                console.log("User already has correct UUID, updating email only...");
                await _supabase.from('players').update({ email: email }).eq('id', newId);
                showNotification("Account updated successfully! 🎉", "success");
                if (!authData.session) toggleAuth(false);
                return;
            }

            // 1. Varmistetaan että uusi UUID-rivi on olemassa ja siinä on vanhat tilastot
            // (Tämä hoitaa tilanteen jossa Auth-luonti loi tyhjän rivin triggerillä)
            const { data: checkNew } = await _supabase.from('players').select('id').eq('id', newId).maybeSingle();
            
            const { id, username, ...playerStats } = existing;
            const updatePayload = { ...playerStats, email: email };

            if (checkNew) {
                console.log("Updating existing UUID record with legacy stats...");
                await _supabase.from('players').update(updatePayload).eq('id', newId);
            } else {
                console.log("Creating new UUID record with legacy stats...");
                // Käytetään väliaikaista nimeä jos alkuperäinen on vielä varattu vanhalla rivillä
                await _supabase.from('players').insert([{ ...updatePayload, id: newId, username: username + '_MIGRATING' }]);
            }

            // 2. Viittaukset päivittyvät nyt automaattisesti tietokannassa (ON UPDATE CASCADE)
            // Meidän tarvitsee vain varmistaa, että kaikki taulut, joita ei ole linkitetty FK:lla, päivitetään.
            // Mutta useimmat on nyt linkitetty.
            console.log("Database cascade handling references...");

            // 3. Poistetaan vanha legacy-rivi ja palautetaan oikea käyttäjänimi
            console.log("Finalizing migration...");
            await _supabase.from('players').delete().eq('id', oldId);
            const { error: finalError } = await _supabase.from('players').update({ username: username }).eq('id', newId);
            profileError = finalError;
        } else {
            // NEW USER: Luodaan kokonaan uusi pelaaja
            const { error } = await _supabase.from('players').insert([{
                id: authData.user.id, username: u, email: email,
                elo: 1300, wins: 0, losses: 0, acquired_via: state.brand
            }]);
            profileError = error;
        }
        
        if (profileError) {
            showNotification("Profile error: " + profileError.message, "error");
        } else {
            // Koska sähköpostivahvistus on pois päältä, tili on heti valmis.
            // Jos Supabase palautti session heti, onAuthStateChange hoitaa sisäänkirjautumisen.
            showNotification("Account created successfully! 🎉", "success");
            if (!authData.session) toggleAuth(false);
        }
    }
}

export async function handleAuth(event) {
    if (event && event.preventDefault) event.preventDefault();
    const input = document.getElementById('auth-user').value.replace(/\s+/g, ' ').trim();
    const p = document.getElementById('auth-pass').value;
    
    try {
        console.log("--- LOGIN ATTEMPT (Localhost) ---");
        console.log("Input:", input);
        // 1. Yritetään ensin kirjautua sähköpostilla (uusi tapa)
        if (input.includes('@')) {
            const { data: authData, error } = await _supabase.auth.signInWithPassword({
                email: input,
                password: p
            });
            
            if (!error) {
                showNotification("Welcome back!", "success");
                return;
            }
            console.log("Supabase Auth login failed:", error.message);
            
            // Tarkistetaan löytyykö sähköposti players-taulusta (migraatiotuki)
            const { data: emailMatches, error: emailErr } = await _supabase
                .from('players')
                .select('*')
                .eq('email', input);
                
            if (!emailErr && emailMatches && emailMatches.length > 0) {
                const hashed = await hashPassword(p);
                const userRecord = emailMatches.find(m => m.password === hashed || m.password === p) || emailMatches[0];
                
                console.log("Legacy record found by email:", userRecord.username);
                if (isUuid(userRecord.id)) {
                    // Käyttäjä on jo migroitu, joten signInWithPassword virhe oli aito
                    if (error.message.toLowerCase().includes("email not confirmed")) {
                        throw new Error("Please confirm your email address (check your inbox).");
                    }
                    throw error;
                } else {
                    // Legacy-käyttäjä jolla on sähköposti. Tarkistetaan vanha salasana.
                    if (userRecord.password === hashed || userRecord.password === p) {
                        promptForEmailMigration(userRecord, p);
                        return;
                    }
                }
            }
            throw error;
        }

        // 2. Tarkistetaan players-taulu (käyttäjänimellä)
        console.log("Searching players table by username...");
        let { data: nameMatches, error: nameErr } = await _supabase
            .from('players')
            .select('*')
            .ilike('username', input);
            
        if (nameErr) {
            console.error("Database error (check RLS policies):", nameErr);
            throw new Error("Database connection error. Please check your permissions.");
        }

        if (!nameMatches || nameMatches.length === 0) {
            console.log("Direct search failed, trying fuzzy search...");
            const fuzzyInput = input.replace(/\s+/g, '%');
            const { data: fuzzyMatches } = await _supabase
                .from('players')
                .select('*')
                .ilike('username', fuzzyInput);
            nameMatches = fuzzyMatches || [];
        }

        if (nameMatches && nameMatches.length > 0) {
            console.log(`Found ${nameMatches.length} matching records. Checking passwords...`);
            const hashed = await hashPassword(p);
            
            // 1. Kokeillaan ensin migroituja tilejä (UUID + Email)
            const migratedMatch = nameMatches.find(m => isUuid(m.id) && m.email);
            if (migratedMatch) {
                console.log("Migrated record found, attempting Auth login for:", migratedMatch.email);
                const { error: authErr } = await _supabase.auth.signInWithPassword({
                    email: migratedMatch.email,
                    password: p
                });
                if (!authErr) {
                    showNotification("Welcome back!", "success");
                    return;
                }
                console.log("Auth login failed:", authErr.message);
            }

            // 2. Jos Auth-kirjautuminen ei onnistunut, kokeillaan legacy-salasanaa osumiin
            const legacyRecord = nameMatches.find(m => m.password === hashed || m.password === p);
            if (legacyRecord) {
                console.log("Legacy password match found for ID:", legacyRecord.id);
                promptForEmailMigration(legacyRecord, p);
                return;
            }
        }

        // Jos pääsimme tänne asti, mikään rivi ei toiminut
        throw new Error("Invalid login credentials. If you recently upgraded, your secure password might be different from your old one.");
    } catch (e) {
        console.error("Login error:", e);
        const msg = e.message || "An error occurred during login.";
        showNotification(msg.includes("Invalid login credentials") ? "Invalid email or password." : msg, "error");
    }
}

/**
 * Pyytää vanhaa käyttäjää syöttämään sähköpostin tilin päivittämiseksi.
 */
function promptForEmailMigration(user, password) {
    const defaultEmail = user.email || '';
    const msg = defaultEmail 
        ? `Welcome back ${user.username}! \n\nWe've upgraded our security. Confirm your email to continue:`
        : `Welcome back ${user.username}! \n\nWe've upgraded our security. Please enter your email address to continue:`;

    const email = prompt(msg, defaultEmail);
    
    if (email && email.includes('@')) {
        // Luodaan uusi Auth-tili vanhoilla tiedoilla
        document.getElementById('reg-user').value = user.username;
        document.getElementById('reg-email').value = email;
        document.getElementById('reg-pass').value = password;
        
        showNotification("Upgrading your account...", "success");
        handleSignUp();
    } else {
        showNotification("Email is required to access your account.", "error");
    }
}

export function handleGuest() {
    const g = document.getElementById('guest-nick').value.toUpperCase() || "GUEST"; 
    const guestUser = { username: g, id: 'guest', elo: 1300, wins: 0, losses: 0 };
    state.user = guestUser;
    localStorage.setItem('subsoccer-user', JSON.stringify(guestUser));
    if(!state.sessionGuests.includes(g)) state.sessionGuests.push(g);
}

export async function handleLogout() {
    localStorage.removeItem('subsoccer-user');
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

        // Update password via Supabase Auth if provided
        if (newPassword) {
            if (btn) btn.textContent = 'Updating Security...';
            const { error: pwdError } = await _supabase.auth.updateUser({ password: newPassword });
            if (pwdError) {
                showNotification("Password update failed: " + pwdError.message, "error");
                return;
            }
            // Sync password with players table to keep username login working
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
    document.getElementById('btn-logout')?.addEventListener('click', () => handleLogout());

    const signupForm = document.getElementById('signup-form');
    if (signupForm) signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSignUp();
    });
}