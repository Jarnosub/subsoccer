import { state, isAdmin, _supabase } from './config.js';
import { showModal, closeModal, safeHTML, showLoading, hideLoading, showNotification } from './ui-utils.js';

/**
 * ============================================================
 * EVENT UI COMPONENT
 * Handles rendering of event lists, cards, and modals
 * ============================================================
 */

/**
 * Render the events page UI
 */
export function renderEventsPage(events) {
    const container = document.getElementById('events-view');
    if (!container) return;

    const eventsList = events.length === 0 ? safeHTML`
            <div class="empty-events-container" style="text-align:center; padding:80px 20px; color:#444; border: 1px dashed #222; border-radius: 8px; background: rgba(255,255,255,0.01);">
                <i class="fa-solid fa-calendar-xmark" style="font-size:3rem; margin-bottom:20px; opacity:0.1; color: var(--sub-red);"></i>
                <div style="font-size:0.8rem; letter-spacing:3px; font-family: var(--sub-name-font); color: #555;">NO UPCOMING EVENTS</div>
            </div>
    ` : events.map(event => renderEventCard(event));

    // Piilotetaan luontinapit vierailta ja katsojilta
    const canCreate = state.user && state.user.id !== 'guest' && state.user.id !== 'spectator';

    const setupHtml = canCreate ? safeHTML`
        <div class="events-setup-header" style="margin-bottom: 20px;">
            <div style="display:flex; justify-content:center;">
                <button class="create-event-action-btn" onclick="showCreateEventForm()" style="width:100%; max-width:400px; padding:15px; border: 1px solid #333; background: #1a1a1a; color: var(--sub-gold); border-radius: var(--sub-radius); cursor: pointer; transition: all 0.3s ease; font-family: var(--sub-name-font); letter-spacing: 2px; font-size: 0.85rem;">
                    <i class="fa-solid fa-calendar-plus" style="margin-right:8px;"></i> CREATE NEW EVENT
                </button>
            </div>
            
            <div id="create-event-form" style="display:none; transition: all 0.4s ease;"></div>
        </div>
    ` : '';

    container.innerHTML = safeHTML`
        ${setupHtml}
        
        <div class="events-separator" style="display:flex; align-items:center; gap:15px; margin:20px 0 20px 0;">
            <div style="height:1px; background:linear-gradient(to right, transparent, #333); flex:1;"></div>
            <div style="font-family:var(--sub-name-font); color:#888; font-size:0.7rem; letter-spacing:2px; font-weight: bold;">EVENTS</div>
            <div style="height:1px; background:linear-gradient(to left, transparent, #333); flex:1;"></div>
        </div>

        <div id="events-list" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:15px; padding-bottom: 40px;">
            ${eventsList}
        </div>
    `;
}

/**
 * Render a single event card
 */
