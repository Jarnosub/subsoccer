import { _supabase, state } from './config.js';
import { directAdd } from './script.js';

let activeLobbyId = null;
let subscription = null;

export async function hostWithQR() {
    if (!state.user) {
        alert("You need to be logged in to host a tournament.");
        return;
    }

    try {
        // 1. Create a lobby
        const { data, error } = await _supabase
            .from('qr_lobbies')
            .insert([{ host_id: state.user.id }])
            .select()
            .single();

        if (error) throw error;
        activeLobbyId = data.id;

        // 2. Setup the modal
        const modal = document.getElementById('smart-host-modal');
        const qrImg = document.getElementById('smart-host-qr-img');
        const countSpan = document.getElementById('smart-host-count');

        if (modal) modal.style.display = 'flex';
        countSpan.textContent = '0';

        // 3. Generate QR Code linking to ?join=LOBBY_ID
        const joinUrl = `${window.location.origin}/?join=${activeLobbyId}`;
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=E30613&data=${encodeURIComponent(joinUrl)}`;

        // 4. Subscribe to Realtime Updates
        if (subscription) {
            _supabase.removeChannel(subscription);
        }

        subscription = _supabase.channel(`lobby-${activeLobbyId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'qr_lobby_participants',
                    filter: `lobby_id=eq.${activeLobbyId}`
                },
                (payload) => {
                    handleNewParticipant(payload.new);
                }
            )
            .subscribe();

    } catch (err) {
        console.error("Error creating lobby:", err);
        alert("Failed to create tournament lobby. Check console.");
    }
}

function handleNewParticipant(participant) {
    // 1. Update counter
    const countSpan = document.getElementById('smart-host-count');
    let currentCount = parseInt(countSpan.textContent || '0');
    currentCount++;
    countSpan.textContent = currentCount.toString();

    // 2. Add to actual tournament pool in ui.js
    // Since directAdd handles adding to state.pool and rendering, we can use it.
    directAdd(participant.guest_name);

    // Animate the counter for feedback
    countSpan.style.transform = 'scale(1.5)';
    setTimeout(() => {
        countSpan.style.transform = 'scale(1)';
    }, 200);
}

export async function cancelQRHost() {
    const modal = document.getElementById('smart-host-modal');
    if (modal) modal.style.display = 'none';

    if (activeLobbyId) {
        // Clean up the lobby row
        await _supabase.from('qr_lobbies').update({ status: 'cancelled' }).eq('id', activeLobbyId);

        if (subscription) {
            _supabase.removeChannel(subscription);
            subscription = null;
        }
        activeLobbyId = null;
    }
}

export async function startQRBracket() {
    const modal = document.getElementById('smart-host-modal');
    if (modal) modal.style.display = 'none';

    if (activeLobbyId) {
        // Update status to started so it can't be joined anymore
        await _supabase.from('qr_lobbies').update({ status: 'started' }).eq('id', activeLobbyId);

        if (subscription) {
            _supabase.removeChannel(subscription);
            subscription = null;
        }
        activeLobbyId = null;
    }
}

export async function checkQRJoinParam() {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (!joinId) return;

    // Hijack UI entirely
    document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0a0a0a; color:#fff; font-family:'Resolve', sans-serif;">
            <i class="fa-solid fa-trophy" style="font-size:4rem; color:var(--sub-gold); margin-bottom:20px;"></i>
            <h1 style="font-family:'Russo One', sans-serif; text-transform:uppercase; margin-bottom:20px;">Join Tournament</h1>
            <input type="text" id="join-guest-name" placeholder="Enter your player name..." style="padding:15px; font-size:1.2rem; border-radius:8px; border:none; margin-bottom:20px; text-align:center; width:80%; max-width:300px; background:#222; color:#fff;">
            <button id="btn-confirm-join" style="padding:15px 40px; font-size:1.2rem; background:linear-gradient(135deg, var(--sub-red), #aa0000); color:white; border:none; border-radius:8px; font-family:'Russo One', sans-serif; cursor:pointer;">JOIN NOW</button>
            <div id="join-status" style="margin-top:20px; color:#888;"></div>
        </div>
    `;

    document.getElementById('btn-confirm-join').addEventListener('click', async () => {
        const nameInput = document.getElementById('join-guest-name').value.trim();
        const stat = document.getElementById('join-status');

        if (!nameInput) {
            stat.textContent = "Please enter a name.";
            return;
        }

        stat.textContent = "Joining...";
        const { error } = await _supabase.from('qr_lobby_participants').insert([{
            lobby_id: joinId,
            guest_name: nameInput
        }]);

        if (error) {
            stat.textContent = "Error: Could not join lobby. Maybe it started already?";
            console.error(error);
        } else {
            document.body.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0a0a0a; color:#fff; font-family:'Resolve', sans-serif;">
                    <i class="fa-solid fa-check-circle" style="font-size:5rem; color:#4CAF50; margin-bottom:20px;"></i>
                    <h1 style="font-family:'Russo One', sans-serif; text-transform:uppercase;">YOU'RE IN!</h1>
                    <p style="color:#aaa; margin-top:10px; font-size:1.1rem;">Look at the main screen.</p>
                </div>
            `;
        }
    });
}
