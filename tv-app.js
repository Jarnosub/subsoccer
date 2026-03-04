import { _supabase } from './config.js';

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const role = urlParams.get('role'); // 'caster', 'camera', or undefined/viewer

if (!roomId) {
    document.getElementById('waiting-screen').innerHTML = `
        <h2 style="color:var(--sub-red); font-family:'Russo One';">INVALID BROADCAST LINK</h2>
        <div style="color:#aaa; font-family:'Resolve';">Missing Room ID parameter.</div>
    `;
} else if (role === 'caster' || role === 'camera') {
    initSenderMode();
} else {
    document.getElementById('room-id-display').textContent = `ROOM: ${roomId}`;
    initViewerMode();
}

let localStream = null;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let lastP1Score = 0;
let lastP2Score = 0;
let channel = null;

// Peer Connections mapping: remoteRole -> RTCPeerConnection
const peerConnections = {};
const iceQueues = {};

function handleScoreUpdateData(data) {
    console.log("Applying Score Update:", data);
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('scoreboard').style.display = 'flex';

    document.getElementById('p1-name').textContent = data.p1Name || 'PLAYER 1';
    document.getElementById('p2-name').textContent = data.p2Name || 'PLAYER 2';

    let goalScorer = null;
    if (data.isGoal || data.p1Score > lastP1Score) goalScorer = data.p1Name;
    if (data.isGoal || data.p2Score > lastP2Score) goalScorer = data.p2Name;

    lastP1Score = data.p1Score;
    lastP2Score = data.p2Score;

    updateScoreCard('p1-score', data.p1Score);
    updateScoreCard('p2-score', data.p2Score);

    if (goalScorer && (data.p1Score > 0 || data.p2Score > 0) && data.isGoal) {
        triggerGoalExplosion(goalScorer);
    }
}

function updateScoreCard(id, score) {
    const box = document.getElementById(id);
    if (box && box.textContent != score) {
        box.style.transform = 'scale(1.2)';
        box.style.borderColor = 'var(--sub-gold)';
        box.textContent = score;
        setTimeout(() => {
            box.style.transform = 'scale(1)';
            box.style.borderColor = '#333';
        }, 300);
    }
}

function triggerGoalExplosion(scorerName) {
    const overlay = document.getElementById('goal-overlay');
    if (overlay) {
        document.getElementById('goal-scorer-name').textContent = scorerName.toUpperCase() + " SCORES!";
        overlay.classList.add('active');
        setTimeout(() => {
            overlay.classList.remove('active');
        }, 3000);
    }
}

function getOrCreatePeerConnection(remoteRole) {
    if (!peerConnections[remoteRole]) {
        console.log(`Creating new peer connection for ${remoteRole}`);
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[remoteRole] = pc;
        iceQueues[remoteRole] = [];

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                channel.send({
                    type: 'broadcast',
                    event: 'WEBRTC_ICE',
                    payload: { targetRole: remoteRole, fromRole: role || 'viewer', candidate: e.candidate }
                });
            }
        };

        pc.ontrack = (event) => {
            console.log(`Got video track from ${remoteRole}!`);
            const videoElemId = remoteRole === 'camera' ? 'arena-video' : 'vip-video';
            const videoElem = document.getElementById(videoElemId);

            if (videoElem) {
                if (videoElem.srcObject !== event.streams[0]) {
                    videoElem.srcObject = event.streams[0];
                }

                if (remoteRole === 'caster') {
                    document.getElementById('vip-box').style.display = 'block';
                } else if (remoteRole === 'camera') {
                    videoElem.style.display = 'block';
                }

                videoElem.play().catch(e => {
                    console.warn(`Autoplay blocked for ${remoteRole}, falling back to muted`);
                    videoElem.muted = true;
                    videoElem.play().then(() => {
                        if (remoteRole === 'caster' && !document.getElementById('unmute-btn')) {
                            createUnmuteButton(videoElem);
                        }
                    });
                });
            }
        };
    }
    return peerConnections[remoteRole];
}

function createUnmuteButton(vipVideo) {
    const btn = document.createElement('div');
    btn.id = 'unmute-btn';
    btn.innerHTML = '🔇 TAP TO UNMUTE CASTER';
    btn.style.position = 'absolute';
    btn.style.bottom = '10px';
    btn.style.left = '50%';
    btn.style.transform = 'translateX(-50%)';
    btn.style.background = 'var(--sub-red)';
    btn.style.color = '#fff';
    btn.style.padding = '5px 10px';
    btn.style.borderRadius = '20px';
    btn.style.cursor = 'pointer';
    btn.style.fontFamily = "'Russo One', sans-serif";
    btn.style.fontSize = '0.7rem';
    btn.style.zIndex = '30';
    btn.style.whiteSpace = 'nowrap';
    btn.onclick = (e) => {
        e.stopPropagation();
        vipVideo.muted = false;
        btn.remove();
    };
    document.getElementById('vip-box').appendChild(btn);
}

