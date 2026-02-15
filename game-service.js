import { _supabase, state } from './config.js';
import { showNotification, showModal, closeModal } from './ui-utils.js';
import { setMapLocation } from './map.js';

/**
 * ============================================================
 * GAME TABLE MANAGEMENT & OWNERSHIP
 * ============================================================
 */

export async function fetchAllGames() {
    try {
        const { data } = await _supabase.from('games').select('id, game_name');
        state.allGames = data || [];
    } catch (e) {
        console.error(e);
    }
}

export async function registerGame() {
    const btn = event?.target;
    const originalText = btn ? btn.textContent : '';
    const serialNumber = document.getElementById('game-serial-input').value.trim();
    const gameName = document.getElementById('game-name-input').value.trim();
    const location = document.getElementById('game-address-input').value.trim();
    const isPublic = document.getElementById('game-public-input').checked;
    
    try {
        if (btn) { btn.disabled = true; btn.textContent = 'Registering...'; }
        if (!serialNumber || !gameName || !location || !state.selLat) {
            showNotification("Please fill all fields and select location on map.", "error");
            return;
        }
        if (state.user.id === 'guest') {
            showNotification("Guests cannot register games. Please create an account.", "error");
            return;
        }
        
        const { data: existingGames } = await _supabase.from('games').select('id, game_name, owner_id').eq('serial_number', serialNumber);
        if (existingGames && existingGames.length > 0) {
            const existingGame = existingGames[0];
            const { data: ownerData } = await _supabase.from('players').select('username').eq('id', existingGame.owner_id).maybeSingle();
            existingGame.players = ownerData;
            showOwnershipTransferDialog(existingGame, serialNumber, gameName, location, isPublic);
            return;
        }
        
        const uniqueCode = serialNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const { error } = await _supabase.from('games').insert([{ 
            unique_code: uniqueCode, game_name: gameName, location: location, owner_id: state.user.id, 
            latitude: state.selLat, longitude: state.selLng, is_public: isPublic,
            serial_number: serialNumber, verified: true, registered_at: new Date().toISOString()
        }]);
        if (error) throw error;
        
        showNotification(`Game "${gameName}" registered successfully! ⭐ VERIFIED`, "success");
        cancelEdit();
        await fetchAllGames();
        fetchMyGames();
    } catch (error) {
        showNotification("Failed to register game: " + error.message, "error");
    } finally { if (btn) { btn.disabled = false; btn.textContent = originalText; } }
}

export function initEditGame(id) {
    const game = state.myGames.find(g => g.id === id);
    if (!game) return;
    state.editingGameId = id;
    document.getElementById('game-serial-input').value = game.serial_number || '';
    document.getElementById('game-serial-input').disabled = true;
    document.getElementById('game-name-input').value = game.game_name;
    document.getElementById('game-address-input').value = game.location;
    document.getElementById('game-public-input').checked = game.is_public;
    if (game.latitude && game.longitude) setMapLocation(game.latitude, game.longitude, game.location);
    document.getElementById('btn-reg-game').style.display = 'none';
    document.getElementById('btn-edit-group').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function cancelEdit() {
    state.editingGameId = null;
    document.getElementById('game-serial-input').value = '';
    document.getElementById('game-serial-input').disabled = false;
    document.getElementById('game-name-input').value = '';
    document.getElementById('game-address-input').value = '';
    document.getElementById('game-public-input').checked = false;
    document.getElementById('location-confirm').innerText = '';
    state.selLat = null; state.selLng = null;
    if (state.gameMarker) state.gameMap.removeLayer(state.gameMarker);
    document.getElementById('btn-reg-game').style.display = 'block';
    document.getElementById('btn-edit-group').style.display = 'none';
}

export async function updateGame() {
    if (!state.editingGameId) return;
    const btn = event?.target;
    const originalText = btn ? btn.textContent : '';
    try {
        if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }
        const gameName = document.getElementById('game-name-input').value.trim();
        const location = document.getElementById('game-address-input').value.trim();
        const isPublic = document.getElementById('game-public-input').checked;
        if (!gameName || !location || !state.selLat) { showNotification("Please fill fields and location.", "error"); return; }
        const { error } = await _supabase.from('games').update({ game_name: gameName, location: location, latitude: state.selLat, longitude: state.selLng, is_public: isPublic }).eq('id', state.editingGameId);
        if (error) throw error;
        showNotification("Game updated!", "success");
        cancelEdit();
        fetchMyGames();
        await fetchAllGames();
    } catch (error) { showNotification("Update failed: " + error.message, "error"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = originalText; } }
}

