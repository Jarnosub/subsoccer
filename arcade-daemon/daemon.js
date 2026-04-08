require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURATION ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
const TABLE_ID = process.env.TABLE_ID || 'arcade_1'; // A unique ID for this physical table
const SHELLY_IP = process.env.SHELLY_IP || '192.168.1.100'; // The IP address of the Shelly plug on the local network

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log(`[🚀] Starting Subsoccer Hardware Daemon for Table: ${TABLE_ID}`);

// --- HARDWARE CONTROLLERS ---

/**
 * Commands the Shelly Plug to turn ON or OFF via its local HTTP API.
 * This skips going to Shelly Cloud and talks directly to the plug on the local network (Zero latency).
 */
async function setShellyRelay(stateOn) {
    const action = stateOn ? 'on' : 'off';
    const numRetries = 2; // Retry if network burps

    console.log(`[💡] Attempting to turn Shelly Relay ${action.toUpperCase()}...`);

    for (let i = 0; i <= numRetries; i++) {
        try {
            // Standard Shelly Gen 1 / Gen 2 local relay toggle endpoint
            const response = await fetch(`http://${SHELLY_IP}/relay/0?turn=${action}`, {
                method: 'GET',
                // Timeout logic should normally be here, fetch in node lacks built-in timeout without AbortController
            });
            
            if (response.ok) {
                console.log(`[✅] SUCCESS: Shelly Relay is now ${action.toUpperCase()}`);
                return true;
            } else {
                console.warn(`[⚠️] Shelly responded with status: ${response.status}`);
            }
        } catch (error) {
            console.error(`[🚨] Error connecting to Shelly (Attempt ${i + 1}/${numRetries + 1}):`, error.message);
        }
        
        // Wait a second before trying again if we failed
        if (i < numRetries) await new Promise(res => setTimeout(res, 1000));
    }
    
    console.error(`[❌] FAILED to set Shelly relay state to ${action.toUpperCase()} after retries.`);
    return false;
}


// --- SUPABASE REALTIME LISTENER ---

// 1. Subscribe to Broadcast channel (used for transient events like "match start")
const channel = supabase.channel(`lounge_room_${TABLE_ID}`);

channel.on('broadcast', { event: 'start_1v1' }, (payload) => {
    console.log('[🎮] Received START_1V1 broadcast from Cloud!');
    console.log('Payload:', payload.payload);
    
    // TURN ON THE TABLE POWER!
    setShellyRelay(true);
});

channel.on('broadcast', { event: 'tourny_state_recovery' }, (payload) => {
    console.log('[🎮] Received Tournament Action broadcast from Cloud!');
    
    // Since tournament matches are starting or recovering, ensure power is ON.
    // If the power is already on, the Shelly will gracefully ignore.
    setShellyRelay(true);
});

// Assuming your lounge-logic.js sends a 'match_complete' broadcast when the final winner screen is reached
channel.on('broadcast', { event: 'match_complete' }, (payload) => {
    console.log('[🛑] Received MATCH_COMPLETE broadcast from Cloud!');
    
    // In a tournament context, maybe we don't shut off until the ENTIRE tournament is over.
    // That requires the lounge-logic to send an 'event_closed' or 'arcade_idle' payload.
    // For now, let's assume we turn it off on 'arcade_idle'
});

channel.on('broadcast', { event: 'arcade_idle' }, (payload) => {
    console.log('[💤] Received ARCADE_IDLE broadcast from Cloud!');
    
    // TURN OFF THE TABLE POWER!
    setShellyRelay(false);
});

// Start listening
channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
        console.log(`[📡] Successfully subscribed to Cloud Channel: lounge_room_${TABLE_ID}`);
        // Optionally flash the lights once to signify successful Daemon boot
    } else {
        console.log(`[📡] Channel status changed:`, status);
    }
});

// --- SHUTDOWN HANDLING (Ctrl+C) ---
process.on('SIGINT', async () => {
    console.log("\n[Graceful Shutdown] Shutting down Hardware Daemon...");
    
    // Safety feature: Turn off relay if daemon crashes or stops voluntarily
    await setShellyRelay(false);
    
    supabase.removeAllChannels();
    process.exit(0);
});