export function renderEventCard(event) {
    const startDate = new Date(event.start_datetime);
    const dayNum = startDate.getDate();
    const monthStr = startDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
    const timeStr = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const eventTypeColors = {
        tournament: 'var(--sub-gold)',
        league: '#4CAF50',
        casual: '#0089CF'
    };
    const typeColor = eventTypeColors[event.event_type] || '#888';

    return safeHTML`
        <div class="event-card-premium" style="position:relative; background:#0a0a0a; border:1px solid #222; border-radius:var(--sub-radius); overflow:hidden; display:flex; flex-direction:column; min-height:300px; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
            
            <!-- Card Image / Header -->
            <div class="event-card-image-wrapper" style="height:160px; position:relative; overflow:hidden; background:#111;">
                ${event.image_url ? safeHTML`
                    <img src="${event.image_url}" loading="lazy" alt="${event.event_name}" style="width:100%; height:100%; object-fit:cover; transition: transform 0.5s ease;">
                ` : safeHTML`
                    <div style="width:100%; height:100%; background: linear-gradient(45deg, #0f0f0f, #1a1a1a); display:flex; align-items:center; justify-content:center;">
                        <i class="fa-solid fa-trophy" style="font-size:4rem; color:rgba(255,255,255,0.03);"></i>
                    </div>
                `}
                
                <!-- Date Badge -->
                <div class="event-date-badge" style="position:absolute; top:15px; left:15px; background:rgba(0,0,0,0.85); border:1px solid var(--sub-border); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); padding:8px 12px; border-radius:var(--sub-radius); text-align:center; min-width:50px; z-index:2;">
                    <div style="font-size:0.65rem; color:var(--sub-gold); font-family:var(--sub-name-font); letter-spacing:1px; line-height:1; margin-bottom:2px;">${monthStr}</div>
                    <div style="font-size:1.4rem; color:#fff; font-family:var(--sub-name-font); line-height:1; font-weight:bold;">${dayNum}</div>
                </div>

                <!-- Overlay Gradient -->
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:linear-gradient(to bottom, transparent 30%, rgba(10,10,10,0.95) 100%); z-index:1;"></div>
                
                <!-- Type Tag -->
                <div style="position:absolute; bottom:15px; left:20px; z-index:2; display:flex; align-items:center; gap:8px;">
                     <span style="height:6px; width:6px; border-radius:50%; background:${typeColor}; box-shadow: 0 0 10px ${typeColor};"></span>
                     <span style="font-size:0.65rem; color:#fff; font-weight:bold; letter-spacing:2px; text-transform:uppercase; font-family:var(--sub-name-font);">${event.event_type}</span>
                </div>
            </div>

            <!-- Card Content -->
            <div class="event-card-body" style="padding:15px; flex:1; display:flex; flex-direction:column; background: linear-gradient(to bottom, rgba(10,10,10,1), #080808);">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
                    <h3 style="font-family:var(--sub-name-font); font-size:1.1rem; margin:0; color:#fff; letter-spacing:0.5px; text-transform:uppercase; line-height:1.2; font-weight:bold; flex:1;">
                        ${event.event_name}
                    </h3>
                    <div style="font-size:0.7rem; color:#888; font-family:var(--sub-name-font); letter-spacing:1px; white-space:nowrap; margin-left:10px;">
                        <i class="fa-regular fa-clock" style="margin-right:3px; color:${typeColor};"></i> ${timeStr}
                    </div>
                </div>
                
                <div style="font-size:0.8rem; color:#888; margin-bottom:15px; display:flex; align-items:flex-start; gap:6px; line-height:1.3;">
                    <i class="fa-solid fa-location-dot" style="color:var(--sub-red); margin-top:2px; font-size:0.8rem;"></i> 
                    <span style="font-family:var(--sub-body-font);">${event.location ? event.location.toUpperCase() : 'LOCATION TBD'}</span>
                </div>
                
                <div style="margin-top:auto; padding-top:10px; border-top:1px solid #1a1a1a;">
                    <button class="event-view-btn-premium" 
                            style="width:100%; padding:10px; font-size:0.75rem; font-weight:bold; letter-spacing:2px; background:#111; border:1px solid #333; color:var(--sub-gold); cursor:pointer; font-family:var(--sub-name-font); text-transform:uppercase; transition:all 0.3s ease; border-radius:var(--sub-radius);"
                            data-action="view-event-details" data-id="${event.id}">
                        VIEW EVENT DETAILS
                    </button>
                </div>
            </div>
            
            <!-- Hover Border Effect -->
            <div class="card-hover-border" style="position:absolute; top:0; left:0; width:100%; height:100%; border:1px solid var(--sub-gold); opacity:0; pointer-events:none; transition:opacity 0.3s ease; z-index:10;"></div>
        </div>
    `;
}

/**
 * Show event details modal
 */
