const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

export const _supabase = window.supabase.createClient(_URL, _KEY);

// Jaettu tila (Shared State) - Kaikki globaalit muuttujat tähän
export const state = {
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
    editingGameId: null
};

// Globaali pääsy debuggausta varten ja vanhoille scripteille
window._appState = state;
window._supabase = _supabase;