export async function deleteGame(id) {
    if (!confirm("Are you sure you want to delete this game table?")) return;
    try {
        await _supabase.from('tournament_history').update({ game_id: null }).eq('game_id', id);
        const { error } = await _supabase.from('games').delete().eq('id', id);
        if (error) throw error;
        showNotification("Game deleted successfully", "success");
        fetchMyGames();
        fetchAllGames();
    } catch (e) { showNotification("Deletion failed: " + e.message, "error"); }
}

export async function fetchMyGames() {
    if (state.user.id === 'guest') return;
    const { data } = await _supabase.from('games').select('*').eq('owner_id', state.user.id);
    state.myGames = data || [];
    const gameHTML = (data && data.length > 0) ? data.map(game => `
        <div style="background:#111; padding:15px; border-radius:8px; margin-bottom:10px; border-left: 3px solid ${game.verified ? 'var(--sub-gold)' : 'var(--sub-red)'}; position: relative;">
            ${game.verified ? '<div style="position:absolute; top:10px; left:10px; background:linear-gradient(135deg, var(--sub-gold) 0%, #d4af37 100%); color:#000; padding:3px 8px; border-radius:4px; font-size:0.65rem; font-family:\'Russo One\'; box-shadow:0 2px 4px rgba(255,215,0,0.3);">⭐ VERIFIED</div>' : ''}
            <div style="position: absolute; top: 10px; right: 10px;">
                <button onclick="initEditGame('${game.id}')" style="background: none; border: none; cursor: pointer; font-size: 1rem; margin-right: 5px; color: #ccc;">✏️</button>
                <button onclick="deleteGame('${game.id}')" style="background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--sub-red);">🗑️</button>
            </div>
            <div style="font-family: 'Russo One'; font-size: 1rem; padding-right: 60px; ${game.verified ? 'margin-top:25px;' : ''}">${game.game_name}</div>
            <small style="color:#888;">${game.location}</small><br>
            <small style="color:var(--sub-gold); font-size:0.65rem;">SERIAL: ${game.serial_number}</small>
            ${game.verified ? `<div style="margin-top:10px;"><button class="btn-red" style="font-size:0.7rem; padding:6px 12px; background:#444;" onclick="releaseGameOwnership('${game.id}')">Release Ownership</button></div>` : ''}
        </div>
    `).join('') : '<p>You have not registered any games yet.</p>';
    const list = document.getElementById('my-games-list');
    const profileList = document.getElementById('profile-games-list');
    if (list) list.innerHTML = gameHTML;
    if (profileList) profileList.innerHTML = data.map(game => `<div style="background:#0a0a0a; padding:12px; border-radius:8px; margin-bottom:8px; border-left:3px solid ${game.verified ? 'var(--sub-gold)' : '#333'};"><div style="font-family:'Russo One'; font-size:0.9rem; color:#fff; margin-bottom:3px;">${game.verified ? '⭐ ' : ''}${game.game_name}</div><div style="font-size:0.75rem; color:#888;">${game.location}</div></div>`).join('');
}

export async function releaseGameOwnership(gameId) {
    if (!confirm("Release ownership?")) return;
    try {
        const { data, error } = await _supabase.rpc('release_game_ownership', { p_game_id: gameId, p_player_id: state.user.id });
        if (error) throw error;
        if (data) { showNotification("Ownership released!", "success"); fetchMyGames(); }
    } catch (error) { showNotification("Failed: " + error.message, "error"); }
}

export async function approveOwnershipTransfer(transferId) {
    if (!confirm("Approve transfer?")) return;
    try {
        const { data, error } = await _supabase.rpc('approve_ownership_transfer', { transfer_id: transferId });
        if (error) throw error;
        if (data) { showNotification("Approved!", "success"); closeOwnershipRequestsModal(); fetchMyGames(); }
    } catch (error) { showNotification("Failed: " + error.message, "error"); }
}

