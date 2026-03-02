import { _supabase, state, isAdmin } from './config.js';
import { showNotification, showLoading, hideLoading, showModal } from './ui-utils.js';
import { renderEventsPage, showEventModal, canModerateEvent, closeEventModal, getFlagEmoji } from './event-ui.js';
import { showCreateTournamentForm, closeTournamentForm, hideCreateEventForm, showCreateEventForm } from './event-form.js';

/**
 * ============================================================
 * EVENT SERVICE
 * Handles data fetching, registration, and management logic
 * ============================================================
 */

/**
 * Load events page - main entry point
 */
export async function loadEventsPage() {
    const container = document.getElementById('events-view');
    if (!container) return;

    showLoading('Loading Events...');

    try {
        const now = new Date();
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);

        const { data: events, error } = await _supabase
            .from('events')
            .select('id, event_name, event_type, start_datetime, end_datetime, location, image_url')
            .neq('status', 'cancelled')
            .gte('start_datetime', threeMonthsAgo.toISOString())
            .order('start_datetime', { ascending: true });

        if (error) throw error;

        const activeEvents = [];
        const pastEvents = [];

        (events || []).forEach(event => {
            const startDate = new Date(event.start_datetime);
            const endDate = event.end_datetime ? new Date(event.end_datetime) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000);
            if (endDate < now) pastEvents.push(event);
            else activeEvents.push(event);
        });

        pastEvents.sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime));
        renderEventsPage([...activeEvents, ...pastEvents]);
    } catch (e) {
        console.error('Failed to load events:', e);
        if (container) container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--sub-red);"><button onclick="loadEventsPage()" class="btn-red">TRY AGAIN</button></div>`;
    } finally {
        hideLoading();
    }
}

/**
 * View event details and registration
 */
