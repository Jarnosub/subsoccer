import { _supabase } from './config.js';
import { showNotification } from './ui-utils.js';
import { viewEventDetails } from './event-service.js';

/**
 * ============================================================
 * EVENT MODERATOR COMPONENT
 * Handles management of event moderators
 * ============================================================
 */

export async function searchModerators(query, eventId) {
    const resultsContainer = document.getElementById('mod-search-results');
    if (!resultsContainer || query.length < 1) {
        if (resultsContainer) resultsContainer.innerHTML = '';
        return;
    }

    try {
        const { data: players } = await _supabase.from('players').select('id, username').ilike('username', `%${query}%`).limit(5);
        resultsContainer.innerHTML = (players || []).map(p => `
            <div style="padding:8px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#fff; font-size:0.85rem;">${p.username}</span>
                <button data-action="add-moderator" data-event-id="${eventId}" data-player-id="${p.id}" data-username="${p.username}"
                    style="background:var(--sub-red); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">ADD</button>
            </div>`).join('') || '<div style="padding:8px; color:#666; font-size:0.85rem;">No players found</div>';
    } catch (e) {
        console.error('Search failed:', e);
    }
}

export async function addModerator(eventId, playerId, username) {
    try {
        const { error } = await _supabase.from('event_moderators').insert({ event_id: eventId, player_id: playerId });
        if (error) {
            if (error.code === '23505') showNotification('Already a moderator', 'warning');
            else throw error;
        } else {
            showNotification(`${username} added as moderator`, 'success');
            viewEventDetails(eventId);
        }
    } catch (e) {
        showNotification('Failed to add moderator', 'error');
    }
}

export async function removeModerator(eventId, playerId) {
    try {
        const { error } = await _supabase.from('event_moderators').delete().eq('event_id', eventId).eq('player_id', playerId);
        if (error) throw error;
        showNotification('Moderator removed', 'success');
        viewEventDetails(eventId);
    } catch (e) {
        showNotification('Failed to remove moderator', 'error');
    }
}

// Global Exports
window.searchModerators = searchModerators;
window.addModerator = addModerator;
window.removeModerator = removeModerator;
