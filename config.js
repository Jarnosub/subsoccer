const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

export const _supabase = window.supabase.createClient(_URL, _KEY);

// Jaettu tila (Shared State) - Kaikki globaalit muuttujat tähän
const initialState = {
    user: null,
    pool: [],
    sessionGuests: [],
    allDbNames: [],
    allGames: [],
    myGames: [],
    gameMap: null,
    gameMarker: null,
    selLat: null,
    selLng: null,
    publicMap: null,
    editingGameId: null,
    currentTournamentId: null,
    // Quick Match & Pro Mode State
    quickP1: null,
    quickP2: null,
    proModeActive: false,
    proModeEnabled: false,
    proScoreP1: 0,
    proScoreP2: 0,
    proGoalHistory: [],
    inventory: [], // Omistetut korttityypit
    activeCardEdition: 'standard',
    brand: null, // Nykyinen brändi (esim. 'coca-cola')
    brandLogo: null, // Brändin logo-URL
    currentPage: 'tournament', // Ohjaa näkyvää sivua
    victoryData: null // Tallentaa voittotiedot animaatiota varten
};

const listeners = {};

/**
 * Reactive State using Proxy. 
 * Automatically triggers registered listeners when state properties change.
 */
export const state = new Proxy(initialState, {
    set(target, prop, value) {
        target[prop] = value;
        if (listeners[prop]) {
            listeners[prop].forEach(callback => callback(value));
        }
        return true;
    }
});

export const subscribe = (prop, callback) => {
    if (!listeners[prop]) listeners[prop] = [];
    listeners[prop].push(callback);
};

// Globaali pääsy debuggausta varten ja vanhoille scripteille
window._appState = state;
window._supabase = _supabase;

export const isAdmin = () => state.user?.is_admin || state.user?.username === 'JARNO SAARINEN';