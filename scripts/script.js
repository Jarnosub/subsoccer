import { _supabase, state } from './config.js';
import { 
    showNotification, 
    showVictoryAnimation, 
    populateGameSelect, 
    showMatchMode,
    updateProfileCard // Tämä on tärkeä keräilykorttia varten
} from './ui.js';

window.addGoal = addGoal;
window.startQuickMatch = startQuickMatch;
window.cancelQuickMatch = cancelQuickMatch;
window.finishQuickMatch = finishQuickMatch;
window.updateScore = updateScore; // Jos käytät tätä HTML:ssä