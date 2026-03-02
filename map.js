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
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(state.publicMap);

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
    } else {
        setTimeout(() => state.publicMap.invalidateSize(), 200);
    }

    // 1. Fetch Public Games
    const { data: games } = await _supabase.from('games').select('*').eq('is_public', true);

    // 2. Fetch Upcoming/Ongoing Tournaments linked to games
    // We use !inner to ensure we only get tournaments that have a valid game link
    const { data: tournaments } = await _supabase
        .from('tournament_history')
        .select('*, games!inner(*)')
        .in('status', ['scheduled', 'ongoing'])
        .gt('end_datetime', new Date().toISOString());

    // Store data for filtering
    state.mapData = {
        games: games || [],
        tournaments: tournaments || []
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

        // Initial Render (All)
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
        if (btn.textContent.toLowerCase().includes(type) || (type === 'all' && btn.textContent === 'ALL')) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    state.clusterGroup.clearLayers();
    const { games, tournaments } = state.mapData;

    // Render Games (if type is 'all' or 'verified')
    if (type === 'all' || type === 'verified') {
        games.forEach(g => {
            // Filter verified if requested
            if (type === 'verified' && !g.verified) return;

            if (g.latitude && g.longitude) {
                const iconColor = g.verified ? 'var(--sub-gold)' : 'var(--sub-red)';
                const verifiedBadge = g.verified ? '<div style="color:var(--sub-gold); font-size:0.6rem; font-weight:bold; margin-bottom:4px;">⭐ VERIFIED TABLE</div>' : '';
                const verifiedClass = g.verified ? 'verified-marker-pulse' : '';

                const subsoccerIcon = L.divIcon({
                    className: `custom-div-icon ${verifiedClass}`,
                    html: `<div style='background-color:${iconColor}; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);'></div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });

                const marker = L.marker([g.latitude, g.longitude], { icon: subsoccerIcon })
                    .bindPopup(`<div style="min-width:160px;">
                        ${verifiedBadge}
                        <b style="font-size:1.1rem; text-transform:uppercase; color:#fff;">${g.game_name}</b>
                        <div style="color:#888; font-size:0.75rem; margin-top:8px; text-transform:uppercase; letter-spacing:1px;">
                            <i class="fa-solid fa-location-dot" style="color:var(--sub-red); margin-right:5px;"></i>${g.location}
                        </div>
                    </div>`);

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
                        <div style="color:var(--sub-red); font-size:0.65rem; font-weight:bold; margin-bottom:4px; letter-spacing:1px;">
                            ${isLive ? '● LIVE TOURNAMENT' : '📅 UPCOMING TOURNAMENT'}
                        </div>
                        <b style="font-size:1.1rem; text-transform:uppercase; color:#fff; display:block; margin-bottom:5px; line-height:1.2;">
                            ${t.tournament_name}
                        </b>
                        <div style="color:#ccc; font-size:0.8rem; margin-bottom:8px;">
                            ${dateStr} @ ${timeStr}
                        </div>
                        <div style="color:#888; font-size:0.7rem; border-top:1px solid #333; padding-top:5px;">
                            <i class="fa-solid fa-location-dot"></i> ${g.game_name}
                        </div>
                    </div>`);

                state.clusterGroup.addLayer(marker);
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

    // Calculate distances
    const withDist = games.map(g => {
        if (!g.latitude || !g.longitude) return null;
        const d = getDistanceFromLatLonInKm(lat, lng, g.latitude, g.longitude);
        return { ...g, distance: d };
    }).filter(g => g !== null);

    // Sort by distance
    withDist.sort((a, b) => a.distance - b.distance);

    // Take top 20
    const nearest = withDist.slice(0, 20);

    list.innerHTML = nearest.map(g => {
        const distDisplay = g.distance < 1 ?
            `${(g.distance * 1000).toFixed(0)} m` :
            `${g.distance.toFixed(1)} km`;

        const border = g.verified ? 'var(--sub-gold)' : '#333';
        const icon = g.verified ? '⭐' : '<i class="fa-solid fa-location-dot" style="color:#666;"></i>';

        return `
            <div class="nearest-game-item" style="border-left-color: ${border};" data-action="fly-to-location" data-lat="${g.latitude}" data-lng="${g.longitude}">
                <div>
                    <div style="font-family:'Russo One'; color:#fff; font-size:0.9rem; margin-bottom:2px;">
                        ${icon} ${g.game_name}
                    </div>
                    <div style="font-size:0.7rem; color:#888;">${g.location}</div>
                </div>
                <div class="nearest-game-dist">
                    ${distDisplay}
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${g.latitude},${g.longitude}" target="_blank" data-action="external-link" style="color:var(--sub-gold); margin-left:8px; font-size:1rem;" title="Get Directions"><i class="fa-solid fa-diamond-turn-right"></i></a>
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
    const q = document.getElementById('public-map-search').value;
    if (!q) return;
    try {
        showNotification("Searching...", "info");
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            if (state.publicMap) {
                state.publicMap.flyTo([lat, lon], 12);
                showNotification(`Moved to ${data[0].display_name.split(',')[0]}`, "success");
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