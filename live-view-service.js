import { _supabase, state } from './config.js';
import { showNotification, unsafeHTML } from './ui-utils.js';

/**
 * ============================================================
 * LIVE EVENT VIEW SERVICE
 * Handles public display and live updates
 * ============================================================
 */

/**
 * Share live event link
 */
export function shareLiveEventLink(eventId, eventName) {
    const liveUrl = `${window.location.origin}${window.location.pathname}?live=${eventId}`;

    // Copy to clipboard
    navigator.clipboard.writeText(liveUrl).then(() => {
        showNotification('Live link copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback: show in modal
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; display:flex; align-items:center; justify-content:center; padding:20px;';
        modal.innerHTML = `
            <div style="background:#1a1a1a; border:2px solid var(--sub-gold); border-radius:12px; padding:30px; max-width:500px; width:100%;">
                <h2 style="font-family:'Russo One'; color:var(--sub-gold); margin-bottom:20px; text-align:center;">
                    <i class="fa fa-share-alt" style="margin-right:8px;"></i> LIVE EVENT LINK
                </h2>
                <p style="color:#ccc; margin-bottom:15px; text-align:center;">
                    Share this link to display live tournament results on screens or other devices.
                </p>
                <input type="text" value="${liveUrl}" readonly 
                       style="width:100%; padding:12px; background:#0a0a0a; border:1px solid #333; color:#fff; font-family:monospace; border-radius:6px; margin-bottom:20px; font-size:0.9rem;"
                       data-action="select-all">
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:#4CAF50;" data-action="copy-live-link" data-url="${liveUrl}">
                        <i class="fa fa-copy"></i> COPY LINK
                    </button>
                    <button class="btn-red" style="flex:1; background:#333;" data-action="close-share-modal">
                        <i class="fa fa-times"></i> CLOSE
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    });
}

/**
 * View live event (public view for screens/TVs)
 */
export async function viewLiveEvent(eventId, isBackgroundUpdate = false) {
    // Ensure live content container exists
    let content = document.getElementById('live-content');
    if (!content) {
        content = document.createElement('div');
        content.id = 'live-content';
        document.body.appendChild(content);
    }
    
    // Enforce full screen styles and hide app content
    content.style.cssText = 'width:100%; height:100vh; padding:0; box-sizing:border-box; background-color:#050505; background-image: linear-gradient(45deg, #0a0a0a 25%, transparent 25%), linear-gradient(-45deg, #0a0a0a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0a0a0a 75%), linear-gradient(-45deg, transparent 75%, #0a0a0a 75%); background-size: 8px 8px; position:fixed; top:0; left:0; z-index:20000; overflow-y:auto; -webkit-overflow-scrolling:touch;';
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.style.display = 'none';

    // Show loading state
    if (!isBackgroundUpdate) {
        content.innerHTML = `
            <div style="text-align:center; padding:40px; color:#fff;">
                <i class="fa fa-spinner fa-spin" style="font-size:3rem; color:var(--sub-gold);"></i>
                <p style="margin-top:20px; font-size:1.2rem;">Loading event...</p>
            </div>
        `;
    }

    try {
        // Fetch event details
        const { data: event, error } = await _supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (error) throw error;
        if (!event) throw new Error('Event not found');

        // Update page title and Open Graph meta tags for social sharing
        if (!isBackgroundUpdate) {
            document.title = `LIVE: ${event.event_name}`;
            
            const setMeta = (prop, val) => {
                if (!val) return;
                let meta = document.querySelector(`meta[property="${prop}"]`);
                if (!meta) {
                    meta = document.createElement('meta');
                    meta.setAttribute('property', prop);
                    document.head.appendChild(meta);
                }
                meta.setAttribute('content', val);
            };

            setMeta('og:title', event.event_name);
            setMeta('og:description', event.description || 'Follow live tournament results.');
            setMeta('og:url', window.location.href);
            if (event.image_url) setMeta('og:image', event.image_url);
        }

        // Fetch tournaments
        const { data: tournaments, error: tournamentsError } = await _supabase
            .from('tournament_history')
            .select(`
                *,
                game: games(game_name, location)
            `)
            .eq('event_id', eventId)
            .order('start_datetime', { ascending: true });

        if (tournamentsError) throw tournamentsError;

        // Fetch participant counts for each tournament separately to be safe
        if (tournaments && tournaments.length > 0) {
            for (let t of tournaments) {
                const { count } = await _supabase
                    .from('event_registrations')
                    .select('*', { count: 'exact', head: true })
                    .eq('tournament_id', t.id);
                t.computed_participant_count = count || 0;
            }

            // Fetch matches for each tournament to build the live bracket
            for (let t of tournaments) {
                const { data: matches, error: matchesError } = await _supabase
                    .from('matches')
                    .select('*')
                    .eq('tournament_id', t.id)
                    .order('created_at', { ascending: true });
                t.matches = matches || [];
            }
        }

        // FETCH PLAYER DATA FOR LIVE PODIUMS
        // Kerätään kaikkien päättyneiden turnausten voittajat ja haetaan heidän kuvansa
        const completedTournaments = tournaments.filter(t => t.status === 'completed');
        let playerMap = {};
        
        if (completedTournaments.length > 0) {
            const names = [...new Set(completedTournaments.flatMap(t => 
                [t.winner_name, t.second_place_name, t.third_place_name]
            ).filter(n => n))];

            if (names.length > 0) {
                const { data: players } = await _supabase
                    .from('players')
                    .select('username, avatar_url, country, elo')
                    .in('username', names);
                
                if (players) {
                    players.forEach(p => { playerMap[p.username.toLowerCase()] = p; });
                }
            }
        }


        if (event.primary_color) {
            // Update theme color variable
            document.documentElement.style.setProperty('--sub-gold', event.primary_color);
        }

        // Display live view
        showLiveEventView(event, tournaments || [], playerMap);

        // Auto-refresh every 10 seconds
        if (window.liveEventRefreshInterval) {
            clearInterval(window.liveEventRefreshInterval);
        }
        window.liveEventRefreshInterval = setInterval(() => {
            // Stop interval if live content container is no longer in DOM
            if (!document.getElementById('live-content')) {
                clearInterval(window.liveEventRefreshInterval);
                return;
            }
            viewLiveEvent(eventId, true);
        }, 10000);

    } catch (e) {
        console.error('Failed to load live event:', e);
        content.innerHTML = `
            <div style="text-align:center; padding:40px; color:#fff;">
                <h2 style="color:#f44336; font-family:'Russo One'; margin-bottom:20px;">⚠️ Error Loading Event</h2>
                <p style="color:#999; margin-bottom:10px;">Unable to load event data.</p>
                <p style="color:#666; font-size:0.9rem; font-family:monospace;">${e.message || 'Unknown error'}</p>
                <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:var(--sub-red); color:#fff; border:none; border-radius:6px; cursor:pointer; font-family:'Russo One';">
                    RELOAD PAGE
                </button>
            </div>
        `;
    }
}

/**
 * Render a TV-friendly bracket diagram for the live view
 */
function renderLiveBracketHtml(t) {
    const matches = t.matches || [];
    
    // Calculate unique players from matches if participant count is missing
    const uniquePlayers = new Set();
    matches.forEach(m => {
        if(m.player1) uniquePlayers.add(m.player1);
        if(m.player2) uniquePlayers.add(m.player2);
    });
    
    // Use the larger of registered count or actual players in matches
    const participantCount = Math.max(t.computed_participant_count || 0, uniquePlayers.size);
    
    if (participantCount < 2) {
        return `
            <div style="text-align:center; padding:30px; color:#444; border:1px dashed #222; border-radius:8px;">
                <i class="fa fa-users" style="font-size:2rem; margin-bottom:15px; opacity:0.3;"></i>
                <div style="font-family:var(--sub-name-font); font-size:0.9rem; letter-spacing:1px;">WAITING FOR PLAYERS</div>
                <div style="font-size:0.75rem; color:#666; margin-top:5px;">${participantCount} joined so far</div>
            </div>
        `;
    }

    // 1. Calculate Bracket Dimensions (Next Power of 2)
    let nextPow2 = 2;
    while (nextPow2 < participantCount) nextPow2 *= 2;
    
    // Cap at 32 to prevent UI explosion
    if (nextPow2 > 32) nextPow2 = 32;
    
    const totalRounds = Math.log2(nextPow2);
    
    // Calculate expected matches in Round 1 to fix layout for non-power-of-2 (e.g. 10 players)
    const byes = nextPow2 - participantCount;
    const expectedR1Matches = (participantCount - byes) / 2;
    
    // 2. Sort matches into rounds
    const playerHistory = {};
    const roundBuckets = Array.from({length: totalRounds}, () => []);
    
    // Sort matches by time
    const sortedMatches = [...matches].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let r1MatchesFound = 0;
    
    sortedMatches.forEach(m => {
        const p1 = m.player1 || 'Unknown';
        const p2 = m.player2 || 'Unknown';
        const p1Round = playerHistory[p1] || 0;
        const p2Round = playerHistory[p2] || 0;
        
        // Match belongs to the round index equal to the max previous games played by participants
        let currentRound = Math.max(p1Round, p2Round);
        
        // HEURISTIC FIX: If both players have 0 history, it could be R1 or a R2 "Bye vs Bye" match.
        // We force overflow matches to R2 to maintain visual structure.
        if (p1Round === 0 && p2Round === 0) {
            if (r1MatchesFound < expectedR1Matches) {
                currentRound = 0;
                r1MatchesFound++;
            } else {
                currentRound = 1; // Push to Round 2
            }
        }

        // Safety cap
        if (currentRound >= totalRounds) currentRound = totalRounds - 1;
        
        // INJECT BYES: If a player appears in Round 2+ without playing in Round 1, they had a BYE.
        if (currentRound > 0) {
             if (p1Round === 0 && p1 !== 'Unknown') {
                 roundBuckets[0].push({ player1: p1, isBye: true });
             }
             if (p2Round === 0 && p2 !== 'Unknown') {
                 roundBuckets[0].push({ player1: p2, isBye: true });
             }
        }

        roundBuckets[currentRound].push(m);
        
        // Increment history
        playerHistory[p1] = currentRound + 1;
        playerHistory[p2] = currentRound + 1;
    });

    // 3. Render Columns
    let html = '<div style="display:flex; gap:30px; overflow-x:auto; padding:20px 0; align-items: flex-start;">';
    
    // Helper for rendering a match box
    const renderBox = (m) => {
        if (m.isBye) {
             return `
                <div class="bracket-match-card" style="background:#111; border:1px solid #333; border-radius:6px; overflow:hidden; min-width:240px; box-shadow:0 4px 15px rgba(0,0,0,0.3); position:relative; opacity:0.6;">
                    <div style="padding:12px 15px; border-bottom:1px solid #222; background:rgba(255,255,255,0.05);">
                        <span style="color:#fff; font-weight:bold; font-size:0.95rem; font-family:var(--sub-name-font); text-transform:uppercase; letter-spacing:0.5px;">${m.player1}</span>
                    </div>
                    <div style="padding:12px 15px; color:#888; font-size:0.8rem; font-family:var(--sub-name-font); letter-spacing:1px; display:flex; align-items:center;">
                        <i class="fa fa-arrow-right" style="margin-right:8px; font-size:0.7rem;"></i> BYE
                    </div>
                </div>
            `;
        }

        const isWinner1 = m.winner === m.player1;
        const isWinner2 = m.winner === m.player2;
        const p1Score = m.player1_score !== null ? m.player1_score : '';
        const p2Score = m.player2_score !== null ? m.player2_score : '';
        
        // Determine border color based on state
        let borderColor = '#333';
        if (m.winner) borderColor = '#555'; // Completed
        
        return `
            <div class="bracket-match-card" style="background:#111; border:1px solid ${borderColor}; border-radius:6px; overflow:hidden; min-width:240px; box-shadow:0 4px 15px rgba(0,0,0,0.3); position:relative;">
                <!-- Player 1 -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid #222; position:relative; ${isWinner1 ? 'background:rgba(255,215,0,0.1);' : ''}">
                    ${isWinner1 ? '<div style="position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--sub-gold);"></div>' : ''}
                    <span style="color:${isWinner1 ? '#fff' : '#888'}; font-weight:${isWinner1 ? 'bold' : 'normal'}; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; font-family:var(--sub-name-font); padding-left:${isWinner1 ? '6px' : '0'}; text-transform:uppercase; letter-spacing:0.5px;">${m.player1}</span>
                    <span style="color:${isWinner1 ? 'var(--sub-gold)' : '#555'}; font-family:'Russo One'; font-size:1.1rem; text-shadow:${isWinner1 ? '0 0 10px rgba(255,215,0,0.3)' : 'none'};">${p1Score}</span>
                </div>
                <!-- Player 2 -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; position:relative; ${isWinner2 ? 'background:rgba(255,215,0,0.1);' : ''}">
                    ${isWinner2 ? '<div style="position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--sub-gold);"></div>' : ''}
                    <span style="color:${isWinner2 ? '#fff' : '#888'}; font-weight:${isWinner2 ? 'bold' : 'normal'}; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; font-family:var(--sub-name-font); padding-left:${isWinner2 ? '6px' : '0'}; text-transform:uppercase; letter-spacing:0.5px;">${m.player2}</span>
                    <span style="color:${isWinner2 ? 'var(--sub-gold)' : '#555'}; font-family:'Russo One'; font-size:1.1rem; text-shadow:${isWinner2 ? '0 0 10px rgba(255,215,0,0.3)' : 'none'};">${p2Score}</span>
                </div>
            </div>
        `;
    };

    // Helper for empty slot
    const renderEmpty = () => `
        <div style="background:rgba(255,255,255,0.03); border:1px dashed #333; border-radius:6px; height:86px; min-width:240px; display:flex; align-items:center; justify-content:center;">
            <span style="color:#444; font-size:0.75rem; letter-spacing:2px; font-family:var(--sub-name-font); font-weight:bold;">TBD</span>
        </div>
    `;

    for (let r = 0; r < totalRounds; r++) {
        const roundCapacity = nextPow2 / Math.pow(2, r + 1);
        let matchesInRound = roundBuckets[r] || [];
        
        // Filter out Bronze match from the final round
        if (r === totalRounds - 1 && r > 0) {
            try {
                const prevRoundMatches = roundBuckets[r-1] || [];
                const prevRoundWinners = new Set(prevRoundMatches.map(m => m.winner).filter(w => w));
                const prevRoundLosers = new Set();
                
                prevRoundMatches.forEach(m => {
                    if (m.winner) {
                        prevRoundLosers.add(m.player1 === m.winner ? m.player2 : m.player1);
                    }
                });
                
                if (prevRoundWinners.size > 0) {
                    // Find the match where players are winners (or byes) and NOT losers
                    let finalMatch = matchesInRound.find(m => {
                        if (!m.player1 || !m.player2) return false;
                        const p1IsWinner = prevRoundWinners.has(m.player1);
                        const p2IsWinner = prevRoundWinners.has(m.player2);
                        const p1IsLoser = prevRoundLosers.has(m.player1);
                        const p2IsLoser = prevRoundLosers.has(m.player2);
                        return (p1IsWinner || p2IsWinner) && !p1IsLoser && !p2IsLoser;
                    });

                    // If no active final match found, but we have winners, create a placeholder
                    if (!finalMatch) {
                        const winners = Array.from(prevRoundWinners);
                        if (winners.length >= 1) {
                            finalMatch = {
                                player1: winners[0],
                                player2: winners[1] || 'TBD',
                                player1_score: null,
                                player2_score: null,
                                winner: null
                            };
                        }
                    }

                    matchesInRound = finalMatch ? [finalMatch] : [];
                }
            } catch (e) {
                console.warn("Error filtering final round:", e);
            }
        }
        
        let colTitle = `ROUND ${r + 1}`;
        if (r === totalRounds - 1) colTitle = "FINALS";
        else if (r === totalRounds - 2) colTitle = "SEMI FINALS";
        else if (r === totalRounds - 3) colTitle = "QUARTER FINALS";
        
        let columnContent = '';
        
        for (let i = 0; i < roundCapacity; i++) {
            const match = matchesInRound[i];
            if (match) {
                columnContent += renderBox(match);
            } else {
                columnContent += renderEmpty();
            }
        }

        html += `
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div style="text-align:center; color:#555; font-size:0.75rem; margin-bottom:5px; font-family:var(--sub-name-font); letter-spacing:2px; text-transform:uppercase;">${colTitle}</div>
                <div style="display:flex; flex-direction:column; gap:15px; justify-content:space-around; flex:1;">
                    ${columnContent}
                </div>
            </div>
        `;
    }
    
    html += '</div>';

    return html;
}

// Wrap the output in SafeString to prevent double-escaping
function renderLiveBracketHtmlSafe(t) {
    return unsafeHTML(renderLiveBracketHtml(t));
}

/**
 * Show live event view
 */
function showLiveEventView(event, tournaments, playerMap = {}) {
    const startDate = new Date(event.start_datetime);
    const dateStr = startDate.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    // Helper to render podium card in live view
    const renderLivePodiumCard = (name, rankIcon, color, place) => {
        if (!name) return '';
        // Case-insensitive lookup from the map we fetched
        const p = playerMap[name.toLowerCase()] || { username: name, elo: '-', country: null, avatar_url: null };
        const flag = p.country ? p.country.toLowerCase() : 'fi';
        
        const avatarHtml = p.avatar_url 
            ? `<img src="${p.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">`
            : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #151515; color: #333; font-size: 2.5rem;"><i class="fa fa-user"></i></div>`;

        // Slightly smaller card for live view grid
        return `
            <div data-username="${p.username}" style="cursor: pointer; display:flex; flex-direction:column; align-items:center; margin: 0 5px; position: relative; z-index: ${4-place}; ${place === 1 ? 'transform: scale(1.1); margin-bottom: 10px;' : ''}">
                <div style="font-size: 1.5rem; margin-bottom: 5px;">${rankIcon}</div>
                
                <div style="width: 100px; height: 160px; background: #0a0a0a; border: 2px solid ${color}; border-radius: 6px; position: relative; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column;">
                    <!-- Header -->
                    <div style="background: ${color}; color: #000; padding: 2px 0; text-align: center; font-family: var(--sub-name-font); font-weight: bold; font-size: 0.5rem; letter-spacing: 1px;">
                        ${place === 1 ? 'WINNER' : (place === 2 ? '2ND' : '3RD')}
                    </div>
                    
                    <!-- Image -->
                    <div style="flex: 1; position: relative; overflow: hidden; background: #151515;">
                        ${avatarHtml}
                        <!-- Gradient Overlay for text readability -->
                        <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 60%; background: linear-gradient(to top, #000 0%, transparent 100%);"></div>
                    </div>
                    
                    <!-- Info -->
                    <div style="position: absolute; bottom: 0; left: 0; width: 100%; padding: 8px 4px; box-sizing: border-box; text-align: center;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 3px; margin-bottom: 1px;">
                            <img src="https://flagcdn.com/w40/${flag}.png" style="height: 8px; border-radius: 1px;">
                            <div style="color: #fff; font-family: var(--sub-name-font); font-size: 0.65rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;">
                                ${p.username}
                            </div>
                        </div>
                        <div style="color: ${color}; font-family: 'Russo One'; font-size: 0.9rem;">
                            ${p.elo}
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const content = document.getElementById('live-content') || document.getElementById('content') || document.body;
    
    // Inject styles for live view
    const liveStyles = `
        <style>
            /* Use local fonts defined in style.css */
            
            @media (min-width: 1200px) {
                .live-qr-code { display: block !important; }
            }
            
            @keyframes pulse-live-badge {
                0% { box-shadow: 0 0 0 0 rgba(227, 6, 19, 0.7); }
                70% { box-shadow: 0 0 0 8px rgba(227, 6, 19, 0); }
                100% { box-shadow: 0 0 0 0 rgba(227, 6, 19, 0); }
            }
            
            .live-badge-pulse {
                animation: pulse-live-badge 2s infinite;
            }
            
            .glass-panel {
                background: var(--sub-surface, rgba(16, 16, 16, 0.95));
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--sub-border, rgba(255, 255, 255, 0.08));
                box-shadow: var(--sub-shadow, 0 20px 50px rgba(0, 0, 0, 0.9));
                border-radius: var(--sub-radius, 2px);
            }
            
            .bracket-match-card {
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                background: #141414; /* Match container bg */
                border-radius: var(--sub-radius, 2px);
            }
            
            .bracket-match-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(0,0,0,0.4);
                border-color: var(--sub-gold, #FFD700) !important;
            }

        /* Scrollbar styling for live view */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #0a0a0a; 
        }
        ::-webkit-scrollbar-thumb {
            background: #333; 
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #555; 
        }

        /* Ticker Styles */
        .live-ticker {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(10, 10, 10, 0.98);
            border-top: 1px solid var(--sub-border);
            padding: 12px 0;
            overflow: hidden;
            white-space: nowrap;
            z-index: 20001;
            backdrop-filter: blur(10px);
        }
        .ticker-content {
            display: inline-block;
            white-space: nowrap;
            animation: ticker 60s linear infinite;
            padding-left: 100%;
            font-family: var(--sub-name-font);
            font-size: 0.9rem;
            color: #ccc;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        @keyframes ticker {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-100%, 0, 0); }
        }
        </style>
    `;

    content.innerHTML = liveStyles + `
        <div style="max-width:1600px; margin:0 auto; padding:20px 20px 80px 20px; font-family: var(--sub-body-font); min-height: 100vh;">
            <!-- Broadcast Header -->
            <div class="glass-panel" style="text-align:center; margin-bottom:30px; padding:40px; position: relative; overflow: hidden;">
                
                <!-- Background Glow -->
                <div style="position:absolute; top:-50%; left:50%; transform:translateX(-50%); width:60%; height:200%; background:radial-gradient(circle, rgba(227,6,19,0.1) 0%, transparent 70%); pointer-events:none;"></div>

                <!-- QR Code (Desktop Only) -->
                <div class="live-qr-code" style="position:absolute; top:30px; left:30px; background:#fff; padding:8px; border-radius:8px; box-shadow:0 0 20px rgba(0,0,0,0.5); display:none; z-index:100;">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.href)}" style="width:90px; height:90px; display:block;">
                    <div style="color:#000; font-size:0.65rem; font-weight:bold; text-align:center; margin-top:5px; font-family:var(--sub-name-font); letter-spacing:1px;">SCAN TO FOLLOW</div>
                </div>

                <button onclick="closeLiveView()" style="position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.05); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:50%; width:40px; height:40px; cursor:pointer; z-index:100; font-size:1.2rem; transition:all 0.2s; display:flex; align-items:center; justify-content:center;" onmouseover="this.style.background='var(--sub-red)'; this.style.borderColor='var(--sub-red)';" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(255,255,255,0.1)';">
                    <i class="fa fa-times"></i>
                </button>

                <img src="logo.png" alt="Subsoccer" style="height: 50px; width: auto; margin-bottom: 25px; filter: drop-shadow(0 0 15px rgba(0,0,0,0.8));">

                ${event.brand_logo_url ? `
                    <div style="background: rgba(255,255,255,0.05); display: inline-block; padding: 10px 25px; border-radius: var(--sub-radius); margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                        <img src="${event.brand_logo_url}" style="max-height:70px; width:auto; display:block;">
                    </div>
                ` : ''}

                <h1 class="sub-heading-premium" style="font-size:3.5rem; margin-bottom:15px; line-height: 1; text-transform:uppercase; letter-spacing:3px; text-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    ${event.event_name}
                </h1>
                
                <div style="display: flex; justify-content: center; gap: 30px; align-items: center; flex-wrap: wrap; margin-top: 15px;">
                    <div style="font-size:1rem; color:#ccc; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; display:flex; align-items:center; gap:10px;">
                        <i class="fa fa-calendar" style="color: var(--sub-gold);"></i> ${dateStr}
                    </div>
                    ${event.location ? `
                        <div style="font-size:1rem; color:#ccc; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; display:flex; align-items:center; gap:10px;">
                            <i class="fa fa-map-marker-alt" style="color: var(--sub-red);"></i> ${event.location}
                        </div>
                    ` : ''}
                </div>

                <div style="margin-top:25px; display: flex; justify-content: center; gap: 15px;">
                    <div class="sub-badge-live live-badge-pulse" style="font-size: 0.8rem; padding: 8px 20px; border-radius: 4px; letter-spacing: 2px; background:var(--sub-red); color:#fff; font-weight:bold; display:flex; align-items:center; gap:10px; box-shadow: 0 0 20px rgba(227,6,19,0.4);">
                        <i class="fa fa-broadcast-tower"></i> LIVE BROADCAST
                    </div>
                </div>
            </div>
            
            <!-- Tournament Grid -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(450px, 1fr)); gap:30px;">
                ${tournaments.map(t => {
        // SAFETY CHECK: Skip broken tournaments to prevent Live View crash
        try {
        const tDate = new Date(t.start_datetime);
        const timeStr = tDate.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const participantCount = t.computed_participant_count || 0;

        return `
                        <div class="glass-panel" style="border-top: 4px solid ${t.status === 'completed' ? 'var(--sub-gold)' : t.status === 'ongoing' ? 'var(--sub-red)' : '#333'}; position: relative; display: flex; flex-direction: column; padding: 30px; height:100%;">
                            
                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:25px;">
                                <div style="flex: 1;">
                                    <div style="font-size:0.75rem; color:var(--sub-gold); font-family: var(--sub-name-font); letter-spacing: 2px; margin-bottom: 8px; text-transform: uppercase;">
                                        ${t.game?.game_name || 'Tournament'}
                                    </div>
                                    <h2 style="font-family:var(--sub-name-font); font-size:1.6rem; margin:0; line-height: 1.2; color:#fff; letter-spacing:1px;">
                                        ${t.tournament_name || 'Unofficial Match'}
                                    </h2>
                                </div>
                                <div style="text-align:right; margin-left: 20px;">
                                    ${t.status === 'ongoing' ? `
                                        <div style="color:var(--sub-red); font-size:0.7rem; font-weight:bold; letter-spacing:1px; animation:pulse 1.5s infinite;">● LIVE</div>
                                    ` : `
                                        <div style="font-size:0.7rem; color:${t.status === 'completed' ? 'var(--sub-gold)' : '#666'}; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; font-weight: bold;">
                                            ${t.status === 'completed' ? 'FINISHED' : 'SCHEDULED'}
                                        </div>
                                    `}
                                    <div style="margin-top:5px; font-size:1.4rem; color:#fff; font-family: var(--sub-name-font); font-weight:bold;">
                                        ${timeStr}
                                    </div>
                                </div>
                            </div>

                            <div style="height:1px; background:rgba(255,255,255,0.1); margin-bottom:25px;"></div>
                            
                            <div style="flex: 1;">
                                ${t.status === 'completed' || t.status === 'ongoing' ? `
                                    ${t.status === 'completed' ? `
                                        <div style="background:rgba(255, 255, 255, 0.02); border:1px solid #333; border-radius:var(--sub-radius); padding:30px; text-align:center; margin-bottom: 30px;">
                                            <div style="color:#888; font-family:var(--sub-name-font); font-size:0.75rem; letter-spacing:4px; margin-bottom:20px; text-transform:uppercase;">Tournament Podium</div>
                                            <div style="display:flex; justify-content:center; align-items:flex-end; gap:20px;">
                                                ${renderLivePodiumCard(t.second_place_name, '🥈', '#C0C0C0', 2)}
                                                ${renderLivePodiumCard(t.winner_name, '🏆', '#FFD700', 1)}
                                                ${renderLivePodiumCard(t.third_place_name, '🥉', '#CD7F32', 3)}
                                            </div>
                                        </div>
                                    ` : ''}
                                    
                                    <div style="margin-bottom:20px;">
                                        ${renderLiveBracketHtmlSafe(t)}
                                    </div>
                                    
                                    ${t.status === 'ongoing' ? `
                                        <div style="background:rgba(193, 39, 45, 0.05); border:1px solid rgba(193, 39, 45, 0.2); border-radius:var(--sub-radius); padding:25px; text-align:center;">
                                        <div class="sub-badge-live" style="margin-bottom: 20px;">MATCH IN PROGRESS</div>
                                        <div style="color:#fff; font-size:1.4rem; font-family: var(--sub-name-font); letter-spacing: 1px;">
                                            ${participantCount} PLAYERS COMPETING
                                        </div>
                                        <div style="font-size:0.9rem; color:#888; margin-top:15px; font-family: var(--sub-name-font); letter-spacing: 1px;">
                                            Live results updating automatically
                                        </div>
                                        </div>
                                    ` : ''}
                                ` : `
                                    <div style="background:rgba(255, 255, 255, 0.02); border:1px solid var(--sub-border); border-radius:var(--sub-radius); padding:50px 20px; text-align:center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                                        <div style="color:var(--sub-gold); font-size:1.8rem; font-family: var(--sub-name-font); margin-bottom: 15px;">PRE-MATCH</div>
                                        <div style="color:#666; font-size:1.1rem; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase;">
                                            Registration open: ${participantCount} players joined
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
        } catch (err) {
            console.warn("Skipping broken tournament in Live View:", t.id, err);
            return '';
        }
    }).join('')}
            </div>
            
            ${tournaments.length === 0 ? `
                <div style="text-align:center; padding:120px 20px; color:#444; background: var(--sub-charcoal); border: 1px dashed var(--sub-border); border-radius: var(--sub-radius);">
                    <i class="fa fa-trophy" style="font-size:6rem; margin-bottom:40px; opacity:0.1;"></i>
                    <h3 class="sub-heading-premium" style="font-size: 2.5rem; opacity: 0.3;">Live Broadcaster standby</h3>
                    <p style="font-size: 1.4rem; opacity: 0.5;">Awaiting tournament schedule from organizer</p>
                </div>
            ` : ''
        }

            <!-- Footer -->
            <div style="text-align:center; margin-top:100px; padding-top:40px; border-top: 1px solid var(--sub-border); opacity: 0.5;">
                <img src="logo.png" style="height: 30px; width: auto; margin-bottom: 15px; filter: grayscale(1);">
                <div style="font-family: var(--sub-name-font); color: #666; font-size: 0.8rem; letter-spacing: 3px;">OFFICIAL TOURNAMENT BROADCAST SYSTEM</div>
            </div>
            
            <!-- Ticker -->
            <div class="live-ticker">
                <div class="ticker-content">
                    ${tournaments.length > 0 ? 
                        tournaments.map(t => `
                            <span style="margin-right:50px;">🏆 ${t.tournament_name || 'Tournament'}: ${t.status === 'completed' ? `WINNER: ${t.winner_name}` : 'LIVE NOW'}</span>
                        `).join('') 
                        : 'WELCOME TO SUBSOCCER LIVE EVENTS • FOLLOW THE ACTION • PLAY FAIR • HAVE FUN'
                    }
                    <span style="margin-right:50px;">• POWERED BY SUBSOCCER •</span>
                </div>
            </div>
        </div>
            `;
}

/**
 * Close live event view
 */
export function closeLiveView() {
    const content = document.getElementById('live-content');
    if (content) content.remove();
    
    document.body.classList.remove('live-mode');
    
    if (window.liveEventRefreshInterval) {
        clearInterval(window.liveEventRefreshInterval);
        window.liveEventRefreshInterval = null;
    }
    
    // Clean up URL
    const url = new URL(window.location);
    url.searchParams.delete('live');
    window.history.replaceState({}, '', url);
    
    const appContent = document.getElementById('app-content');
    const navTabs = document.getElementById('nav-tabs');
    const header = document.querySelector('header');
    const menuBtn = document.getElementById('menu-toggle-btn');
    const authPage = document.getElementById('auth-page');

    // Restore Header
    if (header) header.style.display = '';
    if (menuBtn) menuBtn.style.display = 'block';

    // Check login state to decide what to show
    if (state.user) {
        // User is logged in (or guest) -> Show App
        if (appContent) {
            appContent.style.display = 'flex';
            appContent.classList.remove('fade-in');
            void appContent.offsetWidth; 
            appContent.classList.add('fade-in');
        }
        if (navTabs) navTabs.style.setProperty('display', 'flex', 'important');
        if (authPage) authPage.style.display = 'none';
    } else {
        // User not logged in -> Show Auth
        if (authPage) authPage.style.display = 'flex';
        if (appContent) appContent.style.display = 'none';
        if (navTabs) navTabs.style.display = 'none';
    }
}

// Check for live event URL parameter on page load
// Wrap in DOMContentLoaded to ensure elements exist
export function checkLiveEventParam() {
    if (window.location.search.includes('live=')) {
        const urlParams = new URLSearchParams(window.location.search);
        const liveEventId = urlParams.get('live');
        if (liveEventId) {

            // Activate live mode via CSS class
            document.body.classList.add('live-mode');

            // Create live content container if it doesn't exist
            let liveContainer = document.getElementById('live-content');
            if (!liveContainer) {
                liveContainer = document.createElement('div');
                liveContainer.id = 'live-content';
                liveContainer.style.cssText = 'width:100%; min-height:100vh; padding:20px; box-sizing:border-box; background:#000; color:#fff;';
                document.body.appendChild(liveContainer);
            }

            // Explicitly ensure other modals/overlays are closed
            const overlays = ['.modal-overlay', '#victory-overlay', '#loading-overlay'];
            overlays.forEach(selector => {
                const el = document.querySelector(selector);
                if (el) el.style.display = 'none';
            });

            // Load live view content
            viewLiveEvent(liveEventId);
        }
    }
}

// Global bindings
window.shareLiveEventLink = shareLiveEventLink;
window.viewLiveEvent = viewLiveEvent;
window.closeLiveView = closeLiveView;