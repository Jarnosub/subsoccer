import { _supabase } from './config.js';

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const role = urlParams.get('role'); // 'caster' or 'viewer'

if (!roomId) {
    document.getElementById('waiting-screen').innerHTML = `
        <h2 style="color:var(--sub-red); font-family:'Russo One';">INVALID BROADCAST LINK</h2>
        <div style="color:#aaa; font-family:'Resolve';">Missing Room ID parameter.</div>
    `;
} else if (role === 'caster') {
    initCasterMode();
} else {
    document.getElementById('room-id-display').textContent = `ROOM: ${roomId}`;
    initBroadcastReceiver();
}

let peerConnection;
let localStream;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let lastP1Score = 0;
let lastP2Score = 0;

function initBroadcastReceiver() {
    const channel = _supabase.channel(`room:${roomId}`);

    channel.on('broadcast', { event: 'SCORE_UPDATE' }, (payload) => {
        const data = payload.payload;
        console.log("Received Update:", data);

        // Show Scoreboard
        document.getElementById('waiting-screen').style.display = 'none';
        document.getElementById('scoreboard').style.display = 'flex';

        // Update Names
        document.getElementById('p1-name').textContent = data.p1Name || 'PLAYER 1';
        document.getElementById('p2-name').textContent = data.p2Name || 'PLAYER 2';

        // Check for Goal Events
        let goalScorer = null;
        if (data.isGoal || data.p1Score > lastP1Score) goalScorer = data.p1Name;
        if (data.isGoal || data.p2Score > lastP2Score) goalScorer = data.p2Name;

        lastP1Score = data.p1Score;
        lastP2Score = data.p2Score;

        // Animate Score Increment
        updateScoreCard('p1-score', data.p1Score);
        updateScoreCard('p2-score', data.p2Score);

        if (goalScorer && (data.p1Score > 0 || data.p2Score > 0) && data.isGoal) {
            triggerGoalExplosion(goalScorer);
        }
    });

    channel.on('broadcast', { event: 'MATCH_ENDED' }, () => {
        console.log("Match ended, waiting for next...");
        document.getElementById('scoreboard').style.display = 'none';
        document.getElementById('waiting-screen').style.display = 'flex';
        document.getElementById('room-id-display').textContent = `CONNECTED. WAITING FOR NEXT MATCH...`;
        document.getElementById('room-id-display').style.color = '#4CAF50';
    });

    channel.on('broadcast', { event: 'WEBRTC_ICE' }, async (p) => {
        if (peerConnection && p.payload.isCasterCandidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(p.payload.candidate));
        }
    });

    channel.on('broadcast', { event: 'WEBRTC_OFFER' }, async (p) => {
        console.log("VIP Offer Received");
        if (peerConnection) peerConnection.close();

        peerConnection = new RTCPeerConnection(rtcConfig);

        peerConnection.ontrack = (event) => {
            console.log("Got VIP video track!");
            const vipVideo = document.getElementById('vip-video');
            if (vipVideo.srcObject !== event.streams[0]) {
                vipVideo.srcObject = event.streams[0];
                document.getElementById('vip-box').style.display = 'block';
            }
        };

        peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
                channel.send({ type: 'broadcast', event: 'WEBRTC_ICE', payload: { isCasterCandidate: false, candidate: e.candidate } });
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(p.payload));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        channel.send({ type: 'broadcast', event: 'WEBRTC_ANSWER', payload: answer });
    });

    channel.on('broadcast', { event: 'CASTER_READY' }, async () => {
        // Caster just started their camera, we need to tell them we are here so they send an offer
        console.log("Caster is ready, sending VIEWER_READY...");
        channel.send({ type: 'broadcast', event: 'VIEWER_READY', payload: {} });
    });

    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log("Connected to Stream");
            document.getElementById('room-id-display').textContent = `CONNECTED. WAITING FOR MATCH...`;
            document.getElementById('room-id-display').style.color = '#4CAF50';
            // Tell caster we joined so they send offer
            channel.send({ type: 'broadcast', event: 'VIEWER_READY', payload: {} });
        }
    });
}

