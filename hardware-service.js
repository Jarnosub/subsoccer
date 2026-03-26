import { _supabase } from './config.js';
import { showNotification, showLoading, hideLoading } from './ui-utils.js';

export function setupHardwareGarage() {
    window.openHardwareClaimModal = () => {
        document.getElementById('hardware-serial-input').value = '';
        document.getElementById('hardware-claim-message').innerText = '';
        document.getElementById('hardware-claim-modal').style.display = 'flex';
    };

    // Auto-open logic for physical packaging QR codes: ?action=register
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'register' || urlParams.get('action') === 'claim') {
        let attempts = 0;
        const checkAuthId = setInterval(async () => {
            attempts++;
            if (attempts > 300) { clearInterval(checkAuthId); return; } // stop checking after ~7 minutes to save battery

            const { data } = await _supabase.auth.getUser();
            if (data && data.user) {
                clearInterval(checkAuthId);
                
                // Clean the URL so refreshing doesn't re-trigger it
                const url = new URL(window.location);
                url.searchParams.delete('action');
                window.history.replaceState({}, '', url);

                // Navigate to the profile view
                if (typeof window.showPage === 'function') {
                    window.showPage('profile');
                } else {
                    document.getElementById('nav-profile')?.click();
                }
                
                // Open the modal after a short delay for smooth UX
                setTimeout(() => {
                    if (window.openHardwareClaimModal) window.openHardwareClaimModal();
                }, 800);
            }
        }, 1500);
    }

    const submitBtn = document.getElementById('btn-submit-hardware-claim');
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const serialInput = document.getElementById('hardware-serial-input').value.trim();
            const locationInput = document.getElementById('hardware-location-input').value;
            const messageBox = document.getElementById('hardware-claim-message');

            if (!serialInput) {
                messageBox.style.color = '#ff4444';
                messageBox.innerText = 'Please enter a valid serial number.';
                return;
            }

            try {
                messageBox.style.color = 'var(--sub-gold)';
                messageBox.innerText = 'Verifying hardware...';
                showLoading('Activating Device...');

                const { data, error } = await _supabase.rpc('claim_hardware', {
                    target_serial_number: serialInput,
                    claim_location_type: locationInput
                });

                if (error) {
                    console.error("Hardware claim RPC error:", error);
                    throw new Error("Server error while claiming hardware.");
                }

                if (data && data.success) {
                    document.getElementById('hardware-claim-modal').style.display = 'none';
                    showNotification(`Successfully activated ${data.device.model}!`, 'success');
                    
                    // Refresh the garage list
                    loadHardwareGarage();
                } else {
                    messageBox.style.color = '#ff4444';
                    messageBox.innerText = data.error || 'Failed to claim device.';
                }
            } catch (err) {
                console.error("Hardware claim exception:", err);
                messageBox.style.color = '#ff4444';
                messageBox.innerText = err.message || 'Error communicating with the server.';
            } finally {
                hideLoading();
            }
        });
    }
}

