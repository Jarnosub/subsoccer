import { _supabase } from './config.js';

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const role = urlParams.get('role'); // 'caster', 'camera', or undefined/viewer



let localStream = null;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let lastP1Score = 0;
let lastP2Score = 0;
let channel = null;

// Peer Connections mapping: remoteRole -> RTCPeerConnection
const peerConnections = {};
const iceQueues = {};

function handleScoreUpdateData(data) {

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

        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[remoteRole] = pc;
        iceQueues[remoteRole] = iceQueues[remoteRole] || [];

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
        const myRole = role || 'viewer';
        if (targetRole === myRole) {
            const pc = peerConnections[fromRole];
            if (pc && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                iceQueues[fromRole] = iceQueues[fromRole] || [];
                iceQueues[fromRole].push(candidate);
            }
        }
    });

    channel.on('broadcast', { event: 'WEBRTC_OFFER' }, async (p) => {
        const { targetRole, fromRole, offer } = p.payload;
        const myRole = role || 'viewer';
        if (targetRole === myRole) {


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
        const myRole = role || 'viewer';
        if (targetRole === myRole) {

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

            await createAndSendOffer(fromRole);
        }
    });

    channel.on('broadcast', { event: 'SCORE_UPDATE' }, (payload) => {
        handleScoreUpdateData(payload.payload);
    });

    channel.on('broadcast', { event: 'DIRECTOR_COMMAND' }, (p) => {
        const { action } = p.payload;


        if (action === 'TOGGLE_SCOREBOARD') {
            const sb = document.getElementById('scoreboard');
            if (sb) sb.style.opacity = (sb.style.opacity === '0' ? '1' : '0');
        } else if (action === 'TOGGLE_CASTER') {
            const vb = document.getElementById('vip-box');
            if (vb) vb.style.opacity = (vb.style.opacity === '0' ? '1' : '0');
        } else if (action === 'SHOW_GOAL') {
            const go = document.getElementById('goal-overlay');
            if (go) {
                go.classList.add('active');
                setTimeout(() => go.classList.remove('active'), 5000);
            }
        } else if (action === 'SHOW_BRACKET') {
            let br = document.getElementById('director-bracket-overlay');
            if (!br) {
                br = document.createElement('div');
                br.id = 'director-bracket-overlay';
                br.innerHTML = `
                    <div style="background: rgba(0,0,0,0.9); border:2px solid var(--sub-red); padding:40px; border-radius:12px; text-align:center;">
                        <h2 style="font-family:'Russo One'; color:white; font-size:3rem; margin:0 0 20px 0; letter-spacing:4px;">TOURNAMENT BRACKET</h2>
                        <div style="color:var(--sub-gold); font-size:1.5rem; letter-spacing:2px;">(Live bracket sync coming soon...)</div>
                    </div>
                `;
                br.style.position = 'fixed';
                br.style.inset = '0';
                br.style.zIndex = '200';
                br.style.display = 'flex';
                br.style.alignItems = 'center';
                br.style.justifyContent = 'center';
                br.style.background = 'rgba(0,0,0,0.6)';
                br.style.backdropFilter = 'blur(10px)';
                br.style.opacity = '0';
                br.style.transition = 'opacity 0.4s ease';
                document.body.appendChild(br);
                // force reflow
                br.offsetHeight;
                br.style.opacity = '1';
            } else {
                br.style.opacity = (br.style.opacity === '0' ? '1' : '0');
                if (br.style.opacity === '0') {
                    // removing it completely after fade out could be better but opacity 0 is fine and unclickable since we use pointer-events if we want, but let's just remove it
                    setTimeout(() => { if (br.parentNode) br.parentNode.removeChild(br); }, 400);
                }
            }
        }
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

            const roomIdDisplay = document.getElementById('room-id-display');
            if (roomIdDisplay) {
                roomIdDisplay.textContent = `CONNECTED. WAITING FOR MATCH...`;
                roomIdDisplay.style.color = '#4CAF50';
            }
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
