import { _supabase, _URL, _KEY, state, resetFullState, KIOSK_MODE } from './config.js';
import { showNotification } from './ui-utils.js';
import { fetchAllGames } from './game-service.js';
import { startQuickMatch } from './quick-match.js';

const isUuid = (val) => val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val));

let isAuthListenerSet = false;

// Security fix #12: Client-side rate limiter for login attempts
const loginAttempts = [];
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60000; // 60 seconds

function isRateLimited() {
    const now = Date.now();
    // Remove attempts outside the window
    while (loginAttempts.length > 0 && now - loginAttempts[0] > LOGIN_WINDOW_MS) {
        loginAttempts.shift();
    }
    return loginAttempts.length >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt() {
    loginAttempts.push(Date.now());
}

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
                    const isE2ETest = navigator.webdriver || window.location.search.includes('e2e=true');
                    if (window.location.pathname.includes('login') && !isE2ETest) {
                        // Varmistetaan että profiili on välimuistissa ennen redirectiä
                        if (!state.user || state.user.id !== session.user.id) {
                            await refreshUserProfile(session.user.id);
                        }
                        window.location.replace('index.html');
                        return;
                    }

                    // Normal in-app flow (other pages)
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
        // Yritetään ensin teams-joinilla, ja jos se epäonnistuu (406), haetaan ilman joinia
        let data, error;
        ({ data, error } = await _supabase
            .from('players')
            .select('*, team_data:teams!players_team_id_fkey(*)')
            .eq('id', userId));

        if (error) {
            if (error.message?.includes('AbortError')) return;
            console.warn("Teams join failed (406?), retrying without join:", error.message);
            // Fallback: haetaan ilman teams-joinia
            ({ data, error } = await _supabase
                .from('players')
                .select('*')
                .eq('id', userId));
            if (error) {
                if (error.message?.includes('AbortError')) return;
                console.error("Tietokantavirhe profiilia haettaessa:", error);
            }
        }

        const profile = data?.[0]; // Otetaan manuaalisesti ensimmäinen tulos

        if (profile) {
            state.user = profile;
            localStorage.setItem('subsoccer-user', JSON.stringify(profile));
            console.log("👤 CURRENT USER ID (Copy this for config.js):", profile.id);
        } else {
            // Profiili puuttuu players-taulusta, mutta käyttäjä on Auth-istunnossa.
            // Luodaan profiili automaattisesti käyttäen Auth-metadatan tietoja.
            console.log("Profiili puuttuu, luodaan automaattisesti ID:lle:", userId);
            const { data: { user } } = await _supabase.auth.getUser();
            const userEmail = user?.email;

            // Tarkistetaan ensin, onko tällä sähköpostilla jo legacy-profiili taulussa
            if (userEmail) {
                const { data: emailMatch } = await _supabase
                    .from('players')
                    .select('*')
                    .ilike('email', userEmail);

                const legacyProfile = emailMatch?.[0];
                if (legacyProfile && legacyProfile.id !== userId) {
                    console.log("🔄 Legacy profile found by email, migrating:", legacyProfile.id, "→", userId);
                    // Päivitetään vanhan profiilin ID uuteen Google OAuth UUID:hen
                    const { id: oldId, ...profileData } = legacyProfile;
                    
                    // Luodaan uusi rivi uudella UUID:llä ja vanhoilla tiedoilla
                    const { data: migrated, error: migrateErr } = await _supabase
                        .from('players')
                        .upsert({ ...profileData, id: userId, email: userEmail }, { onConflict: 'id' })
                        .select()
                        .maybeSingle();
                    
                    if (!migrateErr && migrated) {
                        // Poistetaan vanha legacy-rivi
                        await _supabase.from('players').delete().eq('id', oldId);
                        state.user = migrated;
                        localStorage.setItem('subsoccer-user', JSON.stringify(migrated));
                        console.log("✅ Legacy profile migrated successfully to Google OAuth UUID");
                    } else {
                        console.error("Legacy migration failed:", migrateErr);
                        // Fallback: käytetään vanhaa profiilia suoraan
                        state.user = legacyProfile;
                        localStorage.setItem('subsoccer-user', JSON.stringify(legacyProfile));
                    }
                    return; // Profiilin migraatio tehty, ei tarvitse luoda uutta
                } else if (legacyProfile && legacyProfile.id === userId) {
                    // Profiili on jo oikealla UUID:llä (ehkä aiempi haku epäonnistui joinilla)
                    state.user = legacyProfile;
                    localStorage.setItem('subsoccer-user', JSON.stringify(legacyProfile));
                    return;
                }
            }

            // Ei löytynyt legacy-profiilia — luodaan kokonaan uusi
            const newProfile = {
                id: userId,
                username: user?.user_metadata?.full_name?.toUpperCase() || user?.user_metadata?.username || userEmail?.split('@')[0].toUpperCase() || 'PLAYER',
                email: userEmail,
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
    // Custom order matching the user's exact specification
    const order = ['fi', 'us', 'gb', 'sg', 'ph', 'id', 'de', 'cz', 'cs', 'cn', 'dk', 'fr', 'no', 'in', 'az', 'hk', 'mx', 'tr', 'ca', 'se', 'es', 'ja', 'jp', 'vi'];

    // Sort according to custom order array, then fallback to alphabetical
    const sorted = [...countries].sort((a, b) => {
        const codeA = a.code.toLowerCase();
        const codeB = b.code.toLowerCase();
        let idxA = order.indexOf(codeA);
        let idxB = order.indexOf(codeB);
        
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        
        if (idxA !== idxB) {
            return idxA - idxB;
        }
        return a.name.localeCompare(b.name);
    });

    select.innerHTML = '<option value="" disabled selected>Select Country</option>';
    sorted.forEach(c => {
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

    if (!u || !p || !email) return showNotification("Fill all fields including email", "error");

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
            // Ladataan mahdollinen valittu avatar
            let finalAvatarUrl = null;
            
            // Priority 1: AI-generated avatar URL (already in Storage, no re-upload needed)
            const aiAvatarUrl = window.getSignupAiAvatarUrl ? window.getSignupAiAvatarUrl() : null;
            if (aiAvatarUrl) {
                console.log('📸 Using AI avatar URL from Storage:', aiAvatarUrl);
                finalAvatarUrl = aiAvatarUrl;
            }
            
            // Priority 2: AI-generated avatar (base64, legacy fallback)
            if (!finalAvatarUrl) {
                const aiAvatarB64 = window.getSignupAiAvatar ? window.getSignupAiAvatar() : null;
                if (aiAvatarB64) {
                    try {
                        console.log('📸 Uploading AI avatar (base64) for new user...');
                        const byteCharacters = atob(aiAvatarB64);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const blob = new Blob([new Uint8Array(byteNumbers)], {type: 'image/png'});
                        const path = `avatars/${authData.user.id}_ai_${Date.now()}.png`;
                        
                        const { error: uploadError } = await _supabase.storage
                            .from('event-images')
                            .upload(path, blob, {
                                cacheControl: '3600',
                                upsert: true,
                                contentType: 'image/png'
                            });
                        
                        if (!uploadError) {
                            const { data: urlData } = _supabase.storage
                                .from('event-images')
                                .getPublicUrl(path);
                                
                            finalAvatarUrl = urlData.publicUrl;
                            console.log('✅ AI avatar uploaded:', finalAvatarUrl);
                        } else {
                            console.error('AI avatar upload failed:', uploadError);
                        }
                    } catch (err) {
                        console.error('Failed to upload AI avatar during signup:', err);
                    }
                }
            }
            
            // Priority 2: File upload
            if (!finalAvatarUrl) {
                const avatarInput = document.getElementById('signup-avatar-file');
                if (avatarInput && avatarInput.files && avatarInput.files[0]) {
                    try {
                        finalAvatarUrl = await uploadPlayerAvatar(avatarInput.files[0], authData.user.id);
                    } catch (err) {
                        console.error('Failed to upload avatar during signup:', err);
                    }
                }
            }
            
            // Priority 3: Preset avatar selection
            if (!finalAvatarUrl) {
                const selectedAvatar = document.getElementById('signup-selected-avatar')?.value;
                if (selectedAvatar && selectedAvatar !== 'ai-custom' && selectedAvatar.startsWith('avatar-')) {
                    finalAvatarUrl = window.location.origin + '/' + selectedAvatar;
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

                const avatarFileInput = document.getElementById('signup-avatar-file');
                if (avatarFileInput) {
                    // Clear the input after success
                    avatarFileInput.value = '';
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

        // Security fix #12: Rate limit login attempts
        if (isRateLimited()) {
            const waitSec = Math.ceil((LOGIN_WINDOW_MS - (Date.now() - loginAttempts[0])) / 1000);
            showNotification(`Too many login attempts. Please wait ${waitSec} seconds.`, "error");
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
                .select('*')
                .ilike('email', input);

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
        console.log("🔍 Searching players table by username...");

        // Yksinkertaistettu haku ilman Promise.racea jumiutumisen estämiseksi
        let { data: nameMatches, error: nameErr } = await _supabase
            .from('players').select('*').ilike('username', input);

        console.log("📡 DB Search completed. Matches found:", nameMatches?.length || 0);

        if (nameErr) {
            if (nameErr.message?.includes('AbortError')) return; // Ohitetaan keskeytykset
            console.error("Database error (check RLS policies):", nameErr);
            throw new Error("Database connection error. Please check your permissions.");
        }

        // Security fix #12: Removed fuzzy/wildcard search from login — exact match only
        // Fuzzy search allowed username enumeration without rate limits

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
        recordLoginAttempt(); // Security fix #12: track failed attempts
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
 * Compress and resize an image file using HTML5 Canvas
 * @param {File|Blob} file The input image file
 * @param {number} maxDim Maximum width or height
 * @param {number} quality JPEG quality (0.0 to 1.0)
 * @returns {Promise<Blob>} The compressed JPEG blob
 */
function compressImage(file, maxDim = 512, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            return resolve(file);
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxDim) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    }
                } else {
                    if (height > maxDim) {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas toBlob returned null'));
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

/**
 * Upload player avatar to Supabase Storage
 */
async function uploadPlayerAvatar(file, customUserId = null) {
    try {
        console.log('Original avatar file size:', (file.size / 1024).toFixed(1), 'KB');
        
        let fileToUpload = file;
        try {
            fileToUpload = await compressImage(file, 512, 0.8);
            console.log('Compressed avatar file size:', (fileToUpload.size / 1024).toFixed(1), 'KB');
        } catch (compressErr) {
            console.warn('Image compression failed, uploading original:', compressErr);
        }

        const fileExt = 'jpg'; // Always upload as jpg after compression
        const userId = customUserId || (state.user ? state.user.id : 'unknown');
        const fileName = `${userId}_${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        console.log('Uploading avatar:', filePath);

        const { data, error } = await _supabase.storage
            .from('event-images')
            .upload(filePath, fileToUpload, {
                cacheControl: '3600',
                upsert: false,
                contentType: 'image/jpeg'
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

        const usernameInput = document.getElementById('edit-username')?.value.trim();
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
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
                return;
            }
        }

        if (usernameInput) { // Only validate if a username was provided
            if (usernameInput.length < 2) {
                showNotification('Gamertag must be at least 2 characters', 'error');
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
                return;
            }
            if (usernameInput.includes(' ')) {
                showNotification('Gamertag cannot contain spaces', 'error');
                if (btn) { btn.textContent = originalText; btn.disabled = false; }
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

        if (usernameInput && usernameInput !== state.user.username) {
            updates.username = usernameInput;
        }

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
            if (error.code === '23505') {
                showNotification("This Gamertag is already taken. Choose another.", "error");
            } else {
                showNotification("Error updating profile: " + error.message, "error");
            }
        } else {
            // TÄRKEÄÄ: Päivitetään globaali tila, jotta sovellus 'muistaa' uudet tiedot
            state.user = {
                ...state.user,
                username: updates.username || state.user.username,
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

export async function signInWithGoogle() {
    try {
        const { error } = await _supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/login.html'
            }
        });
        if (error) throw error;
    } catch (e) {
        console.error("Google login failed:", e);
        showNotification(e.message || "Google login failed", "error");
    }
}

export async function signInWithApple() {
    try {
        const isWKWebView = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers['apple-sign-in'];
        if (isWKWebView) {
            return new Promise((resolve, reject) => {
                window.handleAppleSignInResult = async (token, error) => {
                    delete window.handleAppleSignInResult;
                    if (error) {
                        console.error("Native Apple sign in error:", error);
                        // User cancelled or error, do not show alert if it was user cancellation
                        if (error.indexOf("Canceled") === -1 && error.indexOf("cancelled") === -1) {
                            showNotification(error, "error");
                        }
                        reject(new Error(error));
                        return;
                    }
                    if (!token) {
                        reject(new Error("No token returned"));
                        return;
                    }
                    try {
                        const { data, error: authError } = await _supabase.auth.signInWithIdToken({
                            provider: 'apple',
                            token: token
                        });
                        if (authError) throw authError;
                        
                        // Redirect or reload page to update UI after login
                        window.location.reload();
                        resolve(data);
                    } catch (e) {
                        console.error("Supabase Apple ID token sign in failed:", e);
                        showNotification(e.message || "Apple login failed", "error");
                        reject(e);
                    }
                };
                window.webkit.messageHandlers['apple-sign-in'].postMessage({});
            });
        }

        const { error } = await _supabase.auth.signInWithOAuth({
            provider: 'apple',
            options: {
                redirectTo: window.location.origin + '/login.html'
            }
        });
        if (error) throw error;
    } catch (e) {
        console.error("Apple login failed:", e);
        showNotification(e.message || "Apple login failed", "error");
    }
}

export async function deleteAccount() {
    // Step 1: Confirm with user
    const confirmed = confirm(
        'Are you sure you want to DELETE your account?\n\n' +
        'This will permanently delete:\n' +
        '• Your player profile\n' +
        '• All game history\n' +
        '• Your leaderboard rankings\n\n' +
        'This action CANNOT be undone.'
    );
    if (!confirmed) return;

    // Security fix #15: Re-authenticate before deletion
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        showNotification('You must be logged in to delete your account.', 'error');
        return;
    }

    const email = session.user?.email;
    if (!email) {
        showNotification('Cannot verify identity — no email linked to account.', 'error');
        return;
    }

    const password = prompt('To confirm your identity, please enter your password:');
    if (!password) {
        showNotification('Account deletion cancelled.', 'error');
        return;
    }

    // Re-authenticate with Supabase
    const { error: reAuthError } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (reAuthError) {
        showNotification('Incorrect password. Account deletion cancelled.', 'error');
        return;
    }

    const btn = document.getElementById('btn-delete-account');
    const originalHTML = btn ? btn.innerHTML : '';

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
        }

        // Get current session token
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) {
            showNotification('You must be logged in to delete your account.', 'error');
            return;
        }

        // Call Netlify function
        const response = await fetch('/.netlify/functions/delete-account', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete account');
        }

        // Success — sign out and redirect
        showNotification('Account deleted successfully.', 'success');
        await _supabase.auth.signOut();
        resetFullState();
        setTimeout(() => {
            window.location.replace('index.html');
        }, 1500);

    } catch (error) {
        console.error('Delete account error:', error);
        showNotification('Error: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
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
    document.getElementById('btn-google-login')?.addEventListener('click', signInWithGoogle);
    document.getElementById('btn-google-signup')?.addEventListener('click', signInWithGoogle);
    document.getElementById('btn-apple-login')?.addEventListener('click', signInWithApple);
    document.getElementById('btn-apple-signup')?.addEventListener('click', signInWithApple);
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