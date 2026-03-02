import { _supabase, state } from './config.js';
import { showNotification, showModal, closeModal } from './ui-utils.js';
import { viewEventDetails } from './event-service.js';

/**
 * ============================================================
 * EVENT PARTICIPANT COMPONENT
 * Handles manual registration and participant listing
 * ============================================================
 */

let currentEventId = null;

export async function viewTournamentParticipants(eventId, tournamentId, tournamentName) {
    currentEventId = eventId;
    try {
        const { data: registrations } = await _supabase.from('event_registrations').select('id, player:players(username, country, avatar_url)').eq('tournament_id', tournamentId).eq('status', 'registered');

        let html = `
            <div style="padding:15px; background:#111; border-radius:8px; margin-bottom:20px;">
                <h4 style="color:var(--sub-gold); margin-bottom:15px;">ADD PLAYER</h4>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="participant-search-${tournamentId}" placeholder="Search or type name..." 
                        style="width:100%; padding:10px; background:#222; border:1px solid #333; color:#fff;"
                        data-tour-id="${tournamentId}">
                    <button data-action="add-participant" data-tour-id="${tournamentId}" class="btn-red" style="width: auto; padding: 0 15px;">ADD</button>
                </div>
                <div id="search-dropdown-${tournamentId}" style="display:none; background:#0a0a0a; border:1px solid #333; max-height:200px; overflow-y:auto; margin-top:5px;"></div>
            </div>
            <div id="participants-list">
                ${(registrations || []).map(r => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #222;">
                        <span>${r.player?.username || 'Guest'}</span>
                        <button data-action="remove-participant" data-reg-id="${r.id}" data-tour-id="${tournamentId}" style="background:none; border:none; color:var(--sub-red); cursor:pointer;"><i class="fa fa-trash"></i></button>
                    </div>
                `).join('')}
            </div>
            <button data-action="close-participants-modal" class="btn-red" style="width:100%; margin-top:20px;">DONE</button>
        `;

        showModal('PARTICIPANTS', html, { id: 'participants-modal', maxWidth: '400px' });
    } catch (e) {
        showNotification('Failed to load participants', 'error');
    }
}

export async function handleParticipantSearch(tournamentId) {
    const input = document.getElementById(`participant-search-${tournamentId}`);
    const dropdown = document.getElementById(`search-dropdown-${tournamentId}`);
    if (!input || !dropdown) return;

    const q = input.value.trim();
    if (q.length < 1) { dropdown.style.display = 'none'; return; }

    const { data: players } = await _supabase.from('players').select('username').ilike('username', `%${q}%`).limit(5);
    let html = (players || []).map(p => `<div style="padding:8px; cursor:pointer;" data-action="select-participant" data-tour-id="${tournamentId}" data-name="${p.username}">${p.username}</div>`).join('');
    html += `<div style="padding:8px; color:var(--sub-gold); cursor:pointer;" data-action="select-participant" data-tour-id="${tournamentId}" data-name="${q}">+ Add "${q}"</div>`;
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

export function selectParticipantFromDropdown(tournamentId, name) {
    const input = document.getElementById(`participant-search-${tournamentId}`);
    if (input) input.value = name;
    addParticipantFromSearch(tournamentId);
}

export async function addParticipantFromSearch(tournamentId) {
    const input = document.getElementById(`participant-search-${tournamentId}`);
    const name = input?.value.trim();
    if (!name) return;

    try {
        let { data: player } = await _supabase.from('players').select('id').ilike('username', name).single();
        let playerId = player?.id;

        if (!playerId) {
            const { data, error } = await _supabase.rpc('create_guest_player', { p_username: name });
            if (error) throw error;
            playerId = data;
        }

        const { error } = await _supabase.rpc('add_tournament_participant', { p_tournament_id: tournamentId, p_player_id: playerId });
        if (error) throw error;

        showNotification('Added!', 'success');
        input.value = '';
        viewTournamentParticipants(currentEventId, tournamentId, '');
    } catch (e) {
        showNotification('Failed to add participant', 'error');
    }
}

export async function removeTournamentParticipant(regId, tournamentId) {
    if (!confirm('Remove participant?')) return;
    try {
        await _supabase.from('event_registrations').delete().eq('id', regId);
        viewTournamentParticipants(currentEventId, tournamentId, '');
    } catch (e) {
        showNotification('Failed to remove', 'error');
    }
}

export function closeParticipantsModal() {
    closeModal('participants-modal');
    if (currentEventId) viewEventDetails(currentEventId);
}

// Component exports only (No global window bindings)