export async function loadHardwareGarage() {
    const listContainer = document.getElementById('hardware-garage-list');
    if (!listContainer) return;

    try {
        // Fallback to state if we don't need a roundtrip
        const userId = window.state?.user?.id || (await _supabase.auth.getSession()).data?.session?.user?.id;
        if (!userId || userId === 'guest') return;

        const { data: hardware, error } = await _supabase
            .from('hardware_registry')
            .select('*')
            .eq('owner_id', userId)
            .order('claimed_at', { ascending: false });

        if (error) {
            console.error("Failed to load hardware garage:", error);
            return;
        }

        if (!hardware || hardware.length === 0) {
            listContainer.innerHTML = `
                <div style="flex-shrink: 0; width: 140px; height: 210px; position: relative; scroll-snap-align: center;">
                    <div style="transform: scale(0.5); transform-origin: top left; width: 280px; height: 420px; position: absolute; top:0; left:0;">
                        <div class="venue-card" style="opacity: 0.8;" onclick="openHardwareClaimModal()">
                            <div class="card-flipper">
                                <div class="card-front" style="border-color: #555; align-items: center; justify-content: center; background: #111;">
                                    <i class="fa-solid fa-vault" style="font-size: 3rem; color: var(--sub-gold); margin-bottom: 15px;"></i>
                                    <div style="font-family: var(--sub-name-font); font-size: 1.2rem; color: #fff; letter-spacing: 1px;">UNLOCK TO VAULT</div>
                                    <div style="font-size: 0.7rem; color: #888; margin-top: 10px; width: 80%; text-align: center;">Got a rare card, physical table, or gear? Enter your unique code to add it to your arsenal.</div>
                                </div>
                                <div class="card-back" style="border-color: #555;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        // Fetch associated games (for venue stats)
        const serials = hardware.map(h => h.serial_number);
        const { data: userGames } = await _supabase
            .from('games')
            .select('*')
            .in('serial_number', serials);

        let html = '';
        for (const item of hardware) {
            // Check if there is a corresponding 'game' for map locations
            const gameData = userGames?.find(g => g.serial_number === item.serial_number);
            
            const venueName = gameData?.game_name || item.product_model;
            const locationStr = gameData?.location || (item.location_type || 'PRIVATE HOME TABLE');
            const isVerified = gameData?.verified ? 'VERIFIED TABLE' : 'REGISTERED DEVICE';
            const badgeColor = gameData?.verified ? 'var(--sub-red)' : '#4a9eff';
            const imageUrl = gameData?.image_url || 'lauttasaari_hq.png'; // Default venue image
            const wins = gameData?.wins || 0;
            const uniquePlayers = gameData?.unique_players || 0;

            html += `
                <div style="flex-shrink: 0; width: 140px; height: 196px; position: relative; scroll-snap-align: center;">
                    <div style="transform: scale(0.5); transform-origin: top left; width: 280px; height: 392px; position: absolute; top:0; left:0;">
                        <div class="venue-card" onclick="window.openVenueCardModal('${item.serial_number}')">
                            <div class="card-flipper">
                                <!-- FRONT OF CARD -->
                                <div class="card-front">
                                    <div class="venue-safe-zone">
                                        <!-- Top strip -->
                                        <div style="width: 100%; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; z-index: 2; background: rgba(0,0,0,0.5);">
                                            <div style="font-size: 0.65rem; color: #fff; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                                                VENUE CARD // ${new Date().getFullYear()}
                                            </div>
                                            <div style="background: ${badgeColor}; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 0.6rem; font-weight: bold; font-family:var(--sub-name-font); box-shadow: 0 0 10px rgba(227,6,19,0.5);">
                                                ${isVerified}
                                            </div>
                                        </div>

                                        <!-- Image Area -->
                                        <div style="width: 100%; height: 200px; background: #222; position: relative; display: flex; justify-content: center; align-items: center; overflow: hidden; z-index: 2; border-bottom: 2px solid ${badgeColor};">
                                            <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">
                                            <div style="position: absolute; bottom:0; left:0; width:100%; height:60%; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);"></div>
                                            
                                            <div style="position: absolute; bottom: 10px; left: 15px; display: flex; align-items: center; gap: 6px; color: #fff; font-size: 0.8rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                                                <i class="fa-solid fa-location-dot" style="color: ${badgeColor};"></i> <span>${locationStr}</span>
                                            </div>
                                        </div>

                                        <!-- Bottom Info -->
                                        <div style="width: 100%; padding: 15px; display: flex; flex-direction: column; z-index: 2; flex: 1; align-items: flex-start; background: linear-gradient(135deg, #111 0%, #050505 100%);">
                                            <div style="font-family: var(--sub-name-font); font-size: 1.8rem; text-transform: uppercase; color: #fff; margin-top: -5px; line-height: 1.1; letter-spacing: 1px;">
                                                ${venueName}
                                            </div>
                                            <div style="color: #888; font-size: 0.7rem; font-family: monospace; margin-top: 5px;">SN: ${item.serial_number}</div>

                                            <!-- Stats -->
                                            <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: auto; padding-bottom: 5px;">
                                                <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border-left: 3px solid ${badgeColor};">
                                                    <div style="font-size: 0.6rem; color: #aaa; font-weight: bold; letter-spacing: 0.5px;">WINS HERE</div>
                                                    <div style="font-family: var(--sub-name-font); font-size: 1.6rem; color: #fff; line-height: 1; margin-top: 3px;">${wins}</div>
                                                </div>
                                                <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border-left: 3px solid ${badgeColor};">
                                                    <div style="font-size: 0.6rem; color: #aaa; font-weight: bold; letter-spacing: 0.5px;">UNIQUE PLAYERS</div>
                                                    <div style="font-family: var(--sub-name-font); font-size: 1.6rem; color: #fff; line-height: 1; margin-top: 3px;">${uniquePlayers}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div style="position: absolute; bottom: 8px; width: 100%; text-align: center; color: rgba(255,255,255,0.4); font-size: 0.6rem; font-weight: bold; letter-spacing: 1.5px; z-index: 2; text-transform:uppercase;">
                                            <i class="fa-solid fa-rotate" style="margin-right: 3px;"></i> STATS & KING
                                        </div>
                                    </div>
                                </div>

                                <!-- BACK OF CARD -->
                                <div class="card-back" style="padding: 2px; box-sizing: border-box;">
                                    <div class="venue-safe-zone" style="background-image: radial-gradient(circle at center, #2a0000 0%, #000 100%);">
                                        <div style="text-align:center; padding-bottom:10px; border-bottom:1px solid #333; margin-bottom:15px; margin-top:15px;">
                                            <h4 style="color:var(--sub-gold); font-family:var(--sub-name-font); margin:0; letter-spacing:2px; font-size:1.2rem;">
                                                <i class="fa-solid fa-crown" style="margin-right:5px;"></i> KING OF THE GAME
                                            </h4>
                                        </div>
                                        
                                        <!-- Placeholder King Info (Injected dynamically) -->
                                        <div id="king-widget-mini-${item.serial_number}">
                                            <div style="display: flex; align-items: center; justify-content: center; height: 100px;">
                                                <i class="fa-solid fa-spinner fa-spin" style="color: var(--sub-gold); font-size: 2rem;"></i>
                                            </div>
                                        </div>

                                        <div style="margin-top: auto; margin-bottom: 35px; display:flex; gap: 10px; padding: 0 15px;">
                                           <button style="flex:1; background: #111; border: 1px solid #444; color: #aaa; border-radius: 4px; padding: 10px 0; font-size:0.55rem; font-family:'Open Sans', sans-serif; font-weight:bold; cursor:pointer; letter-spacing: 1px; transition: all 0.2s; display:flex; flex-direction:column; align-items:center;">
                                               <i class="fa-solid fa-camera" style="font-size:1.2rem; margin-bottom:5px; color:#fff;"></i> PHOTO
                                           </button>
                                           <button style="flex:1; background: #111; border: 1px solid #444; color: #aaa; border-radius: 4px; padding: 10px 0; font-size:0.55rem; font-family:'Open Sans', sans-serif; font-weight:bold; cursor:pointer; letter-spacing: 1px; transition: all 0.2s; display:flex; flex-direction:column; align-items:center;">
                                               <i class="fa-solid fa-gear" style="font-size:1.2rem; margin-bottom:5px; color:var(--sub-red);"></i> CONFIGURE
                                           </button>
                                        </div>

                                        <div style="position:absolute; bottom:12px; width:100%; left:0; text-align:center; color:rgba(255,255,255,0.4); font-size:0.6rem; font-weight:bold; letter-spacing:1.5px; z-index:2; cursor:pointer;" onclick="this.closest('.venue-card').classList.toggle('flipped')">
                                            <i class="fa-solid fa-rotate-left" style="margin-right: 3px;"></i> FLIP BACK
                                        </div>
                                    </div>
                                </div>
                    </div>
                </div>
            </div></div>`;
        }

        listContainer.innerHTML = html;
        
        // Cache data for modal expansion
        window.cachedGarageData = { hardware, userGames };

        // Fetch kings dynamically after rendering layout
        for (const item of hardware) {
            const gameData = userGames?.find(g => g.serial_number === item.serial_number);
            renderKingWidget(gameData?.id, item.owner_id, `king-widget-mini-${item.serial_number}`);
        }

    } catch (err) {
        console.error("Error drawing garage:", err);
    }
}

// Global function to open a full-sized venue card modal
window.openVenueCardModal = (serial) => {
    if (!window.cachedGarageData) return;
    const { hardware, userGames } = window.cachedGarageData;

    const item = hardware.find(h => h.serial_number === serial);
    if (!item) return;

    const gameData = userGames?.find(g => g.serial_number === item.serial_number);
    const venueName = gameData?.game_name || item.product_model;
    const locationStr = gameData?.location || (item.location_type || 'PRIVATE HOME TABLE');
    const isVerified = gameData?.verified ? 'VERIFIED TABLE' : 'REGISTERED DEVICE';
    const badgeColor = gameData?.verified ? 'var(--sub-red)' : '#4a9eff';
    const imageUrl = gameData?.image_url || 'lauttasaari_hq.png'; 
    const wins = gameData?.wins || 0;
    const uniquePlayers = gameData?.unique_players || 0;

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.backdropFilter = 'blur(5px)';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.flexDirection = 'column';

    // The close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '20px';
    closeBtn.style.right = '20px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#fff';
    closeBtn.style.fontSize = '2rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(closeBtn);

    // The FULL SIZE card
    const cardHtml = `
        <div class="venue-card" onclick="this.classList.toggle('flipped')" style="box-shadow: 0 10px 40px rgba(0,0,0,0.9);">
            <div class="card-flipper">
                <!-- FRONT OF CARD -->
                <div class="card-front">
                    <div class="venue-safe-zone">
                        <!-- Top strip -->
                        <div style="width: 100%; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; z-index: 2; background: rgba(0,0,0,0.5);">
                            <div style="font-size: 0.65rem; color: #fff; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                                VENUE CARD // ${new Date().getFullYear()}
                            </div>
                            <div style="background: ${badgeColor}; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 0.6rem; font-weight: bold; font-family:var(--sub-name-font); box-shadow: 0 0 10px rgba(227,6,19,0.5);">
                                ${isVerified}
                            </div>
                        </div>

                        <!-- Image Area -->
                        <div style="width: 100%; height: 200px; background: #222; position: relative; display: flex; justify-content: center; align-items: center; overflow: hidden; z-index: 2; border-bottom: 2px solid ${badgeColor};">
                            <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">
                            <div style="position: absolute; bottom:0; left:0; width:100%; height:60%; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);"></div>
                            
                            <div style="position: absolute; bottom: 10px; left: 15px; display: flex; align-items: center; gap: 6px; color: #fff; font-size: 0.8rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                                <i class="fa-solid fa-location-dot" style="color: ${badgeColor};"></i> <span>${locationStr}</span>
                            </div>
                        </div>

                        <!-- Bottom Info -->
                        <div style="width: 100%; padding: 15px; display: flex; flex-direction: column; z-index: 2; flex: 1; align-items: flex-start; background: linear-gradient(135deg, #111 0%, #050505 100%);">
                            <div style="font-family: var(--sub-name-font); font-size: 1.8rem; text-transform: uppercase; color: #fff; margin-top: -5px; line-height: 1.1; letter-spacing: 1px;">
                                ${venueName}
                            </div>
                            <div style="color: #888; font-size: 0.7rem; font-family: monospace; margin-top: 5px;">SN: ${item.serial_number}</div>

                            <!-- Stats -->
                            <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: auto; padding-bottom: 5px;">
                                <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border-left: 3px solid ${badgeColor};">
                                    <div style="font-size: 0.6rem; color: #aaa; font-weight: bold; letter-spacing: 0.5px;">WINS HERE</div>
                                    <div style="font-family: var(--sub-name-font); font-size: 1.6rem; color: #fff; line-height: 1; margin-top: 3px;">${wins}</div>
                                </div>
                                <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border-left: 3px solid ${badgeColor};">
                                    <div style="font-size: 0.6rem; color: #aaa; font-weight: bold; letter-spacing: 0.5px;">UNIQUE PLAYERS</div>
                                    <div style="font-family: var(--sub-name-font); font-size: 1.6rem; color: #fff; line-height: 1; margin-top: 3px;">${uniquePlayers}</div>
                                </div>
                            </div>
                        </div>

                        <div style="position: absolute; bottom: 8px; width: 100%; text-align: center; color: rgba(255,255,255,0.4); font-size: 0.6rem; font-weight: bold; letter-spacing: 1.5px; z-index: 2; text-transform:uppercase;">
                            <i class="fa-solid fa-rotate" style="margin-right: 3px;"></i> STATS & KING
                        </div>
                    </div>
                </div>

                <!-- BACK OF CARD -->
                <div class="card-back" style="padding: 20px; box-sizing: border-box;">
                    <div class="venue-safe-zone">
                        <div style="text-align:center; padding-bottom:10px; border-bottom:1px solid #333; margin-bottom:15px; margin-top:15px;">
                            <h4 style="color:var(--sub-gold); font-family:var(--sub-name-font); margin:0; letter-spacing:2px; font-size:1.2rem;">
                                <i class="fa-solid fa-crown" style="margin-right:5px;"></i> KING OF THE GAME
                            </h4>
                        </div>
                        
                        <!-- Placeholder King Info (Injected dynamically) -->
                        <div id="king-widget-full-${item.serial_number}">
                            <div style="display: flex; align-items: center; justify-content: center; height: 100px;">
                                <i class="fa-solid fa-spinner fa-spin" style="color: var(--sub-gold); font-size: 2rem;"></i>
                            </div>
                        </div>

                        <div style="margin-top: auto; margin-bottom: 35px; display:flex; gap: 10px; padding: 0 15px;">
                           <button onclick="event.stopPropagation(); window.uploadVenuePhoto('${item.serial_number}')" style="flex:1; background: #111; border: 1px solid #444; color: #aaa; border-radius: 4px; padding: 10px 0; font-size:0.55rem; font-family:'Open Sans', sans-serif; font-weight:bold; cursor:pointer; letter-spacing: 1px; transition: all 0.2s; display:flex; flex-direction:column; align-items:center;">
                               <i class="fa-solid fa-camera" style="font-size:1.2rem; margin-bottom:5px; color:#fff;"></i> PHOTO
                           </button>
                           <button onclick="event.stopPropagation(); window.configureVenue('${item.serial_number}')" style="flex:1; background: #111; border: 1px solid #444; color: #aaa; border-radius: 4px; padding: 10px 0; font-size:0.55rem; font-family:'Open Sans', sans-serif; font-weight:bold; cursor:pointer; letter-spacing: 1px; transition: all 0.2s; display:flex; flex-direction:column; align-items:center;">
                               <i class="fa-solid fa-gear" style="font-size:1.2rem; margin-bottom:5px; color:var(--sub-red);"></i> CONFIGURE
                           </button>
                        </div>

                        <div style="position:absolute; bottom:12px; width:100%; left:0; text-align:center; color:rgba(255,255,255,0.4); font-size:0.6rem; font-weight:bold; letter-spacing:1.5px; z-index:2; cursor:pointer;" onclick="this.closest('.venue-card').classList.toggle('flipped')">
                            <i class="fa-solid fa-rotate-left" style="margin-right: 3px;"></i> FLIP BACK
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const cardContainer = document.createElement('div');
    cardContainer.innerHTML = cardHtml;
    overlay.appendChild(cardContainer);

    document.body.appendChild(overlay);

    // Fetch the King of the Table dynamically!
    renderKingWidget(gameData?.id, item.owner_id, `king-widget-full-${item.serial_number}`);
};


// OPEN A VENUE PRO CARD FROM THE PUBLIC MAP (Fetch Dynamic Data without Ownership restrictions)
window.openPublicVenueCardModal = async (gameId) => {
    // 1. Fetch game details directly
    const { data: gameData } = await _supabase.from('games').select('*').eq('id', gameId).single();
    if (!gameData) return;
    
    // 2. Fallback hardware registry features if serial exists
    let item = { product_model: 'SUBSOCCER TABLE', serial_number: gameData.serial_number || 'UNKNOWN', owner_id: null };
    if (gameData.serial_number) {
        const { data: hw } = await _supabase.from('hardware_registry').select('*').eq('serial_number', gameData.serial_number).single();
        if (hw) item = hw;
    }

    const venueName = gameData.game_name || item.product_model;
    const locationStr = gameData.location || (item.location_type || 'PUBLIC TABLE');
    const isVerified = gameData.verified ? 'VERIFIED TABLE' : 'UNVERIFIED LOCATION';
    const badgeColor = gameData.verified ? 'var(--sub-gold)' : '#4a9eff'; 
    const imageUrl = gameData.image_url || 'lauttasaari_hq.png'; 
    const wins = gameData.wins || 0;
    const uniquePlayers = gameData.unique_players || 0;

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.backdropFilter = 'blur(5px)';
    overlay.style.zIndex = '99999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.flexDirection = 'column';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '20px';
    closeBtn.style.right = '20px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#fff';
    closeBtn.style.fontSize = '2rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(closeBtn);

    const cardHtml = `
        <div class="venue-card" onclick="this.classList.toggle('flipped')" style="box-shadow: 0 10px 40px rgba(0,0,0,0.9);">
            <div class="card-flipper">
                <!-- FRONT OF CARD -->
                <div class="card-front">
                    <div class="venue-safe-zone">
                        <div style="width: 100%; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; z-index: 2; background: rgba(0,0,0,0.5);">
                            <div style="font-size: 0.65rem; color: #fff; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                                VENUE CARD // ${new Date().getFullYear()}
                            </div>
                            <div style="background: ${badgeColor}; color: #000; padding: 2px 6px; border-radius: 3px; font-size: 0.6rem; font-weight: bold; font-family:var(--sub-name-font); box-shadow: 0 0 10px rgba(255,215,0,0.5);">
                                ${isVerified}
                            </div>
                        </div>

                        <div style="width: 100%; height: 200px; background: #222; position: relative; display: flex; justify-content: center; align-items: center; overflow: hidden; z-index: 2; border-bottom: 2px solid ${badgeColor};">
                            <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">
                            <div style="position: absolute; bottom:0; left:0; width:100%; height:60%; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);"></div>
                            <div style="position: absolute; bottom: 10px; left: 15px; display: flex; align-items: center; gap: 6px; color: #fff; font-size: 0.8rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">
                                <i class="fa-solid fa-location-dot" style="color: ${badgeColor};"></i> <span>${locationStr}</span>
                            </div>
                        </div>

                        <div style="width: 100%; padding: 15px; display: flex; flex-direction: column; z-index: 2; flex: 1; align-items: flex-start; background: linear-gradient(135deg, #111 0%, #050505 100%);">
                            <div style="font-family: var(--sub-name-font); font-size: 1.8rem; text-transform: uppercase; color: #fff; margin-top: -5px; line-height: 1.1; letter-spacing: 1px;">
                                ${venueName}
                            </div>
                            <div style="color: #888; font-size: 0.7rem; font-family: monospace; margin-top: 5px;">SN: ${item.serial_number}</div>

                            <div style="width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: auto; padding-bottom: 5px;">
                                <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border-left: 3px solid ${badgeColor};">
                                    <div style="font-size: 0.6rem; color: #aaa; font-weight: bold; letter-spacing: 0.5px;">WINS HERE</div>
                                    <div style="font-family: var(--sub-name-font); font-size: 1.6rem; color: #fff; line-height: 1; margin-top: 3px;">${wins}</div>
                                </div>
                                <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border-left: 3px solid ${badgeColor};">
                                    <div style="font-size: 0.6rem; color: #aaa; font-weight: bold; letter-spacing: 0.5px;">UNIQUE PLAYERS</div>
                                    <div style="font-family: var(--sub-name-font); font-size: 1.6rem; color: #fff; line-height: 1; margin-top: 3px;">${uniquePlayers}</div>
                                </div>
                            </div>
                        </div>

                        <div style="position: absolute; bottom: 8px; width: 100%; text-align: center; color: rgba(255,255,255,0.4); font-size: 0.6rem; font-weight: bold; letter-spacing: 1.5px; z-index: 2; text-transform:uppercase;">
                            <i class="fa-solid fa-rotate" style="margin-right: 3px;"></i> STATS & KING
                        </div>
                    </div>
                </div>

                <!-- BACK OF CARD -->
                <div class="card-back" style="padding: 20px; box-sizing: border-box;">
                    <div class="venue-safe-zone">
                        <div style="text-align:center; padding-bottom:10px; border-bottom:1px solid #333; margin-bottom:15px; margin-top:15px;">
                            <h4 style="color:var(--sub-gold); font-family:var(--sub-name-font); margin:0; letter-spacing:2px; font-size:1.2rem;">
                                <i class="fa-solid fa-crown" style="margin-right:5px;"></i> KING OF THE GAME
                            </h4>
                        </div>
                        
                        <!-- Placeholder King Info (Injected dynamically) -->
                        <div id="king-widget-full-${item.serial_number}-pub">
                            <div style="display: flex; align-items: center; justify-content: center; height: 100px;">
                                <i class="fa-solid fa-spinner fa-spin" style="color: var(--sub-gold); font-size: 2rem;"></i>
                            </div>
                        </div>

                        <div style="margin-top: auto; margin-bottom: 35px; display:flex; padding: 0 15px; justify-content:center;">
                           <div style="color:#aaa; font-size:0.7rem; text-transform:uppercase; text-align:center; font-family:'Open Sans'; margin-top:10px;">
                               THIS IS A PUBLIC PRO-CARD.<br>OWNERSHIP CONFIGURATION HIDDEN.
                           </div>
                        </div>

                        <div style="position:absolute; bottom:12px; width:100%; left:0; text-align:center; color:rgba(255,255,255,0.4); font-size:0.6rem; font-weight:bold; letter-spacing:1.5px; z-index:2; cursor:pointer;" onclick="this.closest('.venue-card').classList.toggle('flipped')">
                            <i class="fa-solid fa-rotate-left" style="margin-right: 3px;"></i> FLIP BACK
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const cardContainer = document.createElement('div');
    cardContainer.innerHTML = cardHtml;
    overlay.appendChild(cardContainer);
    document.body.appendChild(overlay);

    renderKingWidget(gameData.id, item.owner_id, `king-widget-full-${item.serial_number}-pub`);
};

// Render the KING OF THE TABLE dynamic widget
async function renderKingWidget(gameId, ownerId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        let kingId = ownerId;
        let kingWins = 0;
        let isDefaultOwner = true;

        if (gameId) {
            // Find players with most wins on this table
            // TODO: Matches table schema currently lacks 'game_id' and 'winner_id' for tracking physical table Kings.
            // Temporarily disabling the API call to prevent the 400 Bad Request console error.
            /*
            const { data: matchData } = await _supabase
                .from('matches')
                .select('winner_id')
                .eq('game_id', gameId)
                .not('winner_id', 'is', null);

            if (matchData && matchData.length > 0) { ... }
            */
            
            // For now, default to owner as the King if no match data exists yet
            if (ownerId) {
                kingId = ownerId;
                isDefaultOwner = true;
            }
        }

        if (!kingId) {
            container.innerHTML = `
                <div style="display: flex; align-items: stretch; gap: 15px; margin-bottom: 20px; background: #0a0a0a; border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 6px; padding: 12px; position: relative;">
                    <div style="width: 60px; height: 80px; background: #222; border: 1px dashed var(--sub-gold); display: flex; justify-content: center; align-items: center; border-radius: 4px; z-index: 2;">
                        <i class="fa-solid fa-user" style="color:#555; font-size: 1.5rem;"></i>
                    </div>
                    <div style="z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                        <div style="font-family: var(--sub-name-font); font-size: 1.3rem; color: #fff; line-height: 1; letter-spacing: 1px;">AWAITING KING</div>
                        <div style="color: #888; font-size: 0.65rem; margin-top: 6px; line-height: 1.4; border-top: 1px solid #333; padding-top: 6px;">Play games here to establish the first King!</div>
                    </div>
                </div>`;
            return;
        }

        // Fetch user profile (assuming we have public.players table)
        const { data: profile } = await _supabase
            .from('players')
            .select('*')
            .eq('id', kingId)
            .single();

        const kingName = profile?.username || 'UNKNOWN KING';
        const kingElo = profile?.elo || 1200;
        const kingAvatar = profile?.avatar_url || null;

        let statusText = isDefaultOwner 
            ? 'TABLE OWNER <i class="fa-solid fa-shield-halved" style="color: #4a9eff; margin-left: 4px;"></i>' 
            : `<span style="color:var(--sub-gold);font-weight:bold;">${kingWins} WINS</span> HERE <i class="fa-solid fa-fire" style="color: var(--sub-red); margin-left: 4px;"></i>`;

        let avatarHtml = `<i class="fa-solid fa-user-astronaut" style="color:#d4af37; font-size: 2.2rem; transform: translateY(-10px);"></i>`;
        if (kingAvatar) {
            avatarHtml = `<img src="${kingAvatar}" style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0; z-index:1;" onerror="this.src='placeholder-silhouette-5-wide.png'">`;
        }

        container.innerHTML = `
            <div style="display: flex; align-items: stretch; gap: 15px; margin-bottom: 20px; background: #0a0a0a; border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 6px; padding: 12px; position: relative; overflow: hidden;">
                <!-- Subtle gold glow for the King -->
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at 10% 50%, rgba(212,175,55,0.1) 0%, transparent 60%); z-index: 1;"></div>
                
                <div style="width: 60px; height: 80px; background: #111; border: 2px solid var(--sub-gold); display: flex; flex-direction: column; justify-content: flex-end; align-items: center; border-radius: 4px; z-index: 2; box-shadow: 0 0 10px rgba(212,175,55,0.3); position: relative; overflow: hidden;">
                    ${avatarHtml}
                    <div style="width: 100%; text-align: center; background: var(--sub-gold); color: #000; font-size: 0.55rem; font-weight: 900; padding: 2px 0; border-top: 1px solid #fff; z-index:2;">${kingElo} ELO</div>
                </div>
                
                <div style="z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-family: var(--sub-name-font); font-size: 1.4rem; color: #fff; line-height: 1; letter-spacing: 1px; text-transform: uppercase; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">${kingName}</div>
                    <div style="color: #aaa; font-size: 0.65rem; margin-top: 6px; line-height: 1.4; border-top: 1px solid #333; padding-top: 6px;">
                        ${statusText}
                    </div>
                </div>
            </div>`;

    } catch (e) {
        console.error("Error finding King:", e);
        // Fallback silently
        container.innerHTML = `
            <div style="display: flex; align-items: stretch; gap: 15px; margin-bottom: 20px; background: #0a0a0a; border: 1px solid #444; border-radius: 6px; padding: 12px; position: relative;">
                <div style="width: 60px; height: 80px; background: #222; border: 1px solid #444; display: flex; justify-content: center; align-items: center; border-radius: 4px; z-index: 2;">
                    <i class="fa-solid fa-user" style="color:#555; font-size: 1.5rem;"></i>
                </div>
                <div style="z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-family: var(--sub-name-font); font-size: 1.3rem; color: #fff; line-height: 1; letter-spacing: 1px;">UNKNOWN</div>
                    <div style="color: #666; font-size: 0.65rem; margin-top: 6px; line-height: 1.4; border-top: 1px solid #333; padding-top: 6px;">Data unavailable</div>
                </div>
            </div>`;
    }
}