function attachSignaling() {
    channel.on('broadcast', { event: 'WEBRTC_ICE' }, async (p) => {
        const { targetRole, fromRole, candidate } = p.payload;
        if (targetRole === (role || 'viewer')) {
            const pc = peerConnections[fromRole];
            if (pc && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else if (iceQueues[fromRole] !== undefined) {
                iceQueues[fromRole].push(candidate);
            }
        }
    });

    channel.on('broadcast', { event: 'WEBRTC_OFFER' }, async (p) => {
        const { targetRole, fromRole, offer } = p.payload;
        if (targetRole === (role || 'viewer')) {
            console.log(`Received Offer from ${fromRole}`);

            if (peerConnections[fromRole]) {
                peerConnections[fromRole].close();
                delete peerConnections[fromRole];
            }

            const pc = getOrCreatePeerConnection(fromRole);
            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            for (const candidate of iceQueues[fromRole]) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            iceQueues[fromRole] = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            channel.send({
                type: 'broadcast',
                event: 'WEBRTC_ANSWER',
                payload: { targetRole: fromRole, fromRole: role || 'viewer', answer: answer }
            });
        }
    });

    channel.on('broadcast', { event: 'WEBRTC_ANSWER' }, async (p) => {
        const { targetRole, fromRole, answer } = p.payload;
        if (targetRole === (role || 'viewer')) {
            console.log(`Received Answer from ${fromRole}`);
            const pc = peerConnections[fromRole];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                for (const candidate of iceQueues[fromRole]) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                iceQueues[fromRole] = [];
            }
        }
    });

    channel.on('broadcast', { event: 'PEER_READY' }, async (p) => {
        const { fromRole } = p.payload;
        if ((role === 'caster' || role === 'camera') && fromRole !== role && localStream) {
            console.log(`${fromRole} declared ready, sending offer...`);
            await createAndSendOffer(fromRole);
        }
    });

    channel.on('broadcast', { event: 'SCORE_UPDATE' }, (payload) => {
        handleScoreUpdateData(payload.payload);
    });

    channel.on('broadcast', { event: 'MATCH_ENDED' }, () => {
        document.getElementById('scoreboard').style.display = 'none';
        document.getElementById('waiting-screen').style.display = 'flex';
        document.getElementById('room-id-display').textContent = role ? 'READY FOR NEXT MATCH...' : 'CONNECTED. WAITING FOR NEXT MATCH...';
    });
}

async function createAndSendOffer(targetRole) {
    if (!localStream) return;

    if (peerConnections[targetRole]) {
        peerConnections[targetRole].close();
        delete peerConnections[targetRole];
    }
    const pc = getOrCreatePeerConnection(targetRole);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channel.send({ type: 'broadcast', event: 'WEBRTC_OFFER', payload: { targetRole, fromRole: role, offer } });
}

function initViewerMode() {
    channel = _supabase.channel(`room:${roomId}`);
    attachSignaling();

    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log("Viewer Connected to Stream");
            document.getElementById('room-id-display').textContent = `CONNECTED. WAITING FOR MATCH...`;
            document.getElementById('room-id-display').style.color = '#4CAF50';
            channel.send({ type: 'broadcast', event: 'PEER_READY', payload: { fromRole: 'viewer' } });
        }
    });
}

function initSenderMode() {
    document.getElementById('room-id-display').textContent = `ROOM: ${roomId} (${role.toUpperCase()})`;

    const floatBtn = document.createElement('button');
    floatBtn.id = 'btn-start-cast';
    floatBtn.innerHTML = role === 'camera' ? '🎥 GO LIVE (CAMERA)' : '🎥 GO LIVE (CASTER)';
    floatBtn.style = "position:fixed; bottom:30px; right:30px; z-index:1000; padding:15px 30px; font-size:1.2rem; background:var(--sub-red); color:#fff; border:none; border-radius:30px; font-family:'Russo One'; cursor:pointer; box-shadow: 0 10px 20px rgba(0,0,0,0.5); border: 2px solid #fff;";
    document.body.appendChild(floatBtn);

    channel = _supabase.channel(`room:${roomId}`);
    attachSignaling();
    channel.subscribe();

    floatBtn.onclick = async () => {
        try {
            // Camera role prefers environment (rear) camera
            const constraints = role === 'camera' ?
                { video: { facingMode: 'environment' }, audio: true } :
                { video: true, audio: true };

            localStream = await navigator.mediaDevices.getUserMedia(constraints);

            const localVideo = document.getElementById(role === 'camera' ? 'arena-video' : 'vip-video');
            if (localVideo) {
                localVideo.muted = true;
                localVideo.srcObject = localStream;
                if (role === 'caster') {
                    document.getElementById('vip-box').style.display = 'block';
                } else {
                    localVideo.style.display = 'block';
                }
            }

            floatBtn.style.display = 'none';
            console.log(`${role} started...`);

            channel.send({ type: 'broadcast', event: 'PEER_READY', payload: { fromRole: role } });

            // Proactively offer to expected receivers
            createAndSendOffer('viewer');
            if (role === 'camera') {
                createAndSendOffer('caster');
            }

        } catch (e) {
            alert("Camera access denied or failed.");
            console.error(e);
        }
    };
}
