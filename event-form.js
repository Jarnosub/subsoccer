import { _supabase, state } from './config.js';
import { showNotification, showLoading, hideLoading } from './ui-utils.js';
import { canModerateEvent, closeEventModal } from './event-ui.js';

/**
 * ============================================================
 * EVENT FORM & UPLOAD COMPONENT
 * Handles event/tournament creation and image processing
 * ============================================================
 */

let selectedEventImage = null;
let selectedBrandLogo = null;

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

    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    document.getElementById('event-start-input').addEventListener('change', (e) => {
        const endInput = document.getElementById('event-end-input');
        if (endInput) {
            endInput.min = e.target.value;
            const sDate = new Date(e.target.value);
            const eDate = new Date(sDate.getTime() + 30 * 60 * 1000);
            endInput.value = formatForInput(eDate);
        }
    });
}

export function hideCreateEventForm() {
    const formContainer = document.getElementById('create-event-form');
    if (formContainer) {
        formContainer.style.display = 'none';
        formContainer.innerHTML = '';
    }
    selectedEventImage = null;
    selectedBrandLogo = null;
}

export function previewEventImage(input) {
    const preview = document.getElementById('event-image-preview');
    const fileLabel = document.getElementById('event-image-label');
    if (!preview) return;

    if (input.files && input.files[0]) {
        selectedEventImage = input.files[0];
        if (selectedEventImage.size > 5 * 1024 * 1024) {
            showNotification('Image too large. Max 5MB allowed.', 'error');
            input.value = '';
            selectedEventImage = null;
            preview.innerHTML = '';
            return;
        }
        if (fileLabel) fileLabel.style.display = 'none';
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

export function clearEventImage() {
    const input = document.getElementById('event-image-input');
    const preview = document.getElementById('event-image-preview');
    const fileLabel = document.getElementById('event-image-label');
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
    if (fileLabel) fileLabel.style.display = 'inline-block';
    selectedEventImage = null;
}

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

export async function createNewEvent() {
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

    const eventName = document.getElementById('event-name-input')?.value.trim();
    const eventType = document.getElementById('event-type-select')?.value;
    const startDatetime = document.getElementById('event-start-input')?.value;
    const endDatetime = document.getElementById('event-end-input')?.value || null;
    const description = document.getElementById('event-desc-input')?.value.trim();
    const location = document.getElementById('event-location-input')?.value.trim() || null;
    const primaryColor = document.getElementById('event-color-input')?.value;

    if (!eventName || !startDatetime) {
        showNotification('Please fill required fields (Event Name, Start Time)', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-check"></i> CREATE EVENT'; }
        return;
    }

    try {
        let imageUrl = null;
        let brandLogoUrl = null;

        if (selectedEventImage) {
            showNotification('Uploading image...', 'success');
            imageUrl = await uploadEventImage(selectedEventImage, true);
        }

        if (selectedBrandLogo) {
            showNotification('Uploading logo...', 'success');
            brandLogoUrl = await uploadEventImage(selectedBrandLogo, false);
        }

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
        };

        const { error } = await _supabase.from('events').insert(eventData).select().single();
        if (error) throw error;

        showNotification('Event created successfully! 🎉', 'success');
        hideCreateEventForm();
        // window.loadEventsPage is called globally in events-v3-final.js
        if (window.loadEventsPage) window.loadEventsPage();

    } catch (e) {
        console.error('Failed to create event:', e);
        showNotification('Failed to create event: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-check"></i> CREATE EVENT'; }
    }
}

async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
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
            fileExt = 'jpg';
        } catch (e) {
            console.warn('Image compression failed, uploading original:', e);
        }
    }
    const fileName = `${state.user.id}-${Date.now()}.${fileExt}`;
    const { error } = await _supabase.storage.from('event-images').upload(fileName, fileToUpload, { cacheControl: '3600', upsert: false });
    if (error) throw new Error('Image upload failed');
    const { data: { publicUrl } } = _supabase.storage.from('event-images').getPublicUrl(fileName);
    return publicUrl;
}

