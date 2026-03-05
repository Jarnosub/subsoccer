/**
 * ============================================================
 * EVENTS MODULE (V3 FINAL - REFACTORED)
 * Main entry point for the events system.
 * Re-exports functionality from sub-modules for compatibility.
 * ============================================================
 */

// 1. Branding logic (moved to branding-service.js)

// 2. UI Rendering
export {
    renderEventsPage,
    renderEventCard,
    showEventModal,
    closeEventModal,
    canModerateEvent
} from './event-ui.js';

// 3. Form Handling & Creation
export {
    showCreateEventForm,
    hideCreateEventForm,
    previewEventImage,
    clearEventImage,
    previewBrandLogo,
    clearBrandLogo,
    createNewEvent,
    showCreateTournamentForm,
    closeTournamentForm,
    createTournament
} from './event-form.js';

// 4. Data Services
export {
    loadEventsPage,
    viewEventDetails,
    registerForTournament,
    unregisterFromTournament,
    deleteEvent,
    editTournament,
    saveTournamentEdit,
    deleteTournament,
    duplicateTournament,
    shareTournamentLink,
    editEvent,
    updateEventForm,
    showEmailPrompt,
    closeEmailPrompt,
    saveEmailAndRegister
} from './event-service.js';

// 5. Participant Management
export {
    viewTournamentParticipants,
    removeTournamentParticipant,
    closeParticipantsModal,
    handleParticipantSearch,
    selectParticipantFromDropdown,
    addParticipantFromSearch
} from './event-participant.js';

// 6. Moderator Management
export {
    searchModerators,
    addModerator,
    removeModerator
} from './event-moderator.js';

// 7. Tournament Logic & Brackets
export {
    viewTournamentBracket,
    finishEventTournament,
    closeBracketModal
} from './event-tournament-logic.js';

// 8. Event UI Listeners
export {
    setupEventUIListeners
} from './event-listeners.js';
