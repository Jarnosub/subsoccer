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
export function renderEventCard(event) {
    const startDate = new Date(event.start_datetime);
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
                <div style="height:180px; position:relative; overflow:hidden;">
                    <img src="${event.image_url}" loading="lazy" alt="${event.event_name}" style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;">
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
 * Show event details modal
 */
export function showEventModal(event, tournaments, userRegistrations, moderators = []) {
    const startDate = new Date(event.start_datetime);
    const endDate = event.end_datetime ? new Date(event.end_datetime) : null;

    let dateStr;
    if (endDate && endDate.toDateString() !== startDate.toDateString()) {
        const startFull = startDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
        const endFull = endDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
        dateStr = `${startFull} - ${endFull}`;
    } else {
        dateStr = startDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
    }

    const timeStr = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const isOrganizer = canModerateEvent(event, moderators);

    const headerHtml = event.image_url ? `
        <div style="height:180px; background:url('${event.image_url}') center/cover; position:relative; border-radius:8px 8px 0 0; margin:-20px -20px 20px -20px; border-bottom:2px solid var(--sub-red);">
            <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.9) 100%);"></div>
            <div style="position:absolute; bottom:15px; left:20px;">
                <span style="background:var(--sub-red); color:#fff; padding:3px 8px; font-size:0.7rem; font-weight:bold; border-radius:3px; letter-spacing:1px; text-transform:uppercase; box-shadow:0 2px 5px rgba(0,0,0,0.5);">${event.event_type}</span>
            </div>
        </div>
    ` : `
        <div style="margin-bottom:20px;">
            <span style="background:var(--sub-red); color:#fff; padding:3px 8px; font-size:0.75rem; font-weight:bold; border-radius:3px; letter-spacing:1px; text-transform:uppercase;">${event.event_type}</span>
        </div>
    `;

    const infoCardHtml = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:15px; background:rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid rgba(255,255,255,0.05); margin-bottom:25px;">
            <div>
                <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Date & Time</div>
                <div style="color:#fff; font-size:0.9rem; font-weight:bold;">${dateStr}</div>
                ${(!endDate || endDate.toDateString() === startDate.toDateString()) ? `<div style="color:var(--sub-gold); font-size:0.85rem; margin-top:2px;">${timeStr}</div>` : ''}
            </div>
            <div>
                <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Location</div>
                <div style="color:#fff; font-size:0.9rem;"><i class="fa fa-location-dot" style="color:var(--sub-red); margin-right:5px;"></i>${event.location || 'TBA'}</div>
            </div>
            <div>
                <div style="font-size:0.65rem; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Organizer</div>
                <div style="color:#fff; font-size:0.9rem;"><i class="fa fa-user-circle" style="color:#666; margin-right:5px;"></i>${event.organizer?.username || 'System'}</div>
            </div>
        </div>
    `;

    const descriptionHtml = event.description ? `
        <div style="margin-bottom:30px;">
            <div style="font-size:0.75rem; color:var(--sub-gold); font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px; border-bottom:1px solid rgba(255,215,0,0.2); padding-bottom:5px;">About</div>
            <p style="font-size:0.9rem; color:#ccc; line-height:1.6; margin:0; white-space:pre-wrap;">${event.description}</p>
        </div>
    ` : '';

    const adminHtml = (event.organizer_id === state.user?.id || isAdmin()) ? `
        <div style="background:rgba(211,47,47,0.05); border:1px solid rgba(211,47,47,0.3); border-radius:6px; margin-bottom:30px;">
            <div style="background:rgba(211,47,47,0.1); padding:8px 15px; border-bottom:1px solid rgba(211,47,47,0.2); display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:0.75rem; color:var(--sub-red); font-weight:bold; letter-spacing:1px;"><i class="fa fa-shield-halved"></i> EVENT ADMIN PORTAL</div>
                <button data-action="toggle-moderator-search" data-event-id="${event.id}" style="background:transparent; border:1px solid var(--sub-red); color:var(--sub-red); padding:3px 10px; font-size:0.7rem; border-radius:4px; cursor:pointer;">+ ADD MODERATOR</button>
            </div>
            <div style="padding:15px;">
                <div id="event-moderators-list" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;"></div>
                <div id="moderator-search-container" style="display:none; margin-bottom:15px;">
                    <input type="text" id="mod-search-input" placeholder="Search user to add as mod..." style="width:100%; padding:8px; background:rgba(0,0,0,0.5); border:1px solid #444; color:#fff; font-size:0.85rem; border-radius:4px;">
                    <div id="mod-search-results" style="max-height:150px; overflow-y:auto; margin-top:5px;"></div>
                </div>
                
                <div style="display:flex; gap:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:15px;">
                    <button class="btn-red" style="flex:1; padding:8px; font-size:0.75rem; background:#333; border:1px solid #444;" data-action="edit-event" data-id="${event.id}"><i class="fa fa-edit"></i> EDIT</button>
                    <button class="btn-red" style="flex:1; padding:8px; font-size:0.75rem; background:#333; border:1px solid #444; color:#2196F3;" data-action="open-public-display" data-id="${event.id}"><i class="fa fa-tv"></i> LIVE TV</button>
                    <button class="btn-red" style="flex:1; padding:8px; font-size:0.75rem; background:#333; border:1px solid #444; color:var(--sub-red);" data-action="delete-event" data-id="${event.id}"><i class="fa fa-trash"></i> DELETE</button>
                </div>
            </div>
        </div>
    ` : '';

    const tournamentsHtml = `
        <div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.85rem; color:#fff; font-weight:bold; letter-spacing:1px; text-transform:uppercase;"><i class="fa fa-sitemap" style="color:var(--sub-gold); margin-right:6px;"></i> TOURNAMENTS</div>
            ${isOrganizer ? `<button class="btn-red" style="padding:4px 10px; font-size:0.7rem; width:auto; background:var(--sub-gold); color:#000;" data-action="show-create-tournament-form" data-event-id="${event.id}" data-event-name="${event.event_name}">+ CREATE</button>` : ''}
        </div>
        
        <div style="display:flex; flex-direction:column; gap:12px;">
            ${tournaments.length === 0 ? `
                <div style="text-align:center; padding:30px; background:rgba(0,0,0,0.2); border:1px dashed #333; border-radius:6px; color:#666; font-size:0.85rem;">
                    <div>No tournaments created yet.</div>
                    ${isOrganizer ? `<div style="font-size:0.75rem; margin-top:5px;">Click '+ CREATE' to add one.</div>` : ''}
                </div>
            ` : tournaments.map(t => {
        const tDate = t.start_datetime ? new Date(t.start_datetime) : new Date(t.created_at);
        const tTimeStr = tDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const displayCount = (t.status === 'completed' && (t.participant_count || 0) === 0 && t.max_participants) ? t.max_participants : (t.participant_count || 0);

        const statusBadge = t.status === 'ongoing' ? `<span style="color:var(--sub-red); font-size:0.65rem; font-weight:bold; letter-spacing:1px; animation:pulse 2s infinite;">LIVE</span>`
            : t.status === 'completed' ? `<span style="color:#4CAF50; font-size:0.65rem; font-weight:bold; letter-spacing:1px;">COMPLETED</span>`
                : `<span style="color:#888; font-size:0.65rem; font-weight:bold; letter-spacing:1px;">SCHEDULED</span>`;

        return `
                    <div style="background:#151515; border:1px solid #333; border-radius:6px; overflow:hidden;">
                        <div style="padding:10px 15px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-size:0.6rem; color:var(--sub-gold); text-transform:uppercase; letter-spacing:1px; margin-bottom:2px;">${t.game?.game_name || 'Tournament Table'}</div>
                                <div style="font-size:0.95rem; color:#fff; font-weight:bold;">${t.tournament_name || 'Tournament'}</div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:0.95rem; color:#fff; font-weight:bold;">${tTimeStr}</div>
                                ${statusBadge}
                            </div>
                        </div>
                        <div style="padding:12px 15px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <div style="font-size:0.8rem; color:#aaa;"><i class="fa fa-users" style="margin-right:5px; color:#666;"></i> ${displayCount} ${t.max_participants > 0 ? '/ ' + t.max_participants : ''} Players</div>
                                <div style="display:flex; gap:6px;">
                                    <button data-action="view-participants" data-event-id="${event.id}" data-tour-id="${t.id}" data-name="${(t.tournament_name || 'Tournament').replace(/[`'"]/g, '')}" style="background:transparent; border:1px solid #333; color:var(--sub-gold); padding:4px 10px; font-size:0.7rem; border-radius:4px; cursor:pointer;" onmouseover="this.style.background='rgba(255,215,0,0.1)'" onmouseout="this.style.background='transparent'">ROSTER</button>
                                    ${displayCount >= 2 ? `<button data-action="view-bracket" data-id="${t.id}" data-event-id="${event.id}" data-name="${(t.tournament_name || 'Tournament').replace(/[`'"]/g, '')}" data-max="${t.max_participants}" style="background:transparent; border:1px solid #333; color:#4CAF50; padding:4px 10px; font-size:0.7rem; border-radius:4px; cursor:pointer;" onmouseover="this.style.background='rgba(76,175,80,0.1)'" onmouseout="this.style.background='transparent'">BRACKET</button>` : ''}
                                </div>
                            </div>
                            ${t.status === 'completed' && t.winner_name ? `
                                <div style="background:rgba(255,215,0,0.05); padding:8px 12px; border-radius:4px; display:flex; align-items:center; gap:10px; border-left:2px solid var(--sub-gold);">
                                    <i class="fa fa-medal" style="color:var(--sub-gold);"></i>
                                    <div>
                                        <div style="font-size:0.6rem; color:#888; text-transform:uppercase;">Winner</div>
                                        <div style="font-size:0.85rem; color:#fff; font-weight:bold;">${t.winner_name}</div>
                                    </div>
                                    ${t.second_place_name ? `
                                        <div style="margin-left:auto; text-align:right;">
                                            <div style="font-size:0.6rem; color:#888; text-transform:uppercase;">2nd Place</div>
                                            <div style="font-size:0.8rem; color:#aaa;">${t.second_place_name}</div>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}
                            
                            ${isOrganizer ? `
                                <div style="display:flex; gap:6px; margin-top:12px; border-top:1px solid #222; padding-top:12px;">
                                    <button class="btn-red" style="flex:1; padding:6px; font-size:0.7rem; background:#222; border:1px solid #333;" onclick="editTournament('${t.id}', '${event.id}', '${event.event_name}')"><i class="fa fa-edit"></i> Edit</button>
                                    <button class="btn-red" style="flex:1; padding:6px; font-size:0.7rem; background:#222; border:1px solid #333; color:var(--sub-gold);" onclick="duplicateTournament('${t.id}', '${event.id}')"><i class="fa fa-copy"></i> Copy</button>
                                    <button class="btn-red" style="flex:1; padding:6px; font-size:0.7rem; background:#222; border:1px solid #333; color:var(--sub-red);" onclick="deleteTournament('${t.id}', '${event.id}')"><i class="fa fa-trash"></i> Delete</button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;

    const footerHtml = `
        <div style="display:flex; gap:10px; margin-top:30px; border-top:1px solid #333; padding-top:20px;">
            <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000; padding:12px; font-size:0.9rem; font-weight:bold; border:none;" data-action="share-live-link" data-id="${event.id}" data-name="${event.event_name}"><i class="fa fa-share-nodes"></i> SHARE EVENT</button>
            <button class="btn-red" style="flex:1; background:#222; border:1px solid #444; color:#fff; padding:12px; font-size:0.9rem;" data-action="close-event-modal"><i class="fa fa-times"></i> CLOSE</button>
        </div>
    `;

    const modalHtml = `
        <style>
            @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        </style>
        <div>
            ${headerHtml}
            ${infoCardHtml}
            ${descriptionHtml}
            ${adminHtml}
            ${tournamentsHtml}
            ${footerHtml}
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

// Note: Functions are imported via ES modules in ui.js - no window.* exports needed here.
// Exception: editTournament, deleteTournament, duplicateTournament are on window via event-service.js
// because they are called from dynamically-generated HTML onclick handlers.
