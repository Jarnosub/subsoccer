import { _supabase, state } from './config.js';
import { showNotification } from './ui-utils.js';

/**
 * ============================================================
 * MAP & LOCATION SERVICES
 * ============================================================
 */

export function initGameMap() {
    state.gameMap = L.map('map-picker').setView([60.1699, 24.9384], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }).addTo(state.gameMap);
    state.gameMap.on('click', async function(e) {
        setMapLocation(e.latlng.lat, e.latlng.lng);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`);
            const data = await res.json();
            if (data && data.display_name) document.getElementById('game-address-input').value = data.display_name;
        } catch(e) {}
    });
}

export function setMapLocation(lat, lng, name) {
    state.selLat = lat; state.selLng = lng;
    if (state.gameMarker) state.gameMap.removeLayer(state.gameMarker);
    state.gameMarker = L.marker([lat, lng]).addTo(state.gameMap);
    state.gameMap.setView([lat, lng], 13);
    const txt = name ? `${name} (${lat.toFixed(2)}, ${lng.toFixed(2)})` : `Selected: ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    document.getElementById('location-confirm').innerText = "Location set to " + txt;
}

export async function fetchPublicGamesMap() {
    if (!state.publicMap) {
        state.publicMap = L.map('public-game-map').setView([60.1699, 24.9384], 11);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(state.publicMap);
    } else {
        setTimeout(() => state.publicMap.invalidateSize(), 200);
    }
    
    const { data } = await _supabase.from('games').select('*').eq('is_public', true);
    if (data) {
        state.publicMap.eachLayer((layer) => { if (layer instanceof L.Marker) state.publicMap.removeLayer(layer); });
        
        const mapContainer = document.getElementById('section-map');
        if (mapContainer && !document.getElementById('map-locate-me')) {
            const locateBtn = document.createElement('button');
            locateBtn.id = 'map-locate-me';
            locateBtn.className = 'map-locate-btn';
            locateBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            locateBtn.onclick = () => {
                state.publicMap.locate({setView: true, maxZoom: 14});
            };
            mapContainer.style.position = 'relative';
            mapContainer.appendChild(locateBtn);
        }

        data.forEach(g => {
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

                L.marker([g.latitude, g.longitude], { icon: subsoccerIcon })
                    .addTo(state.publicMap)
                    .bindPopup(`<div style="min-width:160px;">
                        ${verifiedBadge}
                        <b style="font-size:1.1rem; text-transform:uppercase; color:#fff;">${g.game_name}</b>
                        <div style="color:#888; font-size:0.75rem; margin-top:8px; text-transform:uppercase; letter-spacing:1px;">
                            <i class="fa-solid fa-location-dot" style="color:var(--sub-red); margin-right:5px;"></i>${g.location}
                        </div>
                    </div>`);
            }
        });
    }
}

export async function searchLocation() {
    const q = document.getElementById('game-address-input').value;
    if (!q) return;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && data.length > 0) setMapLocation(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name.split(',')[0]);
        else showNotification("Location not found", "error");
    } catch(e) { showNotification("Search error", "error"); }
}

// Globaalit kytkennät
window.initGameMap = initGameMap;
window.setMapLocation = setMapLocation;
window.fetchPublicGamesMap = fetchPublicGamesMap;
window.searchLocation = searchLocation;