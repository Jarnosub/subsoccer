import { _supabase, state, isAdmin } from './config.js';
import { showNotification, showModal, closeModal, showLoading, hideLoading, safeHTML, unsafeHTML } from './ui-utils.js';
import { BracketEngine } from './bracket-engine.js';
import { MatchService } from './match-service.js';

/**
 * ============================================================
 * SUBSOCCER EVENT CALENDAR SYSTEM
 * Frontend JavaScript for Event Management
 * ============================================================
 */

// Apufunktio päivämäärän muotoiluun input-kenttää varten
const formatForInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// Apufunktio ajan pyöristämiseen seuraavaan 15 minuutin intervaliin
const getRoundedTime = (date = new Date(), minutes = 15) => {
    const ms = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
};

let selectedEventImage = null;
let selectedBrandLogo = null;
// MARKER: UNIQUE_FILE_IDENTITY_CHECK_A1
export let currentEventId = null;
let currentEventTournamentId = null;
let currentEventTournamentName = null;

// Bracket state variables (in-memory, like Tournament Mode)
const bracketStateCache = {};
let eventRoundPlayers = [];
let eventRoundWinners = [];
let eventFinalists = [];
let eventBronzeContenders = [];
let eventBronzeWinner = null;
let currentEventBracketParticipants = [];

/**
 * Load events page - main entry point
 */
