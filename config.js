const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co', _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const _supabase = window.supabase.createClient(_URL, _KEY);
let user = null, pool = [], sessionGuests = [], allDbNames = [], allGames = [], myGames = [];
let gameMap = null, gameMarker = null, selLat = null, selLng = null;
let publicMap = null;
let editingGameId = null;