window.uploadVenuePhoto = async (serial) => {

    // Remove any existing hidden inputs just in case
    const existingInput = document.getElementById('venue-photo-input');
    if (existingInput) existingInput.remove();

    const fileInput = document.createElement('input');
    fileInput.id = 'venue-photo-input';
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    
    document.body.appendChild(fileInput);
    
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            console.log("Starting venue photo upload process for file:", file.name);
            if (typeof showLoading === 'function') showLoading("Optimizing Photo...");
            
            // 2. Compress and optimize image for Print & Web (Max 1200px)
            const compressedFile = await new Promise((resolve, reject) => {
                const img = new Image();
                const objectUrl = URL.createObjectURL(file);

                img.onload = () => {
                    const MAX_SIZE = 1200;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height = Math.floor(height * (MAX_SIZE / width));
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width = Math.floor(width * (MAX_SIZE / height));
                            height = MAX_SIZE;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    // Fill with black to prevent transparent artifacts on JPEGs
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);

                    URL.revokeObjectURL(objectUrl);

                    canvas.toBlob((blob) => {
                        if (!blob) return reject(new Error('Canvas generated an empty blob.'));
                        resolve(new File([blob], `venue_${serial}_${Date.now()}.jpg`, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    }, 'image/jpeg', 0.85);
                };

                img.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    reject(new Error("Image failed to load into Canvas"));
                };

                img.src = objectUrl;
            });

            if (typeof showLoading === 'function') showLoading("Uploading Photo...");

            const fileName = compressedFile.name; 

            // 3. Upload tightly packed optimized JPEG to Supabase
            const { error: uploadError, data: uploadData } = await _supabase.storage
                .from('venue_images')
                .upload(fileName, compressedFile, { upsert: true });

            if (uploadError) throw uploadError;
            console.log("Upload successful:", uploadData);

            // 4. Get Public URL
            const { data } = _supabase.storage
                .from('venue_images')
                .getPublicUrl(fileName);

            const publicUrl = data.publicUrl;
            console.log("Public URL generated:", publicUrl);

            // 5. Connect URL to the table instance in 'games'
            const { data: { user } } = await _supabase.auth.getUser();
            
            const { data: existingGame } = await _supabase
                .from('games')
                .select('id')
                .eq('serial_number', serial)
                .single();

            if (existingGame) {
                const { error: updateErr } = await _supabase
                    .from('games')
                    .update({ image_url: publicUrl })
                    .eq('serial_number', serial);
                if (updateErr) throw updateErr;
            } else if (user) {
                // First time configuring this hardware as a Venue
                const { error: insertErr } = await _supabase
                    .from('games')
                    .insert([{
                        serial_number: serial,
                        owner_id: user.id,
                        game_name: 'My Subsoccer',
                        location: 'Private Location',
                        is_public: false,
                        privacy_mode: 'private',
                        image_url: publicUrl
                    }]);
                if (insertErr) throw insertErr;
            }

            if (typeof showNotification === 'function') showNotification("Photo Updated! Refreshing...", "success");
            
            // Reload UI
            setTimeout(() => { location.reload(); }, 1500);

        } catch (err) {
            console.error("Upload error caught:", err);
            if (typeof showNotification === 'function') showNotification("Error uploading photo. See console.", "error");
        } finally {
            if (typeof hideLoading === 'function') hideLoading();
            fileInput.value = ''; // Reset input
        }
    };

    // Trigger file dialog
    fileInput.click();
};

