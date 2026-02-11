/**
 * ============================================================
 * SUBSOCCER EVENT CALENDAR SYSTEM
 * Frontend JavaScript for Event Management
 * ============================================================
 */

let selectedEventImage = null;

/**
 * Load events page - main entry point
 */
async function loadEventsPage() {
    const container = document.getElementById('events-view');
    if (!container) return;

    // Show loading state
    container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;"><i class="fa fa-spinner fa-spin"></i> Loading events...</div>';

    try {
        // Fetch upcoming events
        const { data: events, error } = await _supabase
            .from('events_with_participant_count')
            .select('*')
            .in('status', ['upcoming', 'ongoing'])
            .order('start_datetime', { ascending: true });

        if (error) throw error;

        renderEventsPage(events || []);
    } catch (e) {
        console.error('Failed to load events:', e);
        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--sub-red);">Failed to load events</div>';
    }
}

/**
 * Render the events page UI
 */
function renderEventsPage(events) {
    const container = document.getElementById('events-view');
    
    let html = `
        <div style="text-align:center; margin-bottom:20px;">
            <button class="btn-red" onclick="showCreateEventForm()" style="width:100%; max-width:300px;">
                <i class="fa fa-plus"></i> CREATE NEW EVENT
            </button>
        </div>
        
        <div id="create-event-form" style="display:none;"></div>
        
        <h4 style="font-family:'Russo One'; text-transform:uppercase; margin:20px 0 10px 0; color:#888;">📅 Upcoming Events</h4>
        <div id="events-list">
    `;
    
    if (events.length === 0) {
        html += '<div style="text-align:center; padding:40px; color:#666;">No upcoming events. Create one!</div>';
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
    const endDate = event.end_datetime ? new Date(event.end_datetime) : null;
    
    let dateStr;
    if (endDate && endDate.toDateString() !== startDate.toDateString()) {
        // Multi-day event
        const startDay = startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const endDay = endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        dateStr = `${startDay} - ${endDay}`;
    } else {
        // Single day event
        dateStr = startDate.toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
        });
    }
    
    const timeStr = startDate.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    const registeredCount = event.registered_count || 0;
    const maxParticipants = event.max_participants || 16;
    const isFull = registeredCount >= maxParticipants;
    
    const eventTypeColors = {
        tournament: 'var(--sub-gold)',
        league: '#4CAF50',
        casual: '#888'
    };
    const typeColor = eventTypeColors[event.event_type] || '#888';
    
    // Larger title if no image
    const titleSize = event.image_url ? '1.1rem' : '1.5rem';
    
    return `
        <div class="event-card" style="background:#111; border:1px solid #222; border-radius:12px; padding:15px; margin-bottom:15px;">
            ${event.image_url ? `
                <div style="width:100%; height:150px; background:url('${event.image_url}') center/cover; border-radius:8px; margin-bottom:10px;"></div>
            ` : ''}
            
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
                <div>
                    <h3 style="font-family:'Russo One'; font-size:${titleSize}; margin:0 0 5px 0; color:#fff;">${event.event_name}</h3>
                    <div style="font-size:0.85rem; color:${typeColor}; text-transform:uppercase; letter-spacing:1px;">
                        ${event.event_type}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.75rem; color:#888;">${dateStr}</div>
                    ${!endDate || endDate.toDateString() === startDate.toDateString() ? `
                        <div style="font-size:0.9rem; color:var(--sub-gold); font-family:'Russo One';">${timeStr}</div>
                    ` : ''}
                </div>
            </div>
            
            ${event.description ? `
                <p style="font-size:0.85rem; color:#aaa; margin:10px 0; line-height:1.4;">${event.description}</p>
            ` : ''}
            
            ${event.location ? `
                <div style="font-size:0.8rem; color:#666; margin:8px 0;">
                    <i class="fa fa-location-dot"></i> ${event.location}
                </div>
            ` : ''}
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid #222;">
                <div style="font-size:0.85rem; color:#888;">
                    <i class="fa fa-calendar"></i> Event Info
                </div>
                <button class="btn-red" style="padding:8px 20px; font-size:0.8rem;" onclick="viewEventDetails('${event.id}')">
                    VIEW DETAILS
                </button>
            </div>
        </div>
    `;
}

