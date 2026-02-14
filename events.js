import { _supabase, state } from './config.js';
import { showNotification, showPage, showModal, closeModal, showLoading, hideLoading } from './ui.js';
import { BracketEngine } from './bracket-engine.js';
import { MatchService } from './match-service.js';

/**
 * ============================================================
 * SUBSOCCER EVENT CALENDAR SYSTEM
 * Frontend JavaScript for Event Management
 * ============================================================
 */

let selectedEventImage = null;
let selectedBrandLogo = null;
let currentEventId = null;
let currentEventTournamentId = null;
let currentEventTournamentName = null;

// Bracket state variables (in-memory, like Tournament Mode)
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
    const container = document.getElementById('events-view');
    if (!container) return;

    showLoading('Loading Events...');

   try {
        const now = new Date();

        // Haetaan kaikki aktiiviset tapahtumat
        const { data: allEvents, error } = await _supabase
            .from('events_with_participant_count')
            .select('*')
            .in('status', ['upcoming', 'ongoing'])
            .order('start_datetime', { ascending: true });

        if (error) throw error;

        // Erotellaan tulevat ja menneet JavaScriptin puolella
        const upcoming = (allEvents || []).filter(e => new Date(e.start_datetime) >= now);
        const past = (allEvents || []).filter(e => new Date(e.start_datetime) < now);

        // Yhdistetään: tulevat ensin, menneet lopussa
        renderEventsPage([...upcoming, ...past]);
    } catch (e) {
        console.error('Failed to load events:', e);
        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--sub-red);">Failed to load events</div>';
    } finally {
        hideLoading();
    }
}

/**
 * Render the events page UI
 */
function renderEventsPage(events) {
    const container = document.getElementById('events-view');
    
    let html = `
        <h2 class="section-title" style="margin-top: 20px; font-size: 0.8rem; color: #555; letter-spacing: 3px; font-family: var(--sub-name-font);">EVENT SETUP</h2>
        
        <div style="text-align:center; margin-bottom:25px;">
            <button class="tour-mode-toggle" onclick="showCreateEventForm()" style="width:100%; justify-content:center; padding:15px;">
                <i class="fa-solid fa-calendar-plus" style="margin-right:8px; color:var(--sub-gold);"></i> CREATE EVENT
            </button>
        </div>
        
        <div id="create-event-form" style="display:none;"></div>
        
        <h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin:25px 0 15px 0; color:#444; font-size:0.75rem; letter-spacing:3px; border-bottom:1px solid #222; padding-bottom:8px; text-align:center;">
            UPCOMING EVENTS
        </h3>
        <div id="events-list">
    `;
    
    if (events.length === 0) {
        html += `
            <div style="text-align:center; padding:60px 20px; color:#444;">
                <i class="fa-solid fa-calendar-xmark" style="font-size:3rem; margin-bottom:15px; opacity:0.2;"></i>
                <div style="font-size:0.9rem; letter-spacing:1px;">NO UPCOMING EVENTS</div>
            </div>
        `;
    } else {
        events.forEach(event => {
            html += renderEventCard(event);
        });
    }
    
    html += '</div>';
    container.innerHTML = html;
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
    
    return `
        <div class="event-card sub-card" style="border-left: 2px solid ${typeColor};">
            ${event.image_url ? `
                <div style="width:100%; height:160px; background:url('${event.image_url}') center/cover; border-radius:2px; margin-bottom:15px; border:1px solid #333;"></div>
            ` : ''}
            
            <div style="margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                    <span class="sub-badge" style="background:${typeColor}; color:#000;">
                        ${event.event_type}
                    </span>
                    <span style="color:#555; font-size:0.75rem; font-family:var(--sub-name-font); letter-spacing:1px;">
                        <i class="fa-solid fa-calendar-day" style="color:#444; margin-right:4px;"></i>
                        ${dayOfWeek}, ${dateStr} @ ${timeStr}
                    </span>
                </div>
                
                <h3 style="font-family:var(--sub-name-font); font-size:1.4rem; margin:0; color:#fff; letter-spacing:1px; text-transform:uppercase;">${event.event_name}</h3>
            </div>
            
            ${event.location ? `
                <div style="font-size:0.8rem; color:#666; margin:8px 0; font-family:var(--sub-body-font); text-transform:uppercase; letter-spacing:1px;">
                    <i class="fa-solid fa-location-dot" style="color:var(--sub-red); margin-right:6px;"></i> ${event.location.toUpperCase()}
                </div>
            ` : ''}
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; padding-top:15px; border-top:1px solid #222;">
                <div style="font-size:0.75rem; color:#555; font-family:'Resolve'; letter-spacing:1px;">
                    <i class="fa-solid fa-users"></i> ${event.registered_count || 0}/${event.max_participants || 16} PLAYERS
                </div>
                <button class="btn-red" style="padding:10px 20px; font-size:0.85rem; letter-spacing:2px; width:auto;" onclick="viewEventDetails('${event.id}')">
                    VIEW DETAILS
                </button>
            </div>
        </div>
    `;
}

/**
 * Show create event form
 */