export async function loadEventsPage() {
    console.log("📅 Event system ready");
    const container = document.getElementById('events-view');
    if (!container) return;

    showLoading('Loading Events...');

    try {
        const now = new Date();
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);

        // Timeout promise to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timed out')), 15000)
        );

        // Haetaan tapahtumat: ei peruutettuja, max 3kk vanhat
        const queryPromise = _supabase
            .from('events')
            .select('*')
            .neq('status', 'cancelled')
            .gte('start_datetime', threeMonthsAgo.toISOString())
            .order('start_datetime', { ascending: true });

        const { data: allEvents, error } = await Promise.race([queryPromise, timeoutPromise]);

        if (error) throw error;

        const events = allEvents || [];
        const activeEvents = [];
        const pastEvents = [];

        events.forEach(event => {
            const startDate = new Date(event.start_datetime);
            // Jos loppuaika on määritelty, käytetään sitä. Muuten oletus 3h kesto.
            const endDate = event.end_datetime ? new Date(event.end_datetime) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
            
            if (endDate < now) {
                pastEvents.push(event);
            } else {
                activeEvents.push(event);
            }
        });

        // Järjestetään menneet käänteiseen aikajärjestykseen (uusin mennyt ensin)
        pastEvents.sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime));

        // Näytetään: Tulevat/Käynnissä ensin, menneet lopussa
        renderEventsPage([...activeEvents, ...pastEvents]);
    } catch (e) {
        console.error('Failed to load events:', e);
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--sub-red);">
                <i class="fa fa-exclamation-circle" style="font-size:2rem; margin-bottom:10px;"></i><br>
                Failed to load events<br>
                <span style="font-size:0.8rem; color:#666;">${e.message || 'Unknown error'}</span><br>
                <button onclick="loadEventsPage()" class="btn-red" style="margin-top:15px; width:auto; display:inline-block; font-size:0.8rem;">TRY AGAIN</button>
            </div>
        `;
    } finally {
        hideLoading();
    }
}

/**
 * Render the events page UI
 */
function renderEventsPage(events) {
    const container = document.getElementById('events-view');
    if (!container) return;

    const eventsList = events.length === 0 ? safeHTML`
            <div style="text-align:center; padding:60px 20px; color:#444;">
                <i class="fa-solid fa-calendar-xmark" style="font-size:3rem; margin-bottom:15px; opacity:0.2;"></i>
                <div style="font-size:0.9rem; letter-spacing:1px;">NO UPCOMING EVENTS</div>
            </div>
    ` : events.map(event => renderEventCard(event));

    // Piilotetaan luontinapit vierailta ja katsojilta
    const canCreate = state.user && state.user.id !== 'guest' && state.user.id !== 'spectator';

    const setupHtml = canCreate ? safeHTML`
        <h2 class="section-title" style="margin-top: 20px; font-size: 0.8rem; color: #555; letter-spacing: 3px; font-family: var(--sub-name-font);">EVENT SETUP</h2>
        
        <div style="text-align:center; margin-bottom:25px;">
            <button class="tour-mode-toggle" onclick="showCreateEventForm()" style="width:100%; justify-content:center; padding:15px;">
                <i class="fa-solid fa-calendar-plus" style="margin-right:8px; color:var(--sub-gold);"></i> CREATE EVENT
            </button>
        </div>
        
        <div id="create-event-form" style="display:none;"></div>
    ` : '';

    container.innerHTML = safeHTML`
        ${setupHtml}
        <div style="display:flex; align-items:center; gap:15px; margin:30px 0 20px 0;">
            <div style="height:1px; background:#333; flex:1;"></div>
            <div style="font-family:var(--sub-name-font); color:#666; font-size:0.8rem; letter-spacing:2px;">UPCOMING EVENTS</div>
            <div style="height:1px; background:#333; flex:1;"></div>
        </div>
        <div id="events-list" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:20px;">
            ${eventsList}
        </div>
    `;
}

/**
 * Render a single event card
 */
function renderEventCard(event) {
    const startDate = new Date(event.start_datetime);
    const dayOfWeek = startDate.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
    const dateStr = startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    const timeStr = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const eventTypeColors = {
        tournament: 'var(--sub-gold)',
        league: '#4CAF50',
        casual: '#888'
    };
    const typeColor = eventTypeColors[event.event_type] || '#888';

    return safeHTML`
        <div class="event-card sub-card" style="padding:0; overflow:hidden; border:1px solid #333; transition:transform 0.2s; position:relative; background:#111;">
            ${event.image_url ? safeHTML`
                <div style="height:180px; background:url('${event.image_url}') center/cover; position:relative;">
                    <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.8) 100%);"></div>
                    <div style="position:absolute; top:15px; right:15px;">
                        <span class="sub-badge" style="background:${typeColor}; color:#000; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
                            ${event.event_type}
                        </span>
                    </div>
                </div>
            ` : safeHTML`
                <div style="height:100px; background:linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); position:relative; border-bottom:1px solid #333;">
                    <div style="position:absolute; top:15px; right:15px;">
                        <span class="sub-badge" style="background:${typeColor}; color:#000;">
                            ${event.event_type}
                        </span>
                    </div>
                </div>
            `}
            
            <div style="padding:20px;">
                <div style="margin-bottom:5px; font-size:0.75rem; color:var(--sub-gold); font-family:var(--sub-name-font); letter-spacing:1px; text-transform:uppercase;">
                    ${dateStr} @ ${timeStr}
                </div>
                
                <h3 style="font-family:var(--sub-name-font); font-size:1.4rem; margin:0 0 10px 0; color:#fff; letter-spacing:1px; text-transform:uppercase; line-height:1.1;">
                    ${event.event_name}
                </h3>
                
                ${event.location ? safeHTML`
                    <div style="font-size:0.85rem; color:#888; margin-bottom:20px; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-location-dot" style="color:var(--sub-red);"></i> ${event.location.toUpperCase()}
                    </div>
                ` : ''}
                
                <button class="btn-red" style="width:100%; padding:14px; font-size:0.9rem; letter-spacing:2px; background:#222; border:1px solid #333; transition:all 0.2s;" 
                    onmouseover="this.style.background='var(--sub-red)'; this.style.borderColor='var(--sub-red)';" 
                    onmouseout="this.style.background='#222'; this.style.borderColor='#333';"
                    data-action="view-event-details" data-id="${event.id}">
                    VIEW EVENT
                </button>
            </div>
        </div>
    `;
}

/**
 * Show create event form
 */
export function showCreateEventForm(eventData = null) {
    if (!eventData) {
        selectedEventImage = null;
        selectedBrandLogo = null;
    }
    const formContainer = document.getElementById('create-event-form');
    if (!formContainer) return;

    const now = new Date();
    const startTime = getRoundedTime(now);
    const minTime = formatForInput(startTime);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
    const defaultEndTime = formatForInput(endTime);

    const action = eventData ? 'update-event-form' : 'create-event';
    const btnText = eventData ? '<i class="fa fa-save"></i> SAVE CHANGES' : '<i class="fa fa-check"></i> CREATE EVENT';
    const dataId = eventData ? `data-id="${eventData.id}"` : '';
    const title = eventData ? '<i class="fa fa-edit"></i> Edit Event' : '<i class="fa fa-plus-circle"></i> Create New Event';

    formContainer.style.display = 'block';
    formContainer.innerHTML = `
        <div style="background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px; margin-bottom:20px;">
            <h4 style="font-family:var(--sub-name-font); text-transform:uppercase; margin:0 0 20px 0; color:var(--sub-gold); font-size:1.1rem; letter-spacing:2px;">
                ${title}
            </h4>
            
            <input type="text" id="event-name-input" placeholder="Event Name *" 
                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:0.95rem; margin-bottom:15px; box-sizing:border-box;">
            
            <select id="event-type-select" class="dark-select" 
                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:0.95rem; margin-bottom:15px; box-sizing:border-box;">
                <option value="tournament">🏆 Tournament</option>
                <option value="league">⚽ League Match</option>
                <option value="casual">🎮 Casual Play</option>
            </select>
            
            <div style="margin-bottom:15px;">
                <label style="font-size:0.95rem; color:#aaa; display:block; margin-bottom:10px; font-weight:600;">
                    <i class="fa fa-calendar" style="color:var(--sub-gold); margin-right:8px;"></i> EVENT DATES
                </label>
                <div style="display:flex; gap:12px;">
                    <div style="flex:1; min-width:0;">
                        <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">Start Date & Time *</label>
                        <input type="datetime-local" id="event-start-input" value="${minTime}" min="${minTime}" step="900"
                            style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:1rem; box-sizing:border-box; color-scheme: dark;">
                    </div>
                    <div style="flex:1; min-width:0;">
                        <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">End Date & Time (optional)</label>
                        <input type="datetime-local" id="event-end-input" value="${defaultEndTime}" min="${minTime}" step="900"
                            style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:1rem; box-sizing:border-box; color-scheme: dark;">
                    </div>
                </div>
            </div>
            
            <input type="text" id="event-location-input" placeholder="Location / Address (optional)" 
                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:0.95rem; margin-bottom:15px; box-sizing:border-box;">
            
            <textarea id="event-desc-input" placeholder="Event Description (optional)" 
                style="width:100%; min-height:80px; padding:12px; background:#111; border:1px solid #333; color:#fff; border-radius:8px; font-family:'Open Sans'; font-size:0.95rem; margin-bottom:15px; resize:vertical; box-sizing:border-box;"></textarea>
            
            <!-- Branding Section -->
            <div style="margin-bottom:20px; padding:15px; background:#111; border:1px solid #333; border-radius:8px;">
                <label style="font-size:0.9rem; color:#aaa; display:block; margin-bottom:10px; font-weight:600;">
                    <i class="fa fa-star" style="color:var(--sub-gold); margin-right:8px;"></i> EVENT BRANDING
                </label>
                
                <div style="margin-bottom:15px;">
                    <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">Brand Logo (e.g. Tournament/Sponsor)</label>
                    <input type="file" id="brand-logo-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
                    <label for="brand-logo-input" id="brand-logo-label" style="display:inline-block; padding:8px 15px; background:#333; color:#fff; border-radius:6px; cursor:pointer; font-size:0.8rem; border:1px solid #444;">
                        <i class="fa fa-upload"></i> Upload Logo
                    </label>
                    <div id="brand-logo-preview" style="margin-top:10px; display:flex; align-items:center;"></div>
                </div>
                
                <div>
                    <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">Primary Theme Color</label>
                    <input type="color" id="event-color-input" value="#FFD700" style="width:100%; height:40px; padding:2px; background:none; border:none; cursor:pointer;">
                </div>
            </div>

            <div style="margin-bottom:20px;">
                <input type="file" id="event-image-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
                <label for="event-image-input" id="event-image-label" 
                    style="display:block; padding:14px; background:var(--sub-red); color:#fff; border-radius:8px; cursor:pointer; font-size:1rem; font-family:var(--sub-name-font); text-transform:uppercase; text-align:center; transition:all 0.2s;">
                    <i class="fa fa-upload"></i> CHOOSE IMAGE
                </label>
                <div id="event-image-preview" style="margin-top:12px;"></div>
            </div>
            
            <div style="display:flex; gap:12px; margin-top:25px;">
                <button class="btn-red" data-action="${action}" ${dataId} style="flex:1; padding:14px; font-size:1rem;">
                    ${btnText}
                </button>
                <button class="btn-red" data-action="hide-create-event-form" style="flex:1; padding:14px; font-size:1rem; background:#333;">
                    <i class="fa fa-times"></i> CANCEL
                </button>
            </div>
        </div>
    `;

    // No need to populate game select anymore - removed from form

    // Scroll to form
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Lisätään logiikka loppuajan synkronointiin
    document.getElementById('event-start-input').addEventListener('change', (e) => {
        const endInput = document.getElementById('event-end-input');
        if (endInput) {
            endInput.min = e.target.value;
            const startDate = new Date(e.target.value);
            const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
            endInput.value = formatForInput(endDate);
        }
    });
}

/**
 * Hide create event form
 */
export function hideCreateEventForm() {
    const formContainer = document.getElementById('create-event-form');
    if (formContainer) {
        formContainer.style.display = 'none';
        formContainer.innerHTML = '';
    }
    selectedEventImage = null;
    selectedBrandLogo = null;
}

/**
 * Preview event image
 */
export function previewEventImage(input) {
    const preview = document.getElementById('event-image-preview');
    const fileLabel = document.getElementById('event-image-label');
    if (!preview) return;

    if (input.files && input.files[0]) {
        selectedEventImage = input.files[0];

        // Validate file size (5MB max)
        if (selectedEventImage.size > 5 * 1024 * 1024) {
            showNotification('Image too large. Max 5MB allowed.', 'error');
            input.value = '';
            selectedEventImage = null;
            preview.innerHTML = '';
            return;
        }

        // Hide the file input button
        if (fileLabel) fileLabel.style.display = 'none';

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `
                <div style="position:relative; width:100%; max-width:300px;">
                    <img src="${e.target.result}" style="width:100%; border-radius:8px; border:2px solid var(--sub-gold);">
                    <button onclick="clearEventImage()" style="position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.8); color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; font-size:1.2rem;">×</button>
                </div>
            `;
        };
        reader.readAsDataURL(selectedEventImage);
    }
}

/**
 * Clear event image
 */
export function clearEventImage() {
    const input = document.getElementById('event-image-input');
    const preview = document.getElementById('event-image-preview');
    const fileLabel = document.getElementById('event-image-label');
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
    if (fileLabel) fileLabel.style.display = 'inline-block'; // Show button again
    selectedEventImage = null;
}

/**
 * Preview brand logo
 */
export function previewBrandLogo(input) {
    const preview = document.getElementById('brand-logo-preview');
    const fileLabel = document.getElementById('brand-logo-label');
    if (!preview) return;

    if (input.files && input.files[0]) {
        selectedBrandLogo = input.files[0];

        if (selectedBrandLogo.size > 2 * 1024 * 1024) {
            showNotification('Logo too large. Max 2MB allowed.', 'error');
            input.value = '';
            selectedBrandLogo = null;
            preview.innerHTML = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `
                <img src="${e.target.result}" style="height:40px; width:auto; margin-right:10px;">
                <button onclick="clearBrandLogo()" style="background:none; border:none; color:#888; cursor:pointer;">&times; Remove</button>
            `;
        };
        reader.readAsDataURL(selectedBrandLogo);
    }
}

export function clearBrandLogo() {
    const input = document.getElementById('brand-logo-input');
    const preview = document.getElementById('brand-logo-preview');
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
    selectedBrandLogo = null;
}

/**
 * Create new event
 */
export async function createNewEvent() {
    // Check if user is logged in - use 'user' not 'user'
    if (!state.user) {
        showNotification('You must be logged in to create events', 'error');
        return;
    }

    const btn = document.querySelector('button[data-action="create-event"]');
    if (btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> CREATING...';
    }

    // Get form values
    const eventName = document.getElementById('event-name-input')?.value.trim();
    const eventType = document.getElementById('event-type-select')?.value;
    const startDatetime = document.getElementById('event-start-input')?.value;
    const endDatetime = document.getElementById('event-end-input')?.value || null;
    const description = document.getElementById('event-desc-input')?.value.trim();
    const location = document.getElementById('event-location-input')?.value.trim() || null;
    const primaryColor = document.getElementById('event-color-input')?.value;

    // Validate required fields
    if (!eventName || !startDatetime) {
        showNotification('Please fill required fields (Event Name, Start Time)', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-check"></i> CREATE EVENT'; }
        return;
    }

    try {
        let imageUrl = null;
        let brandLogoUrl = null;

        // Upload image if selected
        if (selectedEventImage) {
            showNotification('Uploading image...', 'success');
            imageUrl = await uploadEventImage(selectedEventImage, true); // Optimize hero image
        }

        // Upload brand logo if selected
        if (selectedBrandLogo) {
            showNotification('Uploading logo...', 'success');
            brandLogoUrl = await uploadEventImage(selectedBrandLogo, false); // Don't optimize logo (keep transparency)
        }

        // Create event in database
        const eventData = {
            event_name: eventName,
            event_type: eventType,
            start_datetime: startDatetime ? new Date(startDatetime).toISOString() : null,
            end_datetime: endDatetime ? new Date(endDatetime).toISOString() : null,
            description: description || null,
            location: location,
            organizer_id: state.user.id,
            image_url: imageUrl,
            brand_logo_url: brandLogoUrl,
            primary_color: primaryColor,
            status: 'upcoming',
            is_public: true
            // Note: max_participants removed - will be per-tournament
            // Note: game_id removed - will be per-tournament
        };

        const { data: event, error } = await _supabase
            .from('events')
            .insert(eventData)
            .select()
            .single();

        if (error) {
            throw error;
        }

        showNotification('Event created successfully! 🎉', 'success');
        hideCreateEventForm();
        loadEventsPage(); // Reload events list

    } catch (e) {
        console.error('Failed to create event:', e);
        showNotification('Failed to create event: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-check"></i> CREATE EVENT'; }
    }
}

/**
 * Upload event image to Supabase Storage
 */
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200; // Resize large hero images
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress to JPEG with 0.8 quality
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Image compression failed'));
                }, 'image/jpeg', 0.8);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

async function uploadEventImage(file, optimize = false) {
    let fileToUpload = file;
    let fileExt = file.name.split('.').pop();

    if (optimize) {
        try {
            fileToUpload = await compressImage(file);
            fileExt = 'jpg'; // Compressed images are always JPEGs
        } catch (e) {
            console.warn('Image compression failed, uploading original:', e);
        }
    }

    const fileName = `${state.user.id}-${Date.now()}.${fileExt}`;

    const { data, error } = await _supabase.storage
        .from('event-images')
        .upload(fileName, fileToUpload, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) {
        console.error('Upload failed:', error);
        throw new Error('Image upload failed');
    }

    // Get public URL
    const { data: { publicUrl } } = _supabase.storage
        .from('event-images')
        .getPublicUrl(fileName);

    return publicUrl;
}

/**
 * View event details and registration
 */
export async function viewEventDetails(eventId) {
    console.log("🔍 FETCHING EVENT DETAILS FOR:", eventId, "V2_FIX_JOIN");
    try {
        // Fetch base event details
        const { data: event, error } = await _supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (error) throw error;

        // Fetch organizer username separately (fail-safe)
        if (event.organizer_id) {
            const { data: userData } = await _supabase
                .from('players')
                .select('username')
                .eq('id', event.organizer_id)
                .single();
            event.organizer = userData || { username: 'System' };
        } else {
            event.organizer = { username: 'System' };
        }

        // Fetch delegated moderators
        let moderators = [];
        const { data: mods, error: modError } = await _supabase
            .from('event_moderators')
            .select('player_id')
            .eq('event_id', eventId);

        if (modError) {
            console.warn('Moderator feature might not be fully configured (SQL not run?):', modError.message);
            moderators = [];
        } else {
            moderators = mods ? mods.map(m => m.player_id) : [];
        }

        // Fetch tournaments for this event with participant counts
        const { data: tournaments, error: tourError } = await _supabase
            .from('tournament_history')
            .select('*, game:games(game_name, location), participants:event_registrations(count)')
            .eq('event_id', eventId)
            .eq('participants.status', 'registered')
            .order('start_datetime', { ascending: true });

        if (tourError) throw tourError;

        // Add participant count to each tournament
        const tournamentsWithCounts = (tournaments || []).map(t => ({
            ...t,
            participant_count: t.participants?.[0]?.count || 0
        }));

        // Fetch user's tournament registrations if logged in
        let userRegistrations = [];
        if (state.user) {
            const { data: regs } = await _supabase
                .from('event_registrations')
                .select('tournament_id')
                .eq('event_id', eventId)
                .eq('player_id', state.user.id);
            userRegistrations = regs || [];
        }

        // Show modal
        showEventModal(event, tournamentsWithCounts || [], userRegistrations, moderators);

    } catch (e) {
        console.error('Failed to load event details:', e);
        showNotification('Failed to load event details', 'error');
    }
}

/**
 * Check if current user can moderate this event
 */
function canModerateEvent(event, moderators = []) {
    if (!state.user) return false;
    if (isAdmin()) return true; // Global admin
    if (event.organizer_id === state.user.id) return true; // Creator
    return moderators.includes(state.user.id); // Delegated moderator
}

/**
 * Show event details modal
 */
function showEventModal(event, tournaments, userRegistrations, moderators = []) {
    const startDate = new Date(event.start_datetime);
    const endDate = event.end_datetime ? new Date(event.end_datetime) : null;

    let dateStr;
    if (endDate && endDate.toDateString() !== startDate.toDateString()) {
        // Multi-day event
        const startFull = startDate.toLocaleDateString('en-GB', {
            weekday: 'long', day: '2-digit', month: 'long'
        });
        const endFull = endDate.toLocaleDateString('en-GB', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
        dateStr = `${startFull} - ${endFull}`;
    } else {
        dateStr = startDate.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }

    const timeStr = startDate.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const isOrganizer = canModerateEvent(event, moderators);

    let modalHtml = `
        <div style="background:var(--sub-black); border-radius:var(--sub-radius); overflow:hidden; border: 1px solid var(--sub-border); box-shadow: var(--sub-shadow);">
                
                ${event.image_url ? `
                    <div style="width:100%; height:250px; background:url('${event.image_url}') center/cover; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:linear-gradient(to bottom, transparent 0%, var(--sub-black) 100%);"></div>
                        <div style="position:absolute; bottom:20px; left:20px; right:20px;">
                            <div style="background:var(--sub-red); color:#fff; padding:4px 10px; font-size:0.7rem; font-family:var(--sub-name-font); display:inline-block; margin-bottom:10px; border-radius:2px; text-transform:uppercase; letter-spacing:1px;">${event.event_type}</div>
                            <h2 style="font-family:var(--sub-name-font); font-size:2.2rem; margin:0; color:#fff; text-transform:uppercase; letter-spacing:1px; line-height:1; text-shadow:0 2px 10px rgba(0,0,0,0.5);">${event.event_name}</h2>
                        </div>
                    </div>
                ` : `
                    <div style="padding:30px 30px 10px 30px; border-bottom:1px solid #222;">
                        <div style="background:var(--sub-red); color:#fff; padding:4px 10px; font-size:0.7rem; font-family:var(--sub-name-font); display:inline-block; margin-bottom:10px; border-radius:2px; text-transform:uppercase; letter-spacing:1px;">${event.event_type}</div>
                        <h2 style="font-family:var(--sub-name-font); font-size:2rem; margin:0; color:#fff; text-transform:uppercase; letter-spacing:1px;">${event.event_name}</h2>
                    </div>
                `}
                
                <div style="padding:30px;">
                    <!-- Meta Grid -->
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom:30px; background:#111; padding:20px; border-radius:8px; border:1px solid #222;">
                        <div>
                            <div style="font-size:0.7rem; color:#666; margin-bottom:5px; text-transform:uppercase; letter-spacing:1px;">Date & Time</div>
                            <div style="color:#fff; font-family:var(--sub-name-font); font-size:0.95rem;">
                                <i class="fa fa-calendar" style="color:var(--sub-gold); margin-right:8px;"></i> ${dateStr}
                            </div>
                            ${(!endDate || endDate.toDateString() === startDate.toDateString()) ? `
                                <div style="color:#888; font-family:var(--sub-name-font); font-size:0.85rem; margin-top:4px; margin-left:24px;">
                                    ${timeStr}
                                </div>
                            ` : ''}
                        </div>
                        
                        <div>
                            <div style="font-size:0.7rem; color:#666; margin-bottom:5px; text-transform:uppercase; letter-spacing:1px;">Location</div>
                            <div style="color:#fff; font-family:var(--sub-name-font); font-size:0.95rem;">
                                <i class="fa fa-map-marker-alt" style="color:var(--sub-red); margin-right:8px;"></i> ${event.location || 'TBA'}
                            </div>
                        </div>
                        
                        <div>
                            <div style="font-size:0.7rem; color:#666; margin-bottom:5px; text-transform:uppercase; letter-spacing:1px;">Organizer</div>
                            <div style="color:#fff; font-family:var(--sub-name-font); font-size:0.95rem;">
                                <i class="fa fa-user-circle" style="color:#888; margin-right:8px;"></i> ${event.organizer?.username || 'System'}
                            </div>
                        </div>
                    </div>

                    ${event.description ? `
                        <div style="margin-bottom:30px;">
                            <div style="font-size:0.75rem; color:var(--sub-gold); margin-bottom:10px; font-family: var(--sub-name-font); letter-spacing: 1.5px; text-transform: uppercase;">ABOUT EVENT</div>
                            <p style="font-size:0.95rem; color:#ccc; margin:0; line-height:1.6; font-family:'Open Sans';">${event.description}</p>
                        </div>
                    ` : ''}

                    ${event.organizer_id === state.user?.id || isAdmin() ? `
                        <div class="sub-card-premium" data-event-id="${event.id}" style="margin-bottom:24px; border-left:4px solid var(--sub-red); padding: 16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                <div style="font-size:0.85rem; color:#fff; font-weight:bold; font-family: var(--sub-name-font); letter-spacing: 1px;">🛡️ MODERATORS</div>
                                <button data-action="toggle-moderator-search" data-event-id="${event.id}" 
                                    class="btn-red"
                                    style="padding:6px 12px; font-size:0.75rem; width: auto;">
                                    + ADD MODERATOR
                                </button>
                            </div>
                            <div id="event-moderators-list" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                                <!-- Moderators will be loaded here -->
                            </div>
                            <div id="moderator-search-container" style="display:none; background:var(--sub-black); padding:12px; border:1px solid var(--sub-border);">
                                <input type="text" id="mod-search-input" placeholder="Search player name..." 
                                    style="width:100%; padding:10px; background:var(--sub-charcoal); border:1px solid var(--sub-border); color:#fff; font-size:0.85rem; box-sizing:border-box; outline: none;">
                                <div id="mod-search-results" style="max-height:150px; overflow-y:auto; margin-top:8px;"></div>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-bottom:24px;">
                        <div style="font-size:0.75rem; color:var(--sub-red); margin-bottom:12px; font-family: var(--sub-name-font); letter-spacing: 1.5px; text-transform: uppercase;">🏆 TOURNAMENTS</div>

                        ${tournaments.length === 0 ? `
                            <div style="text-align:center; padding:40px 24px; color:#666; background: var(--sub-charcoal); border: 1px dashed var(--sub-border);">
                                <i class="fa fa-trophy" style="font-size:2rem; color:#333; margin-bottom:12px; display:block;"></i>
                                <div style="font-size:0.85rem; font-family: var(--sub-name-font); letter-spacing: 1px;">NO TOURNAMENTS CREATED YET</div>
                                ${isOrganizer ? `<div style="font-size:0.75rem; margin-top:8px; color:#888;">Create tournaments during the event</div>` : ''}
                            </div>
                        ` : tournaments.map(t => {
        const isUserRegistered = userRegistrations.some(r => r.tournament_id === t.id);
        const tDate = t.start_datetime ? new Date(t.start_datetime) : new Date(t.created_at);

        const dateStr = tDate.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short'
        });
        const timeStr = tDate.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const participantCount = t.participant_count || 0;
        const maxParticipants = t.max_participants || 8;
        const isFull = participantCount >= maxParticipants;

        return `
            <div style="background:#111; border:1px solid #333; border-radius:8px; margin-bottom:15px; overflow:hidden;">
                <div style="padding:15px 20px; display:flex; justify-content:space-between; align-items:center; background:#161616; border-bottom:1px solid #222;">
                    <div>
                        <div style="font-size:0.7rem; color:var(--sub-gold); font-family:var(--sub-name-font); letter-spacing:1px; text-transform:uppercase; margin-bottom:4px;">
                            ${t.game?.game_name || 'Tournament Table'}
                        </div>
                        <div style="font-size:1.1rem; color:#fff; font-family:var(--sub-name-font); letter-spacing:1px;">
                            ${t.tournament_name || 'Tournament'}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:1.2rem; font-family:var(--sub-name-font); color:#fff;">${timeStr}</div>
                        ${t.status === 'ongoing' ? '<span class="sub-badge-live">LIVE</span>' : 
                          t.status === 'completed' ? '<span style="color:#4CAF50; font-size:0.7rem; font-weight:bold;">COMPLETED</span>' : 
                          '<span style="color:#666; font-size:0.7rem;">SCHEDULED</span>'}
                    </div>
                </div>
                
                <div style="padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <div style="font-size:0.85rem; color:#888;">
                            <i class="fa fa-users" style="margin-right:6px;"></i> ${participantCount} / ${maxParticipants} Players
                        </div>
                        <div style="display:flex; gap:10px;">
                             <button data-action="view-participants" data-event-id="${event.id}" data-tour-id="${t.id}" data-name="${t.tournament_name || 'Tournament'}" style="background:none; border:none; color:var(--sub-gold); cursor:pointer; text-decoration:none; font-size:0.75rem; font-weight:bold; border:1px solid rgba(255,215,0,0.2); padding:4px 10px; border-radius:4px;">ROSTER</button>
                             ${participantCount >= 2 ? `<button data-action="view-bracket" data-id="${t.id}" data-name="${(t.tournament_name || 'Tournament').replace(/[`'"]/g, '')}" data-max="${maxParticipants}" style="background:none; border:none; color:#4CAF50; cursor:pointer; text-decoration:none; font-size:0.75rem; font-weight:bold; border:1px solid rgba(76,175,80,0.2); padding:4px 10px; border-radius:4px;">BRACKET</button>` : ''}
                        </div>
                    </div>

                    ${t.status === 'completed' && (t.winner_name || t.second_place_name || t.third_place_name) ? `
                        <div style="background:rgba(255,215,0,0.05); border:1px solid rgba(255,215,0,0.2); padding:12px; border-radius:4px; display:flex; align-items:center; gap:15px;">
                            <div style="font-size:1.5rem;">🏆</div>
                            <div>
                                <div style="font-size:0.6rem; color:var(--sub-gold); text-transform:uppercase; letter-spacing:1px;">Winner</div>
                                <div style="font-size:1rem; color:#fff; font-family:var(--sub-name-font);">${t.winner_name}</div>
                            </div>
                            ${t.second_place_name ? `
                                <div style="border-left:1px solid rgba(255,255,255,0.1); padding-left:15px;">
                                    <div style="font-size:0.6rem; color:#C0C0C0; text-transform:uppercase; letter-spacing:1px;">2nd Place</div>
                                    <div style="font-size:0.9rem; color:#ccc; font-family:var(--sub-name-font);">${t.second_place_name}</div>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}

                    ${isOrganizer ? `
                        <div style="display:flex; gap:8px; margin-top:15px; border-top:1px solid #222; padding-top:15px;">
                            <button class="btn-red" style="flex:1; padding:8px; font-size:0.8rem; background:#333; border:1px solid #444;" 
                                    onclick="editTournament('${t.id}', '${event.id}', '${event.event_name}')">
                                <i class="fa fa-edit"></i> EDIT
                            </button>
                            <button class="btn-red" style="flex:1; padding:8px; font-size:0.8rem; background:#333; border:1px solid #444; color:var(--sub-red);" 
                                    onclick="deleteTournament('${t.id}', '${event.id}')">
                                <i class="fa fa-trash"></i> DELETE
                            </button>
                        </div>
                    ` : ''}
                    
                    ${t.status !== 'completed' && state.user && !isOrganizer && state.user.id !== 'spectator' ? `
                        <button class="btn-red" 
                                ${isFull && !isUserRegistered ? 'disabled' : ''}
                                style="width:100%; padding:12px; font-size:0.9rem; margin-top:15px; ${isUserRegistered ? 'background:#4CAF50;' : (isFull ? 'background:#444; cursor:not-allowed; opacity:0.7;' : 'background:var(--sub-red);')}" 
                                onclick="${isUserRegistered ? `unregisterFromTournament('${event.id}', '${t.id}')` : (isFull ? '' : `registerForTournament('${event.id}', '${t.id}')`)}">
                            <i class="fa fa-${isUserRegistered ? 'check' : (isFull ? 'ban' : 'user-plus')}"></i> 
                            ${isUserRegistered ? 'REGISTERED ✓' : (isFull ? 'TOURNAMENT FULL' : 'REGISTER')}
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('')}
                    </div>
                    
                    ${isOrganizer ? `
                        <div style="padding:10px; background:#1a1a1a; border:1px solid #333; border-radius:6px; font-size:0.75rem; color:#888; margin-bottom:15px;">
                            💡 <strong style="color:#fff;">Tip:</strong> Create tournaments during your event. Players can register for specific tournaments.
                        </div>
                    ` : ''}
                    
                    <div style="display:flex; gap:10px; margin-top:20px;">
                        ${isOrganizer ? `
                            <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" data-action="show-create-tournament-form" data-event-id="${event.id}" data-event-name="${event.event_name}">
                                <i class="fa fa-plus"></i> CREATE TOURNAMENT
                            </button>
                            <button class="btn-red" style="flex:1; background:#FF9800; color:#fff;" data-action="edit-event" data-id="${event.id}">
                                <i class="fa fa-edit"></i> EDIT EVENT
                            </button>
                            <button class="btn-red" style="flex:1; background:#c62828; color:#fff;" data-action="delete-event" data-id="${event.id}">
                                <i class="fa fa-trash"></i> DELETE EVENT
                            </button>
                            <button class="btn-red" style="flex:1; background:#2196F3; color:#fff;" data-action="open-public-display" data-id="${event.id}">
                                <i class="fa fa-external-link-alt"></i> OPEN PUBLIC DISPLAY
                            </button>
                        ` : ''}
                    </div>
                    
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <button class="btn-red" style="flex:1; background:#4CAF50; padding:12px 25px;" data-action="share-live-link" data-id="${event.id}" data-name="${event.event_name}">
                            <i class="fa fa-share-alt"></i> SHARE LIVE LINK
                        </button>
                        <button class="btn-red" style="flex:1; background:#333; padding:12px 25px;" data-action="close-event-modal">
                            <i class="fa fa-times"></i> CLOSE
                        </button>
                    </div>
                </div>
        </div>
    `;

    showModal(event.event_name, modalHtml, { id: 'event-modal', maxWidth: '600px' });
}

/**
 * Close event modal
 */
export function closeEventModal() { closeModal('event-modal'); }

/**
 * Delete event
 */
export async function deleteEvent(eventId) {
    if (!state.user) {
        showNotification('You must be logged in', 'error');
        return;
    }

    const confirmDelete = confirm('Are you sure you want to delete this event? This will also delete all tournaments and registrations associated with it.');
    if (!confirmDelete) return;

    try {
        // Delete event (CASCADE will delete related tournaments and registrations)
        const { error } = await _supabase
            .from('events')
            .delete()
            .eq('id', eventId);

        if (error) throw error;

        showNotification('Event deleted successfully!', 'success');
        closeEventModal();

        // Reload events list
        loadEventsPage();

    } catch (e) {
        console.error('Failed to delete event:', e);
        showNotification('Failed to delete event: ' + e.message, 'error');
    }
}

/**
 * View and manage tournament participants
 */
export async function viewTournamentParticipants(eventId, tournamentId, tournamentName) {
    // Store current event ID for refresh
    currentEventId = eventId;
    try {
        // Fetch participants for this tournament
        const { data: registrations, error } = await _supabase
            .from('event_registrations')
            .select(`
                id,
                player_id,
                player:players(id, username, country, avatar_url)
            `)
            .eq('tournament_id', tournamentId)
            .eq('status', 'registered');

        if (error) throw error;

        // Build participant list HTML
        let participantsHtml = `
                    <div style="background:var(--sub-charcoal); border-bottom:1px solid var(--sub-border); padding:16px; margin-bottom:15px; font-size:0.85rem; color:#aaa; text-align:center; font-family: var(--sub-name-font); letter-spacing: 1px;">
                        CURRENT ROSTER: <strong style="color:var(--sub-white);">${tournamentName || 'Tournament'}</strong>
                    </div>
                    
                    <!-- Add Player Section (Search + Dropdown) -->
                    <div class="sub-card-premium" style="margin-bottom:32px; border-bottom:4px solid var(--sub-red);">
                        <div class="sub-heading-premium" style="font-size:1.1rem; color:var(--sub-white); margin-bottom:16px; text-align:center;">
                            <i class="fa fa-user-plus" style="margin-right:8px; color: var(--sub-red);"></i> REGISTER PLAYER
                        </div>
                        
                        <div style="position: relative; margin-bottom: 16px;">
                            <input type="text" 
                                   id="participant-search-${tournamentId}" 
                                   placeholder="Search existing or type new name..."
                                   autocomplete="off"
                                   style="width:100%; padding:16px; background:var(--sub-black); border:1px solid var(--sub-border); border-radius:var(--sub-radius); color:#fff; font-size:1rem; font-family: var(--sub-body-font); box-sizing:border-box; outline: none; transition: border-color 0.3s;"
                                   onfocus="this.style.borderColor='var(--sub-red)';"
                                   onblur="setTimeout(() => { this.style.borderColor='var(--sub-border)'; }, 200);"
                                   oninput="handleParticipantSearch('${tournamentId}')"
                                   onkeypress="if(event.key==='Enter') addParticipantFromSearch('${tournamentId}')">
                            
                            <!-- Search dropdown -->
                            <div id="search-dropdown-${tournamentId}" style="
                                display: none;
                                position: absolute;
                                width: 100%;
                                max-height: 250px;
                                overflow-y: auto;
                                background: var(--sub-black);
                                border: 1px solid var(--sub-red);
                                border-radius: var(--sub-radius);
                                margin-top: 4px;
                                z-index: 10003;
                                box-shadow: var(--sub-shadow);
                            "></div>
                        </div>
                        
                        <button class="btn-red" 
                                style="width:100%; padding:16px; font-family:var(--sub-name-font); font-size:1rem; border-radius:var(--sub-radius); letter-spacing:2px;"
                                onclick="addParticipantFromSearch('${tournamentId}')">
                            ADD TO TOURNAMENT
                        </button>
                        <div style="font-size:0.7rem; color:#666; text-align:center; margin-top:10px;">
                            (Players are added immediately upon clicking "Add to Tournament")
                        </div>
                    </div>
                    
                    ${registrations && registrations.length > 0 ? `
                        <div style="margin-bottom:20px;">
                            <div style="font-size:0.75rem; color:var(--sub-red); margin-bottom:12px; font-family: var(--sub-name-font); letter-spacing: 1.5px; text-transform: uppercase;">
                                ${registrations.length} PLAYER${registrations.length !== 1 ? 'S' : ''} REGISTERED
                            </div>
                            <div style="display: grid; gap: 8px;">
                                ${registrations.map((reg, index) => {
            const player = reg.player;
            const displayName = player?.username || 'Unknown';
            const flagEmoji = player?.country ? getFlagEmoji(player.country) : '';

            return `
                                    <div style="background:var(--sub-charcoal); border:1px solid var(--sub-border); border-radius:var(--sub-radius); padding:16px; display:flex; align-items:center; gap:16px;">
                                        <div style="font-size:0.8rem; color:#444; font-family:var(--sub-name-font); min-width:30px; font-weight: bold;">
                                            ${(index + 1).toString().padStart(2, '0')}
                                        </div>
                                        ${player?.avatar_url ? `
                                            <img src="${player.avatar_url}" style="width:40px; height:40px; border-radius:2px; object-fit:cover; border:1px solid var(--sub-border);">
                                        ` : `
                                            <div style="width:40px; height:40px; border-radius:2px; background:var(--sub-black); display:flex; align-items:center; justify-content:center; border:1px solid var(--sub-border);">
                                                <i class="fa fa-user" style="color:var(--sub-red); opacity: 0.5;"></i>
                                            </div>
                                        `}
                                        <div style="flex:1;">
                                            <div style="font-size:1rem; color:var(--sub-white); font-family: var(--sub-name-font); letter-spacing: 0.5px;">
                                                ${flagEmoji} ${displayName.toUpperCase()}
                                            </div>
                                        </div>
                                        <button onclick="removeTournamentParticipant('${reg.id}', '${tournamentId}')" 
                                                style="background:none; border:1px solid #333; color:#666; width: 36px; height: 36px; border-radius:var(--sub-radius); cursor:pointer; transition:all 0.2s;"
                                                onmouseover="this.style.borderColor='var(--sub-red)'; this.style.color='var(--sub-red)'; this.style.background='rgba(193, 39, 45, 0.1)';"
                                                onmouseout="this.style.borderColor='#333'; this.style.color='#666'; this.style.background='none';">
                                            <i class="fa fa-trash"></i>
                                        </button>
                                    </div>
                                `;
        }).join('')}
                            </div>
                        </div>
                    ` : `
                        <div style="text-align:center; padding:60px; color:#444; background: var(--sub-charcoal); border: 1px dashed var(--sub-border); border-radius: var(--sub-radius);">
                            <i class="fa fa-users" style="font-size:3rem; margin-bottom:16px; opacity:0.1;"></i>
                            <div style="font-size:0.9rem; font-family: var(--sub-name-font); letter-spacing: 1px;">NO PARTICIPANTS YET</div>
                        </div>
                    `}`;

        showModal('MANAGE PARTICIPANTS', participantsHtml, {
            id: 'participants-modal',
            maxWidth: '500px'
        });

    } catch (e) {
        console.error('Failed to load participants:', e);
        showNotification('Failed to load participants: ' + e.message, 'error');
    }
}

/**
 * Remove participant from tournament
 */
export async function removeTournamentParticipant(registrationId, tournamentId) {
    if (!confirm('Remove this participant?')) {
        return;
    }

    try {
        const { error } = await _supabase
            .from('event_registrations')
            .delete()
            .eq('id', registrationId);

        if (error) throw error;

        showNotification('Participant removed', 'success');

        // Reload participant list
        const tournamentNameDiv = document.querySelector('#participants-modal strong');
        const tournamentName = tournamentNameDiv?.textContent || 'Tournament';
        await viewTournamentParticipants(currentEventId, tournamentId, tournamentName);

    } catch (e) {
        console.error('Failed to remove participant:', e);
        showNotification('Failed to remove participant: ' + e.message, 'error');
    }
}

/**
 * Close participants modal
 */
export function closeParticipantsModal() {
    closeModal('participants-modal');

    // Refresh event details to update participant count
    if (currentEventId) {
        viewEventDetails(currentEventId);
    }
}

/**
 * Handle participant search with dropdown (like Tournament Mode)
 */
export async function handleParticipantSearch(tournamentId) {
    const input = document.getElementById(`participant-search-${tournamentId}`);
    const dropdown = document.getElementById(`search-dropdown-${tournamentId}`);

    if (!input || !dropdown) return;

    const searchValue = input.value.trim();

    if (!searchValue) {
        dropdown.style.display = 'none';
        return;
    }

    const q = searchValue.toUpperCase();

    try {
        // Haetaan tietokannasta
        const { data: players, error } = await _supabase
            .from('players')
            .select('id, username')
            .ilike('username', `%${q}%`)
            .limit(5);

        if (error) throw error;

        // Haetaan myös istunnon vieraspelaajista
        const guestMatches = state.sessionGuests
            .filter(g => g.includes(q) && !players.some(p => p.username === g))
            .slice(0, 5);

        // Build dropdown HTML
        let html = '';

        // Show existing players
        if (players && players.length > 0) {
            players.forEach(player => {
                html += `
            <div class="search-item" data-action="select-participant" data-tour-id="${tournamentId}" data-name="${player.username}">
                <i class="fa-solid fa-user" style="margin-right:8px; color:var(--sub-gold);"></i>
                        ${player.username}
                    </div>
            `;
            });
        }

        // Näytetään vieraspelaajat
        guestMatches.forEach(guest => {
            html += `
            <div class="search-item" data-action="select-participant" data-tour-id="${tournamentId}" data-name="${guest}">
                <i class="fa-solid fa-user-clock" style="margin-right:8px; color:#666;"></i>
                    ${guest} <small style="color:#444; margin-left:5px;">(GUEST)</small>
                </div>
            `;
        });

        // Always show "Add as new player" option
        html += `
            <div class="search-item" style="color:var(--sub-gold); border-top:1px solid #333;" data-action="select-participant" data-tour-id="${tournamentId}" data-name="${q}">
                <i class="fa-solid fa-plus-circle" style="margin-right:8px;"></i>
        Add: "${q}"
            </div>
            `;

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

    } catch (e) {
        console.error('Search failed:', e);
    }
}

/**
 * Select participant from dropdown
 */
export function selectParticipantFromDropdown(tournamentId, playerName) {
    const input = document.getElementById(`participant-search-${tournamentId}`);
    const dropdown = document.getElementById(`search-dropdown-${tournamentId}`);

    if (input) {
        input.value = playerName;
    }

    if (dropdown) {
        dropdown.style.display = 'none';
    }

    // Immediately add the selected player
    addParticipantFromSearch(tournamentId);
}

/**
 * Add participant from search input
 */
export async function addParticipantFromSearch(tournamentId) {
    const input = document.getElementById(`participant-search-${tournamentId}`);

    if (!input) {
        showNotification('Input field not found', 'error');
        return;
    }

    const playerName = input.value.trim();

    if (!playerName) {
        showNotification('Please enter a name', 'error');
        return;
    }

    try {
        // Check if player exists
        const { data: players, error: playerError } = await _supabase
            .from('players')
            .select('id, username')
            .ilike('username', playerName);

        if (playerError) throw playerError;

        let playerId;
        let isNewPlayer = false;

        if (players && players.length > 0) {
            // Use existing player
            playerId = players[0].id;
        } else {
            // Create new guest player using SQL function
            const { data: result, error: createError } = await _supabase
                .rpc('create_guest_player', { p_username: playerName });

            if (createError) {
                showNotification(`Failed to create player: ${createError.message} `, 'error');
                return;
            }

            playerId = result;
            isNewPlayer = true;
        }

        // Add to tournament using SQL function (bypasses RLS)
        const { data: success, error } = await _supabase
            .rpc('add_tournament_participant', {
                p_tournament_id: tournamentId,
                p_player_id: playerId
            });

        if (error) throw error;

        if (!success) {
            showNotification(`${playerName} is already registered!`, 'error');
            return;
        }

        // Clear input and refresh list
        input.value = '';
        const dropdown = document.getElementById(`search-dropdown-${tournamentId}`);
        if (dropdown) dropdown.style.display = 'none';

        // Refresh participants list
        const tournamentNameEl = document.querySelector(`#participants-modal strong`);
        const tournamentName = tournamentNameEl?.textContent || 'Tournament';
        await viewTournamentParticipants(currentEventId, tournamentId, tournamentName);

    } catch (e) {
        console.error('Failed to add participant:', e);
        showNotification('Failed to add participant: ' + e.message, 'error');
    }
}

/**
 * Helper: Get flag emoji from country code
 */
function getFlagEmoji(countryCode) {
    if (!countryCode) return '';
    const code = countryCode.toUpperCase();
    return String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt()));
}

