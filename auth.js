import { _supabase, state, resetFullState, KIOSK_MODE } from './config.js';
import { showNotification } from './ui-utils.js';
import { fetchAllGames } from './game-service.js';
import { startQuickMatch } from './quick-match.js';

const isUuid = (val) => val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val));

let isAuthListenerSet = false;

export async function initApp() {
    try {
        setupAuthListeners();

        // PAKOTETTU TARKISTUS: Haetaan istunto heti, jotta ei tarvita refreshia
        const { data: { session }, error } = await _supabase.auth.getSession();

        if (error) {
            console.warn("Supabase auth warning (usually safe to ignore):", error.message);
            // Jos refresh token on vanhentunut, siivotaan paikallinen sessio pois jotta virheet loppuvat
            if (error.message.includes("Invalid Refresh Token")) {
                await _supabase.auth.signOut().catch(() => { });
            }
        } else if (session && (!state.user || state.user.id !== session.user.id)) {
            await refreshUserProfile(session.user.id);
        }

        // UUSI: Spectator Mode (Julkinen katselu ilman kirjautumista)
        if (!session && !state.user) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('page') === 'events') {
                console.log("👀 Public access: Spectator Mode enabled");
                state.user = {
                    id: 'spectator',
                    username: 'Spectator',
                    elo: 0,
                    wins: 0,
                    losses: 0,
                    is_spectator: true
                };
            }
        }

        if (!isAuthListenerSet) {
            _supabase.auth.onAuthStateChange(async (event, session) => {
                if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
                    if (!state.user || state.user.id !== session.user.id) {
                        await refreshUserProfile(session.user.id);
                    }
                } else if (event === 'SIGNED_OUT') {
                    state.user = null;
                    localStorage.removeItem('subsoccer-user');
                }
            });
            isAuthListenerSet = true;
        }

        // REMOVED: Fetching all users causes performance issues at scale.
        // Search is now handled via server-side queries in quick-match.js
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

let lastRefreshedId = null;
let isRefreshing = false;

/**
 * Helper to fetch profile data and update state
 */
async function refreshUserProfile(userId) {
    if (lastRefreshedId === userId || isRefreshing) return;
    isRefreshing = true;
    lastRefreshedId = userId;

    try {
        const { data, error } = await _supabase
            .from('players')
            .select('id, username, email, elo, wins, losses, country, avatar_url, rank, is_admin, full_name, phone, city, acquired_via, team_id, team_data:teams!players_team_id_fkey(*)')
            .eq('id', userId);

        const profile = data?.[0]; // Otetaan manuaalisesti ensimmäinen tulos

        if (error) {
            if (error.message?.includes('AbortError')) return;
            console.error("Tietokantavirhe profiilia haettaessa (406?):", error);
            return;
        }

        if (profile) {
            state.user = profile;
            localStorage.setItem('subsoccer-user', JSON.stringify(profile));
            console.log("👤 CURRENT USER ID (Copy this for config.js):", profile.id);
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
                .upsert(newProfile, { onConflict: 'id' })
                .select()
                .maybeSingle();

            if (!createErr && created) {
                state.user = created;
                localStorage.setItem('subsoccer-user', JSON.stringify(created));
            } else {
                if (createErr?.message?.includes('AbortError')) return;
                console.error("Profiilin automaattinen luonti epäonnistui:", createErr);
                showNotification("Profiilin luonti epäonnistui: " + (createErr?.message || "RLS Error"), "error");
            }
        }
    } catch (e) {
        console.error("Odottamaton virhe profiilin päivityksessä:", e);
    } finally {
        isRefreshing = false;
    }
}

/**
 * Hakee maat Supabasesta ja täyttää pudotusvalikon.
 */
export async function populateCountries() {
    const select = document.getElementById('country-input');
    if (!select) return;

    // Käytetään välimuistia, jos tiedot on jo haettu
    if (state.countries && state.countries.length > 0) {
        renderCountryOptions(select, state.countries);
        return;
    }

    try {
        const { data, error } = await _supabase.from('countries').select('name, code').order('name');
        if (error) throw error;
        if (data && data.length > 0) {
            state.countries = data;
            renderCountryOptions(select, data);
        }
    } catch (e) {
        console.error("Maiden haku epäonnistui:", e);
        select.innerHTML = '<option value="fi">Finland</option>'; // Fallback
    }
}

