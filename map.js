import { _supabase, state } from './config.js';
import { showNotification, showPage } from './ui-utils.js';

/**
 * ============================================================
 * MAP & LOCATION SERVICES
 * ============================================================
 */

export function initGameMap() {
    if (state.gameMap) return; // Prevent double initialization
    if (!document.getElementById('map-picker')) return;
    state.gameMap = L.map('map-picker').setView([60.1699, 24.9384], 10);
    state.gameMap.attributionControl.setPrefix(false); // Remove Leaflet prefix
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }).addTo(state.gameMap);
    state.gameMap.on('click', async function (e) {
        setMapLocation(e.latlng.lat, e.latlng.lng);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`);
            const data = await res.json();
            if (data && data.display_name) document.getElementById('game-address-input').value = data.display_name;
        } catch (e) { }
    });
}

export function setMapLocation(lat, lng, name) {
    state.selLat = lat; state.selLng = lng;
    if (!state.gameMap || typeof state.gameMap.addLayer !== 'function') {
        console.warn("setMapLocation: Map not ready or invalid");
        return;
    }
    if (state.gameMarker) state.gameMap.removeLayer(state.gameMarker);
    state.gameMarker = L.marker([lat, lng]).addTo(state.gameMap);
    state.gameMap.setView([lat, lng], 13);
    const txt = name ? `${name} (${lat.toFixed(2)}, ${lng.toFixed(2)})` : `Selected: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    document.getElementById('location-confirm').innerText = "Location set to " + txt;
}

export async function fetchPublicGamesMap() {
    const mapContainer = document.getElementById('section-map');

    if (!state.publicMap) {
        state.publicMap = L.map('public-game-map').setView([60.1699, 24.9384], 11);
        state.publicMap.attributionControl.setPrefix(false); // Remove Leaflet prefix
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(state.publicMap);

        // Initialize Cluster Group
        state.clusterGroup = L.markerClusterGroup({
            showCoverageOnHover: false,
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true
        });
        state.publicMap.addLayer(state.clusterGroup);

        // Update nearest list when map moves
        state.publicMap.on('moveend', () => {
            const center = state.publicMap.getCenter();
            updateNearestList(center.lat, center.lng);
        });

        // Setup Fullscreen Toggle
        const fullscreenBtn = document.getElementById('btn-map-fullscreen');
        const mapWrapper = document.getElementById('map-wrapper');
        if (fullscreenBtn && mapWrapper) {
            fullscreenBtn.addEventListener('click', () => {
                mapWrapper.classList.toggle('map-fullscreen');
                
                // Toggle Icon & Fix positioning
                const icon = fullscreenBtn.querySelector('i');
                if (mapWrapper.classList.contains('map-fullscreen')) {
                    icon.classList.remove('fa-expand');
                    icon.classList.add('fa-compress');
                    document.body.style.overflow = 'hidden'; 
                    // Force extremely high z-index to stay above leaflet
                    fullscreenBtn.style.zIndex = '20000';
                    fullscreenBtn.style.bottom = '100px';
                } else {
                    icon.classList.remove('fa-compress');
                    icon.classList.add('fa-expand');
                    document.body.style.overflow = '';
                    
                    // Revert z-index and bottom
                    fullscreenBtn.style.zIndex = '20000';
                    fullscreenBtn.style.bottom = '20px';
                }
                
                setTimeout(() => state.publicMap.invalidateSize(), 350);
            });
        }

    } else {
        setTimeout(() => state.publicMap.invalidateSize(), 200);
    }

    // 1. Fetch Public Games AND User's own Games (even if private)
    let query = _supabase.from('games').select('*');
    let fetchedGames = [];

    if (state.user && state.user.id !== 'guest') {
        // Fetch all public games OR games owned by the current user
        const { data: qGames, error } = await _supabase
            .from('games')
            .select('*')
            .or(`is_public.eq.true,owner_id.eq.${state.user.id}`);
        fetchedGames = qGames || [];
    } else {
        // Guest only sees public games
        const { data: qGames } = await _supabase.from('games').select('*').eq('is_public', true);
        fetchedGames = qGames || [];
    }

    // 2. Fetch Upcoming/Ongoing Tournaments linked to games
    const { data: tournaments } = await _supabase
        .from('tournament_history')
        .select('*, games!inner(*)')
        .in('status', ['scheduled', 'ongoing'])
        .gt('end_datetime', new Date().toISOString());

    // 3. Fetch Active Tables Today (from matches and public_tracking)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Use a try-catch for these optional active tracking queries so they don't break the main map if columns are missing
    let activeGameIds = new Set();
    let activeSerials = new Set();
    let scanLocations = new Set();

    try {
        const [matchesReq, trackingReq] = await Promise.all([
            // Changed from select('game_id') to select('id') to avoid 400 Bad Request since matches table lacks game_id
            _supabase.from('matches').select('id, tournament_id').gte('created_at', todayIso),
            // The public_tracking table actually uses client_time, not created_at
            _supabase.from('public_tracking').select('game_code, event_type, location').gte('client_time', todayIso)
        ]);

        if (matchesReq.data) {
            // No game_id exists on matches table yet, so this array just validates if tournaments are active
        }
        if (trackingReq.data) {
            trackingReq.data.forEach(t => {
                if (t.event_type === 'game_finished' && t.game_code && t.game_code !== 'PUBLIC-APP') {
                    activeSerials.add(t.game_code.toUpperCase());
                }
                if (t.location && t.location.includes('/')) {
                    scanLocations.add(t.location);
                }
            });
        }
    } catch (metricErr) {
        console.warn("Could not fetch active table metrics for map (schema mismatch)", metricErr);
    }

    // Store data for filtering
    state.mapData = {
        games: fetchedGames,
        tournaments: tournaments || [],
        activeGameIds,
        activeSerials,
        scanLocations: Array.from(scanLocations)
    };

    if (state.mapData.games.length > 0 || state.mapData.tournaments.length > 0) {
        // Clear existing clusters
        state.clusterGroup.clearLayers();

        if (mapContainer && !document.getElementById('map-locate-me')) {
            const locateBtn = document.createElement('button');
            locateBtn.id = 'map-locate-me';
            locateBtn.className = 'map-locate-btn';
            locateBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            locateBtn.onclick = () => {
                state.publicMap.locate({ setView: true, maxZoom: 14 });
            };
            mapContainer.style.position = 'relative';
            mapContainer.appendChild(locateBtn);
        }

        // Initial Render (Show All Tables so new users see their own immediately)
        filterMap('all');

        // Initial Nearest List (based on map center)
        const center = state.publicMap.getCenter();
        updateNearestList(center.lat, center.lng);
    }
}

export function filterMap(type) {
    if (!state.clusterGroup || !state.mapData) return;

    // Update UI buttons
    document.querySelectorAll('.map-filter-btn').forEach(btn => {
        const btnFilter = btn.getAttribute('data-filter');
        if (btnFilter === type) {
            btn.classList.add('active');
            if (type === 'verified') {
                btn.style.background = 'rgba(227, 6, 19, 0.1)';
                btn.style.borderColor = 'var(--sub-red)';
                btn.style.color = 'var(--sub-red)';
            } else {
                btn.style.background = '#222';
                btn.style.color = '#fff';
            }
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.borderColor = '#444';
            btn.style.color = '#888';
        }
    });

    state.clusterGroup.clearLayers();
    state.mapMarkers = {}; // Cache markers to allow external triggering
    const { games, tournaments } = state.mapData;

    // Define global marker trigger handler
    window.triggerMarkerClick = (markerId) => {
        if (state.mapMarkers && state.mapMarkers[markerId]) {
            // Un-cluster and zoom down slightly if we're bundled before firing
            const targetZm = state.publicMap.getZoom() > 13 ? state.publicMap.getZoom() : 13;
            if (state.publicMap.getZoom() < targetZm) {
                state.publicMap.setZoom(targetZm);
            }
            // Add a small delay so the cluster breaks apart before clicking the sub-marker
            setTimeout(() => {
                state.mapMarkers[markerId].fire('click');
            }, 100);
        }
    };

    // Render Games (if type is 'all' or 'verified')
    if (type === 'all' || type === 'verified') {
        games.forEach(g => {
            // Filter verified if requested
            if (type === 'verified' && !g.verified) return;

            // Stealth mode completely removes the table from the visual map
            if (g.privacy_mode === 'stealth') return;

            if (g.latitude && g.longitude) {
                let markerLat = g.latitude;
                let markerLng = g.longitude;

                // City-Level Private Blur Logic (Math.round to nearest 0.05 degrees ~ 5km)
                // Defaulting legacy non-public tables to blur behavior as well
                if (g.privacy_mode === 'private' || (!g.is_public && !g.privacy_mode)) {
                    markerLat = Math.round(markerLat * 20) / 20;
                    markerLng = Math.round(markerLng * 20) / 20;
                }

                const isActiveToday = (state.mapData.activeGameIds && state.mapData.activeGameIds.has(g.id)) ||
                    (state.mapData.activeSerials && state.mapData.activeSerials.has((g.serial_number || '').toUpperCase()));

                // Reverted back to dark blue for unverified/private for better map contrast
                let iconColor = isActiveToday ? '#FFFF00' : (g.is_public ? (g.verified ? 'var(--sub-red)' : '#ff5722') : '#0033cc');
                const verifiedClass = g.verified && g.is_public && !isActiveToday ? 'verified-marker-pulse' : '';
                
                // Determine pulse animation based on color
                let pulseName = 'bluePulse';
                if (isActiveToday) pulseName = 'yellowPulse';
                else if (g.is_public && g.verified) pulseName = 'markerPulse';
                else if (g.is_public) pulseName = 'orangePulse';

                // Add a strong LED-like glow and pulsing ring
                const glowStyle = `animation: ${pulseName} 2.0s infinite; box-shadow: 0 0 15px ${iconColor};`;

                const subsoccerIcon = L.divIcon({
                    className: `custom-div-icon ${verifiedClass}`,
                    html: `<div style='background-color:${iconColor}; width:18px; height:18px; border-radius:50%; border:2px solid rgba(255,255,255,0.9); ${glowStyle}'></div>`,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                });

                let popupContent = `
                    <div style="text-align:center; padding-bottom: 20px;">
                `;
                if (isActiveToday) {
                    popupContent += `<div style="display:inline-block; background:#FFFF00; color:#000; font-family:var(--sub-name-font); font-size:0.7rem; padding:4px 10px; letter-spacing:1px; border-radius:15px; text-transform:uppercase; margin-bottom:15px; animation: markerPulse 1.5s infinite; font-weight:bold;">⚡ ACTIVE TODAY!</div>`;
                } else if (g.verified) {
                    popupContent += `
                        <div style="display:inline-block; background:var(--sub-red); color:#fff; font-family:var(--sub-name-font); font-size:0.7rem; padding:4px 10px; letter-spacing:1px; border-radius:15px; text-transform:uppercase; margin-bottom:15px; box-shadow:0 0 10px rgba(227,6,19,0.5);">
                            <i class="fa-solid fa-crown" style="margin-right:5px;"></i> VERIFIED GAME
                        </div>
                    `;
                } else if (!g.is_public || g.privacy_mode === 'private') {
                    popupContent += `<div style="display:inline-block; border: 1px dashed #4a9eff; color:#4a9eff; font-size:0.65rem; padding:4px 10px; border-radius:15px; font-weight:bold; margin-bottom:15px; font-family:var(--sub-name-font); text-transform:uppercase;"><i class="fa fa-mask"></i> CITY-LEVEL PRIVATE</div>`;
                }

                popupContent += `
                    <h2 style="font-size:1.8rem; text-transform:uppercase; color:#fff; margin-bottom:10px; font-family:var(--sub-name-font); letter-spacing: 1px;">
                        ${g.privacy_mode === 'private' ? 'HIDDEN VENUE' : g.game_name}
                    </h2>
                    <div style="color:#aaa; font-size:0.9rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:25px; line-height: 1.5;">
                        <i class="fa-solid fa-location-dot" style="color:${iconColor}; margin-right:8px; font-size: 1.1rem;"></i> 
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        ${g.serial_number ? `<button class="btn-dark" onclick="window.openPublicVenueCardModal('${g.id}')" style="width: 100%; box-sizing: border-box; border:1px solid #333; padding:15px 0; background:#111; color:#aaa; font-family:'Russo One', sans-serif; font-size:1rem; border-radius:8px; letter-spacing:1px; text-align:center;"><i class="fa-solid fa-id-card" style="margin-right:10px;"></i> VIEW PRO CARD</button>` : ''}
                        ${g.privacy_mode !== 'private' ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${markerLat},${markerLng}" target="_blank" style="display:inline-block; width: 100%; box-sizing: border-box; border:none; padding:15px 0; background:var(--sub-gold); color:#000; font-family:'Russo One', sans-serif; text-decoration:none; font-size:1rem; border-radius:8px; letter-spacing:1px; text-align:center; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);"><i class="fa-solid fa-diamond-turn-right" style="margin-right:10px;"></i> GET DIRECTIONS</a>` : ''}
                    </div>
                `;

                const marker = L.marker([markerLat, markerLng], { icon: subsoccerIcon })
                    .on('click', () => {
                        const content = document.getElementById('venue-card-content');
                        if(content) {
                            const statsContainerId = `stats-container-${g.id}`;
                            const fullHTML = popupContent + `
                                <div id="${statsContainerId}" style="margin-top: 20px; background: #080808; border: 1px solid #222; border-radius: 8px; padding: 15px;">
                                    <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--sub-gold); font-size:1.5rem;"></i>
                                </div>
                            </div>`; // Closes the main wrapper right here
                            
                            content.innerHTML = fullHTML;
                            document.getElementById('venue-card-modal').classList.add('active');
                            // Gently fly to the marker slightly above center so the bottom sheet doesn't cover it
                            state.publicMap.flyTo([markerLat - 0.005, markerLng], state.publicMap.getZoom() > 13 ? state.publicMap.getZoom() : 13, { animate: true, duration: 0.5 });
                            
                            // Fetch real backend data!
                            if (g.serial_number) {
                                _supabase.from('public_tracking')
                                    .select('*', { count: 'exact', head: true })
                                    .eq('game_code', g.serial_number.toUpperCase())
                                    .then(({ count, error }) => {
                                        const statsDiv = document.getElementById(statsContainerId);
                                        if (statsDiv) {
                                            const totalGames = count || 0;
                                            statsDiv.innerHTML = `
                                                <div style="font-size: 0.7rem; color: #888; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px;">GAMES PLAYED HERE</div>
                                                <div style="font-family: 'Russo One', sans-serif; font-size: 2.2rem; color: var(--sub-gold); text-shadow: 0 0 15px rgba(255, 215, 0, 0.2); line-height:1;">${totalGames}</div>
                                            `;
                                        }
                                    });
                            } else {
                                const statsDiv = document.getElementById(statsContainerId);
                                if (statsDiv) {
                                    statsDiv.innerHTML = `
                                        <div style="font-size: 0.7rem; color: #888; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px;">GAMES PLAYED HERE</div>
                                        <div style="font-family: 'Russo One', sans-serif; font-size: 2.2rem; color: #444; line-height:1;">0</div>
                                    `;
                                }
                            }
                        }
                    });

                state.mapMarkers[g.id] = marker;
                state.clusterGroup.addLayer(marker);
            }
        });
    }

    // Render Tournaments (if type is 'all' or 'tournaments')
    if (type === 'all' || type === 'tournaments') {
        (tournaments || []).forEach(t => {
            const g = t.games;
            if (g && g.latitude && g.longitude) {
                const isLive = t.status === 'ongoing';
                const dateStr = new Date(t.start_datetime).toLocaleDateString();
                const timeStr = new Date(t.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Red pulsing icon for tournaments
                const tournamentIcon = L.divIcon({
                    className: `custom-div-icon`,
                    html: `<div style='background-color:var(--sub-red); width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow: 0 0 15px var(--sub-red); animation: markerPulse 1.5s infinite;'></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });

                const marker = L.marker([g.latitude, g.longitude], { icon: tournamentIcon })
                    .bindPopup(`<div style="min-width:180px;">
                        <div style="color:var(--sub-red); font-size:0.65rem; font-weight:bold; margin-bottom:4px; letter-spacing:1px; font-family: var(--sub-name-font);">
                            ${isLive ? '● LIVE TOURNAMENT' : '📅 UPCOMING TOURNAMENT'}
                        </div>
                        <b style="font-size:1.1rem; text-transform:uppercase; color:#fff; display:block; margin-bottom:5px; line-height:1.2; font-family: var(--sub-name-font);">
                            ${t.tournament_name}
                        </b>
                        <div style="color:#ccc; font-size:0.8rem; margin-bottom:8px; font-family: var(--sub-body-font);">
                            ${dateStr} @ ${timeStr}
                        </div>
                        <div style="color:#888; font-size:0.7rem; border-top:1px solid #333; padding-top:5px;">
                            <i class="fa-solid fa-location-dot"></i> ${g.game_name}
                        </div>
                    </div>`);
                state.mapMarkers[t.id] = marker;
                state.clusterGroup.addLayer(marker);
            }
        });
    }

    // Refresh the list below the map to reflect the new filter
    if (state.publicMap) {
        const center = state.publicMap.getCenter();
        updateNearestList(center.lat, center.lng);
    }

    // Render Anonymous Scans as Small Cyan Dots
    if ((type === 'all' || type === 'verified') && state.mapData.scanLocations) {
        state.mapData.scanLocations.forEach(async (tz) => {
            let city = tz.split('/').pop().replace(/_/g, ' ');
            if (!city) return;

            state.tzCache = state.tzCache || {};
            let coords = state.tzCache[tz];

            if (!coords) {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&city=${encodeURIComponent(city)}&limit=1`);
                    const data = await res.json();
                    if (data && data.length > 0) {
                        coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                        state.tzCache[tz] = coords;
                    }
                } catch (e) { }
            }

            if (coords && state.clusterGroup) {
                // Determine a slight offset so multiple cities don't overlap perfectly if they share the same timezone string perfectly
                // For timezone level granularity, it's fine.
                // Scan markers restored to cyan for lightning feel
                const scanIcon = L.divIcon({
                    className: `custom-div-icon`,
                    html: `<div style='background-color:#00FFCC; width:14px; height:14px; border-radius:50%; border:2px solid rgba(255,255,255,0.9); box-shadow: 0 0 15px #00FFCC; animation: bluePulse 1.5s infinite;'></div>`,
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                });
                const scanMarker = L.marker(coords, { icon: scanIcon })
                    .bindPopup(`<div style="color:#00FFCC; font-size:0.75rem; text-align:center; font-family:'Russo One'; text-transform:uppercase;">⚡ LIVE SCAN<br><span style="color:#fff; font-size:1.1rem; line-height:1.5;">${city}</span></div>`);
                state.clusterGroup.addLayer(scanMarker);
            }
        });
    }
}

export function flyToLocation(lat, lng) {
    if (state.publicMap) {
        state.publicMap.flyTo([lat, lng], 16);
    }
}

function updateNearestList(lat, lng) {
    const list = document.getElementById('nearest-games-list');
    if (!list || !state.mapData) return;

    const { games } = state.mapData;
    const activeFilter = document.querySelector('.map-filter-btn.active')?.getAttribute('data-filter') || 'all';

    let filteredGames = games;
    if (activeFilter === 'verified') {
        filteredGames = games.filter(g => g.verified);
    }

    // Calculate distances
    const withDist = filteredGames.map(g => {
        if (!g.latitude || !g.longitude) return null;
        const d = getDistanceFromLatLonInKm(lat, lng, g.latitude, g.longitude);
        return { ...g, distance: d };
    }).filter(g => g !== null);

    // Sort by distance
    withDist.sort((a, b) => a.distance - b.distance);

    const nearest = withDist.slice(0, 20);

    list.innerHTML = nearest.map(g => {
        const distDisplay = g.distance < 1 ?
            `${(g.distance * 1000).toFixed(0)} m` :
            `${g.distance.toFixed(1)} km`;

        const isVerified = g.verified;
        const isPrivate = !g.is_public;

        const borderStyle = isVerified ? 'border-left: 4px solid var(--sub-red); background: rgba(255, 255, 255, 0.03);' : (isPrivate ? 'border-left: 4px solid #4a9eff; background: rgba(255, 255, 255, 0.03);' : 'border-left: 4px solid #333;');
        const titleColor = isVerified ? '#fff' : (isPrivate ? '#4a9eff' : '#fff');
        const badge = isVerified ? '<span style="background:var(--sub-red); color:#fff; font-family:\'Russo One\'; font-size:0.55rem; padding:2px 4px; border-radius:2px; margin-right:5px; vertical-align:middle;">VERIFIED GAME</span>' : (isPrivate ? '<i class="fa-solid fa-lock" style="font-size:0.6rem; margin-right:4px;"></i>' : '');

        return `
            <div class="nearest-game-item" style="${borderStyle} padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border-radius:4px;" onclick="if(!event.target.closest('a')) { window.triggerMarkerClick('${g.id}'); }">
                <div style="flex-grow:1; cursor:pointer;">
                    <div style="font-family:'Russo One'; color:${titleColor}; font-size:0.95rem; margin-bottom:3px; text-transform:uppercase;">
                        ${badge}${g.game_name}
                    </div>
                    <div style="font-size:0.75rem; color:#ffffff; opacity:0.9;"><i class="fa-solid fa-location-dot" style="margin-right:4px; color:var(--sub-red);"></i>${g.location}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.8rem; font-weight:bold; color:#ccc; margin-bottom:3px;">${distDisplay}</div>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${g.latitude},${g.longitude}" target="_blank" data-action="external-link" style="color:var(--sub-red); font-size:1.1rem; padding:5px; display:inline-block;" title="Get Directions">
                        <i class="fa-solid fa-diamond-turn-right"></i>
                    </a>
                </div>
            </div>
        `;
    }).join('');
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

export async function searchLocation() {
    const q = document.getElementById('game-address-input').value;
    if (!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && data.length > 0) setMapLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name.split(',')[0]);
        else showNotification("Location not found", "error");
    } catch (e) { showNotification("Search error", "error"); }
}

export async function searchPublicMap() {
    const q = document.getElementById('public-map-search').value.trim().toLowerCase();
    if (!q) return;

    // 1. Native Search: Try to find a matching Subsoccer Venue or Tournament first!
    if (state.mapData) {
        const matchingGame = state.mapData.games?.find(g => 
            g.game_name?.toLowerCase().includes(q) || 
            (g.location && g.location.toLowerCase().includes(q))
        );
        if (matchingGame && matchingGame.id) {
            showNotification(`Found venue: ${matchingGame.game_name}`, "success");
            document.getElementById('public-map-search').value = '';
            // Blur the keyboard
            document.getElementById('public-map-search').blur();
            window.triggerMarkerClick(matchingGame.id);
            return; // Stop here, we found our table natively!
        }

        const matchingTour = state.mapData.tournaments?.find(t => 
            t.tournament_name?.toLowerCase().includes(q) || 
            t.name?.toLowerCase().includes(q)
        );
        if (matchingTour && matchingTour.id) {
            showNotification(`Found event: ${matchingTour.name || matchingTour.tournament_name}`, "success");
            document.getElementById('public-map-search').value = '';
            document.getElementById('public-map-search').blur();
            window.triggerMarkerClick(matchingTour.id);
            return;
        }
    }

    // 2. Global Fallback: Search for a City/Country using OpenStreetMap
    try {
        showNotification("Searching regions...", "info");
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            if (state.publicMap) {
                state.publicMap.flyTo([lat, lon], 12);
                showNotification(`Moved to ${data[0].display_name.split(',')[0]}`, "success");
                document.getElementById('public-map-search').value = '';
                document.getElementById('public-map-search').blur();
            }
        }
        else showNotification("Location not found", "error");
    } catch (e) { showNotification("Search error", "error"); }
}


// Globaalit kytkennät
window.initGameMap = initGameMap;
window.setMapLocation = setMapLocation;
window.fetchPublicGamesMap = fetchPublicGamesMap;
window.searchLocation = searchLocation;