/**
 * Show create tournament form
 */
export async function showCreateTournamentForm(eventId, eventName) {
    if (!state.user) {
        showNotification('You must be logged in to create tournaments', 'error');
        return;
    }

    // Ensure games are loaded before showing form
    if (!state.allGames || state.allGames.length === 0) {
        showNotification('Loading game tables...', 'success');

        const { data: games, error } = await _supabase
            .from('games')
            .select('*')
            .eq('is_public', true)
            .order('game_name');

        if (error) {
            console.error('❌ Failed to load game tables:', error);
            showNotification('Failed to load game tables: ' + error.message, 'error');
            return;
        }

        if (!games || games.length === 0) {
            console.warn('⚠️ No game tables found in database');
            showNotification('No game tables available. Please create a table first in Tournament Mode.', 'error');
            return;
        }

        state.allGames = games;
    }

    // Generate game options from loaded games
    const gameOptions = '<option value="" disabled selected>Select Game Table</option>' +
        state.allGames.map(g => {
            const displayText = g.location ? `${g.game_name} - ${g.location}` : g.game_name;
            return `<option value="${g.id}">${displayText}</option>`;
        }).join('');

    const now = new Date();
    const startTime = getRoundedTime(now);
    const defaultStartTime = formatForInput(startTime);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
    const defaultEndTime = formatForInput(endTime);

    const formHtml = `
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; overflow-y:auto; padding:20px; box-sizing:border-box;">
                <div style="max-width:500px; margin:0 auto; background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px;">

                    <h2 style="font-family:var(--sub-name-font); font-size:1.1rem; margin:0 0 20px 0; color:var(--sub-gold); text-align:center; text-transform:uppercase; letter-spacing:2px;">
                        <i class="fa fa-trophy" style="margin-right:8px;"></i> CREATE TOURNAMENT
                    </h2>

                    <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:15px; font-size:0.85rem; color:#888;">
                        <i class="fa fa-calendar" style="margin-right:8px;"></i> Event: <span style="color:#fff;">${eventName}</span>
                    </div>

                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            TOURNAMENT NAME <span style="color:#666;">(optional)</span>
                        </label>
                        <input type="text" id="tournament-name-input"
                            placeholder="e.g., Morning Finals, Day 1 Eliminations..."
                            style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                    </div>

                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            GAME TABLE *
                        </label>
                        <select id="tournament-game-select"
                            style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                            ${gameOptions}
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:15px;">
                        <div>
                            <label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">
                                <i class="fa fa-clock" style="color:var(--sub-gold);"></i> START TIME *
                            </label>
                            <input type="datetime-local" id="tournament-start-input" value="${defaultStartTime}" min="${defaultStartTime}" step="900"
                                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:1rem; box-sizing:border-box; color-scheme: dark;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">
                                <i class="fa fa-flag-checkered"></i> END TIME
                            </label>
                            <input type="datetime-local" id="tournament-end-input" value="${defaultEndTime}" min="${defaultStartTime}" step="900"
                                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:1rem; box-sizing:border-box; color-scheme: dark;">
                        </div>
                    </div>

                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            MAX PLAYERS
                        </label>
                        <input type="number" id="tournament-max-input" value="8" min="2" max="32"
                            style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                    </div>

                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" onclick="createTournament('${eventId}')">
                            <i class="fa fa-check"></i> CREATE
                        </button>
                        <button class="btn-red" style="flex:1; background:#333;" onclick="closeTournamentForm()">
                            <i class="fa fa-times"></i> CANCEL
                        </button>
                    </div>
                </div>
            </div>
            `;

    let formContainer = document.getElementById('tournament-form-modal');
    if (!formContainer) {
        formContainer = document.createElement('div');
        formContainer.id = 'tournament-form-modal';
        document.body.appendChild(formContainer);
    } else {
    }
    formContainer.innerHTML = formHtml;

    // Auto-select first game if available
    if (state.allGames && state.allGames.length > 0) {
        const gameSelect = document.getElementById('tournament-game-select');
        if (gameSelect) {
            gameSelect.value = state.allGames[0].id;
        }
    }

    // Synkronointi turnauslomakkeelle
    document.getElementById('tournament-start-input').addEventListener('change', (e) => {
        const endInput = document.getElementById('tournament-end-input');
        if (endInput) {
            endInput.min = e.target.value;
            const startDate = new Date(e.target.value);
            const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
            endInput.value = formatForInput(endDate);
        }
    });
}