export async function viewEventDetails(eventId) {
    showLoading('Loading Event...');
    try {
        const { data: event, error } = await _supabase.from('events').select('*').eq('id', eventId).single();
        if (error) throw error;

        const { data: tournaments } = await _supabase.from('tournament_history').select('*, game:games(game_name)').eq('event_id', eventId).order('start_datetime', { ascending: true });

        // Get actual participant counts for each tournament
        const { data: allRegs } = await _supabase.from('event_registrations').select('tournament_id').eq('event_id', eventId).eq('status', 'registered');
        (tournaments || []).forEach(t => {
            t.participant_count = (allRegs || []).filter(r => r.tournament_id === t.id).length;
        });

        let userRegistrations = [];
        if (state.user) {
            const { data: regs } = await _supabase.from('event_registrations').select('*').eq('event_id', eventId).eq('player_id', state.user.id);
            userRegistrations = regs || [];
        }

        const { data: mods } = await _supabase.from('event_moderators').select('player_id').eq('event_id', eventId);
        const moderatorIds = mods ? mods.map(m => m.player_id) : [];

        showEventModal(event, tournaments || [], userRegistrations, moderatorIds);
    } catch (e) {
        showNotification('Failed to load event details', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Registration logic
 */
export async function registerForTournament(eventId, tournamentId) {
    if (!state.user) {
        showNotification('You must be logged in to register', 'error');
        return;
    }

    if (!state.user.email) {
        showEmailPrompt(eventId, tournamentId);
        return;
    }

    try {
        const { error } = await _supabase.from('event_registrations').insert({ event_id: eventId, tournament_id: tournamentId, player_id: state.user.id, status: 'registered' });
        if (error) throw error;
        showNotification('Registered!', 'success');
        viewEventDetails(eventId);
    } catch (e) {
        showNotification('Registration failed', 'error');
    }
}

export function showEmailPrompt(eventId, tournamentId) {
    const html = `
        <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:11000;">
            <div style="background:#222; padding:30px; border-radius:8px; border:2px solid var(--sub-gold); max-width:400px; width:100%;">
                <h3 style="color:var(--sub-gold); text-align:center;">Email Required</h3>
                <p style="color:#ccc; text-align:center; margin-bottom:20px;">Required for tournament participation.</p>
                <input type="email" id="email-prompt-input" placeholder="email@example.com" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px;">
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button onclick="closeEmailPrompt()" style="flex:1; background:#555; border:none; color:#fff; padding:10px; border-radius:4px;">Cancel</button>
                    <button onclick="saveEmailAndRegister('${eventId}', '${tournamentId}')" class="btn-gold" style="flex:1;">Save & Register</button>
                </div>
            </div>
        </div>
    `;
    let m = document.getElementById('email-prompt-modal');
    if (!m) { m = document.createElement('div'); m.id = 'email-prompt-modal'; document.body.appendChild(m); }
    m.innerHTML = html;
}

export function closeEmailPrompt() {
    const m = document.getElementById('email-prompt-modal');
    if (m) m.remove();
}

export async function saveEmailAndRegister(eventId, tournamentId) {
    const email = document.getElementById('email-prompt-input')?.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showNotification('Valid email required', 'error');
        return;
    }

    try {
        await _supabase.from('players').update({ email }).eq('id', state.user.id);
        state.user.email = email;
        closeEmailPrompt();
        showNotification('Email saved!', 'success');
        setTimeout(() => registerForTournament(eventId, tournamentId), 500);
    } catch (e) {
        showNotification('Failed to save email', 'error');
    }
}

export async function unregisterFromTournament(eventId, tournamentId) {
    if (!state.user) return;
    try {
        const { error } = await _supabase.from('event_registrations').delete().eq('event_id', eventId).eq('tournament_id', tournamentId).eq('player_id', state.user.id);
        if (error) throw error;
        showNotification('Cancelled', 'success');
        viewEventDetails(eventId);
    } catch (e) {
        showNotification('Failed to cancel', 'error');
    }
}

export async function deleteEvent(eventId) {
    if (!confirm('Are you sure? This will delete the event and all associated tournaments.')) return;
    try {
        const { error } = await _supabase.from('events').delete().eq('id', eventId);
        if (error) throw error;
        showNotification('Event deleted', 'success');
        closeEventModal();
        loadEventsPage();
    } catch (e) {
        showNotification('Delete failed', 'error');
    }
}

export async function editEvent(eventId) {
    try {
        const { data: event } = await _supabase.from('events').select('*').eq('id', eventId).single();
        if (!event) return;

        showCreateEventForm(event);

        setTimeout(() => {
            if (document.getElementById('event-name-input')) document.getElementById('event-name-input').value = event.event_name;
            if (document.getElementById('event-type-select')) document.getElementById('event-type-select').value = event.event_type;
            if (document.getElementById('event-location-input')) document.getElementById('event-location-input').value = event.location || '';
            if (document.getElementById('event-desc-input')) document.getElementById('event-desc-input').value = event.description || '';
            if (document.getElementById('event-start-input')) document.getElementById('event-start-input').value = new Date(event.start_datetime).toISOString().slice(0, 16);
            if (document.getElementById('event-end-input')) document.getElementById('event-end-input').value = event.end_datetime ? new Date(event.end_datetime).toISOString().slice(0, 16) : '';

            const btn = document.querySelector('button[onclick="createNewEvent()"]');
            if (btn) {
                btn.setAttribute('onclick', `updateEventForm('${eventId}')`);
                btn.innerHTML = 'UPDATE EVENT';
            }
        }, 100);
    } catch (e) {
        showNotification('Failed to load event for editing', 'error');
    }
}

export async function updateEventForm(eventId) {
    const updates = {
        event_name: document.getElementById('event-name-input')?.value.trim(),
        event_type: document.getElementById('event-type-select')?.value,
        location: document.getElementById('event-location-input')?.value.trim(),
        description: document.getElementById('event-desc-input')?.value.trim(),
        start_datetime: document.getElementById('event-start-input')?.value ? new Date(document.getElementById('event-start-input').value).toISOString() : null,
        end_datetime: document.getElementById('event-end-input')?.value ? new Date(document.getElementById('event-end-input').value).toISOString() : null,
        primary_color: document.getElementById('event-color-input')?.value
    };

    try {
        const { error } = await _supabase.from('events').update(updates).eq('id', eventId);
        if (error) throw error;
        showNotification('Event updated!', 'success');
        hideCreateEventForm();
        loadEventsPage();
    } catch (e) {
        showNotification('Update failed', 'error');
    }
}

/**
 * Edit tournament
 */
export async function editTournament(tournamentId, eventId, eventName) {
    try {
        const { data: tournament } = await _supabase.from('tournament_history').select('*').eq('id', tournamentId).single();
        const { data: event } = await _supabase.from('events').select('*, moderators:event_moderators(player_id)').eq('id', eventId).single();
        const moderators = event.moderators ? event.moderators.map(m => m.player_id) : [];
        if (!canModerateEvent(event, moderators)) {
            showNotification('Not authorized', 'error');
            return;
        }
        await showEditTournamentForm(tournament, eventId, eventName);
    } catch (e) {
        showNotification('Failed to load tournament', 'error');
    }
}

async function showEditTournamentForm(tournament, eventId, eventName) {
    if (!state.allGames || state.allGames.length === 0) {
        const { data: games } = await _supabase.from('games').select('*').order('game_name');
        state.allGames = games || [];
    }
    await showCreateTournamentForm(eventId, eventName);
    setTimeout(() => {
        if (document.getElementById('tournament-name-input')) document.getElementById('tournament-name-input').value = tournament.tournament_name || '';
        if (document.getElementById('tournament-game-select')) document.getElementById('tournament-game-select').value = tournament.game_id;
        if (document.getElementById('tournament-start-input') && tournament.start_datetime) document.getElementById('tournament-start-input').value = new Date(tournament.start_datetime).toISOString().slice(0, 16);
        if (document.getElementById('tournament-end-input') && tournament.end_datetime) document.getElementById('tournament-end-input').value = new Date(tournament.end_datetime).toISOString().slice(0, 16);
        if (document.getElementById('tournament-max-input')) document.getElementById('tournament-max-input').value = tournament.max_participants || 8;

        const btn = document.querySelector('#tournament-form-modal button[onclick*="createTournament"]');
        if (btn) {
            btn.setAttribute('onclick', `saveTournamentEdit('${tournament.id}', '${eventId}')`);
            btn.innerHTML = '<i class="fa fa-save"></i> SAVE CHANGES';
        }
    }, 100);
}

export async function saveTournamentEdit(tournamentId, eventId) {
    const updates = {
        tournament_name: document.getElementById('tournament-name-input')?.value.trim(),
        game_id: document.getElementById('tournament-game-select')?.value,
        start_datetime: new Date(document.getElementById('tournament-start-input').value).toISOString(),
        end_datetime: document.getElementById('tournament-end-input')?.value ? new Date(document.getElementById('tournament-end-input').value).toISOString() : null,
        max_participants: parseInt(document.getElementById('tournament-max-input')?.value) || 8
    };

    try {
        const { error } = await _supabase.from('tournament_history').update(updates).eq('id', tournamentId);
        if (error) throw error;
        showNotification('Tournament updated!', 'success');
        closeTournamentForm();
        viewEventDetails(eventId);
    } catch (e) {
        showNotification('Failed to update: ' + e.message, 'error');
    }
}

export async function deleteTournament(tournamentId, eventId) {
    if (!confirm('Are you sure?')) return;
    try {
        const { error } = await _supabase.from('tournament_history').delete().eq('id', tournamentId);
        if (error) throw error;
        showNotification('Tournament deleted', 'success');
        viewEventDetails(eventId);
    } catch (e) {
        showNotification('Delete failed', 'error');
    }
}

export async function duplicateTournament(tournamentId, eventId) {
    try {
        const { data: original } = await _supabase.from('tournament_history').select('*').eq('id', tournamentId).single();
        const copy = { ...original };
        delete copy.id;
        copy.tournament_name = `${original.tournament_name} (Copy)`;
        copy.status = 'scheduled';
        copy.created_at = new Date().toISOString();

        const { error } = await _supabase.from('tournament_history').insert(copy);
        if (error) throw error;
        showNotification('Duplicated!', 'success');
        viewEventDetails(eventId);
    } catch (e) {
        showNotification('Failed to duplicate', 'error');
    }
}

export function shareTournamentLink(eventId, tournamentId, tournamentName) {
    const shareUrl = `${window.location.origin}${window.location.pathname}?page=events&event_id=${eventId}`;
    const modalHtml = `
        <div style="text-align:center;">
            <p style="color:#ccc; margin-bottom:20px;">Scan to register for <strong>${tournamentName}</strong></p>
            <div style="background:#fff; padding:15px; display:inline-block; border-radius:8px; margin-bottom:20px;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}" style="width:200px; height:200px; display:block;">
            </div>
            <button class="btn-red" onclick="navigator.clipboard.writeText('${shareUrl}').then(() => showNotification('Link copied!', 'success'))">COPY LINK</button>
        </div>
    `;
    showModal('SHARE', modalHtml, { maxWidth: '400px' });
}

// Global Exports
window.loadEventsPage = loadEventsPage;
window.viewEventDetails = viewEventDetails;
window.deleteEvent = deleteEvent;
window.registerForTournament = registerForTournament;
window.unregisterFromTournament = unregisterFromTournament;
window.editTournament = editTournament;
window.deleteTournament = deleteTournament;
window.duplicateTournament = duplicateTournament;
window.saveTournamentEdit = saveTournamentEdit;
window.shareTournamentLink = shareTournamentLink;
window.editEvent = editEvent;
window.updateEventForm = updateEventForm;
window.showEmailPrompt = showEmailPrompt;
window.closeEmailPrompt = closeEmailPrompt;
window.saveEmailAndRegister = saveEmailAndRegister;