export function showEventModal(event, tournaments, userRegistrations, moderators = []) {
    const startDate = new Date(event.start_datetime);
    const endDate = event.end_datetime ? new Date(event.end_datetime) : null;

    let dateStr;
    if (endDate && endDate.toDateString() !== startDate.toDateString()) {
        const startFull = startDate.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
        const endFull = endDate.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        dateStr = `${startFull} - ${endFull}`;
    } else {
        dateStr = startDate.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    }

    const timeStr = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const isOrganizer = canModerateEvent(event, moderators);

    let modalHtml = `
        <div style="background:#0e0e0e; border-radius:var(--sub-radius); overflow:hidden; border: 1px solid var(--sub-border); box-shadow: var(--sub-shadow);">
                ${event.image_url ? `
                    <div style="width:100%; height:220px; background:url('${event.image_url}') center/cover; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:linear-gradient(to bottom, transparent 40%, #0e0e0e 100%);"></div>
                        <div style="position:absolute; bottom:20px; left:25px; right:25px;">
                            <div style="background:var(--sub-gold); color:#000; padding:3px 8px; font-size:0.65rem; font-weight:bold; display:inline-block; margin-bottom:8px; border-radius:2px; text-transform:uppercase; letter-spacing:1px;">${event.event_type}</div>
                            <h2 style="font-family:var(--sub-name-font); font-size:2rem; margin:0; color:#fff; text-transform:uppercase; letter-spacing:1px; line-height:1; text-shadow:0 2px 15px rgba(0,0,0,0.8);">${event.event_name}</h2>
                        </div>
                    </div>
                ` : `
                    <div style="padding:30px 25px 10px 25px; border-bottom:1px solid #222; background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%); background-size: 8px 8px; background-color: #111;">
                        <div style="background:var(--sub-gold); color:#000; padding:3px 8px; font-size:0.65rem; font-weight:bold; display:inline-block; margin-bottom:10px; border-radius:2px; text-transform:uppercase; letter-spacing:1px;">${event.event_type}</div>
                        <h2 style="font-family:var(--sub-name-font); font-size:1.8rem; margin:0; color:#fff; text-transform:uppercase; letter-spacing:1px;">${event.event_name}</h2>
                    </div>
                `}
                
                <div style="padding:25px;">
                    <!-- Info Bar -->
                    <div style="display:flex; flex-wrap:wrap; gap:20px; margin-bottom:25px; padding-bottom:20px; border-bottom:1px solid #222;">
                        <div style="flex:1; min-width:140px;">
                            <div style="font-size:0.65rem; color:#666; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">DATE</div>
                            <div style="color:#fff; font-size:0.9rem; font-weight:bold;"><i class="fa fa-calendar" style="color:var(--sub-gold); margin-right:6px;"></i> ${dateStr}</div>
                            ${(!endDate || endDate.toDateString() === startDate.toDateString()) ? `<div style="color:#888; font-size:0.8rem; margin-top:2px; margin-left:20px;">${timeStr}</div>` : ''}
                        </div>
                        <div style="flex:1; min-width:140px;">
                            <div style="font-size:0.65rem; color:#666; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">LOCATION</div>
                            <div style="color:#fff; font-size:0.9rem; font-weight:bold;"><i class="fa fa-map-marker-alt" style="color:var(--sub-red); margin-right:6px;"></i> ${event.location || 'TBA'}</div>
                        </div>
                        <div style="flex:1; min-width:140px;">
                            <div style="font-size:0.65rem; color:#666; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">ORGANIZER</div>
                            <div style="color:#fff; font-size:0.9rem; font-weight:bold;"><i class="fa fa-user-circle" style="color:#888; margin-right:6px;"></i> ${event.organizer?.username || 'System'}</div>
                        </div>
                    </div>

                    ${event.description ? `<div style="margin-bottom:30px; background:#161616; padding:15px; border-radius:6px; border:1px solid #222;"><div style="font-size:0.7rem; color:var(--sub-gold); margin-bottom:8px; font-weight:bold; letter-spacing: 1px; text-transform: uppercase;">ABOUT EVENT</div><p style="font-size:0.9rem; color:#ccc; margin:0; line-height:1.5;">${event.description}</p></div>` : ''}

                    ${event.organizer_id === state.user?.id || isAdmin() ? `
                        <div class="sub-card-premium" data-event-id="${event.id}" style="margin-bottom:24px; border-left:4px solid var(--sub-red); padding: 16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                <div style="font-size:0.85rem; color:#fff; font-weight:bold; font-family: var(--sub-name-font); letter-spacing: 1px;">🛡️ MODERATORS</div>
                                <button data-action="toggle-moderator-search" data-event-id="${event.id}" class="btn-red" style="padding:6px 12px; font-size:0.75rem; width: auto;">+ ADD MODERATOR</button>
                            </div>
                            <div id="event-moderators-list" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;"></div>
                            <div id="moderator-search-container" style="display:none; background:var(--sub-black); padding:12px; border:1px solid var(--sub-border);">
                                <input type="text" id="mod-search-input" placeholder="Search player name..." style="width:100%; padding:10px; background:var(--sub-charcoal); border:1px solid var(--sub-border); color:#fff; font-size:0.85rem; box-sizing:border-box; outline: none;">
                                <div id="mod-search-results" style="max-height:150px; overflow-y:auto; margin-top:8px;"></div>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-bottom:24px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div style="font-size:0.8rem; color:#fff; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase;">🏆 TOURNAMENTS</div>
                            ${isOrganizer ? `<button class="btn-red" style="width:auto; padding:6px 12px; font-size:0.7rem; background:var(--sub-gold); color:#000;" data-action="show-create-tournament-form" data-event-id="${event.id}" data-event-name="${event.event_name}">+ CREATE</button>` : ''}
                        </div>

                        ${tournaments.length === 0 ? `
                            <div style="text-align:center; padding:40px 24px; color:#666; background: var(--sub-charcoal); border: 1px dashed var(--sub-border);">
                                <i class="fa fa-trophy" style="font-size:2rem; color:#333; margin-bottom:12px; display:block;"></i>
                                <div style="font-size:0.85rem; font-family: var(--sub-name-font); letter-spacing: 1px;">NO TOURNAMENTS CREATED YET</div>
                                ${isOrganizer ? `<div style="font-size:0.75rem; margin-top:8px; color:#888;">Create tournaments during the event</div>` : ''}
                            </div>
                        ` : tournaments.map(t => {
        const userRegs = userRegistrations || [];
        const isUserRegistered = userRegs.some(r => r.tournament_id === t.id);
        const tDate = t.start_datetime ? new Date(t.start_datetime) : new Date(t.created_at);
        const tTimeStr = tDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const displayCount = (t.status === 'completed' && (t.participant_count || 0) === 0 && t.max_participants) ? t.max_participants : (t.participant_count || 0);

        return `
                                <div style="background:#141414; border:1px solid ${t.status === 'ongoing' ? 'var(--sub-red)' : '#2a2a2a'}; border-radius:6px; margin-bottom:12px; overflow:hidden; position:relative;">
                                    ${t.status === 'ongoing' ? '<div style="position:absolute; top:0; right:0; background:var(--sub-red); color:#fff; font-size:0.6rem; padding:2px 8px; font-weight:bold; border-bottom-left-radius:6px;">LIVE</div>' : ''}
                                    
                                    <div style="padding:15px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                                        <div style="text-align:center; min-width:55px; padding-right:12px; border-right:1px solid #333;">
                                            <div style="font-size:1.1rem; font-family:var(--sub-name-font); color:#fff; line-height:1;">${tTimeStr}</div>
                                            <div style="font-size:0.6rem; color:#666; text-transform:uppercase; margin-top:2px;">Start</div>
                                        </div>
                                        
                                        <div style="flex:1; min-width:150px;">
                                            <div style="font-size:0.65rem; color:var(--sub-gold); font-weight:bold; text-transform:uppercase; margin-bottom:2px;">${t.game?.game_name || 'Table TBD'}</div>
                                            <div style="font-size:1rem; color:#fff; font-family:var(--sub-name-font); letter-spacing:0.5px; line-height:1.2;">${t.tournament_name || 'Tournament'}</div>
                                            <div style="font-size:0.7rem; color:#888; margin-top:4px;"><i class="fa fa-users" style="font-size:0.7rem; margin-right:4px;"></i> ${displayCount} ${t.max_participants > 0 ? '/ ' + t.max_participants : ''} Players</div>
                                        </div>

                                        <div style="display:flex; gap:6px; min-width:fit-content; margin-left:auto;">
                                             ${displayCount >= 2 ? `<button data-action="view-bracket" data-id="${t.id}" data-event-id="${event.id}" data-name="${(t.tournament_name || 'Tournament').replace(/[`'"]/g, '')}" data-max="${t.max_participants}" style="background:rgba(255,255,255,0.05); border:1px solid #444; color:#fff; cursor:pointer; font-size:0.65rem; font-weight:bold; padding:8px 12px; border-radius:4px; text-align:center; font-family:var(--sub-name-font); text-transform:uppercase;">BRACKET</button>` : ''}
                                             <button data-action="view-participants" data-event-id="${event.id}" data-tour-id="${t.id}" data-name="${(t.tournament_name || 'Tournament').replace(/[`'"]/g, '')}" style="background:none; border:1px solid #333; color:#aaa; cursor:pointer; font-size:0.65rem; padding:8px 12px; border-radius:4px; text-align:center; font-family:var(--sub-name-font); text-transform:uppercase;">ROSTER</button>
                                        </div>
                                    </div>
                                    
                                    ${t.status === 'completed' && (t.winner_name) ? `<div style="background:rgba(255,215,0,0.05); border-top:1px solid rgba(255,215,0,0.1); padding:8px 15px; display:flex; align-items:center; gap:10px;"><span style="font-size:0.9rem;">🏆</span> <span style="color:var(--sub-gold); font-weight:bold; font-size:0.8rem;">WINNER: ${t.winner_name}</span></div>` : ''}
                                    
                                    ${isOrganizer ? `<div style="display:flex; gap:1px; background:#111; border-top:1px solid #222;">
                                        <button style="flex:1; padding:8px; font-size:0.7rem; background:none; border:none; color:#888; cursor:pointer; border-right:1px solid #222;" onclick="editTournament('${t.id}', '${event.id}', '${event.event_name}')">EDIT</button>
                                        <button style="flex:1; padding:8px; font-size:0.7rem; background:none; border:none; color:#888; cursor:pointer; border-right:1px solid #222;" onclick="duplicateTournament('${t.id}', '${event.id}')">COPY</button>
                                        <button style="flex:1; padding:8px; font-size:0.7rem; background:none; border:none; color:var(--sub-red); cursor:pointer;" onclick="deleteTournament('${t.id}', '${event.id}')">DELETE</button>
                                    </div>` : ''}
                                </div>`;
    }).join('')}
                    </div>
                    
                    ${isOrganizer ? `<div style="padding:12px; background:#1a1a1a; border:1px solid #333; border-radius:6px; font-size:0.75rem; color:#888; margin-bottom:20px; display:flex; gap:10px; align-items:center;"><i class="fa fa-info-circle"></i> <span>Create tournaments above to start matches.</span></div>` : ''}
                    
                    <div style="display:flex; gap:10px; margin-top:30px; border-top:1px solid #222; padding-top:20px;">
                        ${isOrganizer ? `
                            <button class="btn-red" style="flex:1; background:#222; border:1px solid #333; color:#ccc;" data-action="edit-event" data-id="${event.id}">EDIT</button>
                            <button class="btn-red" style="flex:1; background:#222; border:1px solid #333; color:var(--sub-red);" data-action="delete-event" data-id="${event.id}">DELETE</button>
                            <button class="btn-red" style="flex:1.5; background:#0089CF; color:#fff;" data-action="open-public-display" data-id="${event.id}"><i class="fa fa-tv"></i> PUBLIC SCREEN</button>
                        ` : ''}
                    </div>
                    
                    <div style="display:flex; gap:10px; margin-top:10px; padding-bottom:10px;">
                        <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000; padding:14px;" data-action="share-live-link" data-id="${event.id}" data-name="${event.event_name}"><i class="fa fa-share-alt"></i> SHARE LINK</button>
                        <button class="btn-red" style="flex:1; background:#333; padding:14px;" data-action="close-event-modal">CLOSE</button>
                    </div>
                </div>
        </div>
    `;

    showModal(event.event_name, modalHtml, { id: 'event-modal', maxWidth: '600px' });
}

export function closeEventModal() {
    closeModal('event-modal');
}

/**
 * Check if current user can moderate this event
 */
export function canModerateEvent(event, moderators = []) {
    if (!state.user) return false;
    if (isAdmin()) return true; // Global admin
    if (event.organizer_id === state.user.id) return true; // Creator

    if (event.organizer && event.organizer.username &&
        state.user.username &&
        event.organizer.username.toLowerCase() === state.user.username.toLowerCase()) {
        return true;
    }

    const mods = moderators || [];
    return mods.includes(state.user.id);
}

export function getFlagEmoji(countryCode) {
    if (!countryCode) return '';
    const code = countryCode.toUpperCase();
    return String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt()));
}