export async function showCreateTournamentForm(eventId, eventName) {
    if (!state.user) {
        showNotification('You must be logged in to create tournaments', 'error');
        return;
    }
    if (!state.allGames || state.allGames.length === 0) {
        showLoading();
        const { data: games, error } = await _supabase.from('games').select('*').eq('is_public', true).order('game_name');
        hideLoading();
        if (error || !games || games.length === 0) {
            showNotification('No game tables available.', 'error');
            return;
        }
        state.allGames = games;
    }

    const gameOptions = state.allGames.map(g => `<option value="${g.id}">${g.game_name}${g.location ? ' - ' + g.location : ''}</option>`).join('');
    const now = new Date();
    const startTime = getRoundedTime(now);
    const defaultStartTime = formatForInput(startTime);
    const defaultEndTime = formatForInput(new Date(startTime.getTime() + 30 * 60 * 1000));

    const formHtml = `
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; overflow-y:auto; padding:20px; box-sizing:border-box;">
                <div style="max-width:500px; margin:0 auto; background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px;">
                    <h2 style="font-family:var(--sub-name-font); font-size:1.1rem; margin:0 0 20px 0; color:var(--sub-gold); text-align:center; text-transform:uppercase; letter-spacing:2px;">
                        <i class="fa fa-trophy" style="margin-right:8px;"></i> CREATE TOURNAMENT
                    </h2>
                    <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:15px; font-size:0.85rem; color:#888;">Event: <span style="color:#fff;">${eventName}</span></div>
                    <div style="margin-bottom:15px;"><label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">TOURNAMENT NAME</label><input type="text" id="tournament-name-input" placeholder="e.g. Morning Finals" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff;"></div>
                    <div style="margin-bottom:15px;"><label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">GAME TABLE *</label><select id="tournament-game-select" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff;">${gameOptions}</select></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                        <div><label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">START TIME *</label><input type="datetime-local" id="tournament-start-input" value="${defaultStartTime}" min="${defaultStartTime}" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; color-scheme:dark;"></div>
                        <div><label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">END TIME</label><input type="datetime-local" id="tournament-end-input" value="${defaultEndTime}" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; color-scheme:dark;"></div>
                    </div>
                    <div style="margin-bottom:15px;"><label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">MAX PLAYERS</label><input type="number" id="tournament-max-input" value="8" min="2" max="32" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff;"></div>
                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" onclick="createTournament('${eventId}')">CREATE</button>
                        <button class="btn-red" style="flex:1; background:#333;" onclick="closeTournamentForm()">CANCEL</button>
                    </div>
                </div>
            </div>`;

    let formContainer = document.getElementById('tournament-form-modal');
    if (!formContainer) {
        formContainer = document.createElement('div');
        formContainer.id = 'tournament-form-modal';
        document.body.appendChild(formContainer);
    }
    formContainer.innerHTML = formHtml;

    document.getElementById('tournament-start-input').addEventListener('change', (e) => {
        const endInput = document.getElementById('tournament-end-input');
        if (endInput) {
            endInput.min = e.target.value;
            const sDate = new Date(e.target.value);
            const eDate = new Date(sDate.getTime() + 30 * 60 * 1000);
            endInput.value = formatForInput(eDate);
        }
    });
}

export function closeTournamentForm() {
    const f = document.getElementById('tournament-form-modal');
    if (f) f.remove();
}

export async function createTournament(eventId) {
    if (!state.user) return;
    try {
        const { data: event } = await _supabase.from('events').select('*, moderators:event_moderators(player_id)').eq('id', eventId).single();
        if (!event) return;
        const moderators = event.moderators ? event.moderators.map(m => m.player_id) : [];
        if (!canModerateEvent(event, moderators)) {
            showNotification('Not authorized', 'error');
            return;
        }

        const updates = {
            event_id: eventId,
            game_id: document.getElementById('tournament-game-select')?.value,
            organizer_id: state.user.id,
            tournament_name: document.getElementById('tournament-name-input')?.value.trim() || null,
            tournament_type: 'elimination',
            max_participants: parseInt(document.getElementById('tournament-max-input')?.value) || 8,
            start_datetime: new Date(document.getElementById('tournament-start-input')?.value).toISOString(),
            end_datetime: document.getElementById('tournament-end-input')?.value ? new Date(document.getElementById('tournament-end-input').value).toISOString() : null,
            status: 'scheduled'
        };

        const { error } = await _supabase.from('tournament_history').insert(updates);
        if (error) throw error;
        showNotification('Tournament created!', 'success');
        closeTournamentForm();
        if (window.viewEventDetails) window.viewEventDetails(eventId);
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    }
}



function populateEventForm(event) {
    showCreateEventForm(event);
    const setVal = (id, val) => { if (document.getElementById(id)) document.getElementById(id).value = val || ''; };
    setVal('event-name-input', event.event_name);
    setVal('event-type-select', event.event_type);
    setVal('event-location-input', event.location);
    setVal('event-desc-input', event.description);
    if (event.start_datetime) setVal('event-start-input', new Date(event.start_datetime).toISOString().slice(0, 16));
    if (event.end_datetime) setVal('event-end-input', new Date(event.end_datetime).toISOString().slice(0, 16));
    setVal('event-color-input', event.primary_color);

    if (event.image_url) {
        const preview = document.getElementById('event-image-preview');
        preview.innerHTML = `<div style="position:relative; width:100%; max-width:300px;"><img src="${event.image_url}" style="width:100%; border-radius:8px;"><button onclick="clearEventImage()" style="position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.8); color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer;">×</button></div>`;
        if (document.getElementById('event-image-label')) document.getElementById('event-image-label').style.display = 'none';
    }
}



// Utility functions helper
function formatForInput(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

function getRoundedTime(date, minutes = 15) {
    const ms = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
}

// Global Exports
window.showCreateEventForm = showCreateEventForm;
window.hideCreateEventForm = hideCreateEventForm;
window.previewEventImage = previewEventImage;
window.clearEventImage = clearEventImage;
window.previewBrandLogo = previewBrandLogo;
window.clearBrandLogo = clearBrandLogo;
window.createNewEvent = createNewEvent;
window.showCreateTournamentForm = showCreateTournamentForm;
window.closeTournamentForm = closeTournamentForm;
window.createTournament = createTournament;