/**
 * Close tournament form
 */
export function closeTournamentForm() {
    const formContainer = document.getElementById('tournament-form-modal');
    if (formContainer) formContainer.remove();
}

/**
 * Create tournament
 */
export async function createTournament(eventId) {
    if (!state.user) {
        showNotification('You must be logged in', 'error');
        return;
    }

    try {
        // Fetch event with moderators
        const { data: event, error: eventError } = await _supabase
            .from('events')
            .select('*, moderators:event_moderators(player_id)')
            .eq('id', eventId)
            .single();

        if (eventError || !event) throw new Error('Event not found');
        const moderators = event.moderators ? event.moderators.map(m => m.player_id) : [];

        if (!canModerateEvent(event, moderators)) {
            showNotification('You are not authorized to create tournaments for this event', 'error');
            return;
        }

        const tournamentName = document.getElementById('tournament-name-input')?.value.trim() || null;
        const gameId = document.getElementById('tournament-game-select')?.value;
        const startDatetime = document.getElementById('tournament-start-input')?.value;
        const endDatetime = document.getElementById('tournament-end-input')?.value || null;
        const maxParticipants = parseInt(document.getElementById('tournament-max-input')?.value) || 8;
        const tournamentType = document.getElementById('tournament-type-select')?.value || 'elimination';

        if (!gameId) {
            showNotification('Please select a game table', 'error');
            return;
        }

        if (!startDatetime) {
            showNotification('Please select start time', 'error');
            return;
        }

        // Create tournament in tournament_history
        const tournamentData = {
            event_id: eventId,
            game_id: gameId,
            organizer_id: state.user.id,
            tournament_name: tournamentName,
            tournament_type: tournamentType,
            max_participants: maxParticipants,
            start_datetime: startDatetime ? new Date(startDatetime).toISOString() : null,
            end_datetime: endDatetime ? new Date(endDatetime).toISOString() : null,
            status: 'scheduled',
            created_at: new Date().toISOString()
        };

        const { data: tournament, error } = await _supabase
            .from('tournament_history')
            .insert(tournamentData)
            .select()
            .single();

        if (error) {
            throw error;
        }

        showNotification('Tournament created successfully!', 'success');
        closeTournamentForm();

        // Reload event details to show new tournament
        viewEventDetails(eventId);

    } catch (e) {
        console.error('❌ EXCEPTION in createTournament:', e);
        console.error('Error details:', {
            message: e.message,
            code: e.code,
            details: e.details,
            hint: e.hint
        });
        if (e.message && e.message.includes('column')) {
            showNotification('Database error: Please run add_tournament_datetime.sql in Supabase first', 'error');
        } else {
            showNotification('Failed to create tournament: ' + e.message, 'error');
        }
    }
}

/**
 * Show email prompt modal
 */
export function showEmailPrompt(eventId, tournamentId) {
    const modalHtml = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;">
            <div style="background: #222; border: 2px solid var(--sub-gold); border-radius: 8px; max-width: 400px; width: 100%; padding: 30px;">
            <h3 style="color: var(--sub-gold); margin-top: 0; text-align: center;">
                <i class="fa fa-envelope" style="margin-right:8px;"></i> Email Required
                </h3>
                <p style="color: #ccc; margin-bottom: 20px; text-align: center;">
                    Tournament participation requires an email address for notifications and updates.
                </p>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: #999; margin-bottom: 5px; font-size: 0.9rem;">
                        Email Address
                    </label>
                    <input 
                        type="email" 
                        id="email-prompt-input" 
                        placeholder="your.email@example.com"
                        style="
                            width: 100%;
                            padding: 10px;
                            background: #333;
                            border: 1px solid #555;
                            border-radius: 4px;
                            color: white;
                            font-size: 1rem;
                        "
                    />
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button 
                        onclick="closeEmailPrompt()" 
                        style="
                            flex: 1;
                            padding: 10px;
                            background: #555;
                            border: none;
                            border-radius: 4px;
                            color: white;
                            cursor: pointer;
                        "
                    >
                        Cancel
                    </button>
                    <button 
                        onclick="saveEmailAndRegister('${eventId}', '${tournamentId}')" 
                        class="btn-gold"
                        style="flex: 1;"
                    >
                        Save & Register
                    </button>
                </div>
                </div>
        </div>
            `;

    let modal = document.getElementById('email-prompt-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'email-prompt-modal';
        document.body.appendChild(modal);
    }
    modal.innerHTML = modalHtml;
}

/**
 * Close email prompt modal
 */
export function closeEmailPrompt() {
    const modal = document.getElementById('email-prompt-modal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Save email and proceed with tournament registration
 */
export async function saveEmailAndRegister(eventId, tournamentId) {
    const emailInput = document.getElementById('email-prompt-input');
    const email = emailInput?.value?.trim();

    if (!email) {
        showNotification('Please enter your email address', 'error');
        return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }

    try {
        // Update player's email
        const { error } = await _supabase
            .from('players')
            .update({ email: email })
            .eq('id', state.user.id);

        if (error) throw error;

        // Update local user object
        state.user.email = email;

        closeEmailPrompt();

        // Show success notification with longer duration
        showNotification('✅ Email saved! You can now register for tournaments.', 'success');

        // Small delay to let user see the notification before registration proceeds
        setTimeout(() => {
            registerForTournament(eventId, tournamentId);
        }, 800);

    } catch (e) {
        console.error('Failed to save email:', e);
        showNotification('Failed to save email: ' + e.message, 'error');
    }
}

/**
 * Register for tournament
 */
export async function registerForTournament(eventId, tournamentId) {
    if (!state.user) {
        showNotification('You must be logged in to register', 'error');
        return;
    }

    // Check if user has email - required for tournament participation
    if (!state.user.email) {
        showEmailPrompt(eventId, tournamentId);
        return;
    }

    try {
        console.log('Registering:', { eventId, tournamentId, playerId: state.user.id });

        // Register in event_registrations (links event, tournament, and player)
        const { data, error } = await _supabase
            .from('event_registrations')
            .insert({
                event_id: eventId,
                tournament_id: tournamentId,
                player_id: state.user.id,
                status: 'registered'
            })
            .select();

        if (error) {
            console.error('Registration error:', error);
            if (error.code === '23505') { // Unique constraint violation
                showNotification('You are already registered', 'error');
            } else if (error.message && error.message.includes('column')) {
                showNotification('Database error: Please run COMPLETE_EVENT_FIX.sql in Supabase', 'error');
            } else if (error.message && error.message.includes('violates')) {
                showNotification('Database constraint error: ' + error.message, 'error');
            } else {
                throw error;
            }
            return;
        }

        console.log('Registration successful:', data);
        showNotification(`${state.user.username} added to tournament!`, 'success');

        // Reload event details
        viewEventDetails(eventId);

    } catch (e) {
        console.error('Failed to register:', e);
        showNotification('Failed to register: ' + e.message, 'error');
    }
}

/**
 * Unregister from tournament
 */
export async function unregisterFromTournament(eventId, tournamentId) {
    if (!state.user) return;

    try {
        const { error } = await _supabase
            .from('event_registrations')
            .delete()
            .eq('event_id', eventId)
            .eq('tournament_id', tournamentId)
            .eq('player_id', state.user.id);

        if (error) throw error;

        showNotification('Registration cancelled', 'success');

        // Reload event details
        viewEventDetails(eventId);

    } catch (e) {
        console.error('Failed to unregister:', e);
        showNotification('Failed to unregister: ' + e.message, 'error');
    }
}

/**
 * Edit tournament
 */
export async function editTournament(tournamentId, eventId, eventName) {
    if (!state.user) {
        showNotification('You must be logged in', 'error');
        return;
    }

    try {
        // Fetch current tournament data
        const { data: tournament, error } = await _supabase
            .from('tournament_history')
            .select('*')
            .eq('id', tournamentId)
            .single();

        if (error) throw error;

        // Fetch event with moderators
        const { data: event, error: eventError } = await _supabase
            .from('events')
            .select('*, moderators:event_moderators(player_id)')
            .eq('id', eventId)
            .single();

        if (!eventError && event) {
            const moderators = event.moderators ? event.moderators.map(m => m.player_id) : [];
            if (!canModerateEvent(event, moderators)) {
                showNotification('You are not authorized to edit this tournament', 'error');
                return;
            }
        } else if (tournament.organizer_id !== state.user.id && !isAdmin()) {
            showNotification('You are not authorized to edit this tournament', 'error');
            return;
        }

        // Show edit form with current values
        await showEditTournamentForm(tournament, eventId, eventName);

    } catch (e) {
        console.error('Failed to load tournament:', e);
        showNotification('Failed to load tournament', 'error');
    }
}

/**
 * Show edit tournament form
 */
async function showEditTournamentForm(tournament, eventId, eventName) {
    // Ensure games are loaded first
    if (!state.allGames || state.allGames.length === 0) {
        console.log('Loading games for edit form...');
        const { data: games, error } = await _supabase.from('games').select('*').order('game_name');
        if (error) {
            console.error('Failed to load games:', error);
            showNotification('Failed to load game tables', 'error');
            return;
        }
        state.allGames = games || [];
        console.log('Loaded', state.allGames.length, 'games');
    }

    if (state.allGames.length === 0) {
        showNotification('No game tables available. Create a table first in Tournament Mode.', 'error');
        return;
    }

    console.log('All games:', state.allGames.map(g => ({ id: g.id, name: g.game_name })));
    console.log('Tournament game_id:', tournament.game_id);

    // Get available game tables
    const gameOptions = state.allGames.map(g => {
        const isSelected = g.id === tournament.game_id;
        console.log(`Game ${g.game_name}: ${g.id} - ${isSelected ? 'SELECTED' : 'not selected'} `);
        const displayText = g.location ? `${g.game_name} - ${g.location} ` : g.game_name;
        return `<option value="${g.id}" ${isSelected ? 'selected' : ''}>${displayText}</option>`;
    }).join('');

    console.log('Generated gameOptions HTML length:', gameOptions.length);

    const formHtml = `
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; overflow-y:auto; padding:20px; box-sizing:border-box;">
                <div style="max-width:500px; margin:0 auto; background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px;">

                    <h2 style="font-family:'Russo One'; font-size:1.3rem; margin:0 0 20px 0; color:var(--sub-gold); text-align:center;">
                        <i class="fa fa-edit"></i> EDIT TOURNAMENT
                    </h2>

                    <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:15px; font-size:0.85rem; color:#888;">
                        <i class="fa fa-calendar"></i> Event: <span style="color:#fff;">${eventName}</span>
                    </div>

                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            TOURNAMENT NAME <span style="color:#666;">(optional)</span>
                        </label>
                        <input type="text" id="tournament-name-input" value="${tournament.tournament_name || ''}"
                            placeholder="e.g., Morning Finals, Day 1 Eliminations..."
                            style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                    </div>

                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            GAME TABLE *
                        </label>
                        <select id="tournament-game-select"
                            style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                            ${gameOptions}
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:15px;">
                        <div>
                            <label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">
                                <i class="fa fa-clock" style="color:var(--sub-gold);"></i> START TIME *
                            </label>
                            <input type="datetime-local" id="tournament-start-input" step="900" 
                                value="${formatForInput(tournament.start_datetime)}"
                                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:1rem; box-sizing:border-box; color-scheme: dark;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">
                                <i class="fa fa-flag-checkered"></i> END TIME
                            </label>
                            <input type="datetime-local" id="tournament-end-input" step="900"
                                value="${formatForInput(tournament.end_datetime)}"
                                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:1rem; box-sizing:border-box; color-scheme: dark;">
                        </div>
                    </div>

                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            MAX PLAYERS
                        </label>
                        <input type="number" id="tournament-max-input" value="${tournament.max_participants || 8}" min="2" max="32"
                            style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                    </div>

                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" onclick="saveTournamentEdit('${tournament.id}', '${eventId}')">
                            <i class="fa fa-save"></i> SAVE CHANGES
                        </button>
                        <button class="btn-red" style="flex:1; background:#333;" onclick="closeTournamentForm()">
                            <i class="fa fa-times"></i> CANCEL
                        </button>
                    </div>
                </div>
            </div>
            `;

    let formContainer = document.getElementById('tournament-form-modal');
    if (!formContainer) {
        formContainer = document.createElement('div');
        formContainer.id = 'tournament-form-modal';
        document.body.appendChild(formContainer);
    }
    formContainer.innerHTML = formHtml;

    // Set form values immediately after DOM is created
    const gameSelect = document.getElementById('tournament-game-select');
    if (gameSelect && tournament.game_id) {
        gameSelect.value = tournament.game_id;
    }

    // Set datetime values
    const startInput = document.getElementById('tournament-start-input');
    const endInput = document.getElementById('tournament-end-input');
    if (startInput && tournament.start_datetime) {
        startInput.value = new Date(tournament.start_datetime).toISOString().slice(0, 16);
    }
    if (endInput && tournament.end_datetime) {
        endInput.value = new Date(tournament.end_datetime).toISOString().slice(0, 16);
    }

    // Synkronointi muokkauslomakkeelle
    document.getElementById('tournament-start-input').addEventListener('change', (e) => {
        const endInput = document.getElementById('tournament-end-input');
        if (endInput) {
            endInput.min = e.target.value;
            const startDate = new Date(e.target.value);
            const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
            endInput.value = formatForInput(endDate);
        }
    });
}

/**
 * Save tournament edit
 */
export async function saveTournamentEdit(tournamentId, eventId) {
    if (!state.user) {
        showNotification('You must be logged in', 'error');
        return;
    }

    const nameInput = document.getElementById('tournament-name-input');
    const gameSelect = document.getElementById('tournament-game-select');
    const startInput = document.getElementById('tournament-start-input');
    const endInput = document.getElementById('tournament-end-input');
    const maxInput = document.getElementById('tournament-max-input');
    const typeSelect = document.getElementById('tournament-type-select');

    try {
        // Fetch event with moderators to check permission
        const { data: event, error: eventError } = await _supabase
            .from('events')
            .select('*, moderators:event_moderators(player_id)')
            .eq('id', eventId)
            .single();

        if (!eventError && event) {
            const moderators = event.moderators ? event.moderators.map(m => m.player_id) : [];
            if (!canModerateEvent(event, moderators)) {
                showNotification('You are not authorized to edit this tournament', 'error');
                return;
            }
        }
        const tournamentName = nameInput?.value.trim() || null;
        const gameId = gameSelect?.value;
        const startDatetime = startInput?.value;
        const endDatetime = endInput?.value || null;
        const maxParticipants = parseInt(maxInput?.value) || 8;
        const tournamentType = typeSelect?.value || 'elimination';

        if (!gameId) {
            showNotification('Please select a game table', 'error');
            return;
        }

        // Note: start_datetime is not required for edit (can be null for old tournaments)

        const { data, error } = await _supabase
            .from('tournament_history')
            .update({
                tournament_name: tournamentName,
                game_id: gameId,
                start_datetime: startDatetime ? new Date(startDatetime).toISOString() : null,
                end_datetime: endDatetime ? new Date(endDatetime).toISOString() : null,
                max_participants: maxParticipants,
                tournament_type: tournamentType
            })
            .eq('id', tournamentId)
            .select();

        if (error) {
            console.error('Database error:', error);
            throw error;
        }

        showNotification('Tournament updated successfully!', 'success');
        closeTournamentForm();
        viewEventDetails(eventId);

    } catch (e) {
        console.error('Failed to update tournament:', e);
        if (e.message && e.message.includes('column')) {
            showNotification('Database error: Please run add_tournament_datetime.sql in Supabase first', 'error');
        } else {
            showNotification('Failed to update tournament: ' + e.message, 'error');
        }
    }
}

/**
 * Delete tournament
 */
export async function deleteTournament(tournamentId, eventId) {
    if (!state.user) {
        showNotification('You must be logged in', 'error');
        return;
    }

    try {
        // Fetch tournament to check data
        const { data: tournament, error: tourError } = await _supabase
            .from('tournament_history')
            .select('*')
            .eq('id', tournamentId)
            .single();

        if (tourError || !tournament) throw new Error('Tournament not found');

        // Fetch event with moderators
        const { data: event, error: eventError } = await _supabase
            .from('events')
            .select('*, moderators:event_moderators(player_id)')
            .eq('id', eventId)
            .single();

        if (!eventError && event) {
            const moderators = event.moderators ? event.moderators.map(m => m.player_id) : [];
            if (!canModerateEvent(event, moderators)) {
                showNotification('You are not authorized to delete this tournament', 'error');
                return;
            }
        } else if (tournament.organizer_id !== state.user.id && !isAdmin()) {
            showNotification('You are not authorized to delete this tournament', 'error');
            return;
        }

        if (!confirm('Are you sure you want to delete this tournament? This action cannot be undone.')) {
            return;
        }

        const { error } = await _supabase
            .from('tournament_history')
            .delete()
            .eq('id', tournamentId);

        if (error) throw error;

        showNotification('Tournament deleted successfully', 'success');
        viewEventDetails(eventId);

    } catch (e) {
        console.error('Failed to delete tournament:', e);
        showNotification('Failed to delete tournament: ' + e.message, 'error');
    }
}

// ============================================================
// LIVE EVENT VIEW (PUBLIC SHAREABLE)
// ============================================================

/**
 * Share live event link
 */
export function shareLiveEventLink(eventId, eventName) {
    const liveUrl = `${window.location.origin}${window.location.pathname}?live=${eventId}`;

    // Copy to clipboard
    navigator.clipboard.writeText(liveUrl).then(() => {
        showNotification('Live link copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback: show in modal
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; display:flex; align-items:center; justify-content:center; padding:20px;';
        modal.innerHTML = `
            <div style="background:#1a1a1a; border:2px solid var(--sub-gold); border-radius:12px; padding:30px; max-width:500px; width:100%;">
                <h2 style="font-family:'Russo One'; color:var(--sub-gold); margin-bottom:20px; text-align:center;">
                    <i class="fa fa-share-alt" style="margin-right:8px;"></i> LIVE EVENT LINK
                </h2>
                <p style="color:#ccc; margin-bottom:15px; text-align:center;">
                    Share this link to display live tournament results on screens or other devices.
                </p>
                <input type="text" value="${liveUrl}" readonly 
                       style="width:100%; padding:12px; background:#0a0a0a; border:1px solid #333; color:#fff; font-family:monospace; border-radius:6px; margin-bottom:20px; font-size:0.9rem;"
                       data-action="select-all">
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:#4CAF50;" data-action="copy-live-link" data-url="${liveUrl}">
                        <i class="fa fa-copy"></i> COPY LINK
                    </button>
                    <button class="btn-red" style="flex:1; background:#333;" data-action="close-share-modal">
                        <i class="fa fa-times"></i> CLOSE
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    });
}