/**
 * Show create event form
 */
function showCreateEventForm() {
    selectedEventImage = null;
    const formContainer = document.getElementById('create-event-form');
    if (!formContainer) return;
    
    formContainer.style.display = 'block';
    formContainer.innerHTML = `
        <div style="background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px; margin-bottom:20px;">
            <h4 style="font-family:'Russo One'; text-transform:uppercase; margin:0 0 20px 0; color:var(--sub-gold); font-size:1.1rem;">
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
            
            <div style="margin-bottom:20px;">
                <input type="file" id="event-image-input" accept="image/jpeg,image/png,image/webp" 
                    onchange="previewEventImage(this)" 
                    style="display:none;">
                <label for="event-image-input" id="event-image-label" 
                    style="display:block; padding:14px; background:var(--sub-red); color:#fff; border-radius:8px; cursor:pointer; font-size:1rem; font-family:'Russo One'; text-transform:uppercase; text-align:center; transition:all 0.2s;">
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
function hideCreateEventForm() {
    const formContainer = document.getElementById('create-event-form');
    if (formContainer) {
        formContainer.style.display = 'none';
        formContainer.innerHTML = '';
    }
    selectedEventImage = null;
}

/**
 * Preview event image
 */
function previewEventImage(input) {
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
function clearEventImage() {
    const input = document.getElementById('event-image-input');
    const preview = document.getElementById('event-image-preview');
    const fileLabel = document.getElementById('event-image-label');
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
    if (fileLabel) fileLabel.style.display = 'inline-block'; // Show button again
    selectedEventImage = null;
}

/**
 * Create new event
 */
async function createNewEvent() {
    console.log('createNewEvent() called'); // DEBUG
    
    // Check if user is logged in - use 'user' not 'user'
    if (!user) {
        console.log('User not logged in'); // DEBUG
        showNotification('You must be logged in to create events', 'error');
        return;
    }
    
    console.log('User logged in:', user.id); // DEBUG
    
    // Get form values
    const eventName = document.getElementById('event-name-input')?.value.trim();
    const eventType = document.getElementById('event-type-select')?.value;
    const startDatetime = document.getElementById('event-start-input')?.value;
    const endDatetime = document.getElementById('event-end-input')?.value || null;
    const description = document.getElementById('event-desc-input')?.value.trim();
    const location = document.getElementById('event-location-input')?.value.trim() || null;
    
    console.log('Form values:', { eventName, eventType, startDatetime, endDatetime, description, location }); // DEBUG
    
    // Validate required fields
    if (!eventName || !startDatetime) {
        console.log('Validation failed'); // DEBUG
        showNotification('Please fill required fields (Event Name, Start Time)', 'error');
        return;
    }
    
    try {
        let imageUrl = null;
        
        // Upload image if selected
        if (selectedEventImage) {
            console.log('Uploading image...'); // DEBUG
            showNotification('Uploading image...', 'success');
            imageUrl = await uploadEventImage(selectedEventImage);
        }
        
        // Create event in database
        const eventData = {
            event_name: eventName,
            event_type: eventType,
            start_datetime: startDatetime,
            end_datetime: endDatetime,
            description: description || null,
            location: location,
            organizer_id: user.id,
            image_url: imageUrl,
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
    const fileName = `${user.id}-${Date.now()}.${file.name.split('.').pop()}`;
    
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
async function viewEventDetails(eventId) {
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
        if (user) {
            const { data: regs } = await _supabase
                .from('event_registrations')
                .select('tournament_id')
                .eq('event_id', eventId)
                .eq('player_id', user.id);
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
    
    const isOrganizer = user && event.organizer_id === user.id;
    
    let modalHtml = `
        <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10000; overflow-y:auto; padding:20px; box-sizing:border-box;">
            <div style="max-width:600px; margin:0 auto; background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; overflow:hidden;">
                
                ${event.image_url ? `
                    <div style="width:100%; height:200px; background:url('${event.image_url}') center/cover;"></div>
                ` : ''}
                
                <div style="padding:20px;">
                    <h2 style="font-family:'Russo One'; font-size:1.5rem; margin:0 0 10px 0; color:#fff;">${event.event_name}</h2>
                    
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
                            
                            // Format date and time separately for better visibility
                            const dateStr = tDate.toLocaleDateString('en-GB', { 
                                weekday: 'short',
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
                                                ${participantCount > 0 ? `<button onclick="viewTournamentParticipants('${t.id}', '${t.tournament_name || 'Tournament'}')" style="background:none; border:none; color:var(--sub-gold); cursor:pointer; text-decoration:underline; font-size:0.8rem; margin-left:5px;">View List</button>` : ''}
                                            </div>
                                            <div style="display:flex; gap:12px; align-items:center; margin-top:8px;">
                                                <div style="font-size:0.95rem; color:#aaa;">
                                                    <i class="fa fa-calendar" style="color:#666; margin-right:4px;"></i> ${dateStr}
                                                </div>
                                                <div style="font-size:1.1rem; color:var(--sub-gold); font-weight:600;">
                                                    <i class="fa fa-clock" style="margin-right:4px;"></i> ${timeStr}
                                                </div>
                                            </div>
                                        </div>
                                        <div style="text-align:right;">
                                            <div style="font-size:0.75rem; color:var(--sub-gold); font-weight:bold; margin-bottom:4px;">
                                                ${t.tournament_type?.toUpperCase() || 'RANKED'}
                                            </div>
                                            ${t.winner_id ? `
                                                <div style="font-size:0.7rem; color:#4CAF50;">
                                                    <i class="fa fa-check-circle"></i> COMPLETED
                                                </div>
                                            ` : `
                                                <div style="font-size:0.7rem; color:#FF9800;">
                                                    <i class="fa fa-spinner"></i> ONGOING
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                    
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
                                    
                                    ${!t.winner_id && user && !isOrganizer ? `
                                        <button class="btn-red" style="width:100%; padding:8px; font-size:0.85rem; margin-top:8px; ${isUserRegistered ? 'background:#4CAF50;' : ''}" 
                                                onclick="${isUserRegistered ? `unregisterFromTournament('${event.id}', '${t.id}')` : `registerForTournament('${event.id}', '${t.id}')`}">
                                            <i class="fa fa-${isUserRegistered ? 'check' : 'user-plus'}"></i> 
                                            ${isUserRegistered ? 'REGISTERED ✓' : 'REGISTER'}
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
                            <button class="btn-red" style="flex:1; background:#c62828; color:#fff;" onclick="deleteEvent('${event.id}')">
                                <i class="fa fa-trash"></i> DELETE EVENT
                            </button>
                        ` : ''}
                        <button class="btn-red" style="${isOrganizer ? 'flex:1;' : 'flex:1;'} background:#333; padding:12px 25px;" onclick="closeEventModal()">
                            <i class="fa fa-times"></i> CLOSE
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    let modal = document.getElementById('event-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'event-modal';
        document.body.appendChild(modal);
    }
    modal.innerHTML = modalHtml;
}

/**
 * Close event modal
 */
function closeEventModal() {
    const modal = document.getElementById('event-modal');
    if (modal) modal.remove();
}

/**
 * Delete event
 */
async function deleteEvent(eventId) {
    if (!user) {
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
 * View tournament participants
 */
async function viewTournamentParticipants(tournamentId, tournamentName) {
    try {
        // Fetch participants for this tournament
        const { data: registrations, error } = await _supabase
            .from('event_registrations')
            .select(`
                id,
                created_at,
                player:players(id, username, country, avatar_url)
            `)
            .eq('tournament_id', tournamentId)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        // Build participant list HTML
        let participantsHtml = `
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:10002; overflow-y:auto; padding:20px; box-sizing:border-box;">
                <div style="max-width:500px; margin:0 auto; background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px;">
                    
                    <h2 style="font-family:'Russo One'; font-size:1.3rem; margin:0 0 20px 0; color:var(--sub-gold); text-align:center;">
                        <i class="fa fa-users"></i> PARTICIPANTS
                    </h2>
                    
                    <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:15px; font-size:0.85rem; color:#888; text-align:center;">
                        <strong style="color:#fff;">${tournamentName || 'Tournament'}</strong>
                    </div>
                    
                    ${registrations && registrations.length > 0 ? `
                        <div style="margin-bottom:20px;">
                            <div style="font-size:0.85rem; color:#888; margin-bottom:10px;">
                                ${registrations.length} player${registrations.length !== 1 ? 's' : ''} registered
                            </div>
                            ${registrations.map((reg, index) => {
                                const player = reg.player;
                                const flagEmoji = player?.country ? getFlagEmoji(player.country) : '';
                                const registeredDate = new Date(reg.created_at).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                                
                                return `
                                    <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:8px; display:flex; align-items:center; gap:12px;">
                                        <div style="font-size:1.2rem; color:#666; font-weight:bold; min-width:30px;">
                                            #${index + 1}
                                        </div>
                                        ${player?.avatar_url ? `
                                            <img src="${player.avatar_url}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid #333;">
                                        ` : `
                                            <div style="width:40px; height:40px; border-radius:50%; background:#333; display:flex; align-items:center; justify-content:center; border:2px solid #444;">
                                                <i class="fa fa-user" style="color:#666;"></i>
                                            </div>
                                        `}
                                        <div style="flex:1;">
                                            <div style="font-size:0.95rem; color:#fff; font-weight:bold;">
                                                ${flagEmoji} ${player?.username || 'Unknown Player'}
                                            </div>
                                            <div style="font-size:0.75rem; color:#666;">
                                                Registered: ${registeredDate}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `
                        <div style="text-align:center; padding:40px; color:#666;">
                            <i class="fa fa-users" style="font-size:3rem; margin-bottom:10px; opacity:0.3;"></i>
                            <p>No participants yet</p>
                        </div>
                    `}
                    
                    <button class="btn-red" style="width:100%; background:#333; padding:12px;" onclick="closeParticipantsModal()">
                        <i class="fa fa-times"></i> CLOSE
                    </button>
                </div>
            </div>
        `;
        
        // Add modal to page
        let modal = document.getElementById('participants-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'participants-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = participantsHtml;
        
    } catch (e) {
        console.error('Failed to load participants:', e);
        showNotification('Failed to load participants: ' + e.message, 'error');
    }
}

/**
 * Close participants modal
 */
function closeParticipantsModal() {
    const modal = document.getElementById('participants-modal');
    if (modal) modal.remove();
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
async function showCreateTournamentForm(eventId, eventName) {
    console.log('=== SHOW CREATE TOURNAMENT FORM ===');
    console.log('Event ID:', eventId);
    console.log('Event Name:', eventName);
    console.log('User:', user);
    
    if (!user) {
        console.log('❌ User not logged in');
        showNotification('You must be logged in to create tournaments', 'error');
        return;
    }
    
    console.log('All games available:', allGames);
    
    // Ensure games are loaded before showing form
    if (!allGames || allGames.length === 0) {
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
        
        allGames = games;
        console.log('✅ Loaded', games.length, 'game tables:', games);
    }
    
    // Generate game options from loaded games
    console.log('All games data:', allGames);
    
    const gameOptions = '<option value="" disabled selected>Select Game Table</option>' + 
        allGames.map(g => {
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
                
                <h2 style="font-family:'Russo One'; font-size:1.3rem; margin:0 0 20px 0; color:var(--sub-gold); text-align:center;">
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
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            START TIME *
                        </label>
                        <input type="datetime-local" id="tournament-start-input" value="${defaultTime}"
                               style="width:100%; height:38px; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem; max-width:100%;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            END TIME <span style="color:#666;">(optional)</span>
                        </label>
                        <input type="datetime-local" id="tournament-end-input" value="${defaultTime}"
                               style="width:100%; height:38px; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem; max-width:100%;">
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
    if (allGames && allGames.length > 0) {
        const gameSelect = document.getElementById('tournament-game-select');
        if (gameSelect) {
            gameSelect.value = allGames[0].id;
            console.log('✅ Auto-selected first game:', allGames[0].game_name, 'ID:', allGames[0].id);
        }
    }
}

/**
 * Close tournament form
 */
function closeTournamentForm() {
    const formContainer = document.getElementById('tournament-form-modal');
    if (formContainer) formContainer.remove();
}

/**
 * Create tournament
 */
async function createTournament(eventId) {
    console.log('=== CREATE TOURNAMENT CALLED ===');
    console.log('Event ID:', eventId);
    console.log('User:', user);
    
    if (!user) {
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
            organizer_id: user.id,
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
function showEmailPrompt(eventId, tournamentId) {
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
function closeEmailPrompt() {
    const modal = document.getElementById('email-prompt-modal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Save email and proceed with tournament registration
 */
async function saveEmailAndRegister(eventId, tournamentId) {
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
            .eq('id', user.id);
        
        if (error) throw error;
        
        // Update local user object
        user.email = email;
        
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
async function registerForTournament(eventId, tournamentId) {
    if (!user) {
        showNotification('You must be logged in to register', 'error');
        return;
    }
    
    // Check if user has email - required for tournament participation
    if (!user.email) {
        showEmailPrompt(eventId, tournamentId);
        return;
    }
    
    try {
        console.log('Registering:', { eventId, tournamentId, playerId: user.id });
        
        // Register in event_registrations (links event, tournament, and player)
        const { data, error } = await _supabase
            .from('event_registrations')
            .insert({
                event_id: eventId,
                tournament_id: tournamentId,
                player_id: user.id,
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
async function unregisterFromTournament(eventId, tournamentId) {
    if (!user) return;
    
    try {
        const { error } = await _supabase
            .from('event_registrations')
            .delete()
            .eq('event_id', eventId)
            .eq('tournament_id', tournamentId)
            .eq('player_id', user.id);
        
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
async function editTournament(tournamentId, eventId, eventName) {
    if (!user) {
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
    if (!allGames || allGames.length === 0) {
        console.log('Loading games for edit form...');
        const { data: games, error } = await _supabase.from('games').select('*').order('game_name');
        if (error) {
            console.error('Failed to load games:', error);
            showNotification('Failed to load game tables', 'error');
            return;
        }
        allGames = games || [];
        console.log('Loaded', allGames.length, 'games');
    }
    
    if (allGames.length === 0) {
        showNotification('No game tables available. Create a table first in Tournament Mode.', 'error');
        return;
    }
    
    console.log('All games:', allGames.map(g => ({ id: g.id, name: g.game_name })));
    console.log('Tournament game_id:', tournament.game_id);
    
    // Get available game tables
    const gameOptions = allGames.map(g => {
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
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            START TIME <span style="color:#666;">(optional)</span>
                        </label>
                        <input type="datetime-local" id="tournament-start-input"
                               value="${tournament.start_datetime ? new Date(tournament.start_datetime).toISOString().slice(0, 16) : ''}"
                               style="width:100%; height:38px; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem; max-width:100%;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">
                            END TIME <span style="color:#666;">(optional)</span>
                        </label>
                        <input type="datetime-local" id="tournament-end-input"
                               value="${tournament.end_datetime ? new Date(tournament.end_datetime).toISOString().slice(0, 16) : ''}"
                               style="width:100%; height:38px; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; font-size:0.9rem; max-width:100%;">
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
async function saveTournamentEdit(tournamentId, eventId) {
    console.log('saveTournamentEdit called with:', { tournamentId, eventId });
    
    if (!user) {
        console.log('User not logged in');
        showNotification('You must be logged in', 'error');
        return;
    }
    
    console.log('User:', user.username);
    
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
async function deleteTournament(tournamentId, eventId) {
    if (!user) {
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

// Global bindings for HTML onclick handlers
window.loadEventsPage = loadEventsPage;
window.showCreateEventForm = showCreateEventForm;
window.hideCreateEventForm = hideCreateEventForm;
window.previewEventImage = previewEventImage;
window.clearEventImage = clearEventImage;
window.createNewEvent = createNewEvent;
window.viewEventDetails = viewEventDetails;
window.closeEventModal = closeEventModal;
window.deleteEvent = deleteEvent;
window.viewTournamentParticipants = viewTournamentParticipants;
window.closeParticipantsModal = closeParticipantsModal;
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
