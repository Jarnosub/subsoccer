import { _supabase, state } from './config.js';
import { showModal, closeModal, safeHTML, showNotification } from './ui-utils.js';

/**
 * ============================================================
 * PLAYER CONSENT & ANTI-CHEAT MODULE
 * Prompts off-device registered players for consent via QR
 * ============================================================
 */

let activeConsentChannel = null;

// Helper to determine if a username is a registered player (not guest, not self)
export async function requiresConsent(username) {
    if (!username) return false;
    username = username.toUpperCase();
    
    if (state.sessionGuests && state.sessionGuests.includes(username)) return false;
    if (state.user && state.user.username && state.user.username.toUpperCase() === username) return false;
    if (username === 'GUEST') return false;
    
    // Check DB to ensure they actually exist as a registered player
    const { data } = await _supabase.from('players').select('id').ilike('username', username).maybeSingle();
    return !!data;
}

export async function requestConsentSequence(p1, p2, onSuccess) {
    const rc1 = await requiresConsent(p1);
    
    if (rc1) {
        showConsentQR(p1, async () => {
            const rc2 = await requiresConsent(p2);
            if (rc2) {
                showConsentQR(p2, onSuccess);
            } else {
                onSuccess();
            }
        });
        return;
    }
    
    const rc2 = await requiresConsent(p2);
    if (rc2) {
        showConsentQR(p2, onSuccess);
        return;
    }

    // No consent needed (both guests or self-initiated match)
    onSuccess();
}

function showConsentQR(player, onConsentGranted) {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const consentUrl = `${window.location.origin}/?consent=${encodeURIComponent(player)}&croom=${roomId}`;
    const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=ffffff&bgcolor=0a0a0a&data=${encodeURIComponent(consentUrl)}`;
    
    // UI Modal Content
    const html = safeHTML`
        <div style="text-align:center; padding:5px 15px 15px 15px;">
            <i class="fa-solid fa-shield-halved" style="font-size:3rem; color:var(--sub-red); margin-bottom:15px; filter:drop-shadow(0 0 10px rgba(227,6,19,0.5));"></i>
            <h3 style="color:var(--sub-red); font-family:var(--sub-name-font); margin-bottom:15px; font-size:1.1rem; letter-spacing:1px; line-height:1.4;">ANTI-CHEAT <br>CONSENT REQUIRED</h3>
            <p style="color:#888; font-family:'Open Sans', sans-serif; font-size:0.8rem; margin-bottom:20px; line-height:1.4;">
                <span style="color:#fff; font-weight:bold; font-family:'Russo One'; font-size:1rem; text-transform:uppercase;">${player}</span><br>is a registered Pro.<br><br>
                To protect Global ELO rankings, they must grant hardware-to-hardware permission to join this match.
            </p>
            
            <div style="background:#111; padding:20px; border-radius:4px; border:1px solid #333; display:inline-block; margin-bottom:25px;">
                <img src="${qrImgSrc}" style="width:180px; height:180px; border-radius:4px; display:block;">
                <div style="font-family:'Open Sans', sans-serif; font-size:0.6rem; color:#666; margin-top:10px; text-transform:uppercase; letter-spacing:1px;">Scan with personal device</div>
            </div>
            
            <button class="btn-grey" onclick="closeModal('consent-modal')" style="width:100%; border-radius:4px; padding:15px; font-family:'Russo One'; margin-bottom:10px; background:#222; color:#fff; border:1px solid #444; cursor:pointer;">CANCEL MATCH</button>
            
            <div style="text-align:right; margin-top:10px;">
                <span id="force-consent-btn" style="font-family:'Open Sans'; font-size:0.55rem; color:#444; cursor:pointer; text-transform:uppercase; letter-spacing:2px;" onclick="document.dispatchEvent(new CustomEvent('force-consent-granted'))">Force Override (Dev)</span>
            </div>
        </div>
    `.toString();

    showModal('VERIFICATION', html, { id: 'consent-modal', maxWidth: '400px', borderColor: 'var(--sub-red)' });
    
    // Subscribe to specific Supabase Broadcast Channel
    if (activeConsentChannel) { _supabase.removeChannel(activeConsentChannel); }
    
    activeConsentChannel = _supabase.channel(`consent:${roomId}`);
    activeConsentChannel.on('broadcast', { event: 'CONSENT_GRANTED' }, (payloadPayload) => {
        const p = payloadPayload.payload;
        if (p && p.player && p.player.toUpperCase() === player.toUpperCase()) {
            console.log(`[Anti-Cheat] Cryptographic consent received for ${player}`);
            completeConsent(onConsentGranted);
        }
    }).subscribe();

    // The greybox fallback button hook
    document.addEventListener('force-consent-granted', () => {
        console.log(`[Anti-Cheat] Dev-forced consent for ${player}`);
        completeConsent(onConsentGranted);
    }, { once: true });
}

function completeConsent(callback) {
    if (activeConsentChannel) {
        _supabase.removeChannel(activeConsentChannel);
        activeConsentChannel = null;
    }
    closeModal('consent-modal');
    callback();
}

/**
 * Parses URL query parameters on application boot to detect if this device is acting as a "Consent Authenticator".
 * Called internally from ui.js when user state initializes.
 */
export async function processConsentRequestParams() {
    const params = new URLSearchParams(window.location.search);
    const targetPlayer = params.get('consent');
    const roomId = params.get('croom');
    
    if (!targetPlayer || !roomId) return;

    if (!state.user || state.user.id === 'guest') {
        showModal('ERROR', '<div style="color:#888; text-align:center; padding:20px; font-family:\'Open Sans\';">You are not logged in.<br><br>Please log in as <b>' + targetPlayer.toUpperCase() + '</b> to approve this match request.</div>', { borderColor: 'var(--sub-red)' });
        return;
    }

    if (state.user.username.toUpperCase() !== targetPlayer.toUpperCase()) {
        showModal('ANTI-CHEAT ERROR', '<div style="color:var(--sub-red); text-align:center; padding:20px; font-family:\'Open Sans\';">Consent blocked.<br><br>You are logged in as <b>' + state.user.username.toUpperCase() + '</b>.<br>This match requires consent from <b>' + targetPlayer.toUpperCase() + '</b>.</div>', { borderColor: 'var(--sub-red)' });
        return;
    }
    
    // We are logged in as the requested player! Send the secure cryptographic broadcast signal.
    showModal('AUTHENTICATING...', `
        <div style="text-align:center; padding:20px;">
            <i class="fa-solid fa-satellite-dish" style="font-size:2rem; color:var(--sub-gold); margin-bottom:15px;"></i>
            <div style="color:#fff; font-family:'Open Sans', sans-serif;">Transmitting cryptographic signature to the arena host...</div>
        </div>
    `, { id: 'consent-sending-modal', borderColor: 'var(--sub-gold)' });
    
    const channel = _supabase.channel(`consent:${roomId}`);
    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            channel.send({
                type: 'broadcast',
                event: 'CONSENT_GRANTED',
                payload: { player: targetPlayer.toUpperCase() }
            }).then(() => {
                showNotification(`Consent granted to the Arena table!`, 'success');
                setTimeout(() => {
                    closeModal('consent-sending-modal');
                    // Remove the query parameters smoothly without reloading
                    window.history.replaceState({}, document.title, window.location.pathname);
                }, 2000);
            }).catch(e => {
                console.error("Broadcast failed:", e);
                showNotification("Transmission failed. Are you offline?", "error");
                closeModal('consent-sending-modal');
            });
        }
    });
}