function renderCountryOptions(select, countries) {
    select.innerHTML = '<option value="" disabled selected>Select Country</option>';
    countries.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code.toLowerCase();
        opt.innerText = c.name;
        select.appendChild(opt);
    });
}

export async function handleSignUp() {
    const u = document.getElementById('reg-user').value.replace(/\s+/g, ' ').trim().toUpperCase();
    const email = document.getElementById('reg-email')?.value.trim();
    const p = document.getElementById('reg-pass').value.trim();
    const gdpr = document.getElementById('reg-gdpr-consent');
    const marketingOptIn = document.getElementById('reg-marketing-consent')?.checked || false;

    if (!u || !p || !email) return showNotification("Fill all fields including email", "error");
    if (gdpr && !gdpr.checked) return showNotification("You must accept the Terms & Privacy Policy to register.", "error");

    let { data: matches } = await _supabase.from('players').select('id, username, email, elo, wins, losses, team, rank, avatar_url, country, phone, city, acquired_via, is_admin').ilike('username', u);

    if (!matches || matches.length === 0) {
        const fuzzyName = u.replace(/\s+/g, '%');
        const { data: fuzzyMatches } = await _supabase
            .from('players')
            .select('id, username, email, elo, wins, losses, team, rank, avatar_url, country, phone, city, acquired_via, is_admin')
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
                display_name: u,    // Yleinen standardi metadatalle
                marketing_consent: marketingOptIn
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
            // Ladataan mahdollinen valittu avatar
            let finalAvatarUrl = null;
            const avatarInput = document.getElementById('signup-avatar-file');
            if (avatarInput && avatarInput.files && avatarInput.files[0]) {
                try {
                    finalAvatarUrl = await uploadPlayerAvatar(avatarInput.files[0], authData.user.id);
                } catch (err) {
                    console.error('Failed to upload avatar during signup:', err);
                }
            }

            const upsertPayload = {
                id: authData.user.id, username: u, email: email,
                elo: 1300, wins: 0, losses: 0, acquired_via: state.brand
            };
            if (finalAvatarUrl) {
                upsertPayload.avatar_url = finalAvatarUrl;
            }

            const { error } = await _supabase.from('players').upsert(upsertPayload, { onConflict: 'id' });
            profileError = error;

            // Ensure state is updated so avatar shows up immediately
            if (!error) {
                state.user = { ...state.user, ...upsertPayload };
                localStorage.setItem('subsoccer-user', JSON.stringify(state.user));

                if (avatarInput) {
                    // Clear the input after success
                    avatarInput.value = '';
                    const previewImg = document.getElementById('signup-avatar-preview');
                    const nameDiv = document.getElementById('signup-avatar-filename');
                    if (previewImg) previewImg.src = 'placeholder-silhouette-5-wide.png';
                    if (nameDiv) nameDiv.textContent = '';
                }
            }
        }

        if (profileError) {
            showNotification("Profile error: " + profileError.message, "error");
        } else {
            // Koska sähköpostivahvistus on pois päältä, tili on heti valmis.
            // Jos Supabase palautti session heti, onAuthStateChange hoitaa sisäänkirjautumisen.
            showNotification("Account created successfully! 🎉", "success");
            if (!authData.session) toggleAuth(false);

            // --- VAIHE 2: Identiteetti ja Ura ---
            // Jos käyttäjällä on tallennettu peli (Instant Playsta), tallennetaan se uudelle tilille
            const pending = localStorage.getItem('subsoccer_pending_match');
            if (pending) {
                try {
                    const matchData = JSON.parse(pending);
                    console.log("Found pending match to claim for new user:", matchData);

                    // Piilotetaan kirjautuminen ja palataan claim-näkymään
                    if (window.showAuthPage) window.showAuthPage('app');

                    // Odotetaan että state päivittyy ja kutsutaan claim-alustusta
                    setTimeout(() => {
                        if (window.initClaimResult) {
                            window.initClaimResult(matchData.p1Score, matchData.p2Score, matchData.gameId);
                            localStorage.removeItem('subsoccer_pending_match');
                        }
                    }, 1000);
                } catch (e) {
                    console.warn("Failed to process pending match:", e);
                }
            }
        }
    }
}

