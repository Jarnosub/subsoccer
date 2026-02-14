import { state, _supabase } from './config.js';
import { 
    fetchLB, 
    fetchHist, 
    fetchMyGames, 
    initGameMap, 
    updateProfileCard 
} from './script.js';
import { loadEventsPage } from './events.js';

window.showPage = showPage;
window.toggleSettingsMenu = toggleSettingsMenu;