function initCasterMode() {
    document.getElementById('waiting-screen').innerHTML = `
        <img src="logo.png" style="width: 150px; margin-bottom: 20px;">
        <h2 style="color:var(--sub-gold); font-family:'Russo One'; margin-bottom: 5px;">VIP CASTER STUDIO</h2>
        <div style="color:#aaa; font-family:'Resolve'; margin-bottom:30px; font-size: 0.9rem;">You will be broadcasted live to the Arena TV in PIP.</div>
        <button id="btn-start-cast" style="padding:15px 30px; font-size:1.2rem; background:var(--sub-red); color:#fff; border:none; border-radius:8px; font-family:'Russo One'; cursor:pointer; box-shadow:0 5px 15px rgba(227,6,19,0.5);">START BROADCASTING</button>
        <video id="caster-preview" autoplay playsinline muted style="width:100%; max-width:300px; border:2px solid #333; border-radius:10px; margin-top:20px; display:none; transform: scaleX(-1);"></video>
    `;

    const channel = _supabase.channel(`room:${roomId}`);
    channel.subscribe();

    document.getElementById('btn-start-cast').onclick = async () => {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const preview = document.getElementById('caster-preview');
            preview.srcObject = localStream;
            preview.style.display = 'block';
            document.getElementById('btn-start-cast').style.display = 'none';

            console.log("Camera started, waiting for TV...");
            // Send offer immediately if TV is already there, or wait for TV to say VIEWER_READY
            channel.send({ type: 'broadcast', event: 'CASTER_READY', payload: {} });
        } catch (e) {
            alert("Camera access denied or failed.");
        }
    };

    channel.on('broadcast', { event: 'VIEWER_READY' }, async () => {
        if (!localStream) return;
        console.log("TV joined. Creating offer...");
        if (peerConnection) peerConnection.close();

        peerConnection = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
                channel.send({ type: 'broadcast', event: 'WEBRTC_ICE', payload: { isCasterCandidate: true, candidate: e.candidate } });
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        channel.send({ type: 'broadcast', event: 'WEBRTC_OFFER', payload: offer });
    });

    channel.on('broadcast', { event: 'WEBRTC_ANSWER' }, async (p) => {
        console.log("VIP Answer Received from TV");
        if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(p.payload));
    });

    channel.on('broadcast', { event: 'WEBRTC_ICE' }, async (p) => {
        if (peerConnection && !p.payload.isCasterCandidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(p.payload.candidate));
        }
    });
}

function updateScoreCard(id, score) {
    const box = document.getElementById(id);
    if (box.textContent != score) {
        box.style.transform = 'scale(1.2)';
        box.style.borderColor = 'var(--sub-gold)';
        box.textContent = score;
        setTimeout(() => {
            box.style.transform = 'scale(1)';
            box.style.borderColor = '#333';
        }, 300);
    } else {
        box.textContent = score;
    }
}

function triggerGoalExplosion(scorerName) {
    const overlay = document.getElementById('goal-overlay');
    const scorerEl = document.getElementById('goal-scorer-name');

    scorerEl.textContent = `${scorerName} SCORES!`;

    overlay.classList.add('active');

    // Attempt to play sound (Browsers require interaction first, so it might block initially if opened in new tab without click)
    playGoalChime();

    setTimeout(() => {
        overlay.classList.remove('active');
    }, 3000);
}

// Simple synthesized loud horn/chime for the TV
function playGoalChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        // Multi-frequency horn simulation
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);

        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);

        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 1.6);

        // Add crowd noise simulation (white noise filter)
        setTimeout(() => {
            playCrowd(audioCtx);
        }, 100);
    } catch (e) { }
}

function playCrowd(ctx) {
    const bufferSize = ctx.sampleRate * 2; // 2 seconds
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    const gain = ctx.createGain();

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);

    noise.start();
}