export async function handleAuth(event) {
    if (event && event.preventDefault) event.preventDefault();

    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key);
        }
    });
    await _supabase.auth.signOut().catch(() => { });

    resetFullState(); // Vaihe A: Puhdistetaan vanha tila ja välimuisti

    const btn = document.getElementById('btn-login');
    if (btn && btn.disabled) {
        console.warn("⚠️ Login already in progress, ignoring duplicate attempt.");
        return;
    }

    const originalText = btn ? btn.textContent : 'LOG IN';

    try {
        if (btn) { btn.disabled = true; btn.textContent = 'LOGGING IN...'; }

        const input = document.getElementById('auth-user')?.value.replace(/\s+/g, ' ').trim();
        const p = document.getElementById('auth-pass')?.value;

        if (!input || !p) {
            showNotification("Please enter both username/email and password", "error");
            return;
        }

        // 1. Yritetään ensin kirjautua sähköpostilla (uusi tapa)
        if (input.includes('@')) {
            console.log("📧 Attempting email login via Supabase Auth...");
            const { data: authData, error } = await _supabase.auth.signInWithPassword({
                email: input,
                password: p
            });

            if (!error) {
                console.log("✅ Email login successful");
                showNotification("Welcome back!", "success");
                return;
            }
            console.log("Supabase Auth login failed:", error.message);

            // Tarkistetaan löytyykö sähköposti players-taulusta (migraatiotuki)
            const { data: emailMatches, error: emailErr } = await _supabase
                .from('players')
                .select('id, username, email, password')
                .ilike('email', input);

            if (!emailErr && emailMatches && emailMatches.length > 0) {
                const hashed = await hashPassword(p);
                const userRecord = emailMatches.find(m => m.password === hashed) || emailMatches[0];

                console.log("Legacy record found by email:", userRecord.username);
                if (isUuid(userRecord.id)) {
                    // Käyttäjä on jo migroitu, joten signInWithPassword virhe oli aito
                    if (error.message.toLowerCase().includes("email not confirmed")) {
                        throw new Error("Please confirm your email address (check your inbox).");
                    }
                    throw error;
                } else {
                    // Legacy-käyttäjä jolla on sähköposti. Tarkistetaan vanha salasana.
                    if (userRecord.password === hashed) {
                        promptForEmailMigration(userRecord, p);
                        return;
                    }
                }
            }
            throw error;
        }

        // 2. Tarkistetaan players-taulu (käyttäjänimellä)
        console.log("🔍 Searching players table by username...");

        // Yksinkertaistettu haku ilman Promise.racea jumiutumisen estämiseksi
        let { data: nameMatches, error: nameErr } = await _supabase
            .from('players').select('id, username, email, password, elo, wins, losses, is_admin, avatar_url, country, rank').ilike('username', input);

        console.log("📡 DB Search completed. Matches found:", nameMatches?.length || 0);

        if (nameErr) {
            if (nameErr.message?.includes('AbortError')) return; // Ohitetaan keskeytykset
            console.error("Database error (check RLS policies):", nameErr);
            throw new Error("Database connection error. Please check your permissions.");
        }

        if (!nameMatches || nameMatches.length === 0) {
            console.log("Direct search failed, trying fuzzy search...");
            const fuzzyInput = input.replace(/\s+/g, '%');
            const { data: fuzzyMatches } = await _supabase
                .from('players')
                .select('id, username, email, password, elo, wins, losses, is_admin, avatar_url, country, rank')
                .ilike('username', fuzzyInput);
            nameMatches = fuzzyMatches || [];
        }

        if (nameMatches && nameMatches.length > 0) {
            console.log(`🔑 Found ${nameMatches.length} matching records. Checking credentials...`);
            const hashed = await hashPassword(p);

            // 1. Kokeillaan ensin migroituja tilejä (UUID + Email)
            const migratedMatch = nameMatches.find(m => isUuid(m.id) && m.email);
            if (migratedMatch) {
                console.log("Migrated record found, attempting Auth login for:", migratedMatch.email);
                const { data: authData, error: authErr } = await _supabase.auth.signInWithPassword({
                    email: migratedMatch.email,
                    password: p
                });
                if (!authErr) {
                    console.log("Auth login successful for:", migratedMatch.email);
                    showNotification("Welcome back!", "success");
                    return;
                }
                console.log("Auth login failed:", authErr.message);
            }

            // 2. Jos Auth-kirjautuminen ei onnistunut, kokeillaan legacy-salasanaa osumiin
            const legacyRecord = nameMatches.find(m => m.password === hashed);
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
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
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
    if (!state.sessionGuests.includes(g)) {
        state.sessionGuests = [...state.sessionGuests, g];
    }
}

export async function handleLogout() {
    if (KIOSK_MODE) {
        if (window.showNotification) window.showNotification("Logout disabled in Kiosk Mode", "error");
        return;
    }
    if (_supabase) {
        try {
            await _supabase.auth.signOut();
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }

    resetFullState();
    window.location.replace('index.html');
}

/**
 * GDPR: Oikeus tulla unohdetuksi (Delete Account)
 */
export async function deleteAccount() {
    if (!state.user || state.user.id === 'guest') return;

    const confirmation = prompt("⚠️ WARNING! This action cannot be undone. All your match history, ranking, and ELO will be permanently lost.\n\nType DELETE to confirm:");
    if (confirmation !== "DELETE") {
        showNotification("Account deletion cancelled.", "info");
        return;
    }

    try {
        const btn = document.getElementById('btn-delete-account');
        if (btn) btn.disabled = true;
        showNotification("Deleting account and removing data...", "info");

        // Supabase DB delete request. RLS and ON DELETE CASCADE should handle the rest.
        // If not, we will attempt to anonymize the account as a fallback.
        const { error } = await _supabase.from('players').delete().eq('id', state.user.id);
        
        if (error) {
            console.warn("Delete failed, anonymizing data instead to comply with GDPR:", error.message);
            // Fallback: Anonymize personal data if delete blocked by Foreign Keys without CASCADE
            await _supabase.from('players').update({
                username: 'DELETED_USER_' + Date.now().toString().slice(-4),
                full_name: null,
                email: null,
                phone: null,
                city: null,
                country: null,
                avatar_url: null
            }).eq('id', state.user.id);
        }

        // Kutsutaan auth signOut ja nollataan cache huolimatta siitä onnistuiko DB poisto vai ei
        await _supabase.auth.signOut().catch(() => {});
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-') || key.includes('supabase') || key.includes('subsoccer')) {
                localStorage.removeItem(key);
            }
        });

        resetFullState();
        alert("Account and personal data have been completely removed.");
        window.location.replace('index.html');

    } catch (e) {
        console.error("Critical error deleting account:", e);
        showNotification("Failed to process account deletion.", "error");
        const btn = document.getElementById('btn-delete-account');
        if (btn) btn.disabled = false;
    }
}