window.configureVenue = async (serial) => {
    
    let currentPrivacy = 'private'; // OLETUKSENA CITY-LEVEL PRIVATE
    let currentLocation = '';
    let currentName = 'My Subsoccer';
    let gameId = null;

    try {
        const { data, error } = await _supabase
            .from('games')
            .select('id, privacy_mode, location, game_name')
            .eq('serial_number', serial)
            .single();
        if (data) {
            if (data.privacy_mode) currentPrivacy = data.privacy_mode;
            if (data.location) currentLocation = data.location;
            if (data.game_name) currentName = data.game_name;
            gameId = data.id;
        }
    } catch (e) {
        console.error("Could not fetch current game details", e);
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.9)';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.fontFamily = 'var(--sub-name-font)';
    
    overlay.innerHTML = `
        <div style="background: #111; border: 1px solid #333; padding: 30px; border-radius: 8px; max-width: 400px; width: 90%; text-align: left; color:#fff;">
            <h2 style="color:var(--sub-gold); margin-bottom: 20px;">CONFIGURE VENUE</h2>
            
            <p style="font-size: 0.8rem; color:#aaa; margin-bottom:20px;">
                Choose how this physical table appears on the Global Map Engine.
            </p>

            <div style="margin-bottom: 20px;">
                <label style="font-size: 0.65rem; color: #888; text-transform: uppercase;">Venue Name / Alias</label>
                <input type="text" id="venueName-${serial}" placeholder="e.g. Laatoka Arena" style="width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: var(--sub-gold); font-weight: bold; border-radius: 4px; margin-top: 5px; box-sizing: border-box; font-family: 'Russo One', sans-serif;" value="${currentName}" />
            </div>

            <div style="margin-bottom: 20px;">
                <label style="font-size: 0.65rem; color: #888; text-transform: uppercase;">Location Address / City</label>
                <input type="text" id="venueLocation-${serial}" placeholder="e.g. Keskuskatu 1, Helsinki" style="width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; margin-top: 5px; box-sizing: border-box; font-family: 'Open Sans', sans-serif;" value="${currentLocation}" />
                <div style="font-size: 0.6rem; color: var(--sub-red); margin-top: 8px; font-weight: bold; letter-spacing: 0.5px;">
                    <i class="fa-solid fa-map-pin"></i> Provide an exact street address for Public Arenas so players can navigate to your table via Google Maps!
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap: 15px;" id="privacyToggleGroup-${serial}">
                <label style="display:flex; gap:10px; background:#222; padding:15px; border-radius:4px; border:1px solid ${currentPrivacy === 'public' ? 'var(--sub-red)' : '#555'}; cursor:pointer;" onclick="this.parentElement.querySelectorAll('label').forEach(l=>l.style.borderColor='#555'); this.style.borderColor='var(--sub-red)';">
                    <input type="radio" name="privacy-${serial}" value="public" style="margin-top:2px;" ${currentPrivacy === 'public' ? 'checked' : ''}>
                    <div>
                        <div style="font-weight:bold; font-size:1.1rem;">PUBLIC ARENA</div>
                        <div style="font-size:0.75rem; color:#888; font-family:'Open Sans'; margin-top:5px;">Exact address is shown. Custom pin. Tournaments can be hosted here.</div>
                    </div>
                </label>

                <label style="display:flex; gap:10px; background:#222; padding:15px; border-radius:4px; border:1px solid ${currentPrivacy === 'private' ? 'var(--sub-red)' : '#555'}; cursor:pointer;" onclick="this.parentElement.querySelectorAll('label').forEach(l=>l.style.borderColor='#555'); this.style.borderColor='var(--sub-red)';">
                    <input type="radio" name="privacy-${serial}" value="private" style="margin-top:2px;" ${currentPrivacy === 'private' ? 'checked' : ''}>
                    <div>
                        <div style="font-weight:bold; font-size:1.1rem;">CITY-LEVEL PRIVATE</div>
                        <div style="font-size:0.75rem; color:#888; font-family:'Open Sans'; margin-top:5px;">Your exact home is hidden. Appears blurred (City center) to grow your city's heatmap. No tournaments.</div>
                    </div>
                </label>

                <label style="display:flex; gap:10px; background:#222; padding:15px; border-radius:4px; border:1px solid ${currentPrivacy === 'stealth' ? 'var(--sub-red)' : '#555'}; cursor:pointer;" onclick="this.parentElement.querySelectorAll('label').forEach(l=>l.style.borderColor='#555'); this.style.borderColor='var(--sub-red)';">
                    <input type="radio" name="privacy-${serial}" value="stealth" style="margin-top:2px;" ${currentPrivacy === 'stealth' ? 'checked' : ''}>
                    <div>
                        <div style="font-weight:bold; font-size:1.1rem;">STEALTH MODE</div>
                        <div style="font-size:0.75rem; color:#888; font-family:'Open Sans'; margin-top:5px;">Completely hidden from public map. Only visible to you in your inventory.</div>
                    </div>
                </label>
            </div>

            <div style="display:flex; gap: 10px; margin-top: 25px;">
                <button onclick="document.body.removeChild(this.parentElement.parentElement.parentElement)" style="flex:1; padding:12px; background:transparent; border:1px solid #444; color:#aaa; cursor:pointer; font-weight:bold;">CANCEL</button>
                <button id="saveVenueBtn-${serial}" style="flex:1; padding:12px; background:var(--sub-gold); border:none; color:#000; font-weight:bold; cursor:pointer;">SAVE CHANGES</button>
            </div>

            <div style="text-align: center; margin-top: 15px;">
                <a href="#" onclick="event.preventDefault(); window.releaseVenueOwnership('${serial}', '${gameId}')" style="color: var(--sub-red); font-size: 0.70rem; text-decoration: underline; font-family: 'Open Sans', sans-serif; cursor: pointer; letter-spacing: 1px; text-transform: uppercase;">
                    <i class="fa-solid fa-unlink"></i> Release Ownership of this Hardware
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById(`saveVenueBtn-${serial}`).addEventListener('click', async (e) => {
        const btn = e.target;
        btn.innerHTML = 'SAVING... <i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const selectedMode = document.querySelector(`input[name="privacy-${serial}"]:checked`).value;
        const locationInputStr = document.getElementById(`venueLocation-${serial}`).value.trim();
        const venueNameInputStr = document.getElementById(`venueName-${serial}`).value.trim();
        const isPublic = (selectedMode !== 'stealth'); 

        // Attempt silent geocoding for Map Pin
        let lat = null;
        let lng = null;
        if (locationInputStr && locationInputStr.length > 2) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationInputStr)}`);
                const geoData = await res.json();
                if (geoData && geoData.length > 0) {
                    lat = parseFloat(geoData[0].lat);
                    lng = parseFloat(geoData[0].lon);
                }
            } catch (geocodeErr) {
                console.warn("Silent geocoding failed", geocodeErr);
            }
        }

        try {
            const { data: { user } } = await _supabase.auth.getUser();

            const { data: existingGame } = await _supabase
                .from('games')
                .select('id')
                .eq('serial_number', serial)
                .maybeSingle();

            let updatePayload = {
                privacy_mode: selectedMode,
                is_public: isPublic,
                location: locationInputStr || 'Private Location',
                game_name: venueNameInputStr || 'My Subsoccer'
            };

            if (lat !== null && lng !== null) {
                updatePayload.latitude = lat;
                updatePayload.longitude = lng;
            }

            if (existingGame) {
                const { error } = await _supabase
                    .from('games')
                    .update(updatePayload)
                    .eq('serial_number', serial);
                if (error) throw error;
            } else if (user) {
                const { error } = await _supabase
                    .from('games')
                    .insert([{
                        ...updatePayload,
                        serial_number: serial,
                        owner_id: user.id
                    }]);
                if (error) throw error;
            }

            btn.innerHTML = 'SAVED! <i class="fa-solid fa-check"></i>';
            btn.style.background = '#4CAF50';
            btn.style.color = '#fff';
            
            setTimeout(() => {
                const overlayToRemove = btn.closest('div[style*="position: fixed"]');
                if (overlayToRemove && document.body.contains(overlayToRemove)) {
                    document.body.removeChild(overlayToRemove);
                }
                loadHardwareGarage(); // Refresh to show potential UI updates
            }, 1000);
        } catch (err) {
            console.error("Error saving privacy configuration:", err);
            btn.innerHTML = 'ERROR!';
            btn.style.background = 'var(--sub-red)';
            btn.style.color = '#fff';
            setTimeout(() => {
                btn.innerHTML = 'SAVE CHANGES';
                btn.style.background = 'var(--sub-gold)';
                btn.style.color = '#000';
                btn.disabled = false;
            }, 2000);
        }
    });
};

window.releaseVenueOwnership = async (serial, gameId) => {
    if (!confirm("Are you sure you want to release ownership? The unique code will become available for anyone else to claim!")) {
        return;
    }
    
    try {
        if (typeof showLoading === 'function') showLoading("Releasing Code...");

        // If it's a game, try calling the RPC
        if (gameId && gameId !== 'null') {
            const { data: { user } } = await _supabase.auth.getUser();
            if (user) {
                await _supabase.rpc('release_game_ownership', { p_game_id: gameId, p_player_id: user.id });
            }
        }
        
        // Also ensure hardware_registry is wiped empty for this serial
        const { error: hwError } = await _supabase
            .from('hardware_registry')
            .update({ owner_id: null, is_claimed: false, location_type: null })
            .eq('serial_number', serial);

        if (hwError) throw hwError;

        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') showNotification("Ownership Released!", "success");

        // Close the modal
        document.querySelectorAll('div[style*="position: fixed"]').forEach(el => {
            if (el.innerHTML.includes('CONFIGURE VENUE')) {
                document.body.removeChild(el);
            }
        });

        loadHardwareGarage();

    } catch (e) {
        console.error("Failed to release ownership", e);
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showNotification === 'function') showNotification("Error releasing code.", "error");
    }
};