/**
 * View live event (public view for screens/TVs)
 */
export async function viewLiveEvent(eventId, isBackgroundUpdate = false) {
    console.log('viewLiveEvent called with ID:', eventId);

    // Ensure live content container exists
    let content = document.getElementById('live-content');
    if (!content) {
        content = document.createElement('div');
        content.id = 'live-content';
        document.body.appendChild(content);
        console.log('Created live-content container');
    }
    
    // Enforce full screen styles and hide app content
    content.style.cssText = 'width:100%; height:100vh; padding:0; box-sizing:border-box; background-color:#050505; background-image: linear-gradient(45deg, #0a0a0a 25%, transparent 25%), linear-gradient(-45deg, #0a0a0a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0a0a0a 75%), linear-gradient(-45deg, transparent 75%, #0a0a0a 75%); background-size: 8px 8px; position:fixed; top:0; left:0; z-index:20000; overflow-y:auto; -webkit-overflow-scrolling:touch;';
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.style.display = 'none';

    // Show loading state
    if (!isBackgroundUpdate) {
        content.innerHTML = `
            <div style="text-align:center; padding:40px; color:#fff;">
                <i class="fa fa-spinner fa-spin" style="font-size:3rem; color:var(--sub-gold);"></i>
                <p style="margin-top:20px; font-size:1.2rem;">Loading event...</p>
            </div>
        `;
    }

    try {
        console.log('Fetching event from Supabase...');

        // Fetch event details
        const { data: event, error } = await _supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        console.log('Event fetch result:', { event, error });

        if (error) throw error;
        if (!event) throw new Error('Event not found');

        // Update page title and Open Graph meta tags for social sharing
        if (!isBackgroundUpdate) {
            document.title = `LIVE: ${event.event_name}`;
            
            const setMeta = (prop, val) => {
                if (!val) return;
                let meta = document.querySelector(`meta[property="${prop}"]`);
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.setAttribute('property', prop);
                    document.head.appendChild(meta);
                }
                meta.setAttribute('content', val);
            };

            setMeta('og:title', event.event_name);
            setMeta('og:description', event.description || 'Follow live tournament results.');
            setMeta('og:url', window.location.href);
            if (event.image_url) setMeta('og:image', event.image_url);
        }

        console.log('Fetching tournaments...');

        // Fetch tournaments
        const { data: tournaments, error: tournamentsError } = await _supabase
            .from('tournament_history')
            .select(`
                *,
                game: games(game_name, location)
            `)
            .eq('event_id', eventId)
            .order('start_datetime', { ascending: true });

        if (tournamentsError) throw tournamentsError;

        // Fetch participant counts for each tournament separately to be safe
        if (tournaments && tournaments.length > 0) {
            for (let t of tournaments) {
                const { count } = await _supabase
                    .from('event_registrations')
                    .select('*', { count: 'exact', head: true })
                    .eq('tournament_id', t.id);
                t.computed_participant_count = count || 0;
            }

            // Fetch matches for each tournament to build the live bracket
            for (let t of tournaments) {
                const { data: matches, error: matchesError } = await _supabase
                    .from('matches')
                    .select('*')
                    .eq('tournament_id', t.id)
                    .order('created_at', { ascending: true });
                t.matches = matches || [];
            }
        }

        // FETCH PLAYER DATA FOR LIVE PODIUMS
        // Kerätään kaikkien päättyneiden turnausten voittajat ja haetaan heidän kuvansa
        const completedTournaments = tournaments.filter(t => t.status === 'completed');
        let playerMap = {};
        
        if (completedTournaments.length > 0) {
            const names = [...new Set(completedTournaments.flatMap(t => 
                [t.winner_name, t.second_place_name, t.third_place_name]
            ).filter(n => n))];

            if (names.length > 0) {
                const { data: players } = await _supabase
                    .from('players')
                    .select('username, avatar_url, country, elo')
                    .in('username', names);
                
                if (players) {
                    players.forEach(p => { playerMap[p.username.toLowerCase()] = p; });
                }
            }
        }

        console.log('Displaying live view...');


        if (event.primary_color) {
            // Update theme color variable
            document.documentElement.style.setProperty('--sub-gold', event.primary_color);
        }

        // Display live view
        showLiveEventView(event, tournaments || [], playerMap);

        // Auto-refresh every 10 seconds
        if (window.liveEventRefreshInterval) {
            clearInterval(window.liveEventRefreshInterval);
        }
        window.liveEventRefreshInterval = setInterval(() => {
            // Stop interval if live content container is no longer in DOM
            if (!document.getElementById('live-content')) {
                clearInterval(window.liveEventRefreshInterval);
                return;
            }
            viewLiveEvent(eventId, true);
        }, 10000);

        console.log('Live event view loaded successfully');

    } catch (e) {
        console.error('Failed to load live event:', e);
        content.innerHTML = `
            <div style="text-align:center; padding:40px; color:#fff;">
                <h2 style="color:#f44336; font-family:'Russo One'; margin-bottom:20px;">⚠️ Error Loading Event</h2>
                <p style="color:#999; margin-bottom:10px;">Unable to load event data.</p>
                <p style="color:#666; font-size:0.9rem; font-family:monospace;">${e.message || 'Unknown error'}</p>
                <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:var(--sub-red); color:#fff; border:none; border-radius:6px; cursor:pointer; font-family:'Russo One';">
                    RELOAD PAGE
                </button>
            </div>
        `;
    }
}

/**
 * Render a TV-friendly bracket diagram for the live view
 */
function renderLiveBracketHtml(t) {
    const matches = t.matches || [];
    
    // Calculate unique players from matches if participant count is missing
    const uniquePlayers = new Set();
    matches.forEach(m => {
        if(m.player1) uniquePlayers.add(m.player1);
        if(m.player2) uniquePlayers.add(m.player2);
    });
    
    // Use the larger of registered count or actual players in matches
    const participantCount = Math.max(t.computed_participant_count || 0, uniquePlayers.size);
    
    if (participantCount < 2) {
        return `
            <div style="text-align:center; padding:30px; color:#444; border:1px dashed #222; border-radius:8px;">
                <i class="fa fa-users" style="font-size:2rem; margin-bottom:15px; opacity:0.3;"></i>
                <div style="font-family:var(--sub-name-font); font-size:0.9rem; letter-spacing:1px;">WAITING FOR PLAYERS</div>
                <div style="font-size:0.75rem; color:#666; margin-top:5px;">${participantCount} joined so far</div>
            </div>
        `;
    }

    // 1. Calculate Bracket Dimensions (Next Power of 2)
    let nextPow2 = 2;
    while (nextPow2 < participantCount) nextPow2 *= 2;
    
    // Cap at 32 to prevent UI explosion
    if (nextPow2 > 32) nextPow2 = 32;
    
    const totalRounds = Math.log2(nextPow2);
    
    // 2. Sort matches into rounds
    const playerHistory = {};
    const roundBuckets = Array.from({length: totalRounds}, () => []);
    
    // Sort matches by time
    const sortedMatches = [...matches].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    sortedMatches.forEach(m => {
        const p1 = m.player1 || 'Unknown';
        const p2 = m.player2 || 'Unknown';
        const p1Round = playerHistory[p1] || 0;
        const p2Round = playerHistory[p2] || 0;
        
        // Match belongs to the round index equal to the max previous games played by participants
        let currentRound = Math.max(p1Round, p2Round);
        
        // Safety cap
        if (currentRound >= totalRounds) currentRound = totalRounds - 1;
        
        roundBuckets[currentRound].push(m);
        
        // Increment history
        playerHistory[p1] = currentRound + 1;
        playerHistory[p2] = currentRound + 1;
    });

    // 3. Render Columns
    let html = '<div style="display:flex; gap:30px; overflow-x:auto; padding:20px 0; align-items: flex-start;">';
    
    // Helper for rendering a match box
    const renderBox = (m) => {
        const isWinner1 = m.winner === m.player1;
        const isWinner2 = m.winner === m.player2;
        const p1Score = m.player1_score !== null ? m.player1_score : '';
        const p2Score = m.player2_score !== null ? m.player2_score : '';
        
        // Determine border color based on state
        let borderColor = '#333';
        if (m.winner) borderColor = '#555'; // Completed
        
        return `
            <div class="bracket-match-card" style="background:#111; border:1px solid ${borderColor}; border-radius:6px; overflow:hidden; min-width:240px; box-shadow:0 4px 15px rgba(0,0,0,0.3); position:relative;">
                <!-- Player 1 -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid #222; position:relative; ${isWinner1 ? 'background:rgba(255,215,0,0.1);' : ''}">
                    ${isWinner1 ? '<div style="position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--sub-gold); box-shadow:0 0 8px var(--sub-gold);"></div>' : ''}
                    <span style="color:${isWinner1 ? '#fff' : '#888'}; font-weight:${isWinner1 ? 'bold' : 'normal'}; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; font-family:var(--sub-name-font); padding-left:${isWinner1 ? '6px' : '0'}; text-transform:uppercase; letter-spacing:0.5px;">${m.player1}</span>
                    <span style="color:${isWinner1 ? 'var(--sub-gold)' : '#555'}; font-family:'Russo One'; font-size:1.1rem; text-shadow:${isWinner1 ? '0 0 10px rgba(255,215,0,0.3)' : 'none'};">${p1Score}</span>
                </div>
                <!-- Player 2 -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; position:relative; ${isWinner2 ? 'background:rgba(255,215,0,0.1);' : ''}">
                    ${isWinner2 ? '<div style="position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--sub-gold); box-shadow:0 0 8px var(--sub-gold);"></div>' : ''}
                    <span style="color:${isWinner2 ? '#fff' : '#888'}; font-weight:${isWinner2 ? 'bold' : 'normal'}; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; font-family:var(--sub-name-font); padding-left:${isWinner2 ? '6px' : '0'}; text-transform:uppercase; letter-spacing:0.5px;">${m.player2}</span>
                    <span style="color:${isWinner2 ? 'var(--sub-gold)' : '#555'}; font-family:'Russo One'; font-size:1.1rem; text-shadow:${isWinner2 ? '0 0 10px rgba(255,215,0,0.3)' : 'none'};">${p2Score}</span>
                </div>
            </div>
        `;
    };

    // Helper for empty slot
    const renderEmpty = () => `
        <div style="background:rgba(255,255,255,0.03); border:1px dashed #333; border-radius:6px; height:86px; min-width:240px; display:flex; align-items:center; justify-content:center;">
            <span style="color:#444; font-size:0.75rem; letter-spacing:2px; font-family:var(--sub-name-font); font-weight:bold;">TBD</span>
        </div>
    `;

    for (let r = 0; r < totalRounds; r++) {
        const roundCapacity = nextPow2 / Math.pow(2, r + 1);
        let matchesInRound = roundBuckets[r] || [];
        
        // Filter out Bronze match from the final round
        if (r === totalRounds - 1 && r > 0) {
            try {
                const prevRoundMatches = roundBuckets[r-1] || [];
                const prevRoundWinners = new Set(prevRoundMatches.map(m => m.winner).filter(w => w));
                const prevRoundLosers = new Set();
                
                prevRoundMatches.forEach(m => {
                    if (m.winner) {
                        prevRoundLosers.add(m.player1 === m.winner ? m.player2 : m.player1);
                    }
                });
                
                if (prevRoundWinners.size > 0) {
                    // Find the match where players are winners (or byes) and NOT losers
                    let finalMatch = matchesInRound.find(m => {
                        if (!m.player1 || !m.player2) return false;
                        const p1IsWinner = prevRoundWinners.has(m.player1);
                        const p2IsWinner = prevRoundWinners.has(m.player2);
                        const p1IsLoser = prevRoundLosers.has(m.player1);
                        const p2IsLoser = prevRoundLosers.has(m.player2);
                        return (p1IsWinner || p2IsWinner) && !p1IsLoser && !p2IsLoser;
                    });

                    // If no active final match found, but we have winners, create a placeholder
                    if (!finalMatch) {
                        const winners = Array.from(prevRoundWinners);
                        if (winners.length >= 1) {
                            finalMatch = {
                                player1: winners[0],
                                player2: winners[1] || 'TBD',
                                player1_score: null,
                                player2_score: null,
                                winner: null
                            };
                        }
                    }

                    matchesInRound = finalMatch ? [finalMatch] : [];
                }
            } catch (e) {
                console.warn("Error filtering final round:", e);
            }
        }
        
        let colTitle = `ROUND ${r + 1}`;
        if (r === totalRounds - 1) colTitle = "FINALS";
        else if (r === totalRounds - 2) colTitle = "SEMI FINALS";
        else if (r === totalRounds - 3) colTitle = "QUARTER FINALS";
        
        let columnContent = '';
        
        for (let i = 0; i < roundCapacity; i++) {
            const match = matchesInRound[i];
            if (match) {
                columnContent += renderBox(match);
            } else {
                columnContent += renderEmpty();
            }
        }

        html += `
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div style="text-align:center; color:#555; font-size:0.75rem; margin-bottom:5px; font-family:var(--sub-name-font); letter-spacing:2px; text-transform:uppercase;">${colTitle}</div>
                <div style="display:flex; flex-direction:column; gap:15px; justify-content:space-around; flex:1;">
                    ${columnContent}
                </div>
            </div>
        `;
    }
    
    html += '</div>';

    return html;
}