export function showCreateEventForm() {
    selectedEventImage = null;
    selectedBrandLogo = null;
    const formContainer = document.getElementById('create-event-form');
    if (!formContainer) return;
    
    formContainer.style.display = 'block';
    formContainer.innerHTML = `
        <div style="background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px; margin-bottom:20px;">
            <h4 style="font-family:var(--sub-name-font); text-transform:uppercase; margin:0 0 20px 0; color:var(--sub-gold); font-size:1.1rem; letter-spacing:2px;">
                <i class="fa fa-plus-circle"></i> Create New Event
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
                    <i class="fa fa-calendar" style="color:var(--sub-gold);"></i> EVENT DATES
                </label>
                <div style="display:flex; gap:12px;">
                    <div style="flex:1; min-width:0;">
                        <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">Start Date & Time *</label>
                        <input type="datetime-local" id="event-start-input" 
                            style="width:100%; max-width:none; height:38px; padding:6px 8px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:0.85rem; line-height:1.2; box-sizing:border-box;">
                    </div>
                    <div style="flex:1; min-width:0;">
                        <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">End Date & Time (optional)</label>
                        <input type="datetime-local" id="event-end-input" 
                            style="width:100%; max-width:none; height:38px; padding:6px 8px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:0.85rem; line-height:1.2; box-sizing:border-box;">
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
                    <i class="fa fa-star" style="color:var(--sub-gold);"></i> EVENT BRANDING
                </label>
                
                <div style="margin-bottom:15px;">
                    <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">Brand Logo (e.g. Tournament/Sponsor)</label>
                    <input type="file" id="brand-logo-input" accept="image/jpeg,image/png,image/webp" onchange="previewBrandLogo(this)" style="display:none;">
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
                <input type="file" id="event-image-input" accept="image/jpeg,image/png,image/webp" 
                    onchange="previewEventImage(this)" 
                    style="display:none;">
                <label for="event-image-input" id="event-image-label" 
                    style="display:block; padding:14px; background:var(--sub-red); color:#fff; border-radius:8px; cursor:pointer; font-size:1rem; font-family:var(--sub-name-font); text-transform:uppercase; text-align:center; transition:all 0.2s;">
                    <i class="fa fa-upload"></i> CHOOSE IMAGE
                </label>
                <div id="event-image-preview" style="margin-top:12px;"></div>
            </div>
            
            <div style="display:flex; gap:12px; margin-top:25px;">
                <button class="btn-red" onclick="createNewEvent()" style="flex:1; padding:14px; font-size:1rem;">
                    <i class="fa fa-check"></i> CREATE EVENT
                </button>
                <button class="btn-red" onclick="hideCreateEventForm()" style="flex:1; padding:14px; font-size:1rem; background:#333;">
                    <i class="fa fa-times"></i> CANCEL
                </button>
            </div>
        </div>
    `;
    
    // No need to populate game select anymore - removed from form
    
    // Scroll to form
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    console.log('createNewEvent() called'); // DEBUG
    
    // Check if user is logged in - use 'user' not 'user'
    if (!state.user) {
        console.log('User not logged in'); // DEBUG
        showNotification('You must be logged in to create events', 'error');
        return;
    }
    
    console.log('User logged in:', state.user.id); // DEBUG
    
    // Get form values
    const eventName = document.getElementById('event-name-input')?.value.trim();
    const eventType = document.getElementById('event-type-select')?.value;
    const startDatetime = document.getElementById('event-start-input')?.value;
    const endDatetime = document.getElementById('event-end-input')?.value || null;
    const description = document.getElementById('event-desc-input')?.value.trim();
    const location = document.getElementById('event-location-input')?.value.trim() || null;
    const primaryColor = document.getElementById('event-color-input')?.value;
    
    console.log('Form values:', { eventName, eventType, startDatetime, endDatetime, description, location }); // DEBUG
    
    // Validate required fields
    if (!eventName || !startDatetime) {
        console.log('Validation failed'); // DEBUG
        showNotification('Please fill required fields (Event Name, Start Time)', 'error');
        return;
    }
    
    try {
        let imageUrl = null;
        let brandLogoUrl = null;
        
        // Upload image if selected
        if (selectedEventImage) {
            console.log('Uploading image...'); // DEBUG
            showNotification('Uploading image...', 'success');
            imageUrl = await uploadEventImage(selectedEventImage);
        }

        // Upload brand logo if selected
        if (selectedBrandLogo) {
            showNotification('Uploading logo...', 'success');
            brandLogoUrl = await uploadEventImage(selectedBrandLogo); // Reuse same upload function
        }
        
        // Create event in database
        const eventData = {
            event_name: eventName,
            event_type: eventType,
            start_datetime: startDatetime,
            end_datetime: endDatetime,
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
        
        console.log('Creating event with data:', eventData); // DEBUG
        
        const { data: event, error } = await _supabase
            .from('events')
            .insert(eventData)
            .select()
            .single();
        
        if (error) {
            console.error('Database error:', error); // DEBUG
            throw error;
        }
        
        console.log('Event created successfully:', event); // DEBUG
        showNotification('Event created successfully! 🎉', 'success');
        hideCreateEventForm();
        loadEventsPage(); // Reload events list
        
    } catch (e) {
        console.error('Failed to create event:', e);
        showNotification('Failed to create event: ' + e.message, 'error');
    }
}

/**
 * Upload event image to Supabase Storage
 */
async function uploadEventImage(file) {
    const fileName = `${state.user.id}-${Date.now()}.${file.name.split('.').pop()}`;
    
    const { data, error } = await _supabase.storage
        .from('event-images')
        .upload(fileName, file, {
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
    try {
        // Fetch event details
        const { data: event, error } = await _supabase
            .from('events_with_participant_count')
            .select('*')
            .eq('id', eventId)
            .single();
        
        if (error) throw error;
        
        // Fetch tournaments linked to this event WITH participant counts
        const { data: tournaments, error: tournamentsError } = await _supabase
            .from('tournament_history')
            .select(`
                *,
                game:games(game_name, location),
                participants:event_registrations(count)
            `)
            .eq('event_id', eventId)
            .order('created_at', { ascending: false });
        
        if (tournamentsError) throw tournamentsError;
        
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
        showEventModal(event, tournamentsWithCounts || [], userRegistrations);
        
    } catch (e) {
        console.error('Failed to load event details:', e);
        showNotification('Failed to load event details', 'error');
    }
}

/**
 * Show event details modal
 */
function showEventModal(event, tournaments, userRegistrations) {
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
    
    const isOrganizer = state.user && event.organizer_id === state.user.id;
    
    let modalHtml = `
        <div style="background:#0a0a0a; border-radius:12px; overflow:hidden;">
                
                ${event.image_url ? `
                    <div style="width:100%; height:200px; background:url('${event.image_url}') center/cover;"></div>
                ` : ''}
                
                <div style="padding:20px;">
                    <h2 style="font-family:var(--sub-name-font); font-size:1.5rem; margin:0 0 10px 0; color:#fff; text-transform:uppercase; letter-spacing:1px;">${event.event_name}</h2>
                    
                    <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;">
                        <div style="font-size:0.9rem; color:var(--sub-gold); text-transform:uppercase; letter-spacing:1px;">
                            <i class="fa fa-tag"></i> ${event.event_type}
                        </div>
                        <div style="font-size:0.9rem; color:#888;">
                            <i class="fa fa-calendar"></i> ${dateStr}
                        </div>
                        ${!endDate || endDate.toDateString() === startDate.toDateString() ? `
                            <div style="font-size:0.9rem; color:#888;">
                                <i class="fa fa-clock"></i> ${timeStr}
                            </div>
                        ` : ''}
                    </div>
                    
                    ${event.location ? `
                        <div style="background:#111; border:1px solid #222; border-radius:8px; padding:12px; margin-bottom:15px;">
                            <div style="font-size:0.85rem; color:#888; margin-bottom:5px;">📍 LOCATION</div>
                            <div style="font-size:1rem; color:#fff;">${event.location}</div>
                        </div>
                    ` : ''}
                    
                    ${event.description ? `
                        <div style="background:#111; border:1px solid #222; border-radius:8px; padding:12px; margin-bottom:15px;">
                            <div style="font-size:0.85rem; color:#888; margin-bottom:5px;">ℹ️ DESCRIPTION</div>
                            <p style="font-size:0.9rem; color:#ccc; margin:0; line-height:1.5;">${event.description}</p>
                        </div>
                    ` : ''}
                    
                    <div style="background:#111; border:1px solid #222; border-radius:8px; padding:12px; margin-bottom:15px;">
                        <div style="font-size:0.85rem; color:#888; margin-bottom:8px;">🏆 TOURNAMENTS</div>
                        ${tournaments.length === 0 ? `
                            <div style="text-align:center; padding:30px 20px; color:#666;">
                                <i class="fa fa-trophy" style="font-size:2rem; color:#333; margin-bottom:10px; display:block;"></i>
                                <div style="font-size:0.85rem;">No tournaments created yet</div>
                                ${isOrganizer ? `<div style="font-size:0.75rem; margin-top:5px; color:#888;">Create tournaments during the event</div>` : ''}
                            </div>
                        ` : tournaments.map(t => {
                            const isUserRegistered = userRegistrations.some(r => r.tournament_id === t.id);
                            // Use start_datetime if available, otherwise created_at
                            const tDate = t.start_datetime ? new Date(t.start_datetime) : new Date(t.created_at);
                            
                            // Format date and time compactly for mobile
                            const dateStr = tDate.toLocaleDateString('en-GB', { 
                                day: 'numeric', 
                                month: 'short'
                            });
                            const timeStr = tDate.toLocaleTimeString('en-GB', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                            });
                            
                            // Get participant count for this tournament
                            const participantCount = t.participant_count || 0;
                            const maxParticipants = t.max_participants || 8;
                            const isFull = participantCount >= maxParticipants;
                            
                            return `
                                <div style="background:#0a0a0a; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:8px;">
                                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
                                        <div style="flex:1;">
                                            <div style="font-size:1rem; color:#fff; font-weight:bold; margin-bottom:6px;">
                                                ${t.tournament_name || 'Tournament'}
                                            </div>
                                            <div style="font-size:0.8rem; color:#888; margin-bottom:6px;">
                                                <i class="fa fa-gamepad"></i> ${t.game?.game_name || 'Unknown Table'}${t.game?.location ? ` - ${t.game.location}` : ''}
                                            </div>
                                            <div style="font-size:0.8rem; color:${participantCount > 0 ? 'var(--sub-gold)' : '#666'}; margin-bottom:6px;">
                                                <i class="fa fa-users"></i> ${participantCount} / ${maxParticipants} players
                                                <button onclick="viewTournamentParticipants('${event.id}', '${t.id}', '${t.tournament_name || 'Tournament'}')" style="background:none; border:none; color:var(--sub-gold); cursor:pointer; text-decoration:underline; font-size:0.8rem; margin-left:5px;">View List</button>
                                                ${participantCount >= 2 ? `<button onclick="viewTournamentBracket('${t.id}', \`${(t.tournament_name || 'Tournament').replace(/[`'"]/g, '')}\`, ${maxParticipants})" style="background:none; border:none; color:#4CAF50; cursor:pointer; text-decoration:underline; font-size:0.8rem; margin-left:5px;"><i class="fa fa-sitemap"></i> Bracket</button>` : ''}
                                            </div>
                                            <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                                                <div style="font-size:0.85rem; color:#aaa; white-space:nowrap;">
                                                    <i class="fa fa-calendar" style="color:#666; margin-right:4px;"></i>${dateStr}
                                                </div>
                                                <div style="font-size:1rem; color:var(--sub-gold); font-weight:600; white-space:nowrap;">
                                                    <i class="fa fa-clock" style="margin-right:4px;"></i>${timeStr}
                                                </div>
                                            </div>
                                        </div>
                                        <div style="text-align:right;">
                                            <div style="font-size:0.75rem; color:var(--sub-gold); font-weight:bold; margin-bottom:4px;">
                                                ${t.tournament_type?.toUpperCase() || 'ELIMINATION'}
                                            </div>
                                            ${t.status === 'completed' ? `
                                                <div style="font-size:0.7rem; color:#4CAF50;">
                                                    <i class="fa fa-check-circle"></i> COMPLETED
                                                </div>
                                            ` : t.status === 'ongoing' ? `
                                                <div style="font-size:0.7rem; color:#FF9800;">
                                                    <i class="fa fa-spinner"></i> ONGOING
                                                </div>
                                            ` : `
                                                <div style="font-size:0.7rem; color:#666;">
                                                    <i class="fa fa-calendar"></i> SCHEDULED
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                    
                                    ${t.status === 'completed' && (t.winner_name || t.second_place_name || t.third_place_name) ? `
                                        <div style="background:#111; border:1px solid var(--sub-gold); border-radius:6px; padding:10px; margin-top:10px;">
                                            <div style="font-size:0.75rem; color:#888; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">
                                                <i class="fa fa-trophy"></i> Results
                                            </div>
                                            ${t.winner_name ? `
                                                <div style="font-size:0.85rem; color:var(--sub-gold); margin-bottom:4px;">
                                                    🏆 ${t.winner_name}
                                                </div>
                                            ` : ''}
                                            ${t.second_place_name ? `
                                                <div style="font-size:0.85rem; color:#999; margin-bottom:4px;">
                                                    🥈 ${t.second_place_name}
                                                </div>
                                            ` : ''}
                                            ${t.third_place_name ? `
                                                <div style="font-size:0.85rem; color:#CD7F32; margin-bottom:4px;">
                                                    🥉 ${t.third_place_name}
                                                </div>
                                            ` : ''}
                                        </div>
                                    ` : ''}
                                    
                                    ${isOrganizer ? `
                                        <div style="display:flex; gap:8px; margin-top:8px;">
                                            <button class="btn-red" style="flex:1; padding:8px; font-size:0.85rem; background:#FF9800;" 
                                                    onclick="editTournament('${t.id}', '${event.id}', '${event.event_name}')">
                                                <i class="fa fa-edit"></i> EDIT
                                            </button>
                                            <button class="btn-red" style="flex:1; padding:8px; font-size:0.85rem; background:#f44336;" 
                                                    onclick="deleteTournament('${t.id}', '${event.id}')">
                                                <i class="fa fa-trash"></i> DELETE
                                            </button>
                                        </div>
                                    ` : ''}
                                    
                                    ${t.status !== 'completed' && state.user && !isOrganizer ? `
                                        <button class="btn-red" 
                                                ${isFull && !isUserRegistered ? 'disabled' : ''}
                                                style="width:100%; padding:8px; font-size:0.85rem; margin-top:8px; ${isUserRegistered ? 'background:#4CAF50;' : (isFull ? 'background:#444; cursor:not-allowed; opacity:0.7;' : '')}" 
                                                onclick="${isUserRegistered ? `unregisterFromTournament('${event.id}', '${t.id}')` : (isFull ? '' : `registerForTournament('${event.id}', '${t.id}')`)}">
                                            <i class="fa fa-${isUserRegistered ? 'check' : (isFull ? 'ban' : 'user-plus')}"></i> 
                                            ${isUserRegistered ? 'REGISTERED ✓' : (isFull ? 'TOURNAMENT FULL' : 'REGISTER')}
                                        </button>
                                    ` : ''}
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
                            <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" onclick="showCreateTournamentForm('${event.id}', '${event.event_name}')">
                                <i class="fa fa-plus"></i> CREATE TOURNAMENT
                            </button>
                            <button class="btn-red" style="flex:1; background:#FF9800; color:#fff;" onclick="editEvent('${event.id}')">
                                <i class="fa fa-edit"></i> EDIT EVENT
                            </button>
                            <button class="btn-red" style="flex:1; background:#c62828; color:#fff;" onclick="deleteEvent('${event.id}')">
                                <i class="fa fa-trash"></i> DELETE EVENT
                            </button>
                            <button class="btn-red" style="flex:1; background:#2196F3; color:#fff;" onclick="window.open('?live=${event.id}', '_blank')">
                                <i class="fa fa-external-link-alt"></i> OPEN PUBLIC DISPLAY
                            </button>
                        ` : ''}
                    </div>
                    
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <button class="btn-red" style="flex:1; background:#4CAF50; padding:12px 25px;" onclick="shareLiveEventLink('${event.id}', '${event.event_name}')">
                            <i class="fa fa-share-alt"></i> SHARE LIVE LINK
                        </button>
                        <button class="btn-red" style="flex:1; background:#333; padding:12px 25px;" onclick="closeEventModal()">
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
                    <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:15px; font-size:0.85rem; color:#888; text-align:center;">
                        <strong style="color:#fff;">${tournamentName || 'Tournament'}</strong>
                    </div>
                    
                    <!-- Add Player Section (Search + Dropdown) -->
                    <div style="background:linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border:2px solid var(--sub-gold); border-radius:10px; padding:20px; margin-bottom:25px; box-shadow: 0 4px 15px rgba(227,6,19,0.2);">
                        <div style="font-family:'Russo One'; font-size:1rem; color:var(--sub-gold); margin-bottom:15px; text-align:center; text-transform:uppercase; letter-spacing:1px;">
                            <i class="fa fa-user-plus"></i> Add Player
                        </div>
                        
                        <div style="position: relative;">
                            <input type="text" 
                                   id="participant-search-${tournamentId}" 
                                   placeholder="Search or type new name..."
                                   autocomplete="off"
                                   style="width:100%; padding:18px 20px; background:#000; border:2px solid #444; border-radius:8px; color:#fff; font-size:1.1rem; font-family:'Roboto', sans-serif; margin-bottom:12px; box-sizing:border-box; transition: all 0.3s ease;"
                                   onfocus="this.style.borderColor='var(--sub-gold)'; this.style.background='#0a0a0a';"
                                   onblur="setTimeout(() => { this.style.borderColor='#444'; this.style.background='#000'; }, 200);"
                                   oninput="handleParticipantSearch('${tournamentId}')"
                                   onkeypress="if(event.key==='Enter') addParticipantFromSearch('${tournamentId}')">
                            
                            <!-- Search dropdown -->
                            <div id="search-dropdown-${tournamentId}" style="
                                display: none;
                                position: absolute;
                                width: 100%;
                                max-height: 250px;
                                overflow-y: auto;
                                background: #111;
                                border: 2px solid var(--sub-gold);
                                border-radius: 8px;
                                margin-top: -10px;
                                z-index: 10003;
                                box-shadow: 0 4px 20px rgba(255,215,0,0.3);
                            "></div>
                        </div>
                        
                        <button class="btn-red" 
                                style="width:100%; padding:15px; background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:1rem; border:none; border-radius:8px; cursor:pointer; text-transform:uppercase; letter-spacing:1px; transition: all 0.2s ease;"
                                onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 5px 20px rgba(227,6,19,0.4)';"
                                onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"
                                onclick="addParticipantFromSearch('${tournamentId}')">
                            <i class="fa fa-plus"></i> ADD PLAYER
                        </button>
                        <div style="font-size:0.8rem; color:#888; margin-top:12px; text-align:center;">
                            💡 Search existing or add new guest players
                        </div>
                    </div>
                    
                    ${registrations && registrations.length > 0 ? `
                        <div style="margin-bottom:20px;">
                            <div style="font-size:0.85rem; color:#888; margin-bottom:10px;">
                                ${registrations.length} PARTICIPANT${registrations.length !== 1 ? 'S' : ''}
                            </div>
                            ${registrations.map((reg, index) => {
                                const player = reg.player;
                                const displayName = player?.username || 'Unknown';
                                const isRegistered = !!player;
                                const flagEmoji = player?.country ? getFlagEmoji(player.country) : '';
                                
                                return `
                                    <div style="background:#0a0a0a; border:1px solid #222; border-radius:var(--sub-radius); padding:12px; margin-bottom:8px; display:flex; align-items:center; gap:12px;">
                                        <div style="font-size:0.8rem; color:#444; font-family:var(--sub-name-font); min-width:30px;">
                                            #${index + 1}
                                        </div>
                                        ${player?.avatar_url ? `
                                            <img src="${player.avatar_url}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid #333;">
                                        ` : `
                                            <div style="width:36px; height:36px; border-radius:50%; background:#111; display:flex; align-items:center; justify-content:center; border:1px solid #333;">
                                                <i class="fa fa-user" style="color:#666;"></i>
                                            </div>
                                        `}
                                        <div style="flex:1;">
                                            <div style="font-size:0.95rem; color:#fff; font-weight:bold;">
                                                ${flagEmoji} ${displayName}
                                            </div>
                                        </div>
                                        <button onclick="removeTournamentParticipant('${reg.id}', '${tournamentId}')" 
                                                style="background:none; border:1px solid #666; color:#666; padding:8px 12px; border-radius:6px; cursor:pointer; transition:all 0.2s;"
                                                onmouseover="this.style.borderColor='var(--sub-red)'; this.style.color='var(--sub-red)';"
                                                onmouseout="this.style.borderColor='#666'; this.style.color='#666';">
                                            <i class="fa fa-trash"></i>
                                        </button>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `
                        <div style="text-align:center; padding:40px; color:#666;">
                            <i class="fa fa-users" style="font-size:3rem; margin-bottom:10px; opacity:0.3;"></i>
                            <p>No participants yet</p>
                            <p style="font-size:0.85rem;">Add players above to start</p>
                        </div>
                    `}
        `;
        
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
                    <div class="search-item" onclick="selectParticipantFromDropdown('${tournamentId}', '${player.username}')">
                        <i class="fa-solid fa-user" style="margin-right:8px; color:var(--sub-gold);"></i>
                        ${player.username}
                    </div>
                `;
            });
        }

        // Näytetään vieraspelaajat
        guestMatches.forEach(guest => {
            html += `
                <div class="search-item" onclick="selectParticipantFromDropdown('${tournamentId}', '${guest}')">
                    <i class="fa-solid fa-user-clock" style="margin-right:8px; color:#666;"></i>
                    ${guest} <small style="color:#444; margin-left:5px;">(GUEST)</small>
                </div>
            `;
        });
        
        // Always show "Add as new player" option
        html += `
            <div class="search-item" style="color:var(--sub-gold); border-top:1px solid #333;" onclick="selectParticipantFromDropdown('${tournamentId}', '${q}')">
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
                showNotification(`Failed to create player: ${createError.message}`, 'error');
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
    console.log('=== SHOW CREATE TOURNAMENT FORM ===');
    console.log('Event ID:', eventId);
    console.log('Event Name:', eventName);
    console.log('User:', state.user);
    
    if (!state.user) {
        console.log('❌ User not logged in');
        showNotification('You must be logged in to create tournaments', 'error');
        return;
    }
    
    console.log('All games available:', state.allGames);
    
    // Ensure games are loaded before showing form
    if (!state.allGames || state.allGames.length === 0) {
        console.log('⏳ Fetching games from database...');
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
        console.log('✅ Loaded', games.length, 'game tables:', games);
    }
    
    // Generate game options from loaded games
    console.log('All games data:', state.allGames);
    
    const gameOptions = '<option value="" disabled selected>Select Game Table</option>' + 
        state.allGames.map(g => {
            const displayText = g.location ? `${g.game_name} - ${g.location}` : g.game_name;
            return `<option value="${g.id}">${displayText}</option>`;
        }).join('');
    
    console.log('✅ Generated game options:', gameOptions.length, 'characters');
    
    // Set default time to current time
    const now = new Date();
    const defaultTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    
    const formHtml = `
        <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; overflow-y:auto; padding:20px; box-sizing:border-box;">
            <div style="max-width:500px; margin:0 auto; background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px;">
                
                <h2 style="font-family:var(--sub-name-font); font-size:1.1rem; margin:0 0 20px 0; color:var(--sub-gold); text-align:center; text-transform:uppercase; letter-spacing:2px;">
                    <i class="fa fa-trophy"></i> CREATE TOURNAMENT
                </h2>
                
                <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:15px; font-size:0.85rem; color:#888;">
                    <i class="fa fa-calendar"></i> Event: <span style="color:#fff;">${eventName}</span>
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
                            START TIME *
                        </label>
                        <input type="datetime-local" id="tournament-start-input" value="${defaultTime}"
                               style="width:100%; height:36px; padding:6px 8px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.8rem; max-width:100%;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">
                            END TIME <span style="color:#666;">(opt.)</span>
                        </label>
                        <input type="datetime-local" id="tournament-end-input" value="${defaultTime}"
                               style="width:100%; height:36px; padding:6px 8px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.8rem; max-width:100%;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            MAX PLAYERS
                        </label>
                        <input type="number" id="tournament-max-input" value="8" min="2" max="32"
                               style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            TYPE
                        </label>
                        <select id="tournament-type-select" 
                                style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                            <option value="elimination">Elimination</option>
                            <option value="swiss">Swiss System</option>
                            <option value="round_robin">Round Robin</option>
                        </select>
                    </div>
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
        console.log('✅ Created new form container');
    } else {
        console.log('✅ Using existing form container');
    }
    formContainer.innerHTML = formHtml;
    console.log('✅ Tournament form rendered successfully');
    
    // Auto-select first game if available
    if (state.allGames && state.allGames.length > 0) {
        const gameSelect = document.getElementById('tournament-game-select');
        if (gameSelect) {
            gameSelect.value = state.allGames[0].id;
            console.log('✅ Auto-selected first game:', state.allGames[0].game_name, 'ID:', state.allGames[0].id);
        }
    }
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
    console.log('=== CREATE TOURNAMENT CALLED ===');
    console.log('Event ID:', eventId);
    console.log('User:', state.user);
    
    if (!state.user) {
        console.log('❌ User not logged in');
        showNotification('You must be logged in', 'error');
        return;
    }
    
    const tournamentName = document.getElementById('tournament-name-input')?.value.trim() || null;
    const gameId = document.getElementById('tournament-game-select')?.value;
    const startDatetime = document.getElementById('tournament-start-input')?.value;
    const endDatetime = document.getElementById('tournament-end-input')?.value || null;
    const maxParticipants = parseInt(document.getElementById('tournament-max-input')?.value) || 8;
    const tournamentType = document.getElementById('tournament-type-select')?.value || 'elimination';
    
    console.log('Form values:', {
        tournamentName,
        gameId,
        startDatetime,
        endDatetime,
        maxParticipants,
        tournamentType
    });
    
    if (!gameId) {
        console.log('❌ No game selected');
        showNotification('Please select a game table', 'error');
        return;
    }
    
    if (!startDatetime) {
        console.log('❌ No start time selected');
        showNotification('Please select start time', 'error');
        return;
    }
    
    console.log('✅ Validation passed, creating tournament...');
    
    try {
        // Create tournament in tournament_history
        const tournamentData = {
            event_id: eventId,
            game_id: gameId,
            organizer_id: state.user.id,
            tournament_name: tournamentName,
            tournament_type: tournamentType,
            max_participants: maxParticipants,
            start_datetime: startDatetime,
            end_datetime: endDatetime,
            status: 'scheduled',
            created_at: new Date().toISOString()
        };
        
        console.log('Tournament data to insert:', tournamentData);
        
        const { data: tournament, error } = await _supabase
            .from('tournament_history')
            .insert(tournamentData)
            .select()
            .single();
        
        console.log('Supabase response:', { tournament, error });
        
        if (error) {
            console.log('❌ Database error:', error);
            throw error;
        }
        
        console.log('✅ Tournament created successfully:', tournament);
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
        <div style="
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        ">
            <div style="
                background: #222;
                border: 2px solid var(--sub-gold);
                border-radius: 8px;
                max-width: 400px;
                width: 100%;
                padding: 30px;
            ">
                <h3 style="color: var(--sub-gold); margin-top: 0; text-align: center;">
                    <i class="fa fa-envelope"></i> Email Required
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
        showNotification('Successfully registered!', 'success');
        
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
        console.log(`Game ${g.game_name}: ${g.id} - ${isSelected ? 'SELECTED' : 'not selected'}`);
        const displayText = g.location ? `${g.game_name} - ${g.location}` : g.game_name;
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
                            START TIME <span style="color:#666;">(opt.)</span>
                        </label>
                        <input type="datetime-local" id="tournament-start-input"
                               value="${tournament.start_datetime ? new Date(tournament.start_datetime).toISOString().slice(0, 16) : ''}"
                               style="width:100%; height:36px; padding:6px 8px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.8rem; max-width:100%;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">
                            END TIME <span style="color:#666;">(opt.)</span>
                        </label>
                        <input type="datetime-local" id="tournament-end-input"
                               value="${tournament.end_datetime ? new Date(tournament.end_datetime).toISOString().slice(0, 16) : ''}"
                               style="width:100%; height:36px; padding:6px 8px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.8rem; max-width:100%;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            MAX PLAYERS
                        </label>
                        <input type="number" id="tournament-max-input" value="${tournament.max_participants || 8}" min="2" max="32"
                               style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            TYPE
                        </label>
                        <select id="tournament-type-select" 
                                style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem;">
                            <option value="elimination" ${tournament.tournament_type === 'elimination' ? 'selected' : ''}>Elimination</option>
                            <option value="swiss" ${tournament.tournament_type === 'swiss' ? 'selected' : ''}>Swiss System</option>
                            <option value="round_robin" ${tournament.tournament_type === 'round_robin' ? 'selected' : ''}>Round Robin</option>
                        </select>
                    </div>
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
}

/**
 * Save tournament edit
 */
export async function saveTournamentEdit(tournamentId, eventId) {
    console.log('saveTournamentEdit called with:', { tournamentId, eventId });
    
    if (!state.user) {
        console.log('User not logged in');
        showNotification('You must be logged in', 'error');
        return;
    }
    
    console.log('User:', state.user.username);
    
    const nameInput = document.getElementById('tournament-name-input');
    const gameSelect = document.getElementById('tournament-game-select');
    const startInput = document.getElementById('tournament-start-input');
    const endInput = document.getElementById('tournament-end-input');
    const maxInput = document.getElementById('tournament-max-input');
    const typeSelect = document.getElementById('tournament-type-select');
    
    console.log('Form elements found:', {
        nameInput: !!nameInput,
        gameSelect: !!gameSelect,
        startInput: !!startInput,
        endInput: !!endInput,
        maxInput: !!maxInput,
        typeSelect: !!typeSelect
    });
    
    if (gameSelect) {
        console.log('Game select options count:', gameSelect.options.length);
        console.log('Game select value:', gameSelect.value);
        console.log('Game select selectedIndex:', gameSelect.selectedIndex);
        if (gameSelect.selectedIndex >= 0) {
            console.log('Selected option:', gameSelect.options[gameSelect.selectedIndex]?.text);
        }
    }
    
    const tournamentName = nameInput?.value.trim() || null;
    const gameId = gameSelect?.value;
    const startDatetime = startInput?.value;
    const endDatetime = endInput?.value || null;
    const maxParticipants = parseInt(maxInput?.value) || 8;
    const tournamentType = typeSelect?.value || 'elimination';
    
    console.log('Form values:', {
        tournamentName, gameId, startDatetime, endDatetime, maxParticipants, tournamentType
    });
    
    if (!gameId) {
        console.log('No game ID selected');
        showNotification('Please select a game table', 'error');
        return;
    }
    
    // Note: start_datetime is not required for edit (can be null for old tournaments)
    
    try {
        console.log('Saving tournament edit...');
        
        const { data, error } = await _supabase
            .from('tournament_history')
            .update({
                tournament_name: tournamentName,
                game_id: gameId,
                start_datetime: startDatetime || null,
                end_datetime: endDatetime,
                max_participants: maxParticipants,
                tournament_type: tournamentType
            })
            .eq('id', tournamentId)
            .select();
        
        if (error) {
            console.error('Database error:', error);
            throw error;
        }
        
        console.log('Tournament updated successfully:', data);
        
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
    
    if (!confirm('Are you sure you want to delete this tournament? This action cannot be undone.')) {
        return;
    }
    
    try {
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
                    <i class="fa fa-share-alt"></i> LIVE EVENT LINK
                </h2>
                <p style="color:#ccc; margin-bottom:15px; text-align:center;">
                    Share this link to display live tournament results on screens or other devices.
                </p>
                <input type="text" value="${liveUrl}" readonly 
                       style="width:100%; padding:12px; background:#0a0a0a; border:1px solid #333; color:#fff; font-family:monospace; border-radius:6px; margin-bottom:20px; font-size:0.9rem;"
                       onclick="this.select()">
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:#4CAF50;" onclick="navigator.clipboard.writeText('${liveUrl}').then(() => { showNotification('Copied!', 'success'); this.parentElement.parentElement.parentElement.remove(); })">
                        <i class="fa fa-copy"></i> COPY LINK
                    </button>
                    <button class="btn-red" style="flex:1; background:#333;" onclick="this.parentElement.parentElement.parentElement.remove()">
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
export async function viewLiveEvent(eventId) {
    console.log('viewLiveEvent called with ID:', eventId);
    
    // Ensure live content container exists
    let content = document.getElementById('live-content');
    if (!content) {
        content = document.createElement('div');
        content.id = 'live-content';
        content.style.cssText = 'width:100%; min-height:100vh; padding:20px; box-sizing:border-box;';
        document.body.appendChild(content);
        console.log('Created live-content container');
    }
    
    // Show loading state
    content.innerHTML = `
        <div style="text-align:center; padding:40px; color:#fff;">
            <i class="fa fa-spinner fa-spin" style="font-size:3rem; color:var(--sub-gold);"></i>
            <p style="margin-top:20px; font-size:1.2rem;">Loading event...</p>
        </div>
    `;
    
    try {
        console.log('Fetching event from Supabase...');
        
        // Check if _supabase is defined
        if (typeof _supabase === 'undefined') {
            throw new Error('Supabase client not initialized. Make sure config.js is loaded.');
        }
        
        // Fetch event details
        const { data: event, error } = await _supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();
        
        console.log('Event fetch result:', { event, error });
        
        if (error) throw error;
        if (!event) throw new Error('Event not found');
        
        console.log('Fetching tournaments...');
        
        // Fetch tournaments
        const { data: tournaments, error: tournamentsError } = await _supabase
            .from('tournament_history')
            .select(`
                *,
                game:games(game_name, location),
                participants:event_registrations(count)
            `)
            .eq('event_id', eventId)
            .order('start_datetime', { ascending: true });
        
        console.log('Tournaments fetch result:', { tournaments, error: tournamentsError });
        
        if (tournamentsError) throw tournamentsError;
        
        console.log('Displaying live view...');
        
        // Apply Event Branding
        if (event.brand_logo_url) {
            const header = document.querySelector('header');
            const logo = document.querySelector('.main-logo');
            if (header && logo) {
                header.style.display = 'flex'; // Ensure header is visible
                logo.src = event.brand_logo_url;
                logo.style.maxHeight = '80px';
                logo.style.width = 'auto';
            }
        }
        
        if (event.primary_color) {
            // Update theme color variable
            document.documentElement.style.setProperty('--sub-gold', event.primary_color);
        }

        // Display live view
        showLiveEventView(event, tournaments || []);
        
        // Auto-refresh every 10 seconds
        if (window.liveEventRefreshInterval) {
            clearInterval(window.liveEventRefreshInterval);
        }
        window.liveEventRefreshInterval = setInterval(() => {
            viewLiveEvent(eventId);
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
 * Show live event view
 */
function showLiveEventView(event, tournaments) {
    const startDate = new Date(event.start_datetime);
    const dateStr = startDate.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    const content = document.getElementById('live-content') || document.getElementById('content') || document.body;
    content.innerHTML = `
        <div style="max-width:1200px; margin:0 auto; padding:20px;">
            <!-- Event Header -->
            <div style="text-align:center; margin-bottom:40px; padding:30px; background:#0a0a0a; border-radius:12px; border:2px solid var(--sub-gold);">
                ${event.image_url ? `
                    <img src="${event.image_url}" style="max-width:200px; height:auto; border-radius:8px; margin-bottom:20px;">
                ` : ''}
                <h1 style="font-family:'Russo One'; color:var(--sub-gold); font-size:2.5rem; margin-bottom:10px; text-transform:uppercase;">
                    ${event.event_name}
                </h1>
                <div style="font-size:1.2rem; color:#ccc; margin-bottom:10px;">
                    <i class="fa fa-calendar"></i> ${dateStr}
                </div>
                ${event.location ? `
                    <div style="font-size:1rem; color:#999;">
                        <i class="fa fa-map-marker"></i> ${event.location}
                    </div>
                ` : ''}
                ${event.description ? `
                    <p style="color:#aaa; margin-top:15px; max-width:600px; margin-left:auto; margin-right:auto;">
                        ${event.description}
                    </p>
                ` : ''}
                <div style="margin-top:20px; font-size:0.9rem; color:#666;">
                    <i class="fa fa-sync"></i> Auto-refreshing every 10 seconds
                </div>
            </div>
            
            <!-- Tournaments -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(350px, 1fr)); gap:20px;">
                ${tournaments.map(t => {
                    const tDate = new Date(t.start_datetime);
                    const timeStr = tDate.toLocaleTimeString('en-GB', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                    const participantCount = t.participants?.[0]?.count || 0;
                    
                    return `
                        <div style="background:#0a0a0a; border:2px solid ${t.status === 'completed' ? '#4CAF50' : t.status === 'ongoing' ? '#FF9800' : '#333'}; border-radius:12px; padding:20px;">
                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:15px;">
                                <div>
                                    <h2 style="font-family:'Russo One'; color:#fff; font-size:1.5rem; margin-bottom:8px;">
                                        ${t.tournament_name || 'Tournament'}
                                    </h2>
                                    <div style="font-size:0.9rem; color:#888; margin-bottom:5px;">
                                        <i class="fa fa-gamepad"></i> ${t.game?.game_name || 'Unknown'}
                                    </div>
                                    <div style="font-size:0.9rem; color:var(--sub-gold);">
                                        <i class="fa fa-clock"></i> ${timeStr} • <i class="fa fa-users"></i> ${participantCount} players
                                    </div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:0.8rem; color:${t.status === 'completed' ? '#4CAF50' : t.status === 'ongoing' ? '#FF9800' : '#666'}; font-weight:bold;">
                                        ${t.status === 'completed' ? '✓ COMPLETED' : t.status === 'ongoing' ? '▶ ONGOING' : '⏱ SCHEDULED'}
                                    </div>
                                </div>
                            </div>
                            
                            ${t.status === 'completed' && (t.winner_name || t.second_place_name || t.third_place_name) ? `
                                <div style="background:#111; border:2px solid var(--sub-gold); border-radius:8px; padding:20px; margin-top:15px;">
                                    <div style="font-size:0.85rem; color:#888; margin-bottom:15px; text-transform:uppercase; letter-spacing:1px; text-align:center;">
                                        <i class="fa fa-trophy"></i> FINAL RESULTS
                                    </div>
                                    ${t.winner_name ? `
                                        <div style="font-size:1.3rem; color:var(--sub-gold); margin-bottom:10px; text-align:center; font-family:'Russo One';">
                                            🏆 ${t.winner_name}
                                        </div>
                                    ` : ''}
                                    ${t.second_place_name ? `
                                        <div style="font-size:1.1rem; color:#C0C0C0; margin-bottom:10px; text-align:center; font-family:'Russo One';">
                                            🥈 ${t.second_place_name}
                                        </div>
                                    ` : ''}
                                    ${t.third_place_name ? `
                                        <div style="font-size:1rem; color:#CD7F32; text-align:center; font-family:'Russo One';">
                                            🥉 ${t.third_place_name}
                                        </div>
                                    ` : ''}
                                </div>
                            ` : t.status === 'ongoing' ? `
                                <div style="background:#1a1a1a; border:1px solid #FF9800; border-radius:8px; padding:15px; margin-top:15px; text-align:center;">
                                    <div style="color:#FF9800; font-size:1rem;">
                                        <i class="fa fa-spinner fa-spin"></i> TOURNAMENT IN PROGRESS
                                    </div>
                                    <div style="color:#666; font-size:0.85rem; margin-top:5px;">
                                        Results will appear here when completed
                                    </div>
                                </div>
                            ` : `
                                <div style="background:#1a1a1a; border:1px solid #333; border-radius:8px; padding:15px; margin-top:15px; text-align:center;">
                                    <div style="color:#666; font-size:1rem;">
                                        <i class="fa fa-calendar"></i> STARTING SOON
                                    </div>
                                </div>
                            `}
                        </div>
                    `;
                }).join('')}
            </div>
            
            ${tournaments.length === 0 ? `
                <div style="text-align:center; padding:60px; color:#666;">
                    <i class="fa fa-trophy" style="font-size:4rem; margin-bottom:20px; opacity:0.3;"></i>
                    <h3>No Tournaments Yet</h3>
                    <p>Tournaments will appear here when created</p>
                </div>
            ` : ''}
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
        showPage('events');
        
        // Wait for loadEventsPage to finish rendering the form container before showing and populating it
        setTimeout(() => {
            showCreateEventForm();

            // Populate form fields
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
            
            // Format datetime for input field
            if (startInput && event.start_datetime) {
                const startDate = new Date(event.start_datetime);
                startInput.value = startDate.toISOString().slice(0, 16);
            }
            if (endInput && event.end_datetime) {
                const endDate = new Date(event.end_datetime);
                endInput.value = endDate.toISOString().slice(0, 16);
            }

            if (colorInput && event.primary_color) {
                colorInput.value = event.primary_color;
            }
            if (brandPreview && event.brand_logo_url) {
                brandPreview.innerHTML = `
                    <img src="${event.brand_logo_url}" style="height:40px; width:auto; margin-right:10px;">
                `;
            }

            // Näytetään nykyinen tapahtumakuva esikatselussa
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
            
            // Change button to UPDATE
            const createBtn = document.querySelector('#create-event-form button[onclick="createNewEvent()"]');
            if (createBtn) {
                createBtn.textContent = '✓ UPDATE EVENT';
                createBtn.onclick = () => updateEventForm(eventId);
            }
            
            // Change title
            const formTitle = document.querySelector('#create-event-form h4');
            if (formTitle) {
                formTitle.innerHTML = '<i class="fa fa-edit"></i> Edit Event';
            }
        }, 600); // Increased timeout to ensure loadEventsPage has finished rendering the container
        
    } catch (e) {
        console.error('Failed to load event for editing:', e);
        showNotification('Failed to load event: ' + e.message, 'error');
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
        return;
    }
    
    try {
        let imageUrl = undefined;
        let brandLogoUrl = undefined;

        if (selectedEventImage) {
            showNotification('Uploading new image...', 'success');
            imageUrl = await uploadEventImage(selectedEventImage);
        }
        
        if (selectedBrandLogo) {
            showNotification('Uploading new logo...', 'success');
            brandLogoUrl = await uploadEventImage(selectedBrandLogo);
        }

        const updates = {
            event_name: eventName,
            event_type: eventType,
            start_datetime: startDatetime,
            end_datetime: endDatetime,
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

// Check for live event URL parameter on page load
// Wrap in DOMContentLoaded to ensure elements exist
export function checkLiveEventParam() {
    if (window.location.search.includes('live=')) {
        const urlParams = new URLSearchParams(window.location.search);
        const liveEventId = urlParams.get('live');
        if (liveEventId) {
            console.log('Live event ID detected:', liveEventId);
            
            // Hide auth page and app content
            const authPage = document.getElementById('auth-page');
            const appContent = document.getElementById('app-content');
            const header = document.querySelector('header');
            const navTabs = document.querySelector('.nav-tabs');
            
            if (authPage) {
                authPage.style.display = 'none';
                console.log('Auth page hidden');
            }
            if (appContent) {
                appContent.style.display = 'none';
                console.log('App content hidden');
            }
            if (header) header.style.display = 'none';
            if (navTabs) navTabs.style.display = 'none';
            
            // Create live content container if it doesn't exist
            let liveContainer = document.getElementById('live-content');
            if (!liveContainer) {
                liveContainer = document.createElement('div');
                liveContainer.id = 'live-content';
                liveContainer.style.cssText = 'width:100%; min-height:100vh; padding:20px; box-sizing:border-box;';
                document.body.appendChild(liveContainer);
                console.log('Live container created');
            }
            
            // Load live view
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
            showCompletedTournamentBracket(tournament);
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
                players:player_id(id, username)
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
        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
        
        // Initialize bracket state
        currentEventBracketParticipants = shuffledPlayers;
        eventRoundPlayers = [...shuffledPlayers];
        eventRoundWinners = [];
        eventFinalists = [];
        eventBronzeContenders = [];
        eventBronzeWinner = null;
        
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
function showCompletedTournamentBracket(tournament) {
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
    
    // Winner announcement
    a.innerHTML += `
        <div style="text-align:center; margin-top:30px; padding:20px; background:rgba(255,215,0,0.05); border-radius:var(--sub-radius); border:1px dashed rgba(255,215,0,0.2);">
            <div style="font-family:var(--sub-name-font); color:var(--sub-gold); font-size:1.4rem; text-transform:uppercase; letter-spacing:2px;">🏆 ${tournament.winner_name}</div>
            <div style="font-family:var(--sub-name-font); color:#555; font-size:0.7rem; margin-top:5px; letter-spacing:1px;">OFFICIAL EVENT WINNER</div>
        </div>
    `;
    
    const modalContent = `
            ${a.outerHTML}
            
            <div style="text-align:center; margin-top:20px; padding-top:20px; border-top:1px solid #333;">
                <button onclick="closeBracketModal()" class="btn-red" style="padding:15px 40px;"><i class="fa fa-times"></i> CLOSE</button>
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
        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:10px; color:#CD7F32; text-align:center; font-size:0.8rem; letter-spacing:2px;">🥉 BRONZE MATCH</h3>`;
        a.appendChild(BracketEngine.renderMatch(
            eventBronzeContenders[0], 
            eventBronzeContenders[1], 
            0, 
            eventBronzeWinner, 
            'pickEventBronzeWinner', 
            { isBronze: true }
        ));
        
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
                ${nextBtnHtml}
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
async function pickEventWinner(idx, playerName) {
    // Save match to database
    const match = getCurrentEventMatch(idx);
    if (match.p1 && match.p2) {
        await saveEventMatch(match.p1, match.p2, playerName);
    }
    
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
        return '<button onclick="finishEventTournament()" class="btn-red" style="padding:15px 40px;"><i class="fa fa-trophy"></i> FINISH TOURNAMENT</button>';
    }

    const byes = BracketEngine.calculateByes(eventRoundPlayers.length);
    const matchesToPlay = (eventRoundPlayers.length - byes) / 2;
    const expectedWinners = byes + matchesToPlay;
    const pickedWinners = eventRoundWinners.filter(w => w).length;

    if (pickedWinners === expectedWinners && matchesToPlay > 0) {
        return '<button onclick="advanceEventRound()" class="btn-red" style="padding:15px 40px;">NEXT ROUND <i class="fa fa-arrow-right"></i></button>';
    }
    
    return '<small style="color:#666;">Select winners for all matches</small>';
}

/**
 * Advance to next round
 */
function advanceEventRound() {
    // Check if moving to finals
    if (eventRoundPlayers.length === 4) {
        const losers = eventRoundPlayers.filter(p => !eventRoundWinners.includes(p));
        eventBronzeContenders = [...losers];
        eventFinalists = [...eventRoundWinners.filter(w => w)];
        eventRoundWinners = [];
        showEventBracket();
        return;
    }
    
    // Advance winners to next round
    eventRoundPlayers = eventRoundWinners.filter(w => w);
    eventRoundWinners = [];
    
    const nextByes = BracketEngine.calculateByes(eventRoundPlayers.length);
    
    showEventBracket(nextByes);
}

/**
 * Finish tournament and save to history
 */
async function finishEventTournament() {
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
function closeBracketModal() {
    closeModal('bracket-modal');
    
    // Reset bracket state
    eventRoundPlayers = [];
    eventRoundWinners = [];
    eventFinalists = [];
    eventBronzeContenders = [];
    eventBronzeWinner = null;
    currentEventBracketParticipants = [];
}

// Export functions to window
window.viewTournamentBracket = viewTournamentBracket;
window.closeBracketModal = closeBracketModal;
window.pickEventWinner = pickEventWinner;
window.pickEventBronzeWinner = pickEventBronzeWinner;
window.advanceEventRound = advanceEventRound;
window.finishEventTournament = finishEventTournament;