export async function rejectOwnershipTransfer(transferId) {
    try {
        const { error } = await _supabase.from('ownership_transfer_requests').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', transferId);
        if (error) throw error;
        showNotification("Rejected.", "success");
        closeOwnershipRequestsModal();
    } catch (error) { showNotification("Failed: " + error.message, "error"); }
}

export async function requestOwnershipTransfer(gameId, serialNumber, newGameName, newLocation, isPublic) {
    try {
        const message = document.getElementById('transfer-message')?.value.trim() || '';
        const { data: gameData } = await _supabase.from('games').select('owner_id').eq('id', gameId).single();
        const { error } = await _supabase.from('ownership_transfer_requests').insert([{ game_id: gameId, serial_number: serialNumber, current_owner_id: gameData.owner_id, new_owner_id: state.user.id, message: message, status: 'pending' }]);
        if (error) throw error;
        closeOwnershipTransferDialog();
        showNotification("Request sent!", "success");
    } catch (error) { showNotification("Failed: " + error.message, "error"); }
}

export function showOwnershipTransferDialog(existingGame, serialNumber, gameName, location, isPublic) {
    const currentOwnerName = existingGame.players?.username || 'Unknown';
    const html = `
        <p>Registered to: <b>${existingGame.game_name}</b> (Owner: ${currentOwnerName})</p>
        <textarea id="transfer-message" placeholder="Message to owner..." style="width:100%; min-height:80px; margin-bottom:20px; background:#111; border:1px solid #333; border-radius:8px; padding:10px; color:#fff;"></textarea>
        <div style="display:flex; gap:10px;">
            <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" onclick="requestOwnershipTransfer('${existingGame.id}', '${serialNumber}', '${gameName}', '${location}', ${isPublic})">REQUEST</button>
            <button class="btn-red" style="flex:1; background:#444;" onclick="closeOwnershipTransferDialog()">CANCEL</button>
        </div>
    `;
    showModal('⚠️ SERIAL IN USE', html, { id: 'ownership-transfer-modal' });
}

export function closeOwnershipTransferDialog() {
    closeModal('ownership-transfer-modal');
    const btn = document.getElementById('btn-reg-game');
    if (btn) { btn.disabled = false; btn.textContent = 'REGISTER GAME'; }
}

export async function viewOwnershipRequests() {
    try {
        const { data } = await _supabase.from('ownership_transfer_requests').select('*, games!game_id(game_name, serial_number), players!new_owner_id(username)').eq('current_owner_id', state.user.id).eq('status', 'pending');
        
        const html = data && data.length > 0 ? data.map(req => `
            <div style="background:#111; padding:20px; border-radius:8px; margin-bottom:15px; border-left:3px solid var(--sub-gold);">
                <div style="font-family:var(--sub-name-font); margin-bottom:5px;">${req.games?.game_name}</div>
                <div style="font-size:0.8rem; color:#888; margin-bottom:10px;">By: ${req.players?.username}</div>
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000; font-size:0.8rem;" onclick="approveOwnershipTransfer('${req.id}')">APPROVE</button>
                    <button class="btn-red" style="flex:1; background:#666; font-size:0.8rem;" onclick="rejectOwnershipTransfer('${req.id}')">REJECT</button>
                </div>
            </div>
        `).join('') : '<p style="text-align:center; color:#666;">No pending requests</p>';
        
        showModal('OWNERSHIP REQUESTS', html, { id: 'ownership-requests-modal', maxWidth: '600px' });
    } catch (error) { showNotification("Failed: " + error.message, "error"); }
}

export function closeOwnershipRequestsModal() {
    closeModal('ownership-requests-modal');
}

// Globaalit kytkennät
window.registerGame = registerGame;
window.initEditGame = initEditGame;
window.cancelEdit = cancelEdit;
window.updateGame = updateGame;
window.deleteGame = deleteGame;
window.fetchMyGames = fetchMyGames;
window.releaseGameOwnership = releaseGameOwnership;
window.approveOwnershipTransfer = approveOwnershipTransfer;
window.rejectOwnershipTransfer = rejectOwnershipTransfer;
window.requestOwnershipTransfer = requestOwnershipTransfer;
window.showOwnershipTransferDialog = showOwnershipTransferDialog;
window.closeOwnershipTransferDialog = closeOwnershipTransferDialog;
window.viewOwnershipRequests = viewOwnershipRequests;
window.closeOwnershipRequestsModal = closeOwnershipRequestsModal;