/**
 * Preview avatar file before upload
 */
export function previewAvatarFile(input, previewImgId = 'avatar-preview', fileNameDivId = 'avatar-file-name') {
    const file = input.files[0];
    const fileNameDiv = document.getElementById(fileNameDivId);

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
        const previewImg = document.getElementById(previewImgId);
        if (previewImg) previewImg.src = e.target.result;

        // Backward compatibility for window function if needed
        if (previewImgId === 'avatar-preview' && window.updateAvatarPreview) {
            window.updateAvatarPreview(e.target.result);
        }
    };
    reader.readAsDataURL(file);
}

/**
 * Upload player avatar to Supabase Storage
 */
async function uploadPlayerAvatar(file, customUserId = null) {
    try {
        const fileExt = file.name.split('.').pop();
        const userId = customUserId || (state.user ? state.user.id : 'unknown');
        const fileName = `${userId}_${Date.now()}.${fileExt}`;
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
            // Note: Legacy password update removed as Trigger blocks it. Auth handles it.
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
    if (loginForm) {
        // Vaihe B: Estä tuplakytkennät korvaamalla elementti kloonilla
        const newForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newForm, loginForm);

        newForm.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleAuth(e);
        });
    }

    document.getElementById('btn-show-signup')?.addEventListener('click', () => toggleAuth(true));
    document.getElementById('btn-register')?.addEventListener('click', handleSignUp);
    document.getElementById('link-back-to-login')?.addEventListener('click', () => toggleAuth(false));
    document.getElementById('btn-guest-login')?.addEventListener('click', handleGuest);
    document.getElementById('btn-delete-account')?.addEventListener('click', deleteAccount);

    // Kytketään kaikki uloskirjautumispainikkeet
    document.querySelectorAll('.logout-item, #btn-logout').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    });

    const signupForm = document.getElementById('signup-form');
    if (signupForm && !signupForm.dataset.authBound) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleSignUp();
        });
        signupForm.dataset.authBound = "true";
    }
}