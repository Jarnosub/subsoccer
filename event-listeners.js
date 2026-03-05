import {
    viewTournamentBracket, finishEventTournament, closeBracketModal, viewTournamentParticipants,
    showCreateEventForm, hideCreateEventForm, viewEventDetails, editTournament, deleteTournament,
    unregisterFromTournament, registerForTournament, showCreateTournamentForm, editEvent, deleteEvent,
    closeEventModal, addParticipantFromSearch, removeTournamentParticipant, selectParticipantFromDropdown,
    createTournament, closeParticipantsModal, closeTournamentForm, saveTournamentEdit, clearEventImage,
    clearBrandLogo, previewBrandLogo, previewEventImage, createNewEvent, updateEventForm, closeEmailPrompt,
    saveEmailAndRegister, handleParticipantSearch, searchModerators, addModerator, removeModerator,
    shareTournamentLink
} from './events-v3-final.js';
import { shareLiveEventLink } from './live-view-service.js';
import { showNotification } from './ui-utils.js';

export function setupEventUIListeners() {
    // Event Delegation for dynamic event elements
    document.addEventListener('click', (e) => {
        // 13. View Tournament Bracket (Events)
        const viewBracketBtn = e.target.closest('[data-action="view-bracket"]');
        if (viewBracketBtn) {
            const { id, eventId, name } = viewBracketBtn.dataset;
            viewTournamentBracket(id, name, eventId);
            return;
        }

        // 14. View Participants (Events)
        const viewParticipantsBtn = e.target.closest('[data-action="view-participants"]');
        if (viewParticipantsBtn) {
            const { eventId, tourId, name } = viewParticipantsBtn.dataset;
            viewTournamentParticipants(eventId, tourId, name);
            return;
        }

        // 15. Event Bracket Controls
        const action = e.target.dataset.action;
        if (action === 'finish-event-tournament') finishEventTournament();
        if (action === 'close-bracket-modal') closeBracketModal();

        // 16. Event Management Delegation
        const eventAction = e.target.closest('[data-action]');
        if (eventAction) {
            const act = eventAction.dataset.action;
            const id = eventAction.dataset.id;
            const eventId = eventAction.dataset.eventId;
            const tourId = eventAction.dataset.tourId;
            const name = eventAction.dataset.name;
            const eventName = eventAction.dataset.eventName;

            if (act === 'show-create-event-form') { showCreateEventForm(); return; }
            if (act === 'hide-create-event-form') { hideCreateEventForm(); return; }
            if (act === 'view-event-details') { viewEventDetails(id); return; }
            if (act === 'edit-tournament') { editTournament(id, eventId, eventName); return; }
            if (act === 'delete-tournament') { deleteTournament(id, eventId); return; }
            if (act === 'unregister-tournament') { unregisterFromTournament(eventId, tourId); return; }
            if (act === 'register-tournament') { registerForTournament(eventId, tourId); return; }
            if (act === 'show-create-tournament-form') { showCreateTournamentForm(eventId, eventName); return; }
            if (act === 'edit-event') { editEvent(id); return; }
            if (act === 'delete-event') { deleteEvent(id); return; }
            if (act === 'open-public-display') { window.open(`?live=${id}`, '_blank'); return; }
            if (act === 'share-live-link') { shareLiveEventLink(id, name); return; }
            if (act === 'close-event-modal') { closeEventModal(); return; }
            if (act === 'close-participants-modal') { closeParticipantsModal(); return; }
            if (act === 'add-participant') { addParticipantFromSearch(tourId); return; }
            if (act === 'remove-participant') { removeTournamentParticipant(eventAction.dataset.regId, tourId); return; }
            if (act === 'select-participant') { selectParticipantFromDropdown(tourId, name); return; }
            if (act === 'share-tournament') { shareTournamentLink(eventId, tourId, name); return; }
            if (act === 'create-tournament') { createTournament(eventId); return; }
            if (act === 'close-tournament-form') { closeTournamentForm(); return; }
            if (act === 'save-tournament-edit') { saveTournamentEdit(id, eventId); return; }
            if (act === 'clear-event-image') { clearEventImage(); return; }
            if (act === 'clear-brand-logo') { clearBrandLogo(); return; }
            if (act === 'create-event') { createNewEvent(); return; }
            if (act === 'update-event-form') { updateEventForm(id); return; }
            if (act === 'close-email-prompt') { closeEmailPrompt(); return; }
            if (act === 'save-email-register') { saveEmailAndRegister(eventId, tourId); return; }
            if (act === 'reload-page') { location.reload(); return; }
            if (act === 'select-all') { e.target.select(); return; }
            if (act === 'copy-live-link') {
                navigator.clipboard.writeText(eventAction.dataset.url).then(() => {
                    showNotification('Copied!', 'success');
                    eventAction.closest('div[style*="position:fixed"]').remove();
                });
                return;
            }
            if (act === 'close-share-modal') { eventAction.closest('div[style*="position:fixed"]').remove(); return; }
            if (act === 'toggle-moderator-search') {
                const container = document.getElementById('moderator-search-container');
                if (container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
                return;
            }
            if (act === 'add-moderator') {
                addModerator(eventId, eventAction.dataset.playerId, eventAction.dataset.username);
                return;
            }
            if (act === 'remove-moderator') {
                removeModerator(eventId, eventAction.dataset.playerId);
                return;
            }
        }
    });

    document.addEventListener('input', (e) => {
        // Participant search in events
        if (e.target.id && e.target.id.startsWith('participant-search-')) {
            const tourId = e.target.id.replace('participant-search-', '');
            handleParticipantSearch(tourId);
        }
        if (e.target.id === 'mod-search-input') {
            const eventId = e.target.closest('[data-event-id]')?.dataset.eventId;
            if (eventId) searchModerators(e.target.value, eventId);
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'brand-logo-input') previewBrandLogo(e.target);
        if (e.target.id === 'event-image-input') previewEventImage(e.target);
    });
}
