import { _supabase } from './config.js';

let currentChannel = null;
let currentRoomId = null;

export const BroadcastService = {
    getRoomId: () => {
        // Ensisijaisesti sijoitetaan huone kiinteästi fyysiseen pelipöytään (QR-koodin sn tai game_id)
        const params = new URLSearchParams(window.location.search);
        let rid = params.get('sn') || params.get('game_id');

        if (rid && rid !== 'QUICK-PLAY') {
            rid = rid.toUpperCase();
            localStorage.setItem('TV_ROOM_ID', rid); // Tallennetaan laitteen muistiin viimeisin virallinen pöytä
            return rid;
        }

        // Fallback: Jos ei QR-skannattu pöytä (esim normi suorajulkaisu), luodaan/haetaan perus TV-vastaanottimen laitteen id
        rid = localStorage.getItem('TV_ROOM_ID');
        if (!rid) {
            rid = Math.random().toString(36).substring(2, 8).toUpperCase();
            localStorage.setItem('TV_ROOM_ID', rid);
        }
        return rid;
    },

    startBroadcasting: async () => {
        if (currentChannel) return BroadcastService.getRoomId();

        currentRoomId = BroadcastService.getRoomId();

        currentChannel = _supabase.channel(`room:${currentRoomId}`);

        currentChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {

            }
        });

        // Whenever a new TV joins, immediately sync it with the ongoing score
        currentChannel.on('broadcast', { event: 'PEER_READY' }, (p) => {
            if (p.payload && p.payload.fromRole === 'viewer' && BroadcastService.latestScore) {

                currentChannel.send({
                    type: 'broadcast',
                    event: 'SCORE_UPDATE',
                    payload: BroadcastService.latestScore
                });
            }
        });

        // Fallback for older TV clients still sending VIEWER_READY
        currentChannel.on('broadcast', { event: 'VIEWER_READY' }, () => {
            if (BroadcastService.latestScore) {

                currentChannel.send({
                    type: 'broadcast',
                    event: 'SCORE_UPDATE',
                    payload: BroadcastService.latestScore
                });
            }
        });

        return currentRoomId;
    },

    sendScoreUpdate: (p1Name, p2Name, p1Score, p2Score, isGoal = false) => {
        if (!currentChannel) return;

        const payload = {
            p1Name,
            p2Name,
            p1Score,
            p2Score,
            isGoal,
            timestamp: Date.now()
        };

        // Store latest state so late-joining TVs get the immediate score
        BroadcastService.latestScore = payload;

        // Fix for Supabase V2 Realtime Broadcast
        currentChannel.send({
            type: 'broadcast',
            event: 'SCORE_UPDATE',
            payload: payload
        }).catch(err => {

        });
    },

    stopBroadcasting: () => {
        if (currentChannel) {
            currentChannel.send({ type: 'broadcast', event: 'MATCH_ENDED', payload: {} });
            _supabase.removeChannel(currentChannel);
            currentChannel = null;
            // We intentionally do NOT reset currentRoomId so it persists

        }
    }
};

// Expose to window for inline HTML calls if needed
window.BroadcastService = BroadcastService;