// Wrap the output in SafeString to prevent double-escaping
function renderLiveBracketHtmlSafe(t) {
    return unsafeHTML(renderLiveBracketHtml(t));
}

/**
 * Show live event view
 */
function showLiveEventView(event, tournaments, playerMap = {}) {
    const startDate = new Date(event.start_datetime);
    const dateStr = startDate.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    // Helper to render podium card in live view
    const renderLivePodiumCard = (name, rankIcon, color, place) => {
        if (!name) return '';
        // Case-insensitive lookup from the map we fetched
        const p = playerMap[name.toLowerCase()] || { username: name, elo: '-', country: null, avatar_url: null };
        const flag = p.country ? p.country.toLowerCase() : 'fi';
        
        const avatarHtml = p.avatar_url 
            ? `<img src="${p.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">`
            : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #151515; color: #333; font-size: 2.5rem;"><i class="fa fa-user"></i></div>`;

        // Slightly smaller card for live view grid
        return `
            <div data-username="${p.username}" style="cursor: pointer; display:flex; flex-direction:column; align-items:center; margin: 0 5px; position: relative; z-index: ${4-place}; ${place === 1 ? 'transform: scale(1.1); margin-bottom: 10px;' : ''}">
                <div style="font-size: 1.5rem; margin-bottom: 5px; filter: drop-shadow(0 0 10px ${color});">${rankIcon}</div>
                
                <div style="width: 100px; height: 160px; background: #0a0a0a; border: 2px solid ${color}; border-radius: 6px; position: relative; overflow: hidden; box-shadow: 0 0 15px ${color}40; display: flex; flex-direction: column;">
                    <!-- Header -->
                    <div style="background: ${color}; color: #000; padding: 2px 0; text-align: center; font-family: var(--sub-name-font); font-weight: bold; font-size: 0.5rem; letter-spacing: 1px;">
                        ${place === 1 ? 'WINNER' : (place === 2 ? '2ND' : '3RD')}
                    </div>
                    
                    <!-- Image -->
                    <div style="flex: 1; position: relative; overflow: hidden; background: #151515;">
                        ${avatarHtml}
                        <!-- Gradient Overlay for text readability -->
                        <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 60%; background: linear-gradient(to top, #000 0%, transparent 100%);"></div>
                    </div>
                    
                    <!-- Info -->
                    <div style="position: absolute; bottom: 0; left: 0; width: 100%; padding: 8px 4px; box-sizing: border-box; text-align: center;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 3px; margin-bottom: 1px;">
                            <img src="https://flagcdn.com/w40/${flag}.png" style="height: 8px; border-radius: 1px;">
                            <div style="color: #fff; font-family: var(--sub-name-font); font-size: 0.65rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;">
                                ${p.username}
                            </div>
                        </div>
                        <div style="color: ${color}; font-family: 'Russo One'; font-size: 0.9rem;">
                            ${p.elo}
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const content = document.getElementById('live-content') || document.getElementById('content') || document.body;
    
    // Inject styles for live view
    const liveStyles = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Russo+One&display=swap');
            
            @keyframes pulse-live-badge {
                0% { box-shadow: 0 0 0 0 rgba(227, 6, 19, 0.7); }
                70% { box-shadow: 0 0 0 8px rgba(227, 6, 19, 0); }
                100% { box-shadow: 0 0 0 0 rgba(227, 6, 19, 0); }
            }
            
            .live-badge-pulse {
                animation: pulse-live-badge 2s infinite;
            }
            
            .glass-panel {
                background: #0a0a0a;
                border: 1px solid #222;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            }
            
            .bracket-match-card {
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            
            .bracket-match-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(0,0,0,0.4);
                border-color: #555 !important;
            }

        /* Scrollbar styling for live view */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #0a0a0a; 
        }
        ::-webkit-scrollbar-thumb {
            background: #333; 
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #555; 
        }
        </style>
    `;

    content.innerHTML = liveStyles + `
        <div style="max-width:1600px; margin:0 auto; padding:20px; font-family: var(--sub-body-font); min-height: 100vh;">
            <!-- Broadcast Header -->
            <div class="glass-panel" style="text-align:center; margin-bottom:30px; padding:30px; border-radius:16px; border-bottom: 1px solid var(--sub-border); position: relative; overflow: hidden;">
                
                <!-- Background Glow -->
                <div style="position:absolute; top:-50%; left:50%; transform:translateX(-50%); width:60%; height:200%; background:radial-gradient(circle, rgba(227,6,19,0.15) 0%, transparent 70%); pointer-events:none;"></div>

                <button onclick="closeLiveView()" style="position:absolute; top:15px; right:15px; background:rgba(255,255,255,0.05); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:50%; width:36px; height:36px; cursor:pointer; z-index:100; font-size:1rem; transition:all 0.2s; display:flex; align-items:center; justify-content:center;" onmouseover="this.style.background='var(--sub-red)'; this.style.borderColor='var(--sub-red)';" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(255,255,255,0.1)';">
                    <i class="fa fa-times"></i>
                </button>

                ${event.brand_logo_url ? `
                    <div style="background: rgba(255,255,255,0.05); display: inline-block; padding: 8px 20px; border-radius: 8px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.1);">
                        <img src="${event.brand_logo_url}" style="max-height:60px; width:auto; display:block;">
                    </div>
                ` : `
                    <div style="margin-bottom: 15px;">
                        <span style="font-family: 'Resolve'; color: var(--sub-red); font-size: 0.7rem; letter-spacing: 4px; opacity: 0.8;">POWERED BY</span>
                        <div style="font-family: var(--sub-logo-font); color: #fff; font-size: 1.8rem; letter-spacing: 2px; text-shadow: 0 0 20px rgba(227,6,19,0.5);">SUBSOCCER</div>
                    </div>
                `}

                <h1 class="sub-heading-premium" style="font-size:2.5rem; margin-bottom:10px; line-height: 1.1; text-transform:uppercase; letter-spacing:2px;">
                    ${event.event_name}
                </h1>
                
                <div style="display: flex; justify-content: center; gap: 25px; align-items: center; flex-wrap: wrap; margin-top: 10px;">
                    <div style="font-size:0.9rem; color:#aaa; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; display:flex; align-items:center; gap:8px;">
                        <i class="fa fa-calendar" style="color: var(--sub-gold);"></i> ${dateStr}
                    </div>
                    ${event.location ? `
                        <div style="font-size:0.9rem; color:#aaa; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; display:flex; align-items:center; gap:8px;">
                            <i class="fa fa-map-marker-alt" style="color: var(--sub-red);"></i> ${event.location}
                        </div>
                    ` : ''}
                </div>

                <div style="margin-top:20px; display: flex; justify-content: center; gap: 15px;">
                    <div class="sub-badge-live live-badge-pulse" style="font-size: 0.75rem; padding: 6px 16px; border-radius: 30px; letter-spacing: 1.5px; background:var(--sub-red); color:#fff; font-weight:bold; display:flex; align-items:center; gap:8px;">
                        <i class="fa fa-broadcast-tower"></i> LIVE BROADCAST
                    </div>
                </div>
            </div>
            
            <!-- Tournament Grid -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:25px;">
                ${tournaments.map(t => {
        const tDate = new Date(t.start_datetime);
        const timeStr = tDate.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const participantCount = t.computed_participant_count || 0;

        return `
                        <div class="glass-panel" style="border-top: 3px solid ${t.status === 'completed' ? '#4CAF50' : t.status === 'ongoing' ? 'var(--sub-red)' : '#333'}; position: relative; display: flex; flex-direction: column; padding: 25px; border-radius: 12px; height:100%;">
                            
                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:20px;">
                                <div style="flex: 1;">
                                    <div style="font-size:0.7rem; color:var(--sub-gold); font-family: var(--sub-name-font); letter-spacing: 1.5px; margin-bottom: 6px; text-transform: uppercase;">
                                        ${t.game?.game_name || 'Tournament'}
                                    </div>
                                    <h2 style="font-family:var(--sub-name-font); font-size:1.4rem; margin:0; line-height: 1.2; color:#fff; letter-spacing:1px;">
                                        ${t.tournament_name || 'Unofficial Match'}
                                    </h2>
                                </div>
                                <div style="text-align:right; margin-left: 15px;">
                                    ${t.status === 'ongoing' ? `
                                        <div style="color:var(--sub-red); font-size:0.7rem; font-weight:bold; letter-spacing:1px; animation:pulse 1.5s infinite;">● LIVE</div>
                                    ` : `
                                        <div style="font-size:0.7rem; color:${t.status === 'completed' ? '#4CAF50' : '#666'}; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; font-weight: bold;">
                                            ${t.status === 'completed' ? 'FINISHED' : 'SCHEDULED'}
                                        </div>
                                    `}
                                    <div style="margin-top:5px; font-size:1.2rem; color:#fff; font-family: var(--sub-name-font); font-weight:bold;">
                                        ${timeStr}
                                    </div>
                                </div>
                            </div>

                            <div style="height:1px; background:rgba(255,255,255,0.1); margin-bottom:20px;"></div>
                            
                            <div style="flex: 1;">
                                ${t.status === 'completed' || t.status === 'ongoing' ? `
                                    ${t.status === 'completed' ? `
                                        <div style="background:linear-gradient(to bottom, rgba(255, 215, 0, 0.1), rgba(0,0,0,0.6)); border:1px solid var(--sub-gold); border-radius:12px; padding:30px; text-align:center; box-shadow: 0 15px 40px rgba(0,0,0,0.6); margin-bottom: 30px;">
                                            <div style="color:var(--sub-gold); font-family:var(--sub-name-font); font-size:0.7rem; letter-spacing:5px; margin-bottom:15px; text-transform:uppercase; opacity:0.7;">Tournament Podium</div>
                                            <div style="display:flex; justify-content:center; align-items:flex-end; gap:15px;">
                                                ${renderLivePodiumCard(t.second_place_name, '🥈', '#C0C0C0', 2)}
                                                ${renderLivePodiumCard(t.winner_name, '🏆', '#FFD700', 1)}
                                                ${renderLivePodiumCard(t.third_place_name, '🥉', '#CD7F32', 3)}
                                            </div>
                                        </div>
                                    ` : ''}
                                    
                                    <div style="margin-bottom:20px;">
                                        ${renderLiveBracketHtmlSafe(t)}
                                    </div>
                                    
                                    ${t.status === 'ongoing' ? `
                                        <div style="background:rgba(193, 39, 45, 0.05); border:1px solid rgba(193, 39, 45, 0.2); border-radius:var(--sub-radius); padding:20px; text-align:center;">
                                        <div class="sub-badge-live" style="margin-bottom: 20px;">MATCH IN PROGRESS</div>
                                        <div style="color:#fff; font-size:1.2rem; font-family: var(--sub-name-font); letter-spacing: 1px;">
                                            ${participantCount} PLAYERS COMPETING
                                        </div>
                                        <div style="font-size:0.9rem; color:#666; margin-top:15px; font-family: var(--sub-name-font);">
                                            Live results will be displayed here soon
                                        </div>
                                        </div>
                                    ` : ''}
                                ` : `
                                    <div style="background:rgba(255, 255, 255, 0.02); border:1px solid var(--sub-border); border-radius:var(--sub-radius); padding:40px 20px; text-align:center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                                        <div style="color:var(--sub-gold); font-size:1.5rem; font-family: var(--sub-name-font); margin-bottom: 10px;">PRE-MATCH</div>
                                        <div style="color:#666; font-size:1rem; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase;">
                                            Registration open: ${participantCount} players joined
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
            
            ${tournaments.length === 0 ? `
                <div style="text-align:center; padding:100px 20px; color:#444; background: var(--sub-charcoal); border: 1px dashed var(--sub-border); border-radius: var(--sub-radius);">
                    <i class="fa fa-trophy" style="font-size:5rem; margin-bottom:30px; opacity:0.1;"></i>
                    <h3 class="sub-heading-premium" style="font-size: 2rem; opacity: 0.3;">Live Broadcaster standby</h3>
                    <p style="font-size: 1.2rem; opacity: 0.5;">Awaiting tournament schedule from organizer</p>
                </div>
            ` : ''
        }

            <!-- Footer -->
            <div style="text-align:center; margin-top:80px; padding-top:40px; border-top: 1px solid var(--sub-border);">
                <div style="font-family: var(--sub-logo-font); color: rgba(255,255,255,0.2); font-size: 1.5rem; letter-spacing: 1px;">SUBSOCCER PRO</div>
                <div style="margin-top:10px; font-size:0.8rem; color:#444; font-family: var(--sub-name-font); letter-spacing: 2px;">OFFICIAL TOURNAMENT BROADCAST SYSTEM</div>
       </div>
            
            <!-- Ticker -->
            <div class="live-ticker">
                <div class="ticker-content">
                    ${tournaments.length > 0 ? 
                        tournaments.map(t => `
                            <span style="margin-right:50px;">🏆 ${t.tournament_name || 'Tournament'}: ${t.status === 'completed' ? `WINNER: ${t.winner_name}` : 'LIVE NOW'}</span>
                        `).join('') 
                        : 'WELCOME TO SUBSOCCER LIVE EVENTS • FOLLOW THE ACTION • PLAY FAIR • HAVE FUN'
                    }
                    <span style="margin-right:50px;">• POWERED BY SUBSOCCER •</span>
                </div>
            </div>
        </div>
            `;
}

/**
 * Edit existing event
 */
export async function editEvent(eventId) {
    if (!state.user) {
        showNotification('You must be logged in', 'error');
        return;
    }

    try {
        // Fetch event details
        const { data: event, error } = await _supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (error) throw error;

        if (event.organizer_id !== state.user.id) {
            showNotification('You are not authorized to edit this event', 'error');
            return;
        }

        // Close modal first
        closeEventModal();

        // Show events page (this triggers loadEventsPage which clears the view to show loading spinner)
        state.currentPage = 'events';

        // Wait for loading to finish and form container to be ready
        const checkAndPopulate = () => {
            const formContainer = document.getElementById('create-event-form');
            const loading = document.getElementById('loading-overlay');

            // Wait if loading is active (loadEventsPage is running) OR if form container is not yet in DOM
            if ((loading && loading.style.display !== 'none') || !formContainer) {
                setTimeout(checkAndPopulate, 100);
            } else {
                populateEventForm(event);
                formContainer.scrollIntoView({ behavior: 'smooth' });
            }
        };
        checkAndPopulate();

    } catch (e) {
        console.error('Failed to load event for editing:', e);
        showNotification('Failed to load event: ' + e.message, 'error');
    }
}

/**
 * Helper to populate the event form with existing data
 */
function populateEventForm(event) {
    showCreateEventForm(event);

    const nameInput = document.getElementById('event-name-input');
    const typeSelect = document.getElementById('event-type-select');
    const startInput = document.getElementById('event-start-input');
    const endInput = document.getElementById('event-end-input');
    const locationInput = document.getElementById('event-location-input');
    const descInput = document.getElementById('event-desc-input');
    const colorInput = document.getElementById('event-color-input');
    const brandPreview = document.getElementById('brand-logo-preview');
    const imagePreview = document.getElementById('event-image-preview');

    if (nameInput) nameInput.value = event.event_name || '';
    if (typeSelect) typeSelect.value = event.event_type || 'tournament';
    if (locationInput) locationInput.value = event.location || '';
    if (descInput) descInput.value = event.description || '';

    if (startInput && event.start_datetime) {
        startInput.value = new Date(event.start_datetime).toISOString().slice(0, 16);
    }
    if (endInput && event.end_datetime) {
        endInput.value = new Date(event.end_datetime).toISOString().slice(0, 16);
    }

    if (colorInput && event.primary_color) colorInput.value = event.primary_color;

    if (brandPreview && event.brand_logo_url) {
        brandPreview.innerHTML = `<img src="${event.brand_logo_url}" style="height:40px; width:auto; margin-right:10px;">`;
    }

    if (imagePreview && event.image_url) {
        imagePreview.innerHTML = `
            <div style="position:relative; width:100%; max-width:300px;">
                <img src="${event.image_url}" style="width:100%; border-radius:8px; border:2px solid var(--sub-gold);">
                    <button onclick="clearEventImage()" style="position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.8); color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; font-size:1.2rem;">×</button>
                </div>
        `;
        const fileLabel = document.getElementById('event-image-label');
        if (fileLabel) fileLabel.style.display = 'none';
    }
}

/**
 * Update event from form
 */
export async function updateEventForm(eventId) {
    if (!state.user) {
        showNotification('You must be logged in', 'error');
        return;
    }

    const btn = document.querySelector(`button[data-action="update-event-form"][data-id="${eventId}"]`);
    if (btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> SAVING...';
    }

    // Get form values
    const eventName = document.getElementById('event-name-input')?.value.trim();
    const eventType = document.getElementById('event-type-select')?.value;
    const startDatetime = document.getElementById('event-start-input')?.value;
    const endDatetime = document.getElementById('event-end-input')?.value || null;
    const description = document.getElementById('event-desc-input')?.value.trim();
    const location = document.getElementById('event-location-input')?.value.trim() || null;
    const primaryColor = document.getElementById('event-color-input')?.value;

    // Validate required fields
    if (!eventName || !startDatetime) {
        showNotification('Please fill required fields (Event Name, Start Time)', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-save"></i> SAVE CHANGES'; }
        return;
    }

    try {
        let imageUrl = undefined;
        let brandLogoUrl = undefined;

        if (selectedEventImage) {
            showNotification('Uploading new image...', 'success');
            imageUrl = await uploadEventImage(selectedEventImage, true);
        }

        if (selectedBrandLogo) {
            showNotification('Uploading new logo...', 'success');
            brandLogoUrl = await uploadEventImage(selectedBrandLogo, false);
        }

        const updates = {
            event_name: eventName,
            event_type: eventType,
            start_datetime: startDatetime ? new Date(startDatetime).toISOString() : null,
            end_datetime: endDatetime ? new Date(endDatetime).toISOString() : null,
            description: description,
            location: location,
            primary_color: primaryColor
        };
        if (imageUrl) updates.image_url = imageUrl;
        if (brandLogoUrl) updates.brand_logo_url = brandLogoUrl;

        // Update event in database
        const { error } = await _supabase.from('events').update(updates)
            .eq('id', eventId)
            .eq('organizer_id', state.user.id); // Security check

        if (error) throw error;

        showNotification('Event updated successfully!', 'success');
        hideCreateEventForm();
        loadEventsPage();

    } catch (e) {
        console.error('Failed to update event:', e);
        showNotification('Failed to update event: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-save"></i> SAVE CHANGES'; }
    }
}

// Global bindings for HTML onclick handlers
window.loadEventsPage = loadEventsPage;
window.showCreateEventForm = showCreateEventForm;
window.hideCreateEventForm = hideCreateEventForm;
window.previewEventImage = previewEventImage;
window.clearEventImage = clearEventImage;
window.previewBrandLogo = previewBrandLogo;
window.clearBrandLogo = clearBrandLogo;
window.createNewEvent = createNewEvent;
window.editEvent = editEvent;
window.updateEventForm = updateEventForm;
window.viewEventDetails = viewEventDetails;
window.closeEventModal = closeEventModal;
window.deleteEvent = deleteEvent;
window.handleParticipantSearch = handleParticipantSearch;
window.selectParticipantFromDropdown = selectParticipantFromDropdown;
window.addParticipantFromSearch = addParticipantFromSearch;
window.viewTournamentParticipants = viewTournamentParticipants;
window.closeParticipantsModal = closeParticipantsModal;
// window.addTournamentParticipant = addTournamentParticipant; // Function not defined - removed
window.removeTournamentParticipant = removeTournamentParticipant;
window.showCreateTournamentForm = showCreateTournamentForm;
window.closeTournamentForm = closeTournamentForm;
window.createTournament = createTournament;
window.registerForTournament = registerForTournament;
window.unregisterFromTournament = unregisterFromTournament;
window.editTournament = editTournament;
window.deleteTournament = deleteTournament;
window.saveTournamentEdit = saveTournamentEdit;
window.showEmailPrompt = showEmailPrompt;
window.closeEmailPrompt = closeEmailPrompt;
window.saveEmailAndRegister = saveEmailAndRegister;
window.shareLiveEventLink = shareLiveEventLink;
window.viewLiveEvent = viewLiveEvent;
window.closeLiveView = closeLiveView;

/**
 * Close live event view
 */
export function closeLiveView() {
    const content = document.getElementById('live-content');
    if (content) content.remove();
    
    document.body.classList.remove('live-mode');
    
    if (window.liveEventRefreshInterval) {
        clearInterval(window.liveEventRefreshInterval);
        window.liveEventRefreshInterval = null;
    }
    
    // Clean up URL
    const url = new URL(window.location);
    url.searchParams.delete('live');
    window.history.replaceState({}, '', url);
    
    const appContent = document.getElementById('app-content');
    const navTabs = document.getElementById('nav-tabs');
    const header = document.querySelector('header');
    const menuBtn = document.getElementById('menu-toggle-btn');
    const authPage = document.getElementById('auth-page');

    // Restore Header
    if (header) header.style.display = '';
    if (menuBtn) menuBtn.style.display = 'block';

    // Check login state to decide what to show
    if (state.user) {
        // User is logged in (or guest) -> Show App
        if (appContent) {
            appContent.style.display = 'flex';
            appContent.classList.remove('fade-in');
            void appContent.offsetWidth; 
            appContent.classList.add('fade-in');
        }
        if (navTabs) navTabs.style.setProperty('display', 'flex', 'important');
        if (authPage) authPage.style.display = 'none';
    } else {
        // User not logged in -> Show Auth
        if (authPage) authPage.style.display = 'flex';
        if (appContent) appContent.style.display = 'none';
        if (navTabs) navTabs.style.display = 'none';
    }
}

// Check for live event URL parameter on page load
// Wrap in DOMContentLoaded to ensure elements exist
export function checkLiveEventParam() {
    if (window.location.search.includes('live=')) {
        const urlParams = new URLSearchParams(window.location.search);
        const liveEventId = urlParams.get('live');
        if (liveEventId) {
            console.log('Live event ID detected:', liveEventId);

            // Activate live mode via CSS class
            document.body.classList.add('live-mode');

            // Create live content container if it doesn't exist
            let liveContainer = document.getElementById('live-content');
            if (!liveContainer) {
                liveContainer = document.createElement('div');
                liveContainer.id = 'live-content';
                liveContainer.style.cssText = 'width:100%; min-height:100vh; padding:20px; box-sizing:border-box; background:#000; color:#fff;';
                document.body.appendChild(liveContainer);
                console.log('Live container created');
            }

            // Explicitly ensure other modals/overlays are closed
            const overlays = ['.modal-overlay', '#victory-overlay', '#loading-overlay'];
            overlays.forEach(selector => {
                const el = document.querySelector(selector);
                if (el) el.style.display = 'none';
            });

            // Load live view content
            console.log('Loading live event view...');
            viewLiveEvent(liveEventId);
        }
    }
}


// ============================================================
// ============================================================
// TOURNAMENT BRACKET SYSTEM (IN-MEMORY, LIKE TOURNAMENT MODE)
// Uses JavaScript state, saves final result to tournament_history
// ============================================================

/**
 * View tournament bracket - loads participants and starts bracket
 */
export async function viewTournamentBracket(tournamentId, tournamentName, maxParticipants) {
    console.log('viewTournamentBracket called:', { tournamentId, tournamentName, maxParticipants });
    try {
        currentEventTournamentId = tournamentId;
        currentEventTournamentName = tournamentName;

        // First, check if tournament is completed
        const { data: tournament, error: tournamentError } = await _supabase
            .from('tournament_history')
            .select('status, winner_name, second_place_name, third_place_name')
            .eq('id', tournamentId)
            .single();

        if (tournamentError) throw tournamentError;

        // If completed, show final results
        if (tournament && tournament.status === 'completed') {
            // Fetch player details for podium (ELO, Avatar, Country)
            const names = [tournament.winner_name, tournament.second_place_name, tournament.third_place_name].filter(n => n);
            let players = [];
            if (names.length > 0) {
                const { data } = await _supabase
                    .from('players')
                    .select('username, elo, country, avatar_url')
                    .in('username', names);
                players = data || [];
            }
            showCompletedTournamentBracket(tournament, players);
            return;
        }

        // Update status to 'ongoing' if it's scheduled
        if (tournament && tournament.status === 'scheduled') {
            await _supabase
                .from('tournament_history')
                .update({ status: 'ongoing' })
                .eq('id', tournamentId);
        }

        // Fetch participants from event_registrations
        const { data: registrations, error } = await _supabase
            .from('event_registrations')
            .select(`
        player_id,
            players: player_id(id, username)
                `)
            .eq('tournament_id', tournamentId)
            .eq('status', 'registered');

        if (error) throw error;

        console.log('Fetched registrations:', registrations);

        if (!registrations || registrations.length < 2) {
            showNotification('Not enough players (minimum 2 required)', 'error');
            return;
        }

        // Extract player usernames and shuffle
        const players = registrations.map(r => r.players.username);
        console.log('Players:', players);

        // TÄRKEÄ KORJAUS: Tarkistetaan onko turnauksen rakenne jo muistissa
        if (bracketStateCache[tournamentId]) {
            const cache = bracketStateCache[tournamentId];
            currentEventBracketParticipants = cache.currentEventBracketParticipants;
            eventRoundPlayers = cache.eventRoundPlayers;
            eventRoundWinners = cache.eventRoundWinners;
            eventFinalists = cache.eventFinalists;
            eventBronzeContenders = cache.eventBronzeContenders;
            eventBronzeWinner = cache.eventBronzeWinner;
        } else {
            // Luodaan uusi rakenne vain jos sitä ei ole aiemmin avattu
            const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
            currentEventBracketParticipants = shuffledPlayers;
            eventRoundPlayers = [...shuffledPlayers];
            eventRoundWinners = [];
            eventFinalists = [];
            eventBronzeContenders = [];
            eventBronzeWinner = null;

            // Jos vain 2 pelaajaa, siirrytään suoraan finaaliin
            if (shuffledPlayers.length === 2) {
                eventFinalists = [...shuffledPlayers];
                eventRoundPlayers = [];
            }
            
            // Tallennetaan muistiin
            bracketStateCache[tournamentId] = {
                currentEventBracketParticipants, eventRoundPlayers, eventRoundWinners, 
                eventFinalists, eventBronzeContenders, eventBronzeWinner
            };
        }

        // Calculate byes
        const byes = BracketEngine.calculateByes(players.length);
        console.log('About to show bracket with byes:', byes);

        // Show bracket
        showEventBracket(byes);

    } catch (error) {
        console.error('Error loading bracket:', error);
        showNotification('Failed to load bracket: ' + error.message, 'error');
    }
}

/**
 * Show completed tournament results
 */
function showCompletedTournamentBracket(tournament, players = []) {
    const a = document.createElement('div');
    a.id = 'bracket-area';
    a.style.textAlign = 'center';

    // Show final results
    if (tournament.third_place_name) {
        // Tournament had bronze match
        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:15px; color:#CD7F32; text-align:center; font-size:0.75rem; letter-spacing:2px;">🥉 BRONZE MATCH</h3>`;
        a.appendChild(BracketEngine.renderMatch(
            tournament.third_place_name, null, 0, tournament.third_place_name, '', { isBronze: true }
        ));
    }

    // Final
    a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin:10px 0 15px 0; color:var(--sub-gold); text-align:center; font-size:0.75rem; letter-spacing:2px;">🏆 FINAL</h3>`;
    a.appendChild(BracketEngine.renderMatch(
        tournament.winner_name, tournament.second_place_name, 0, tournament.winner_name, '', { isFinal: true }
    ));

    // Podium Logic with Player Cards
    // FIX: Case-insensitive lookup to ensure avatar is found even if casing differs
    const getPlayer = (name) => players.find(p => p.username.toLowerCase() === name.toLowerCase()) || { username: name, elo: '-', country: null, avatar_url: null };
    
    const winner = getPlayer(tournament.winner_name);
    const second = tournament.second_place_name ? getPlayer(tournament.second_place_name) : null;
    const third = tournament.third_place_name ? getPlayer(tournament.third_place_name) : null;

    const renderCard = (p, rankIcon, color, place) => {
        if (!p) return '';
        const flag = p.country ? p.country.toLowerCase() : 'fi';
        
        // Card styles
        const cardStyle = `
            width: 140px;
            height: 220px;
            background: #0a0a0a;
            border: 2px solid ${color};
            border-radius: 8px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 0 15px ${color}40;
            display: flex;
            flex-direction: column;
        `;

        const avatarHtml = p.avatar_url 
            ? `<img src="${p.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">`
            : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #151515; color: #333; font-size: 3rem;"><i class="fa fa-user"></i></div>`;

        return `
            <div data-username="${p.username}" style="cursor: pointer; display:flex; flex-direction:column; align-items:center; margin: 0 8px; position: relative; z-index: ${4-place}; ${place === 1 ? 'transform: scale(1.15); margin-bottom: 15px;' : ''}">
                <div style="font-size: 2rem; margin-bottom: 8px; filter: drop-shadow(0 0 10px ${color}); animation: bounceIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${place * 0.2}s both;">${rankIcon}</div>
                
                <div class="podium-card" style="${cardStyle}">
                    <!-- Header -->
                    <div style="background: ${color}; color: #000; padding: 3px 0; text-align: center; font-family: var(--sub-name-font); font-weight: bold; font-size: 0.6rem; letter-spacing: 1px;">
                        ${place === 1 ? 'CHAMPION' : (place === 2 ? 'FINALIST' : '3RD PLACE')}
                    </div>
                    
                    <!-- Image Area -->
                    <div style="flex: 1; position: relative; overflow: hidden;">
                        ${avatarHtml}
                        <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 60%; background: linear-gradient(to top, #000 0%, transparent 100%);"></div>
                    </div>
                    
                    <!-- Info Area -->
                    <div style="position: absolute; bottom: 0; left: 0; width: 100%; padding: 12px 8px; box-sizing: border-box; text-align: center;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 5px; margin-bottom: 2px;">
                            <img src="https://flagcdn.com/w40/${flag}.png" style="height: 10px; border-radius: 1px;">
                            <div style="color: #fff; font-family: var(--sub-name-font); font-size: 0.75rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${p.username}
                            </div>
                        </div>
                        <div style="color: ${color}; font-family: 'Russo One'; font-size: 1.2rem; text-shadow: 0 2px 8px rgba(0,0,0,0.8);">
                            ${p.elo}
                        </div>
                        <div style="color: #666; font-size: 0.55rem; letter-spacing: 1px; font-family: var(--sub-name-font);">ELO RATING</div>
                    </div>
                </div>
                
                <!-- Reflection -->
                <div style="width: 120px; height: 15px; background: radial-gradient(ellipse at center, ${color}60 0%, transparent 70%); margin-top: 15px; filter: blur(6px); opacity: 0.6;"></div>
            </div>
        `;
    };

    a.innerHTML += `
        <div style="margin-top:40px; margin-bottom:20px;">
            <div style="font-family:var(--sub-name-font); color:#888; font-size:0.8rem; letter-spacing:3px; text-transform:uppercase; margin-bottom:20px;">Tournament Podium</div>
            <div style="display:flex; align-items:flex-end; justify-content:center; gap:15px;">
                ${renderCard(second, '🥈', '#C0C0C0', 2)}
                ${renderCard(winner, '🏆', '#FFD700', 1)}
                ${renderCard(third, '🥉', '#CD7F32', 3)}
            </div>
        </div>
    `;

    const modalContent = `
            ${a.outerHTML}

        <div style="text-align:center; margin-top:20px; padding-top:20px; border-top:1px solid #333;">
            <button data-action="close-bracket-modal" class="btn-red" style="padding:15px 40px;"><i class="fa fa-times"></i> CLOSE</button>
        </div>
        `;

    showModal(currentEventTournamentName, modalContent, {
        id: 'bracket-modal',
        maxWidth: '600px'
    });
}

/**
 * Display bracket modal with current bracket state
 */
function showEventBracket(byes = 0) {
    console.log('showEventBracket called with byes:', byes, 'eventRoundPlayers:', eventRoundPlayers);
    const a = document.createElement('div');
    a.id = 'bracket-area';

    // Handle final round (with bronze match)
    if (eventFinalists.length === 2) {
        // Bronze Match
        if (eventBronzeContenders.length === 2) {
            a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:10px; color:#CD7F32; text-align:center; font-size:0.8rem; letter-spacing:2px;">🥉 BRONZE MATCH</h3>`;
            a.appendChild(BracketEngine.renderMatch(
                eventBronzeContenders[0],
                eventBronzeContenders[1],
                0,
                eventBronzeWinner,
                'pickEventBronzeWinner',
                { isBronze: true }
            ));
        }

        // Final
        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:10px; color:var(--sub-gold); text-align:center; font-size:0.8rem; letter-spacing:2px;">🏆 FINAL</h3>`;
        a.appendChild(BracketEngine.renderMatch(
            eventFinalists[0],
            eventFinalists[1],
            0,
            eventRoundWinners[0],
            'pickEventWinner',
            { isFinal: true }
        ));
    }
    // Handle single winner
    else if (eventRoundPlayers.length === 1 && eventFinalists.length === 0) {
        a.innerHTML = `
            <div style="text-align:center;">
                <h2 style="font-family:var(--sub-name-font); color:var(--sub-gold); text-transform:uppercase; letter-spacing:2px;">🏆 WINNER: ${eventRoundPlayers[0]}</h2>
                ${eventBronzeWinner ? `<h3 style="font-family:var(--sub-name-font); color:#CD7F32; margin-top:10px; text-transform:uppercase; font-size:0.9rem;">🥉 Bronze: ${eventBronzeWinner}</h3>` : ''}
            </div>
            `;
    }
    // Handle regular rounds
    else {
        const playersWithBye = eventRoundPlayers.slice(0, byes);
        const matchesToPlay = (eventRoundPlayers.length - byes) / 2;

        // Automatically advance BYE players
        playersWithBye.forEach((p, idx) => { if (!eventRoundWinners[idx]) eventRoundWinners[idx] = p; });

        for (let i = 0; i < matchesToPlay; i++) {
            const winnerIndex = byes + i;
            const match = BracketEngine.getMatchPlayers(eventRoundPlayers, eventRoundWinners, winnerIndex);
            a.appendChild(BracketEngine.renderMatch(
                match.p1,
                match.p2,
                winnerIndex,
                eventRoundWinners[winnerIndex],
                'pickEventWinner'
            ));
        }

        // Show BYE players if any
        if (playersWithBye.length > 0) {
            a.innerHTML += `<h4 style="font-family:var(--sub-name-font); text-transform:uppercase; margin: 20px 0 10px 0; opacity: 0.5; text-align:center; font-size:0.75rem; letter-spacing:2px;">Byes (Next Round)</h4>`;
            playersWithBye.forEach(p => {
                const byeEl = document.createElement('div');
                byeEl.innerHTML = `<div style="padding:10px 15px; background: #0a0a0a; border:1px solid #222; border-radius:var(--sub-radius); margin-bottom:10px; width:100%; max-width:400px; font-family:var(--sub-name-font); opacity:0.5; margin:0 auto 10px; text-transform:uppercase;">${p}</div>`;
                a.appendChild(byeEl);
            });
        }
    }

    // Create/update modal
    let modal = document.getElementById('bracket-modal');
    const isComplete = eventRoundPlayers.length === 1 && eventFinalists.length === 0;

    const nextBtnHtml = checkEventBracketCompletion();

    const modalContent = `
            ${a.outerHTML}

        <div style="text-align:center; margin-top:20px; padding-top:20px; border-top:1px solid #333;">
            <div id="event-bracket-controls">${nextBtnHtml}</div>
        </div>
        `;

    showModal(currentEventTournamentName, modalContent, {
        id: 'bracket-modal',
        maxWidth: '600px'
    });
}

/**
 * Pick winner for a match
 */
export async function pickEventWinner(idx, playerName) {
    // Save match to database
    const match = getCurrentEventMatch(idx);
    if (match.p1 && match.p2) {
        await saveEventMatch(match.p1, match.p2, playerName);
    }
    showNotification(`${playerName} wins! Match recorded.`, 'success');

    eventRoundWinners[idx] = playerName;

    // Recalculate byes for current state
    const byes = BracketEngine.calculateByes(eventRoundPlayers.length);

    showEventBracket(byes);
}

/**
 * Pick bronze match winner
 */
export async function pickEventBronzeWinner(idx, playerName) {
    await saveEventMatch(eventBronzeContenders[0], eventBronzeContenders[1], playerName);
    eventBronzeWinner = playerName;
    showNotification(`${playerName} wins bronze match! Match recorded.`, 'success');
    showEventBracket();
}

/**
 * Get current match players for saving
 */
function getCurrentEventMatch(idx) {
    return BracketEngine.getMatchPlayers(eventRoundPlayers, eventRoundWinners, idx);
}

/**
 * Save individual match to database and update ELO ratings
 */
async function saveEventMatch(player1, player2, winner) {
    await MatchService.recordMatch({
        player1Name: player1,
        player2Name: player2,
        winnerName: winner,
        tournamentId: currentEventTournamentId,
        tournamentName: currentEventTournamentName
    });
}

/**
 * Check if round is complete and return next button HTML
 */
function checkEventBracketCompletion() {
    const isComplete = BracketEngine.isRoundComplete(
        eventRoundPlayers,
        eventRoundWinners,
        eventFinalists.length
    );

    if (isComplete && (eventFinalists.length === 2 || eventRoundPlayers.length === 1)) {
        return '<button data-action="finish-event-tournament" class="btn-red" style="padding:15px 40px;"><i class="fa fa-trophy"></i> FINISH TOURNAMENT</button>';
    }

    const byes = BracketEngine.calculateByes(eventRoundPlayers.length);
    const matchesToPlay = (eventRoundPlayers.length - byes) / 2;
    const expectedWinners = byes + matchesToPlay;
    const pickedWinners = eventRoundWinners.filter(w => w).length;

    if (pickedWinners === expectedWinners && matchesToPlay > 0) {
        return '<button data-action="advance-event-round" class="btn-red" style="padding:15px 40px;">NEXT ROUND <i class="fa fa-arrow-right"></i></button>';
    }

    return '<small style="color:#666;">Select winners for all matches</small>';
}

/**
 * Advance to next round
 */
export function advanceEventRound() {
    const winners = eventRoundWinners.filter(w => w);

    // Check if moving to finals
    if (eventRoundPlayers.length === 4) {
        const losers = eventRoundPlayers.filter(p => !winners.includes(p));
        eventBronzeContenders = [...losers];
        eventFinalists = [...winners];
        eventRoundWinners = [];
        showEventBracket();
        return;
    }

    // Jos jäljellä on tasan 2 voittajaa, he ovat finalistit (ilman pronssiottelua)
    if (winners.length === 2) {
        eventFinalists = [...winners];
        eventRoundPlayers = [];
        eventRoundWinners = [];
        showEventBracket();
        return;
    }

    // Advance winners to next round
    eventRoundPlayers = winners;
    eventRoundWinners = [];

    const nextByes = BracketEngine.calculateByes(eventRoundPlayers.length);

    showEventBracket(nextByes);
}

/**
 * Finish tournament and save to history
 */
export async function finishEventTournament() {
    try {
        console.log('finishEventTournament called');
        console.log('eventFinalists:', eventFinalists);
        console.log('eventRoundWinners:', eventRoundWinners);
        console.log('eventRoundPlayers:', eventRoundPlayers);
        console.log('eventBronzeWinner:', eventBronzeWinner);
        console.log('currentEventTournamentId:', currentEventTournamentId);

        // Determine winner and second place based on current state
        let winnerName, secondPlaceName;

        if (eventFinalists.length === 2) {
            // Final has been played
            winnerName = eventRoundWinners[0];
            secondPlaceName = eventFinalists.find(p => p !== winnerName);
        } else {
            // Single winner (2 players only)
            winnerName = eventRoundPlayers[0];
            secondPlaceName = currentEventBracketParticipants.find(p => p !== winnerName);
        }

        console.log('Winner:', winnerName);
        console.log('Second place:', secondPlaceName);

        // Update tournament_history table with results
        const updateData = {
            winner_name: winnerName,
            second_place_name: secondPlaceName,
            status: 'completed',
            end_datetime: new Date().toISOString()
        };

        if (eventBronzeWinner) {
            updateData.third_place_name = eventBronzeWinner;
        }

        console.log('Update data:', updateData);

        const { error } = await _supabase
            .from('tournament_history')
            .update(updateData)
            .eq('id', currentEventTournamentId);

        console.log('Update error:', error);

        if (error) throw error;

        showNotification('Tournament completed successfully!', 'success');
        closeBracketModal();

        // Refresh event details if we have the event ID
        if (currentEventId) {
            viewEventDetails(currentEventId);
        }

    } catch (error) {
        console.error('Error finishing tournament:', error);
        showNotification('Failed to save tournament: ' + error.message, 'error');
    }
}

/**
 * Close bracket modal
 */
export function closeBracketModal() {
    closeModal('bracket-modal');

    // Reset bracket state
    eventRoundPlayers = [];
    eventRoundWinners = [];
    eventFinalists = [];
    eventBronzeContenders = [];
    eventBronzeWinner = null;
    currentEventBracketParticipants = [];
}

/**
 * Load and display moderator list
 */
async function loadModeratorList(eventId, moderatorIds = []) {
    const list = document.getElementById('event-moderators-list');
    if (!list) return;

    if (moderatorIds.length === 0) {
        list.innerHTML = '<span style="color:#666; font-size:0.75rem;">No delegated moderators</span>';
        return;
    }

    try {
        const { data: players } = await _supabase
            .from('players')
            .select('id, username')
            .in('id', moderatorIds);

        list.innerHTML = (players || []).map(p => `
            <div style="background:#222; border-radius:15px; padding:4px 10px; display:flex; align-items:center; gap:8px; border:1px solid #444;">
                <span style="font-size:0.8rem; color:#fff;">${p.username}</span>
                <button data-action="remove-moderator" data-event-id="${eventId}" data-player-id="${p.id}" 
                    style="background:none; border:none; color:var(--sub-red); cursor:pointer; padding:0; font-size:0.8rem;">
                    <i class="fa fa-times"></i>
                </button>
            </div>
            `).join('');
    } catch (e) {
        console.error('Failed to load moderator details:', e);
    }
}

/**
 * Search players to add as moderators
 */
export async function searchModerators(query, eventId) {
    const resultsContainer = document.getElementById('mod-search-results');
    if (!resultsContainer || query.length < 2) {
        if (resultsContainer) resultsContainer.innerHTML = '';
        return;
    }

    try {
        const { data: players } = await _supabase
            .from('players')
            .select('id, username')
            .ilike('username', `%${query}%`)
            .limit(5);

        resultsContainer.innerHTML = (players || []).map(p => `
            <div style="padding:8px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#fff; font-size:0.85rem;">${p.username}</span>
                <button data-action="add-moderator" data-event-id="${eventId}" data-player-id="${p.id}" data-username="${p.username}"
                    style="background:var(--sub-red); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">
                    ADD
                </button>
            </div>
            `).join('') || '<div style="padding:8px; color:#666; font-size:0.85rem;">No players found</div>';
    } catch (e) {
        console.error('Search failed:', e);
    }
}

/**
 * Add a moderator to an event
 */
export async function addModerator(eventId, playerId, username) {
    try {
        const { error } = await _supabase
            .from('event_moderators')
            .insert({ event_id: eventId, player_id: playerId });

        if (error) {
            if (error.code === '23505') {
                showNotification('Player is already a moderator', 'warning');
            } else {
                throw error;
            }
        } else {
            showNotification(`${username} added as moderator`, 'success');
            // Refresh details to update list
            viewEventDetails(eventId);
        }
    } catch (e) {
        console.error('Failed to add moderator:', e);
        if (e.message?.includes('404') || e.code === '42P01') {
            showNotification('Moderator system not configured. Please run the SQL script.', 'error');
        } else {
            showNotification('Failed to add moderator: ' + e.message, 'error');
        }
    }
}

/**
 * Remove a moderator from an event
 */
export async function removeModerator(eventId, playerId) {
    try {
        const { error } = await _supabase
            .from('event_moderators')
            .delete()
            .eq('event_id', eventId)
            .eq('player_id', playerId);

        if (error) throw error;

        showNotification('Moderator removed', 'success');
        viewEventDetails(eventId);
    } catch (e) {
        console.error('Failed to remove moderator:', e);
        if (e.message?.includes('404') || e.code === '42P01') {
            showNotification('Moderator system not configured. Please run the SQL script.', 'error');
        } else {
            showNotification('Failed to remove moderator: ' + e.message, 'error');
        }
    }
}

// Auto-check for live event mode on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkLiveEventParam);
} else {
    checkLiveEventParam();
}
