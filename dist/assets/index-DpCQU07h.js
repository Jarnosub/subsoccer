(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))o(r);new MutationObserver(r=>{for(const a of r)if(a.type==="childList")for(const s of a.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&o(s)}).observe(document,{childList:!0,subtree:!0});function n(r){const a={};return r.integrity&&(a.integrity=r.integrity),r.referrerPolicy&&(a.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?a.credentials="include":r.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function o(r){if(r.ep)return;r.ep=!0;const a=n(r);fetch(r.href,a)}})();const ao="https://ujxmmrsmdwrgcwatdhvx.supabase.co",ro="sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t",We={ENABLE_TEAMS:!0,ENABLE_SHOP:!0,ENABLE_PRO_MODE:!0,ENABLE_EVENTS:!0};let Ye;typeof window<"u"&&window.supabase?Ye=window.supabase.createClient(ao,ro):Ye={from:()=>({select:()=>({eq:()=>({maybeSingle:()=>({data:null,error:null})})}),insert:()=>({data:null,error:null}),update:()=>({eq:()=>({data:null,error:null})}),delete:()=>({eq:()=>({data:null,error:null})})}),auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}}),signOut:async()=>{},signInWithPassword:async()=>({data:{user:null,session:null},error:{message:"Supabase not loaded"}}),signUp:async()=>({data:{user:null,session:null},error:{message:"Supabase not loaded"}})},storage:{from:()=>({upload:async()=>({}),getPublicUrl:()=>({})})},_isMock:!0};const p=Ye,io="v1.0.0 BETA",so=!1,lo={user:null,pool:[],sessionGuests:[],allDbNames:[],allGames:[],countries:[],myGames:[],gameMap:null,gameMarker:null,selLat:null,selLng:null,publicMap:null,editingGameId:null,currentTournamentId:null,quickP1:null,quickP2:null,proModeActive:!1,proModeEnabled:!1,proScoreP1:0,proScoreP2:0,proGoalHistory:[],inventory:[],activeCardEdition:"standard",brand:null,brandLogo:null,currentPage:"tournament",victoryData:null},Vt=()=>{i.user=null,i.pool=[],i.sessionGuests=[],i.allDbNames=[],i.allGames=[],i.countries=[],i.myGames=[],i.gameMap=null,i.gameMarker=null,i.selLat=null,i.selLng=null,i.publicMap=null,i.editingGameId=null,i.currentTournamentId=null,i.quickP1=null,i.quickP2=null,i.proModeActive=!1,i.proModeEnabled=!1,i.proScoreP1=0,i.proScoreP2=0,i.proGoalHistory=[],i.inventory=[],i.activeCardEdition="standard",i.brand=null,i.brandLogo=null,i.currentPage="tournament",i.victoryData=null,localStorage.clear(),sessionStorage.clear()},de={},i=new Proxy(lo,{set(t,e,n){return t[e]=n,de[e]&&de[e].forEach(o=>o(n)),!0}}),te=(t,e)=>{de[t]||(de[t]=[]),de[t].push(e)};window._appState=i;window._supabase=p;const Wt=()=>i.user?.id==="054f6378-95c5-4f5b-a678-745e585a01fc",ye=()=>!!i.user?.is_admin||Wt();class Ke{constructor(e){this.html=e}toString(){return this.html}}function Qe(t){return new Ke(t)}function q(t,...e){const n=r=>r instanceof Ke?r.html:Array.isArray(r)?r.map(n).join(""):typeof r!="string"?r:r.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),o=t.reduce((r,a,s)=>{const d=e[s];return r+a+(d!==void 0?n(d):"")},"");return new Ke(o)}function m(t,e="error"){const n=document.getElementById("notification-container");if(!n)return;const o=document.createElement("div");o.className=`toast-notification ${e}`,o.innerText=t,n.appendChild(o),setTimeout(()=>o.remove(),4e3)}function M(t="Loading..."){let e=document.getElementById("loading-overlay");e||(e=document.createElement("div"),e.id="loading-overlay",e.innerHTML='<div class="spinner"></div><div id="loading-text" style="font-family:var(--sub-name-font); color:var(--sub-gold); letter-spacing:2px; text-transform:uppercase; font-size:0.8rem;"></div>',document.body.appendChild(e));const n=document.getElementById("loading-text");n&&(n.innerText=t),e.style.display="flex"}function R(){const t=document.getElementById("loading-overlay");t&&(t.style.display="none")}async function co(t,e=null){try{M();const n=await t;return e&&m(e,"success"),[n,null]}catch(n){return m(n.message||"An unexpected error occurred","error"),[null,n]}finally{R()}}function B(t,e,n={}){const o=n.id||"generic-modal";let r=document.getElementById(o);r||(r=document.createElement("div"),r.id=o,document.body.appendChild(r)),r.className="modal-overlay";const a=n.maxWidth||"500px",s=n.borderColor||"var(--sub-gold)";r.innerHTML=`
        <div class="modal-content" style="max-width: ${a}; border-color: ${s};">
            <div class="modal-header">
                <h3 style="color: ${s};">${t}</h3>
                <button class="modal-close" data-close-modal="${o}">&times;</button>
            </div>
            <div class="modal-body">${e}</div>
        </div>
    `,r.style.display="flex",r.onclick=l=>{l.target===r&&P(o)},document.body.style.overflow="hidden";const d=r.querySelector(`[data-close-modal="${o}"]`);d&&(d.onclick=()=>P(o))}function P(t="generic-modal"){const e=document.getElementById(t);e&&(e.style.display="none"),document.querySelectorAll('.modal-overlay[style*="display: flex"]').length===0&&(document.body.style.overflow=""),document.body.classList.remove("print-mode-active")}window.showNotification=m;window.showLoading=M;window.hideLoading=R;window.closeModal=P;function Yt(){i.gameMap||document.getElementById("map-picker")&&(i.gameMap=L.map("map-picker").setView([60.1699,24.9384],10),i.gameMap.attributionControl.setPrefix(!1),L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{attribution:"&copy; CARTO"}).addTo(i.gameMap),i.gameMap.on("click",async function(t){ue(t.latlng.lat,t.latlng.lng);try{const n=await(await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${t.latlng.lat}&lon=${t.latlng.lng}`)).json();n&&n.display_name&&(document.getElementById("game-address-input").value=n.display_name)}catch{}}))}function ue(t,e,n){if(i.selLat=t,i.selLng=e,!i.gameMap||typeof i.gameMap.addLayer!="function"){console.warn("setMapLocation: Map not ready or invalid");return}i.gameMarker&&i.gameMap.removeLayer(i.gameMarker),i.gameMarker=L.marker([t,e]).addTo(i.gameMap),i.gameMap.setView([t,e],13);const o=n?`${n} (${t.toFixed(2)}, ${e.toFixed(2)})`:`Selected: ${t.toFixed(2)}, ${e.toFixed(2)}`;document.getElementById("location-confirm").innerText="Location set to "+o}async function Kt(){const t=document.getElementById("section-map");i.publicMap?setTimeout(()=>i.publicMap.invalidateSize(),200):(i.publicMap=L.map("public-game-map").setView([60.1699,24.9384],11),i.publicMap.attributionControl.setPrefix(!1),L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{attribution:"&copy; CARTO",subdomains:"abcd",maxZoom:19}).addTo(i.publicMap),i.clusterGroup=L.markerClusterGroup({showCoverageOnHover:!1,maxClusterRadius:50,spiderfyOnMaxZoom:!0}),i.publicMap.addLayer(i.clusterGroup),i.publicMap.on("moveend",()=>{const o=i.publicMap.getCenter();Je(o.lat,o.lng)})),p.from("games").select("*");let e=[];if(i.user&&i.user.id!=="guest"){const{data:o,error:r}=await p.from("games").select("*").or(`is_public.eq.true,owner_id.eq.${i.user.id}`);e=o||[]}else{const{data:o}=await p.from("games").select("*").eq("is_public",!0);e=o||[]}const{data:n}=await p.from("tournament_history").select("*, games!inner(*)").in("status",["scheduled","ongoing"]).gt("end_datetime",new Date().toISOString());if(i.mapData={games:e,tournaments:n||[]},i.mapData.games.length>0||i.mapData.tournaments.length>0){if(i.clusterGroup.clearLayers(),t&&!document.getElementById("map-locate-me")){const r=document.createElement("button");r.id="map-locate-me",r.className="map-locate-btn",r.innerHTML='<i class="fa-solid fa-crosshairs"></i>',r.onclick=()=>{i.publicMap.locate({setView:!0,maxZoom:14})},t.style.position="relative",t.appendChild(r)}Qt("verified");const o=i.publicMap.getCenter();Je(o.lat,o.lng)}}function Qt(t){if(!i.clusterGroup||!i.mapData)return;document.querySelectorAll(".map-filter-btn").forEach(o=>{o.getAttribute("data-filter")===t?(o.classList.add("active"),t==="verified"?(o.style.background="rgba(255, 215, 0, 0.1)",o.style.borderColor="var(--sub-gold)",o.style.color="var(--sub-gold)"):(o.style.background="#222",o.style.color="#fff")):(o.classList.remove("active"),o.style.background="transparent",o.style.borderColor="#444",o.style.color="#888")}),i.clusterGroup.clearLayers();const{games:e,tournaments:n}=i.mapData;if((t==="all"||t==="verified")&&e.forEach(o=>{if(!(t==="verified"&&!o.verified)&&o.latitude&&o.longitude){let r=o.is_public?o.verified?"var(--sub-gold)":"var(--sub-red)":"#4a9eff";o.verified,o.is_public;const a=o.verified&&o.is_public?"verified-marker-pulse":"",s=L.divIcon({className:`custom-div-icon ${a}`,html:`<div style='background-color:${r}; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);'></div>`,iconSize:[16,16],iconAnchor:[8,8]});let d='<div style="min-width:160px; text-align:center;">';o.verified?d+=`
                        <div style="background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:0.6rem; padding:3px 0; letter-spacing:1px; border-radius:3px 3px 0 0; text-transform:uppercase; margin:-14px -14px 10px -14px;">
                            OFFICIAL ARENA
                        </div>
                        <i class="fa-solid fa-crown" style="color:var(--sub-gold); font-size:1.5rem; margin-bottom:5px;"></i>
                    `:o.is_public||(d+='<div style="color:#4a9eff; font-size:0.6rem; font-weight:bold; margin-bottom:4px;"><i class="fa fa-lock"></i> PRIVATE HOME TABLE</div>'),d+=`
                    <b style="font-size:1.1rem; text-transform:uppercase; color:#fff; display:block; margin-bottom:5px; font-family:'Russo One';">${o.game_name}</b>
                    <div style="color:#888; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">
                        <i class="fa-solid fa-location-dot" style="color:${r}; margin-right:5px;"></i>${o.location}
                    </div>
                </div>`;const l=L.marker([o.latitude,o.longitude],{icon:s}).bindPopup(d);i.clusterGroup.addLayer(l)}}),(t==="all"||t==="tournaments")&&(n||[]).forEach(o=>{const r=o.games;if(r&&r.latitude&&r.longitude){const a=o.status==="ongoing",s=new Date(o.start_datetime).toLocaleDateString(),d=new Date(o.start_datetime).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),l=L.divIcon({className:"custom-div-icon",html:"<div style='background-color:var(--sub-red); width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow: 0 0 15px var(--sub-red); animation: markerPulse 1.5s infinite;'></div>",iconSize:[20,20],iconAnchor:[10,10]}),c=L.marker([r.latitude,r.longitude],{icon:l}).bindPopup(`<div style="min-width:180px;">
                        <div style="color:var(--sub-red); font-size:0.65rem; font-weight:bold; margin-bottom:4px; letter-spacing:1px;">
                            ${a?"● LIVE TOURNAMENT":"📅 UPCOMING TOURNAMENT"}
                        </div>
                        <b style="font-size:1.1rem; text-transform:uppercase; color:#fff; display:block; margin-bottom:5px; line-height:1.2;">
                            ${o.tournament_name}
                        </b>
                        <div style="color:#ccc; font-size:0.8rem; margin-bottom:8px;">
                            ${s} @ ${d}
                        </div>
                        <div style="color:#888; font-size:0.7rem; border-top:1px solid #333; padding-top:5px;">
                            <i class="fa-solid fa-location-dot"></i> ${r.game_name}
                        </div>
                    </div>`);i.clusterGroup.addLayer(c)}}),i.publicMap){const o=i.publicMap.getCenter();Je(o.lat,o.lng)}}function uo(t,e){i.publicMap&&i.publicMap.flyTo([t,e],16)}function Je(t,e){const n=document.getElementById("nearest-games-list");if(!n||!i.mapData)return;const{games:o}=i.mapData,r=document.querySelector(".map-filter-btn.active")?.getAttribute("data-filter")||"all";let a=o;r==="verified"&&(a=o.filter(l=>l.verified));const s=a.map(l=>{if(!l.latitude||!l.longitude)return null;const c=mo(t,e,l.latitude,l.longitude);return{...l,distance:c}}).filter(l=>l!==null);s.sort((l,c)=>l.distance-c.distance);const d=s.slice(0,20);n.innerHTML=d.map(l=>{const c=l.distance<1?`${(l.distance*1e3).toFixed(0)} m`:`${l.distance.toFixed(1)} km`,u=l.verified,f=!l.is_public,g=u?"border-left: 4px solid var(--sub-gold); background: rgba(255, 215, 0, 0.05);":f?"border-left: 4px solid #4a9eff; background: rgba(74, 158, 255, 0.05);":"border-left: 4px solid #333;",y=u?"var(--sub-gold)":f?"#4a9eff":"#fff",v=u?`<span style="background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:0.55rem; padding:2px 4px; border-radius:2px; margin-right:5px; vertical-align:middle;">PRO ARENA</span>`:f?'<i class="fa-solid fa-lock" style="font-size:0.6rem; margin-right:4px;"></i>':"";return`
            <div class="nearest-game-item" style="${g} padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border-radius:4px;" data-action="fly-to-location" data-lat="${l.latitude}" data-lng="${l.longitude}">
                <div style="flex-grow:1; cursor:pointer;">
                    <div style="font-family:'Russo One'; color:${y}; font-size:0.95rem; margin-bottom:3px; text-transform:uppercase;">
                        ${v}${l.game_name}
                    </div>
                    <div style="font-size:0.75rem; color:#888;"><i class="fa-solid fa-location-dot" style="margin-right:4px;"></i>${l.location}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.8rem; font-weight:bold; color:#ccc; margin-bottom:3px;">${c}</div>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}" target="_blank" data-action="external-link" style="color:var(--sub-gold); font-size:1.1rem; padding:5px; display:inline-block;" title="Get Directions">
                        <i class="fa-solid fa-diamond-turn-right"></i>
                    </a>
                </div>
            </div>
        `}).join("")}function mo(t,e,n,o){var r=6371,a=he(n-t),s=he(o-e),d=Math.sin(a/2)*Math.sin(a/2)+Math.cos(he(t))*Math.cos(he(n))*Math.sin(s/2)*Math.sin(s/2),l=2*Math.atan2(Math.sqrt(d),Math.sqrt(1-d)),c=r*l;return c}function he(t){return t*(Math.PI/180)}async function Jt(){const t=document.getElementById("game-address-input").value;if(t)try{const n=await(await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(t)}`)).json();n&&n.length>0?ue(parseFloat(n[0].lat),parseFloat(n[0].lon),n[0].display_name.split(",")[0]):m("Location not found","error")}catch{m("Search error","error")}}async function po(){const t=document.getElementById("public-map-search").value;if(t)try{m("Searching...","info");const n=await(await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(t)}`)).json();if(n&&n.length>0){const o=parseFloat(n[0].lat),r=parseFloat(n[0].lon);i.publicMap&&(i.publicMap.flyTo([o,r],12),m(`Moved to ${n[0].display_name.split(",")[0]}`,"success"))}else m("Location not found","error")}catch{m("Search error","error")}}window.initGameMap=Yt;window.setMapLocation=ue;window.fetchPublicGamesMap=Kt;window.searchLocation=Jt;async function me(){try{const{data:t}=await p.from("games").select("id, game_name");i.allGames=t||[]}catch(t){console.error(t)}}async function Xt(t){const e=t?.currentTarget||t?.target,n=e?e.textContent:"",o=document.getElementById("game-serial-input").value.trim(),r=document.getElementById("game-name-input").value.trim(),a=document.getElementById("game-address-input").value.trim(),d=document.getElementById("game-visibility-input").value==="public";try{if(e&&(e.disabled=!0,e.textContent="Registering..."),!o||!r||!a||!i.selLat){m("Please fill all fields and select location on map.","error");return}if(i.user.id==="guest"){m("Guests cannot register games. Please create an account.","error");return}const{data:l}=await p.from("games").select("id, game_name, owner_id").eq("serial_number",o);if(l&&l.length>0){const f=l[0],{data:g}=await p.from("players").select("username").eq("id",f.owner_id).maybeSingle();f.players=g,en(f,o,r,a,d);return}const c=o.replace(/[^a-zA-Z0-9]/g,"").toUpperCase(),{error:u}=await p.from("games").insert([{unique_code:c,game_name:r,location:a,owner_id:i.user.id,latitude:i.selLat,longitude:i.selLng,is_public:d,serial_number:o,verified:!0,registered_at:new Date().toISOString()}]);if(u)throw u;m(`Game "${r}" registered successfully! ⭐ VERIFIED`,"success"),be(),await me(),J()}catch(l){m("Failed to register game: "+l.message,"error")}finally{e&&(e.disabled=!1,e.textContent=n)}}function fo(t){const e=i.myGames.find(o=>o.id===t);if(!e)return;i.editingGameId=t,i.currentPage="games",document.getElementById("game-serial-input").value=e.serial_number||"",document.getElementById("game-serial-input").disabled=!0,document.getElementById("game-name-input").value=e.game_name,document.getElementById("game-address-input").value=e.location;const n=e.is_public?"public":"private";document.getElementById("game-visibility-input").value=n,document.querySelectorAll(".visibility-btn").forEach(o=>{o.classList.toggle("active",o.getAttribute("data-value")===n)}),e.latitude&&e.longitude&&setTimeout(()=>{if(!i.gameMap&&typeof window.initGameMap=="function")try{window.initGameMap()}catch(o){console.warn("Map auto-init failed",o)}i.gameMap&&(i.gameMap.invalidateSize(),typeof ue=="function"&&ue(e.latitude,e.longitude,e.location))},600),document.getElementById("btn-reg-game").style.display="none",document.getElementById("btn-edit-group").style.display="flex",window.scrollTo({top:0,behavior:"smooth"})}function be(){if(i.editingGameId=null,document.getElementById("game-serial-input").value="",document.getElementById("game-serial-input").disabled=!1,document.getElementById("game-name-input").value="",document.getElementById("game-address-input").value="",document.getElementById("game-visibility-input").value="public",document.querySelectorAll(".visibility-btn").forEach(t=>{t.classList.toggle("active",t.getAttribute("data-value")==="public")}),document.getElementById("location-confirm").innerText="",i.selLat=null,i.selLng=null,i.gameMarker)try{i.gameMap?.removeLayer(i.gameMarker)}catch{}document.getElementById("btn-reg-game").style.display="block",document.getElementById("btn-edit-group").style.display="none"}async function Zt(t){if(!i.editingGameId)return;const e=t?.currentTarget||t?.target,n=e?e.textContent:"";try{e&&(e.disabled=!0,e.textContent="Updating...");const o=document.getElementById("game-name-input").value.trim(),r=document.getElementById("game-address-input").value.trim(),s=document.getElementById("game-visibility-input").value==="public";if(!o||!r||!i.selLat){m("Please fill fields and location.","error");return}const{error:d}=await p.from("games").update({game_name:o,location:r,latitude:i.selLat,longitude:i.selLng,is_public:s}).eq("id",i.editingGameId);if(d)throw d;m("Game updated!","success"),be(),J(),await me()}catch(o){m("Update failed: "+o.message,"error")}finally{e&&(e.disabled=!1,e.textContent=n)}}async function go(t){if(confirm("Are you sure you want to delete this game table?"))try{await p.from("tournament_history").update({game_id:null}).eq("game_id",t);const{error:e}=await p.from("games").delete().eq("id",t);if(e)throw e;m("Game deleted successfully","success"),J(),me()}catch(e){m("Deletion failed: "+e.message,"error")}}async function J(){const t=document.getElementById("game-registration-section");if(i.user.id==="guest"){t&&(t.style.display="none");return}t&&(t.style.display="block");const{data:e}=await p.from("games").select("*").eq("owner_id",i.user.id);i.myGames=e||[];const n=e&&e.length>0?e.map(a=>`
        <div style="background:#111; padding:15px; border-radius:8px; margin-bottom:10px; border-left: 3px solid ${a.verified?"var(--sub-gold)":"var(--sub-red)"}; position: relative;">
            ${a.verified?`<div style="position:absolute; top:10px; left:10px; background:linear-gradient(135deg, var(--sub-gold) 0%, #d4af37 100%); color:#000; padding:3px 8px; border-radius:4px; font-size:0.65rem; font-family:'Russo One'; box-shadow:0 2px 4px rgba(255,215,0,0.3);">⭐ VERIFIED</div>`:""}
            <div style="position: absolute; top: 10px; right: 10px;">
                <button onclick="initEditGame('${a.id}')" style="background: none; border: none; cursor: pointer; font-size: 1rem; margin-right: 5px; color: #ccc;">✏️</button>
                <button onclick="deleteGame('${a.id}')" style="background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--sub-red);">🗑️</button>
            </div>
            <div style="font-family: 'Russo One'; font-size: 1rem; padding-right: 60px; ${a.verified?"margin-top:25px;":""}">${a.game_name}</div>
            <small style="color:#888;">${a.location}</small><br>
            <small style="color:var(--sub-gold); font-size:0.65rem;">SERIAL: ${a.serial_number}</small>
            ${a.verified?`<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:10px;">
                <button class="btn-red" style="font-size:0.7rem; padding:6px 12px; background:var(--sub-gold); color:#000;" onclick="window.open('instant-play.html?mode=display&game_id=${a.id}', '_blank')"><i class="fa-solid fa-tv"></i> OPEN JÄTTINÄYTTÖ</button>
                <button class="btn-red" style="font-size:0.7rem; padding:6px 12px; background:#444;" onclick="releaseGameOwnership('${a.id}')">Release Ownership</button>
            </div>`:""}
        </div>
    `).join(""):"<p>You have not registered any games yet.</p>",o=document.getElementById("my-games-list"),r=document.getElementById("profile-games-list");o&&(o.innerHTML=n),r&&(r.innerHTML=e.map(a=>`
        <div style="background:#0a0a0a; padding:12px; border-radius:var(--sub-radius); margin-bottom:8px; border-left:3px solid ${a.verified?"var(--sub-gold)":"#333"}; position: relative;">
            <div style="position: absolute; top: 10px; right: 10px;">
                <button onclick="initEditGame('${a.id}')" style="background: none; border: none; cursor: pointer; font-size: 0.8rem; color: var(--sub-gold); font-family: 'Resolve';">EDIT</button>
            </div>
            <div style="font-family:'Russo One'; font-size:0.9rem; color:#fff; margin-bottom:3px;">${a.verified?"⭐ ":""}${a.game_name}</div>
            <div style="font-size:0.75rem; color:#888;">${a.location}</div>
        </div>`).join(""))}async function yo(t){if(confirm("Release ownership?"))try{const{data:e,error:n}=await p.rpc("release_game_ownership",{p_game_id:t,p_player_id:i.user.id});if(n)throw n;e&&(m("Ownership released!","success"),J())}catch(e){m("Failed: "+e.message,"error")}}async function bo(t){if(confirm("Approve transfer?"))try{const{data:e,error:n}=await p.rpc("approve_ownership_transfer",{transfer_id:t});if(n)throw n;e&&(m("Approved!","success"),ft(),J())}catch(e){m("Failed: "+e.message,"error")}}async function vo(t){try{const{error:e}=await p.from("ownership_transfer_requests").update({status:"rejected",resolved_at:new Date().toISOString()}).eq("id",t);if(e)throw e;m("Rejected.","success"),ft()}catch(e){m("Failed: "+e.message,"error")}}async function ho(t,e,n,o,r){try{const a=document.getElementById("transfer-message")?.value.trim()||"",{data:s}=await p.from("games").select("owner_id").eq("id",t).single(),{error:d}=await p.from("ownership_transfer_requests").insert([{game_id:t,serial_number:e,current_owner_id:s.owner_id,new_owner_id:i.user.id,message:a,status:"pending"}]);if(d)throw d;tn(),m("Request sent!","success")}catch(a){m("Failed: "+a.message,"error")}}function en(t,e,n,o,r){const a=t.players?.username||"Unknown",s=`
        <p>Registered to: <b>${t.game_name}</b> (Owner: ${a})</p>
        <textarea id="transfer-message" placeholder="Message to owner..." style="width:100%; min-height:80px; margin-bottom:20px; background:#111; border:1px solid #333; border-radius:8px; padding:10px; color:#fff;"></textarea>
        <div style="display:flex; gap:10px;">
            <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" onclick="requestOwnershipTransfer('${t.id}', '${e}', '${n}', '${o}', ${r})">REQUEST</button>
            <button class="btn-red" style="flex:1; background:#444;" onclick="closeOwnershipTransferDialog()">CANCEL</button>
        </div>
    `;B("⚠️ SERIAL IN USE",s,{id:"ownership-transfer-modal"})}function tn(){P("ownership-transfer-modal");const t=document.getElementById("btn-reg-game");t&&(t.disabled=!1,t.textContent="REGISTER GAME")}async function nn(){try{const{data:t}=await p.from("ownership_transfer_requests").select("*, games!game_id(game_name, serial_number), players!new_owner_id(username)").eq("current_owner_id",i.user.id).eq("status","pending"),e=t&&t.length>0?t.map(n=>`
            <div style="background:#111; padding:20px; border-radius:8px; margin-bottom:15px; border-left:3px solid var(--sub-gold);">
                <div style="font-family:var(--sub-name-font); margin-bottom:5px;">${n.games?.game_name}</div>
                <div style="font-size:0.8rem; color:#888; margin-bottom:10px;">By: ${n.players?.username}</div>
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000; font-size:0.8rem;" onclick="approveOwnershipTransfer('${n.id}')">APPROVE</button>
                    <button class="btn-red" style="flex:1; background:#666; font-size:0.8rem;" onclick="rejectOwnershipTransfer('${n.id}')">REJECT</button>
                </div>
            </div>
        `).join(""):'<p style="text-align:center; color:#666;">No pending requests</p>';B("OWNERSHIP REQUESTS",e,{id:"ownership-requests-modal",maxWidth:"600px"})}catch(t){m("Failed: "+t.message,"error")}}function ft(){P("ownership-requests-modal")}window.registerGame=Xt;window.initEditGame=fo;window.cancelEdit=be;window.updateGame=Zt;window.deleteGame=go;window.fetchMyGames=J;window.releaseGameOwnership=yo;window.approveOwnershipTransfer=bo;window.rejectOwnershipTransfer=vo;window.requestOwnershipTransfer=ho;window.showOwnershipTransferDialog=en;window.closeOwnershipTransferDialog=tn;window.viewOwnershipRequests=nn;window.closeOwnershipRequestsModal=ft;const xe=t=>t&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t)),ve={calculateNewElo(t,e,n){const o=t.elo||1300,r=e.elo||1300,a=32,s=1/(1+Math.pow(10,(r-o)/400)),d=1/(1+Math.pow(10,(o-r)/400)),l=n===t.id?1:0,c=n===e.id?1:0;let u=Math.round(o+a*(l-s)),f=Math.round(r+a*(c-d));return l===1&&u<=o&&(u=o+1),c===1&&f<=r&&(f=r+1),l===0&&u>=o&&(u=Math.max(0,o-1)),c===0&&f>=r&&(f=Math.max(0,r-1)),{newEloA:u,newEloB:f}},async recordMatch({player1Name:t,player2Name:e,winnerName:n,p1Score:o=null,p2Score:r=null,tournamentId:a=null,tournamentName:s=null,gameId:d=null}){try{M("Recording match...");let{data:l}=await p.from("players").select("*").ilike("username",t).maybeSingle(),{data:c}=await p.from("players").select("*").ilike("username",e).maybeSingle(),u=!1,f=null;if(d&&d!=="QUICK-PLAY")if(d.toUpperCase()==="HQ")u=!0;else{const z=xe(d)?p.from("games").select("id, verified, is_public").eq("id",d):p.from("games").select("id, verified, is_public").eq("serial_number",d),{data:F}=await z.maybeSingle();F&&(f=F.id,F.verified&&F.is_public&&(u=!0))}else a&&(u=!0);const g=l||{id:"guest_"+t,username:t,elo:1300,isGuest:!0},y=c||{id:"guest_"+e,username:e,elo:1300,isGuest:!0},v=n===t?g:y,b=v.elo||1300,{newEloA:h,newEloB:x}=this.calculateNewElo(g,y,v.id);let E=n===t?h:x;const T=1600;let w=!1;u||(b>=T?(E=b,w=!0):E>T&&(E=T,w=!0));const $=E-b,D=n===t?E:g.isGuest?1300:h,S=n===e?E:y.isGuest?1300:x,{error:k}=await p.rpc("record_quick_match_v1",{p1_id:g.isGuest||!xe(g.id)?null:g.id,p2_id:y.isGuest||!xe(y.id)?null:y.id,p1_new_elo:D,p2_new_elo:S,p1_won:n===t,match_data:{player1:t,player2:e,winner:n,player1_score:o,player2_score:r,tournament_id:xe(a)?a:null,tournament_name:s,is_verified_table:u,elo_capped:w}});if(k)throw k;return window.lastTournamentEloGain=$,window.lastTournamentWinner=n,w&&B("ANTI-CHEAT ACTIVE",`
                <div style="text-align:center; padding:10px;">
                    <i class="fa-solid fa-user-secret" style="font-size:4rem; color:var(--sub-red); margin-bottom:20px;"></i>
                    <h2 style="font-family:'Russo One'; color:var(--sub-red); margin-bottom:15px; text-transform:uppercase; letter-spacing:1px;">🚨 HUSTLER CAUGHT!</h2>
                    
                    <p style="color:#ccc; font-size:0.95rem; line-height:1.6; margin-bottom:20px;">
                        Impressive farming skills. We see you've reached the <strong>1600 ELO</strong> cap for Living Room tables. 
                    </p>
                    
                    <div style="background:rgba(227, 6, 19, 0.1); border:1px solid rgba(227, 6, 19, 0.3); border-radius:8px; padding:15px; margin-bottom:25px;">
                        <p style="color:#fff; font-size:0.85rem; line-height:1.5; margin:0;">
                            To climb the Global Leaderboard and reach the true <strong>Pro Ranks</strong>, you need to step outside. Find an official <span style="color:var(--sub-gold); font-weight:bold;">Verified Public Arena</span> and prove your skills against real challengers.
                        </p>
                    </div>

                    <button class="btn-red" style="width:100%; font-family:'Russo One'; font-size:1.1rem; padding:15px; border-radius:8px;" onclick="this.closest('.modal-overlay').style.display='none'">
                        CHALLENGE ACCEPTED
                    </button>
                </div>
                `,{id:"hacker-modal",maxWidth:"420px",borderColor:"var(--sub-red)"}),!w&&Math.floor(E/100)>Math.floor(b/100)&&setTimeout(()=>{window.showLevelUpCard&&window.showLevelUpCard(n,E)},2e3),{success:!0,newElo:E,gain:$,isGuest:v.isGuest,wasCapped:w}}catch(l){return console.error("MatchService Error:",l),m("Failed to record match","error"),{success:!1,error:l}}finally{R()}}};window.MatchService=ve;let A=null,we=null;const C={getRoomId:()=>{const t=new URLSearchParams(window.location.search);let e=t.get("sn")||t.get("game_id");return e&&e!=="QUICK-PLAY"?(e=e.toUpperCase(),localStorage.setItem("TV_ROOM_ID",e),e):(e=localStorage.getItem("TV_ROOM_ID"),e||(e=Math.random().toString(36).substring(2,8).toUpperCase(),localStorage.setItem("TV_ROOM_ID",e)),e)},startBroadcasting:async()=>A?C.getRoomId():(we=C.getRoomId(),A=p.channel(`room:${we}`),A.subscribe(t=>{t==="SUBSCRIBED"&&console.log(`📡 Broadcast started on room: ${we}`)}),A.on("broadcast",{event:"PEER_READY"},t=>{t.payload&&t.payload.fromRole==="viewer"&&C.latestScore&&(console.log("TV joined. Resyncing current score state."),A.send({type:"broadcast",event:"SCORE_UPDATE",payload:C.latestScore}))}),A.on("broadcast",{event:"VIEWER_READY"},()=>{C.latestScore&&(console.log("Legacy TV joined. Resyncing current score state."),A.send({type:"broadcast",event:"SCORE_UPDATE",payload:C.latestScore}))}),we),sendScoreUpdate:(t,e,n,o,r=!1)=>{if(!A)return;const a={p1Name:t,p2Name:e,p1Score:n,p2Score:o,isGoal:r,timestamp:Date.now()};C.latestScore=a,A.send({type:"broadcast",event:"SCORE_UPDATE",payload:a}).catch(s=>{console.warn("Broadcast channel not fully subscribed yet orREST fallback warned:",s)})},stopBroadcasting:()=>{A&&(A.send({type:"broadcast",event:"MATCH_ENDED",payload:{}}),p.removeChannel(A),A=null,console.log("⏹️ Broadcast stopped."))}};window.BroadcastService=C;const ne=3;let G=!1,Xe=null;async function je(t,e){const n=t.value.trim().toUpperCase(),o=document.getElementById(`${e}-results`);if(!n){o&&(o.style.display="none");return}try{const{data:r,error:a}=await p.from("players").select("username").ilike("username",`%${n}%`).limit(5);if(a)throw a;const s=r?r.map(c=>c.username):[],d=i.sessionGuests.filter(c=>c.includes(n)&&!s.includes(c)).slice(0,5),l=[...s,...d];o&&(o.innerHTML=q`
                ${l.map(c=>q`<div class="search-item" data-action="select-quick-player" data-player="${c}" data-slot="${e}">${c}</div>`)}
                <div class="search-item" style="color:var(--sub-gold);" data-action="select-quick-player" data-player="${n}" data-slot="${e}">Add: "${n}"</div>
            `.toString(),o.style.display="block")}catch(r){console.error("Quick search failed:",r)}}async function xo(t,e){const n=e==="claim"?"claim-opponent-search":`${e}-quick-search`,o=e==="claim"?"claim-results":`${e}-results`,r=document.getElementById(n);r&&(r.value=t);const a=document.getElementById(o);if(a&&(a.style.display="none"),e==="claim"){i.quickP2=t;return}e==="p1"?i.quickP1=t:i.quickP2=t,i.quickP1&&i.quickP2&&(wo(),i.proModeEnabled&&(document.getElementById("audio-status-panel").style.display="block"))}async function wo(){if(!i.quickP1||!i.quickP2)return;const{data:t}=await p.from("players").select("id, elo").ilike("username",i.quickP1.trim()).maybeSingle(),{data:e}=await p.from("players").select("id, elo").ilike("username",i.quickP2.trim()).maybeSingle(),n=t?t.elo:1300,o=e?e.elo:1300,r=t?t.id:"guest1",a=e?e.id:"guest2",d=ve.calculateNewElo({id:r,elo:n},{id:a,elo:o},r).newEloA-n;document.getElementById("elo-prediction-text").innerHTML=`<span class="highlight">${i.quickP1}</span> gains <span class="highlight">+${d} ELO</span> if they win`,document.getElementById("elo-preview").style.display="block"}async function Eo(){document.querySelectorAll("input").forEach(n=>n.blur());let t=document.getElementById("p1-quick-search").value.trim().toUpperCase(),e=document.getElementById("p2-quick-search").value.trim().toUpperCase();if(t||(t="PLAYER 1"),e||(e="PLAYER 2"),i.quickP1=t,i.quickP2=e,i.quickP1===i.quickP2&&i.quickP1!=="PLAYER 1"&&i.quickP2!=="PLAYER 2")return m("Select different players!","error");_o()}async function Pe(t,e=null){try{const n=i.quickP1,o=i.quickP2;let r=null;e&&e.startsWith("Instant Play: ")&&(r=e.replace("Instant Play: ",""));const a=await ve.recordMatch({player1Name:n,player2Name:o,winnerName:t,p1Score:i.proScoreP1,p2Score:i.proScoreP2,tournamentName:e,gameId:r});a.success&&(window.audioEngine&&window.audioEngine.stopListening(),on(t,a.newElo,a.gain,a.isGuest))}catch(n){console.error("Error finalizing Quick Match:",n),m("Failed to save match results","error")}}function on(t,e,n,o=!1){document.getElementById("app-content").style.display="none";const r=document.getElementById("save-btn");r&&(r.style.display="none"),document.getElementById("victory-player-name").innerText=t,document.getElementById("victory-elo-count").innerText=e,document.getElementById("victory-elo-gain").innerText=`+${n} POINTS`;const a=document.getElementById("victory-overlay"),s=a.querySelectorAll("button");s.length>=2&&(s[0].className="btn-red btn-victory-primary",s[0].innerText="NEW GAME",s[1].className="btn-red btn-victory-secondary",s[1].innerText="END GAME");const d=document.getElementById("guest-upsell");if(d&&d.remove(),o){const l=document.createElement("div");l.id="guest-upsell",l.className="fade-in",l.style="margin-top: 25px; color: #fff; font-size: 0.85rem; max-width: 280px; background: rgba(255,215,0,0.1); padding: 15px; border-radius: var(--sub-radius); border: 1px solid rgba(255,215,0,0.2); text-align:center; line-height:1.4;",l.innerHTML="<span style='color:var(--sub-gold); font-weight:bold; display:block; margin-bottom:5px;'>🔥 GREAT WIN!</span> Create a free account to save your progress and climb the Global Leaderboard.",(a.querySelector(".victory-controls")||a.querySelector("button").parentElement).before(l)}a.style.display="flex",window.soundEffects&&typeof window.soundEffects.playCrowdCheer=="function"&&window.soundEffects.playCrowdCheer()}function Io(){window.audioEngine&&typeof window.audioEngine.stopListening=="function"&&window.audioEngine.stopListening(),document.getElementById("app-content").style.display="flex"}function Lt(){document.getElementById("victory-overlay").style.display="none",document.getElementById("app-content").style.display="flex",document.getElementById("audio-status-panel").style.display="none",window.fetchLB&&window.fetchLB(),window.fetchHist&&window.fetchHist();const t=document.getElementById("tour-engine");if(t&&t.style.display!=="none"){t.style.display="none";const e=document.getElementById("tour-setup");e&&(e.style.display="");const n=document.getElementById("bracket-area");n&&(n.innerHTML="");const o=document.getElementById("save-btn");o&&(o.style.display="none",o.classList.remove("sticky-bottom-action"),o.parentNode!==t&&t.appendChild(o))}i.currentPage="tournament"}function ko(t,e){e.parentElement.remove(),Pe(t)}function To(){document.getElementById("p1-quick-search").value="",document.getElementById("p2-quick-search").value="",i.quickP1=null,i.quickP2=null,document.getElementById("elo-preview").style.display="none",document.getElementById("audio-status-panel").style.display="none",document.getElementById("p1-quick-search").focus()}function So(){an()}function Bo(){const t=document.getElementById("pro-mode-section");t&&t.classList.remove("disabled")}function an(){const t=document.getElementById("pro-mode-toggle"),e=document.getElementById("pro-mode-section");t.checked=!t.checked,i.proModeEnabled=t.checked;const n=document.getElementById("start-quick-match");document.getElementById("pro-mode-audio-panels"),i.proModeEnabled?(n.textContent="START MATCH",n.style.background="linear-gradient(135deg, var(--sub-gold), #d4a017)",n.style.color="#000",e.style.borderColor="var(--sub-gold)",e.style.borderStyle="solid"):(n.textContent="START MATCH",n.style.background="var(--sub-red)",n.style.color="white",e.style.borderColor="#1a1a1a",e.style.borderStyle="dashed")}async function _o(){i.proScoreP1=0,i.proScoreP2=0,i.proGoalHistory=[],G=!1,i.proModeActive=!0,await C.startBroadcasting(),document.getElementById("pro-p1-name").textContent=i.quickP1,document.getElementById("pro-p2-name").textContent=i.quickP2,Oe(!1),document.getElementById("app-content").style.display="none";const t=document.getElementById("btn-pro-mic"),e=document.getElementById("btn-pro-sound");if(t&&window.audioEngine){const o=window.audioEngine.getStatus().isListening;t.classList.toggle("active",o),t.innerHTML=o?'<i class="fa-solid fa-microphone"></i>':'<i class="fa-solid fa-microphone-slash"></i>'}e&&window.soundEffects&&e.classList.toggle("active",window.soundEffects.enabled),document.getElementById("pro-mode-view").style.display="flex";const n=document.getElementById("pro-rules-overlay");if(n){n.style.display="flex",i.proModeActive=!1;const o=n.querySelector("button");o&&(o.innerText="I UNDERSTAND - PLAY")}else rn()}function rn(){document.getElementById("pro-rules-overlay").style.display="none",i.proModeActive=!0,G=!1}function Ct(t){!i.proModeActive||G||sn(t)}function sn(t){if(!i.proModeActive||G)return;t===1?i.proScoreP1++:i.proScoreP2++,i.proGoalHistory=[...i.proGoalHistory,{player:t}],Oe(!0);const e=t===1?".pro-player-left":".pro-player-right";document.querySelector(e).classList.add("goal-flash"),setTimeout(()=>document.querySelector(e).classList.remove("goal-flash"),500),navigator.vibrate&&navigator.vibrate([100,50,100]),window.soundEffects&&window.soundEffects.playGoalSound(),i.proScoreP1>=ne?(G=!0,Xe=setTimeout(()=>$t(i.quickP1),1500)):i.proScoreP2>=ne&&(G=!0,Xe=setTimeout(()=>$t(i.quickP2),1500))}function Oe(t=!1){document.getElementById("pro-p1-score").textContent=i.proScoreP1,document.getElementById("pro-p2-score").textContent=i.proScoreP2,document.getElementById("pro-p1-goals").textContent="●".repeat(i.proScoreP1)+"○".repeat(ne-i.proScoreP1),document.getElementById("pro-p2-goals").textContent="●".repeat(i.proScoreP2)+"○".repeat(ne-i.proScoreP2);const e=document.getElementById("btn-pro-undo");e&&(e.style.opacity=i.proGoalHistory.length>0?"1":"0.3");const n=document.getElementById("pro-p1-status"),o=document.getElementById("pro-p2-status");i.proScoreP1===i.proScoreP2?(n.textContent="TIE",o.textContent="TIE"):i.proScoreP1>i.proScoreP2?(n.textContent="LEADING",o.textContent=i.proScoreP2===ne-1?"MATCH POINT":""):(n.textContent=i.proScoreP1===ne-1?"MATCH POINT":"",o.textContent="LEADING"),C.sendScoreUpdate(i.quickP1,i.quickP2,i.proScoreP1,i.proScoreP2,t)}function Lo(){if(!i.proModeActive||i.proGoalHistory.length===0)return;G&&(clearTimeout(Xe),G=!1),i.proGoalHistory.pop().player===1?i.proScoreP1=Math.max(0,i.proScoreP1-1):i.proScoreP2=Math.max(0,i.proScoreP2-1),Oe(!1),navigator.vibrate&&navigator.vibrate(50)}function Co(){confirm("Restart match? Score will be reset to 0-0.")&&(i.proScoreP1=0,i.proScoreP2=0,i.proGoalHistory=[],Oe(!1))}async function $t(t){i.proModeActive=!1,G=!1,window.audioEngine&&window.audioEngine.stopListening(),C.stopBroadcasting(),document.getElementById("pro-mode-view").style.display="none",document.getElementById("pro-audio-meter").style.display="none",await Pe(t)}function $o(){confirm("Exit current match? Result will not be saved.")&&(i.proModeActive=!1,G=!1,i.proGoalHistory=[],window.audioEngine&&window.audioEngine.stopListening(),C.stopBroadcasting(),document.getElementById("pro-mode-view").style.display="none",document.getElementById("pro-audio-meter").style.display="none",document.getElementById("app-content").style.display="flex")}function Ao(t){if(i.proModeActive){sn(t);return}const e=t===1?i.quickP1:i.quickP2;e&&(m(`🚨 GOAL! ${e} scores!`,"success"),window.soundEffects&&window.soundEffects.playGoalSound(),setTimeout(()=>Pe(e),800))}async function At(){if(!window.audioEngine)return m("Audio engine not loaded","error");const t=window.audioEngine.getStatus(),e=document.getElementById("toggle-audio-btn"),n=document.getElementById("btn-pro-mic");if(t.isListening)window.audioEngine.stopListening(),e.textContent="ACTIVATE",e.style.background="#333",n&&(n.classList.remove("active"),n.innerHTML='<i class="fa-solid fa-microphone-slash"></i>',document.getElementById("pro-audio-meter").style.display="none"),document.getElementById("audio-frequency-display").style.display="none";else{const o=await window.audioEngine.startListening();if(o.success){e.textContent="DEACTIVATE",e.style.background="var(--sub-red)",n&&(n.classList.add("active"),n.innerHTML='<i class="fa-solid fa-microphone"></i>',document.getElementById("pro-audio-meter").style.display="block");const r=document.getElementById("audio-threshold-slider"),a=document.getElementById("audio-threshold-value");r&&a&&(r.value=window.audioEngine.getStatus().settings.threshold*100,a.textContent=r.value+"%",r.oninput=s=>{const d=parseInt(s.target.value);a.textContent=d+"%",window.audioEngine.setThreshold(d/100)}),Mo()}else m(o.message,"error")}}function Mo(){const t=setInterval(()=>{if(!window.audioEngine||!window.audioEngine.getStatus().isListening){clearInterval(t);return}const e=window.audioEngine.getStatus(),n=document.getElementById("audio-meter-bar"),o=document.getElementById("audio-threshold-line"),r=document.getElementById("pro-audio-meter-fill"),a=document.getElementById("pro-audio-threshold-marker"),s=Math.max(e.debug.currentG1,e.debug.currentG2),d=e.settings.threshold*100;n&&o&&(n.style.width=s*100+"%",o.style.left=d+"%",s>=e.settings.threshold?n.style.background="#4CAF50":n.style.background="var(--sub-gold)"),r&&a&&(r.style.width=s*100+"%",a.style.left=d+"%",s>=e.settings.threshold?r.style.background="#4CAF50":r.style.background="var(--sub-gold)")},100)}function gt(){if(!window.soundEffects)return m("Sound system not loaded","error");const t=window.soundEffects.toggle(),e=document.getElementById("sound-toggle-btn"),n=document.getElementById("btn-pro-sound");e&&(t?(e.innerHTML="🔊 SOUNDS",e.style.background="#333",e.style.color="#fff",n&&n.classList.add("active"),m("🔊 Sound effects enabled","success"),setTimeout(()=>{window.soundEffects.playGoalSound()},300)):(e.innerHTML="🔇 MUTED",e.style.background="#666",e.style.color="#aaa",n&&n.classList.remove("active"),m("🔇 Sound effects muted","info")))}function ln(t,e,n){const o=Math.max(t,e),r=Math.min(t,e),a=document.getElementById("app-content");a&&(a.style.display="flex"),showMatchMode("quick");const s=document.getElementById("quick-match-section");if(s){Array.from(s.children).forEach(x=>{x.id!=="claim-result-container"&&(x.style.display="none")});let l=document.getElementById("claim-result-container");l||(l=document.createElement("div"),l.id="claim-result-container",s.appendChild(l));const c=i.user.id==="guest";l.className="sub-card fade-in",l.style.display="block",l.style.borderColor=c?"#666":"var(--sub-gold)",l.style.marginTop="20px",l.style.background=c?"linear-gradient(135deg, #111, #222)":"linear-gradient(135deg, #1a1500, #332600)";const u=c?"linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.05) 50%, transparent 60%)":"linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)",f=c?"fa-lock":"fa-trophy",g=c?"#666":"var(--sub-gold)",h=`
            <div style="background:rgba(0,0,0,0.5); border:1px dashed ${g}; border-radius:10px; padding:20px; margin: 0 auto 20px auto; position:relative; overflow:hidden;">
                <div style="position:absolute; top:-50%; left:-50%; width:200%; height:200%; background:${u}; animation: shimmer 3s infinite;"></div>
                <i class="fa-solid ${f}" style="color:${g}; font-size:2rem; margin-bottom:10px;"></i>
                <h3 style="font-family:'Resolve'; color:${c?"#888":"#fff"}; font-size:1.2rem; letter-spacing:2px; margin-bottom:15px; text-transform:uppercase;">${c?"ROOKIE CARD":"PRO CARD UPGRADE"}</h3>
                <p style="color:#aaa; font-size:0.8rem; line-height:1.4; margin-bottom:5px;">${c?"You are playing as an Anonymous Guest.<br><br><span style='color:var(--sub-gold); font-weight:bold;'>UNLOCK YOUR PRO CARD</span><br>to claim this victory and enter the Global Top 100!":"Great win! Save this result to boost your global rank and update your digital Pro Card."}</p>
            </div>
        `;l.innerHTML=`
            <div style="text-align:center; padding-bottom:10px;">
                <div style="font-family:'Russo One'; color:var(--sub-gold); font-size:1.5rem; letter-spacing:2px; margin-bottom:5px;">VICTORY CONFIRMED</div>
                <div style="font-size:3.5rem; font-family:'Subsoccer', sans-serif; color:#fff; line-height:1; text-shadow:0 0 20px rgba(255,215,0,0.3); margin-bottom: 20px;">${o} - ${r}</div>
                ${h}
                <div style="color:#aaa; font-size:0.85rem; margin-top:20px; line-height:1.5; padding:0 15px;">Who did you defeat today? Enter their name below to finalize the match.</div>
            </div>
            
            <div style="position:relative; margin:20px 0;">
                <input type="text" id="claim-opponent-search" placeholder="OPPONENT'S NAME / GUEST" style="margin-bottom:0; background:rgba(255,255,255,0.05); border:1px solid #333; text-align:center; font-family:'Russo One'; letter-spacing:1px; text-transform:uppercase; font-size:1.1rem; padding:15px; color:#fff;">
                <div id="claim-results" class="quick-results"></div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:25px;">
                <button class="btn-red" id="btn-confirm-claim" data-score1="${o}" data-score2="${r}" data-game-id="${n}" style="flex:1; background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:1.1rem; padding:18px; box-shadow:0 5px 15px rgba(255,215,0,0.3);">
                    ${c?"CREATE ACCOUNT & SAVE RANK":"<i class='fa-solid fa-floppy-disk' style='margin-right:10px;'></i> SAVE RESULT"}
                </button>
                
                <button class="btn-red" id="btn-cancel-claim" style="flex:1; padding:15px; font-size:0.9rem; background:transparent; border: 1px dashed #444; color:#666;">
                    DISCARD MATCH
                </button>
            </div>
        `,c&&(i.pendingMatch={p1Score:o,p2Score:r,gameId:n},localStorage.setItem("subsoccer_pending_match",JSON.stringify(i.pendingMatch))),i.quickP1=i.user.username,setTimeout(()=>document.getElementById("claim-opponent-search")?.focus(),500)}m("🏆 Victory! Enter opponent name to save.","success");const d=new URL(window.location);d.searchParams.delete("action"),d.searchParams.delete("p1_score"),d.searchParams.delete("p2_score"),d.searchParams.delete("game_id"),window.history.replaceState({},document.title,d.pathname)}async function Ro(t,e,n){const r=document.getElementById("claim-opponent-search")?.value.trim().toUpperCase();if(!r)return m("Enter opponent name","error");if(r===i.user.username)return m("Cannot play against yourself","error");i.quickP2=r,i.proScoreP1=t,i.proScoreP2=e,await Pe(i.user.username,n?`Instant Play: ${n}`:"Instant Play"),dn()}function dn(){const t=document.getElementById("quick-match-section"),e=document.getElementById("claim-result-container");e&&(e.style.display="none"),t&&Array.from(t.children).forEach(n=>{n.id!=="claim-result-container"&&(n.style.display="")}),window.history.replaceState({},document.title,window.location.pathname)}function cn(){const t=C.getRoomId();if(!t)return m("Broadcast not active yet.","error");const e=`${window.location.origin}/tv.html?room=${t}`;navigator.clipboard.writeText(e).then(()=>{m("📺 TV Link copied to clipboard!","success")}).catch(n=>{m("Failed to copy link","error")})}function un(){const t=C.getRoomId();if(!t)return m("Broadcast not active yet.","error");const e=`${window.location.origin}/tv.html?room=${t}&role=caster`;navigator.clipboard.writeText(e).then(()=>{m("🎤 VIP Caster Link copied!","success")}).catch(n=>{m("Failed to copy link","error")})}window.handleGoalDetected=Ao;window.toggleProMode=an;window.cancelQuickMatch=Io;window.handleQuickWinner=ko;window.toggleSoundEffects=gt;window.initClaimResult=ln;window.copyTvLink=cn;window.copyVipLink=un;function zo(){document.getElementById("p1-quick-search")?.addEventListener("input",t=>je(t.target,"p1")),document.getElementById("p2-quick-search")?.addEventListener("input",t=>je(t.target,"p2")),document.getElementById("btn-clear-quick-players")?.addEventListener("click",()=>To()),document.getElementById("start-quick-match")?.addEventListener("click",()=>Eo()),document.getElementById("pro-mode-section")?.addEventListener("click",()=>So()),document.getElementById("toggle-audio-btn")?.addEventListener("click",()=>At()),document.getElementById("btn-accept-rules")?.addEventListener("click",()=>rn()),document.getElementById("pro-player-left")?.addEventListener("click",()=>Ct(1)),document.getElementById("pro-player-right")?.addEventListener("click",()=>Ct(2)),document.getElementById("btn-exit-pro-mode")?.addEventListener("click",()=>$o()),document.getElementById("btn-pro-undo")?.addEventListener("click",()=>Lo()),document.getElementById("btn-pro-reset")?.addEventListener("click",()=>Co()),document.getElementById("btn-pro-mic")?.addEventListener("click",()=>At()),document.getElementById("btn-pro-sound")?.addEventListener("click",()=>gt()),document.getElementById("btn-pro-tv")?.addEventListener("click",()=>cn()),document.getElementById("btn-pro-vip")?.addEventListener("click",()=>un()),document.getElementById("btn-victory-new-game")?.addEventListener("click",Lt),document.getElementById("btn-victory-end-game")?.addEventListener("click",Lt),document.addEventListener("click",t=>{const e=t.target.closest('[data-action="select-quick-player"]');if(e){xo(e.dataset.player,e.dataset.slot);return}if(t.target.id==="btn-confirm-claim"){Ro(parseInt(t.target.dataset.score1),parseInt(t.target.dataset.score2),t.target.dataset.gameId);return}if(t.target.id==="btn-cancel-claim"){dn();return}}),document.addEventListener("input",t=>{t.target.id==="claim-opponent-search"&&je(t.target,"claim")})}const Ze=t=>t&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t));let Mt=!1;async function Po(){try{Fo();const{data:{session:t},error:e}=await p.auth.getSession();e?(console.warn("Supabase auth warning (usually safe to ignore):",e.message),e.message.includes("Invalid Refresh Token")&&await p.auth.signOut().catch(()=>{})):t&&(!i.user||i.user.id!==t.user.id)&&await zt(t.user.id),!t&&!i.user&&new URLSearchParams(window.location.search).get("page")==="events"&&(console.log("👀 Public access: Spectator Mode enabled"),i.user={id:"spectator",username:"Spectator",elo:0,wins:0,losses:0,is_spectator:!0}),Mt||(p.auth.onAuthStateChange(async(n,o)=>{(n==="SIGNED_IN"||n==="INITIAL_SESSION")&&o?(!i.user||i.user.id!==o.user.id)&&await zt(o.user.id):n==="SIGNED_OUT"&&(i.user=null,localStorage.removeItem("subsoccer-user"))}),Mt=!0),typeof me=="function"&&await me(),await mn()}catch(t){console.error("Virhe alustuksessa:",t)}}function Le(t){document.getElementById("login-form").style.display=t?"none":"block",document.getElementById("signup-form").style.display=t?"block":"none"}async function et(t){if(!window.crypto||!crypto.subtle)return console.warn("SHA-256 requires HTTPS or localhost. Falling back to plain text for legacy check."),t;const e=new TextEncoder().encode(t),n=await crypto.subtle.digest("SHA-256",e);return Array.from(new Uint8Array(n)).map(r=>r.toString(16).padStart(2,"0")).join("")}let Rt=null,Ve=!1;async function zt(t){if(!(Rt===t||Ve)){Ve=!0,Rt=t;try{const{data:e,error:n}=await p.from("players").select("*, team_data:teams!players_team_id_fkey(*)").eq("id",t),o=e?.[0];if(n){if(n.message?.includes("AbortError"))return;console.error("Tietokantavirhe profiilia haettaessa (406?):",n);return}if(o)i.user=o,localStorage.setItem("subsoccer-user",JSON.stringify(o)),console.log("👤 CURRENT USER ID (Copy this for config.js):",o.id);else{console.log("Profiili puuttuu, luodaan automaattisesti ID:lle:",t);const{data:{user:r}}=await p.auth.getUser(),a={id:t,username:r?.user_metadata?.username||r?.email?.split("@")[0].toUpperCase()||"PLAYER",email:r?.email,elo:1300,wins:0,losses:0,is_admin:!1},{data:s,error:d}=await p.from("players").upsert(a,{onConflict:"id"}).select().maybeSingle();if(!d&&s)i.user=s,localStorage.setItem("subsoccer-user",JSON.stringify(s));else{if(d?.message?.includes("AbortError"))return;console.error("Profiilin automaattinen luonti epäonnistui:",d),m("Profiilin luonti epäonnistui: "+(d?.message||"RLS Error"),"error")}}}catch(e){console.error("Odottamaton virhe profiilin päivityksessä:",e)}finally{Ve=!1}}}async function mn(){const t=document.getElementById("country-input");if(t){if(i.countries&&i.countries.length>0){Pt(t,i.countries);return}try{const{data:e,error:n}=await p.from("countries").select("name, code").order("name");if(n)throw n;e&&e.length>0&&(i.countries=e,Pt(t,e))}catch(e){console.error("Maiden haku epäonnistui:",e),t.innerHTML='<option value="fi">Finland</option>'}}}function Pt(t,e){t.innerHTML='<option value="" disabled selected>Select Country</option>',e.forEach(n=>{const o=document.createElement("option");o.value=n.code.toLowerCase(),o.innerText=n.name,t.appendChild(o)})}async function tt(){const t=document.getElementById("reg-user").value.replace(/\s+/g," ").trim().toUpperCase(),e=document.getElementById("reg-email")?.value.trim(),n=document.getElementById("reg-pass").value.trim();if(!t||!n||!e)return m("Fill all fields including email","error");let{data:o}=await p.from("players").select("*").ilike("username",t);if(!o||o.length===0){const l=t.replace(/\s+/g,"%"),{data:c}=await p.from("players").select("*").ilike("username",l);o=c||[]}let r=o.find(l=>!Ze(l.id))||o[0];if(n.length<6)return m("New security policy requires at least 6 characters. Please choose a longer password.","error");let{data:a,error:s}=await p.auth.signUp({email:e,password:n,options:{data:{username:t,full_name:t,display_name:t}}});if(s&&(s.message.toLowerCase().includes("already registered")||s.message.toLowerCase().includes("already been registered")||s.status===422||s.code==="user_already_exists")){console.log("Email already in Auth, attempting to verify password via sign-in...");const{data:l,error:c}=await p.auth.signInWithPassword({email:e,password:n});if(c)return console.error("Migration sign-in failed:",c),m("This email is already in use. Please use the correct password or a different email.","error");a=l,s=null}if(s)return m(s.message,"error");if(a.user){let l;if(r){console.log("Migrating existing record:",r.username,"ID:",r.id,"to UUID:",a.user.id);const c=r.id,u=a.user.id;if(c===u){console.log("User already has correct UUID, updating email only..."),await p.from("players").update({email:e}).eq("id",u),m("Account updated successfully! 🎉","success"),a.session||Le(!1);return}const{data:f}=await p.from("players").select("id").eq("id",u).maybeSingle(),{id:g,username:y,...v}=r,b={...v,email:e};f?(console.log("Updating existing UUID record with legacy stats..."),await p.from("players").update(b).eq("id",u)):(console.log("Creating new UUID record with legacy stats..."),await p.from("players").insert([{...b,id:u,username:y+"_MIGRATING"}])),console.log("Database cascade handling references..."),console.log("Finalizing migration..."),await p.from("players").delete().eq("id",c);const{error:h}=await p.from("players").update({username:y}).eq("id",u);l=h}else{let c=null;const u=document.getElementById("signup-avatar-file");if(u&&u.files&&u.files[0])try{c=await pn(u.files[0],a.user.id)}catch(y){console.error("Failed to upload avatar during signup:",y)}const f={id:a.user.id,username:t,email:e,elo:1300,wins:0,losses:0,acquired_via:i.brand};c&&(f.avatar_url=c);const{error:g}=await p.from("players").upsert(f,{onConflict:"id"});if(l=g,!g&&(i.user={...i.user,...f},localStorage.setItem("subsoccer-user",JSON.stringify(i.user)),u)){u.value="";const y=document.getElementById("signup-avatar-preview"),v=document.getElementById("signup-avatar-filename");y&&(y.src="placeholder-silhouette-5-wide.png"),v&&(v.textContent="")}}if(l)m("Profile error: "+l.message,"error");else{m("Account created successfully! 🎉","success"),a.session||Le(!1);const c=localStorage.getItem("subsoccer_pending_match");if(c)try{const u=JSON.parse(c);console.log("Found pending match to claim for new user:",u),window.showAuthPage&&window.showAuthPage("app"),setTimeout(()=>{window.initClaimResult&&(window.initClaimResult(u.p1Score,u.p2Score,u.gameId),localStorage.removeItem("subsoccer_pending_match"))},1e3)}catch(u){console.warn("Failed to process pending match:",u)}}}}async function Oo(t){t&&t.preventDefault&&t.preventDefault(),Object.keys(localStorage).forEach(o=>{(o.startsWith("sb-")||o.includes("supabase"))&&localStorage.removeItem(o)}),await p.auth.signOut().catch(()=>{}),Vt();const e=document.getElementById("btn-login");if(e&&e.disabled){console.warn("⚠️ Login already in progress, ignoring duplicate attempt.");return}const n=e?e.textContent:"LOG IN";try{e&&(e.disabled=!0,e.textContent="LOGGING IN...");const o=document.getElementById("auth-user")?.value.replace(/\s+/g," ").trim(),r=document.getElementById("auth-pass")?.value;if(!o||!r){m("Please enter both username/email and password","error");return}if(o.includes("@")){console.log("📧 Attempting email login via Supabase Auth...");const{data:d,error:l}=await p.auth.signInWithPassword({email:o,password:r});if(!l){console.log("✅ Email login successful"),m("Welcome back!","success");return}console.log("Supabase Auth login failed:",l.message);const{data:c,error:u}=await p.from("players").select("*").ilike("email",o);if(!u&&c&&c.length>0){const f=await et(r),g=c.find(y=>y.password===f||y.password===r)||c[0];if(console.log("Legacy record found by email:",g.username),Ze(g.id))throw l.message.toLowerCase().includes("email not confirmed")?new Error("Please confirm your email address (check your inbox)."):l;if(g.password===f||g.password===r){Ot(g,r);return}}throw l}console.log("🔍 Searching players table by username...");let{data:a,error:s}=await p.from("players").select("*").ilike("username",o);if(console.log("📡 DB Search completed. Matches found:",a?.length||0),s){if(s.message?.includes("AbortError"))return;throw console.error("Database error (check RLS policies):",s),new Error("Database connection error. Please check your permissions.")}if(!a||a.length===0){console.log("Direct search failed, trying fuzzy search...");const d=o.replace(/\s+/g,"%"),{data:l}=await p.from("players").select("*").ilike("username",d);a=l||[]}if(a&&a.length>0){console.log(`🔑 Found ${a.length} matching records. Checking credentials...`);const d=await et(r),l=a.find(u=>Ze(u.id)&&u.email);if(l){console.log("Migrated record found, attempting Auth login for:",l.email);const{data:u,error:f}=await p.auth.signInWithPassword({email:l.email,password:r});if(!f){console.log("Auth login successful for:",l.email),m("Welcome back!","success");return}console.log("Auth login failed:",f.message)}const c=a.find(u=>u.password===d||u.password===r);if(c){console.log("Legacy password match found for ID:",c.id),Ot(c,r);return}}throw new Error("Invalid login credentials. If you recently upgraded, your secure password might be different from your old one.")}catch(o){console.error("Login error:",o);const r=o.message||"An error occurred during login.";m(r.includes("Invalid login credentials")?"Invalid email or password.":r,"error")}finally{e&&(e.disabled=!1,e.textContent=n)}}function Ot(t,e){const n=t.email||"",o=n?`Welcome back ${t.username}! 

We've upgraded our security. Confirm your email to continue:`:`Welcome back ${t.username}! 

We've upgraded our security. Please enter your email address to continue:`,r=prompt(o,n);r&&r.includes("@")?(document.getElementById("reg-user").value=t.username,document.getElementById("reg-email").value=r,document.getElementById("reg-pass").value=e,m("Upgrading your account...","success"),tt()):m("Email is required to access your account.","error")}function Do(){const t=document.getElementById("guest-nick").value.toUpperCase()||"GUEST",e={username:t,id:"guest",elo:1300,wins:0,losses:0};i.user=e,localStorage.setItem("subsoccer-user",JSON.stringify(e)),i.sessionGuests.includes(t)||(i.sessionGuests=[...i.sessionGuests,t])}async function No(){if(p)try{await p.auth.signOut()}catch(t){console.error("Error logging out:",t)}Vt(),window.location.replace("index.html")}function Dt(t,e="avatar-preview",n="avatar-file-name"){const o=t.files[0],r=document.getElementById(n);if(!o){r&&(r.textContent="");return}if(r&&(r.textContent=`📷 ${o.name} (${(o.size/1024).toFixed(1)} KB)`),o.size>5*1024*1024){m("Image too large (max 5MB)","error"),t.value="",r&&(r.textContent="");return}const a=new FileReader;a.onload=s=>{const d=document.getElementById(e);d&&(d.src=s.target.result),e==="avatar-preview"&&window.updateAvatarPreview&&window.updateAvatarPreview(s.target.result)},a.readAsDataURL(o)}async function pn(t,e=null){try{const n=t.name.split(".").pop(),a=`avatars/${`${e||(i.user?i.user.id:"unknown")}_${Date.now()}.${n}`}`;console.log("Uploading avatar:",a);const{data:s,error:d}=await p.storage.from("event-images").upload(a,t,{cacheControl:"3600",upsert:!1});if(d)throw console.error("Upload error:",d),d;const{data:l}=p.storage.from("event-images").getPublicUrl(a);return console.log("Avatar uploaded successfully:",l.publicUrl),l.publicUrl}catch(n){throw console.error("Failed to upload avatar:",n),n}}async function qo(t){return console.log("AI Stylizing image:",t),t}async function Go(t){const e=t?.target||(window.event?window.event.target:null),n=e?e.textContent:"";try{e&&(e.disabled=!0,e.textContent="Uploading...");const r=document.getElementById("avatar-file-input")?.files[0],a=document.getElementById("edit-username")?.value.trim(),s=document.getElementById("edit-full-name")?.value.trim(),d=document.getElementById("edit-email")?.value.trim(),l=document.getElementById("edit-phone")?.value.trim(),c=document.getElementById("edit-city")?.value.trim(),u=document.getElementById("country-input")?.value.trim().toLowerCase(),f=document.getElementById("edit-password")?.value.trim();let g=i.user.avatar_url;const y=document.getElementById("use-ai-style-checkbox")?.checked;if(r)try{e&&(e.textContent="Uploading photo...");const h=await pn(r);y?(e&&(e.textContent="AI Stylizing..."),g=await qo(h)):g=h}catch(h){m("Failed to upload photo: "+h.message,"error");return}if(d&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d)){m("Please enter a valid email address","error"),e&&(e.textContent=n,e.disabled=!1);return}if(a){if(a.length<2){m("Gamertag must be at least 2 characters","error"),e&&(e.textContent=n,e.disabled=!1);return}if(a.includes(" ")){m("Gamertag cannot contain spaces","error"),e&&(e.textContent=n,e.disabled=!1);return}}const v={full_name:s,email:d,phone:l,city:c,country:u,avatar_url:g};if(a&&a!==i.user.username&&(v.username=a),f){e&&(e.textContent="Updating Security...");const{error:h}=await p.auth.updateUser({password:f});if(h){m("Password update failed: "+h.message,"error");return}v.password=await et(f)}if(Object.keys(v).length===0){m("Nothing to update","error");return}e&&(e.textContent="Saving...");const{error:b}=await p.from("players").update(v).eq("id",i.user.id);b?b.code==="23505"?m("This Gamertag is already taken. Choose another.","error"):m("Error updating profile: "+b.message,"error"):(i.user={...i.user,username:v.username||i.user.username,full_name:s,email:d,phone:l,city:c,country:u,avatar_url:g},localStorage.setItem("subsoccer-user",JSON.stringify(i.user)),m("Profile updated successfully!","success"))}catch(o){console.error("Save profile error:",o),m("Error: "+o.message,"error")}finally{e&&(e.disabled=!1,e.textContent=n)}}function Fo(){const t=document.getElementById("auth-form-wrapper");if(t){const n=t.cloneNode(!0);t.parentNode.replaceChild(n,t),n.addEventListener("submit",o=>{o.preventDefault(),o.stopImmediatePropagation(),Oo(o)})}document.getElementById("btn-show-signup")?.addEventListener("click",()=>Le(!0)),document.getElementById("btn-register")?.addEventListener("click",tt),document.getElementById("link-back-to-login")?.addEventListener("click",()=>Le(!1)),document.getElementById("btn-guest-login")?.addEventListener("click",Do),document.querySelectorAll(".logout-item, #btn-logout").forEach(n=>{n.addEventListener("click",o=>{o.preventDefault(),No()})});const e=document.getElementById("signup-form");e&&!e.dataset.authBound&&(e.addEventListener("submit",n=>{n.preventDefault(),n.stopImmediatePropagation(),tt()}),e.dataset.authBound="true")}function fn(t,e){const n=`${window.location.origin}${window.location.pathname}?live=${t}`;navigator.clipboard.writeText(n).then(()=>{m("Live link copied to clipboard!","success")}).catch(()=>{const o=document.createElement("div");o.style.cssText="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; display:flex; align-items:center; justify-content:center; padding:20px;",o.innerHTML=`
            <div style="background:#1a1a1a; border:2px solid var(--sub-gold); border-radius:12px; padding:30px; max-width:500px; width:100%;">
                <h2 style="font-family:'Russo One'; color:var(--sub-gold); margin-bottom:20px; text-align:center;">
                    <i class="fa fa-share-alt" style="margin-right:8px;"></i> LIVE EVENT LINK
                </h2>
                <p style="color:#ccc; margin-bottom:15px; text-align:center;">
                    Share this link to display live tournament results on screens or other devices.
                </p>
                <input type="text" value="${n}" readonly 
                       style="width:100%; padding:12px; background:#0a0a0a; border:1px solid #333; color:#fff; font-family:monospace; border-radius:6px; margin-bottom:20px; font-size:0.9rem;"
                       data-action="select-all">
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:#4CAF50;" data-action="copy-live-link" data-url="${n}">
                        <i class="fa fa-copy"></i> COPY LINK
                    </button>
                    <button class="btn-red" style="flex:1; background:#333;" data-action="close-share-modal">
                        <i class="fa fa-times"></i> CLOSE
                    </button>
                </div>
            </div>
        `,document.body.appendChild(o)})}async function yt(t,e=!1){let n=document.getElementById("live-content");n||(n=document.createElement("div"),n.id="live-content",document.body.appendChild(n)),n.style.cssText="width:100%; height:100vh; padding:0; box-sizing:border-box; background-color:#050505; background-image: linear-gradient(45deg, #0a0a0a 25%, transparent 25%), linear-gradient(-45deg, #0a0a0a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0a0a0a 75%), linear-gradient(-45deg, transparent 75%, #0a0a0a 75%); background-size: 8px 8px; position:fixed; top:0; left:0; z-index:20000; overflow-y:auto; -webkit-overflow-scrolling:touch;";const o=document.getElementById("app-content");o&&(o.style.display="none"),e||(n.innerHTML=`
            <div style="text-align:center; padding:40px; color:#fff;">
                <i class="fa fa-spinner fa-spin" style="font-size:3rem; color:var(--sub-gold);"></i>
                <p style="margin-top:20px; font-size:1.2rem;">Loading event...</p>
            </div>
        `);try{const{data:r,error:a}=await p.from("events").select("*").eq("id",t).single();if(a)throw a;if(!r)throw new Error("Event not found");if(!e){document.title=`LIVE: ${r.event_name}`;const u=(f,g)=>{if(!g)return;let y=document.querySelector(`meta[property="${f}"]`);y||(y=document.createElement("meta"),y.setAttribute("property",f),document.head.appendChild(y)),y.setAttribute("content",g)};u("og:title",r.event_name),u("og:description",r.description||"Follow live tournament results."),u("og:url",window.location.href),r.image_url&&u("og:image",r.image_url)}const{data:s,error:d}=await p.from("tournament_history").select(`
                *,
                game: games(game_name, location)
            `).eq("event_id",t).order("start_datetime",{ascending:!0});if(d)throw d;if(s&&s.length>0){for(let u of s){const{count:f}=await p.from("event_registrations").select("*",{count:"exact",head:!0}).eq("tournament_id",u.id);u.computed_participant_count=f||0}for(let u of s){const{data:f,error:g}=await p.from("matches").select("*").eq("tournament_id",u.id).order("created_at",{ascending:!0});u.matches=f||[]}}const l=s.filter(u=>u.status==="completed");let c={};if(l.length>0){const u=[...new Set(l.flatMap(f=>[f.winner_name,f.second_place_name,f.third_place_name]).filter(f=>f))];if(u.length>0){const{data:f}=await p.from("players").select("username, avatar_url, country, elo").in("username",u);f&&f.forEach(g=>{c[g.username.toLowerCase()]=g})}}r.primary_color&&document.documentElement.style.setProperty("--sub-gold",r.primary_color),jo(r,s||[],c),window.liveEventRefreshInterval&&clearInterval(window.liveEventRefreshInterval),window.liveEventRefreshInterval=setInterval(()=>{if(!document.getElementById("live-content")){clearInterval(window.liveEventRefreshInterval);return}yt(t,!0)},1e4)}catch(r){console.error("Failed to load live event:",r),n.innerHTML=`
            <div style="text-align:center; padding:40px; color:#fff;">
                <h2 style="color:#f44336; font-family:'Russo One'; margin-bottom:20px;">⚠️ Error Loading Event</h2>
                <p style="color:#999; margin-bottom:10px;">Unable to load event data.</p>
                <p style="color:#666; font-size:0.9rem; font-family:monospace;">${r.message||"Unknown error"}</p>
                <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:var(--sub-red); color:#fff; border:none; border-radius:6px; cursor:pointer; font-family:'Russo One';">
                    RELOAD PAGE
                </button>
            </div>
        `}}function Uo(t){const e=t.matches||[],n=new Set;e.forEach(b=>{b.player1&&n.add(b.player1),b.player2&&n.add(b.player2)});const o=Math.max(t.computed_participant_count||0,n.size);if(o<2)return`
            <div style="text-align:center; padding:30px; color:#444; border:1px dashed #222; border-radius:8px;">
                <i class="fa fa-users" style="font-size:2rem; margin-bottom:15px; opacity:0.3;"></i>
                <div style="font-family:var(--sub-name-font); font-size:0.9rem; letter-spacing:1px;">WAITING FOR PLAYERS</div>
                <div style="font-size:0.75rem; color:#666; margin-top:5px;">${o} joined so far</div>
            </div>
        `;let r=2;for(;r<o;)r*=2;r>32&&(r=32);const a=Math.log2(r),s=r-o,d=(o-s)/2,l={},c=Array.from({length:a},()=>[]),u=[...e].sort((b,h)=>new Date(b.created_at)-new Date(h.created_at));let f=0;u.forEach(b=>{const h=b.player1||"Unknown",x=b.player2||"Unknown",E=l[h]||0,T=l[x]||0;let w=Math.max(E,T);E===0&&T===0&&(f<d?(w=0,f++):w=1),w>=a&&(w=a-1),w>0&&(E===0&&h!=="Unknown"&&c[0].push({player1:h,isBye:!0}),T===0&&x!=="Unknown"&&c[0].push({player1:x,isBye:!0})),c[w].push(b),l[h]=w+1,l[x]=w+1});let g='<div style="display:flex; gap:30px; overflow-x:auto; padding:20px 0; align-items: flex-start;">';const y=b=>{if(b.isBye)return`
                <div class="bracket-match-card" style="background:#111; border:1px solid #333; border-radius:6px; overflow:hidden; min-width:240px; box-shadow:0 4px 15px rgba(0,0,0,0.3); position:relative; opacity:0.6;">
                    <div style="padding:12px 15px; border-bottom:1px solid #222; background:rgba(255,255,255,0.05);">
                        <span style="color:#fff; font-weight:bold; font-size:0.95rem; font-family:var(--sub-name-font); text-transform:uppercase; letter-spacing:0.5px;">${b.player1}</span>
                    </div>
                    <div style="padding:12px 15px; color:#888; font-size:0.8rem; font-family:var(--sub-name-font); letter-spacing:1px; display:flex; align-items:center;">
                        <i class="fa fa-arrow-right" style="margin-right:8px; font-size:0.7rem;"></i> BYE
                    </div>
                </div>
            `;const h=b.winner===b.player1,x=b.winner===b.player2,E=b.player1_score!==null?b.player1_score:"",T=b.player2_score!==null?b.player2_score:"";let w="#333";return b.winner&&(w="#555"),`
            <div class="bracket-match-card" style="background:#111; border:1px solid ${w}; border-radius:6px; overflow:hidden; min-width:240px; box-shadow:0 4px 15px rgba(0,0,0,0.3); position:relative;">
                <!-- Player 1 -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid #222; position:relative; ${h?"background:rgba(255,215,0,0.1);":""}">
                    ${h?'<div style="position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--sub-gold);"></div>':""}
                    <span style="color:${h?"#fff":"#888"}; font-weight:${h?"bold":"normal"}; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; font-family:var(--sub-name-font); padding-left:${h?"6px":"0"}; text-transform:uppercase; letter-spacing:0.5px;">${b.player1}</span>
                    <span style="color:${h?"var(--sub-gold)":"#555"}; font-family:'Russo One'; font-size:1.1rem; text-shadow:${h?"0 0 10px rgba(255,215,0,0.3)":"none"};">${E}</span>
                </div>
                <!-- Player 2 -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; position:relative; ${x?"background:rgba(255,215,0,0.1);":""}">
                    ${x?'<div style="position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--sub-gold);"></div>':""}
                    <span style="color:${x?"#fff":"#888"}; font-weight:${x?"bold":"normal"}; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; font-family:var(--sub-name-font); padding-left:${x?"6px":"0"}; text-transform:uppercase; letter-spacing:0.5px;">${b.player2}</span>
                    <span style="color:${x?"var(--sub-gold)":"#555"}; font-family:'Russo One'; font-size:1.1rem; text-shadow:${x?"0 0 10px rgba(255,215,0,0.3)":"none"};">${T}</span>
                </div>
            </div>
        `},v=()=>`
        <div style="background:rgba(255,255,255,0.03); border:1px dashed #333; border-radius:6px; height:86px; min-width:240px; display:flex; align-items:center; justify-content:center;">
            <span style="color:#444; font-size:0.75rem; letter-spacing:2px; font-family:var(--sub-name-font); font-weight:bold;">TBD</span>
        </div>
    `;for(let b=0;b<a;b++){const h=r/Math.pow(2,b+1);let x=c[b]||[];if(b===a-1&&b>0)try{const w=c[b-1]||[],$=new Set(w.map(S=>S.winner).filter(S=>S)),D=new Set;if(w.forEach(S=>{S.winner&&D.add(S.player1===S.winner?S.player2:S.player1)}),$.size>0){let S=x.find(k=>{if(!k.player1||!k.player2)return!1;const z=$.has(k.player1),F=$.has(k.player2),_t=D.has(k.player1),oo=D.has(k.player2);return(z||F)&&!_t&&!oo});if(!S){const k=Array.from($);k.length>=1&&(S={player1:k[0],player2:k[1]||"TBD",player1_score:null,player2_score:null,winner:null})}x=S?[S]:[]}}catch(w){console.warn("Error filtering final round:",w)}let E=`ROUND ${b+1}`;b===a-1?E="FINALS":b===a-2?E="SEMI FINALS":b===a-3&&(E="QUARTER FINALS");let T="";for(let w=0;w<h;w++){const $=x[w];$?T+=y($):T+=v()}g+=`
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div style="text-align:center; color:#555; font-size:0.75rem; margin-bottom:5px; font-family:var(--sub-name-font); letter-spacing:2px; text-transform:uppercase;">${E}</div>
                <div style="display:flex; flex-direction:column; gap:15px; justify-content:space-around; flex:1;">
                    ${T}
                </div>
            </div>
        `}return g+="</div>",g}function Ho(t){return Qe(Uo(t))}function jo(t,e,n={}){const r=new Date(t.start_datetime).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}),a=(l,c,u,f)=>{if(!l)return"";const g=n[l.toLowerCase()]||{username:l,elo:"-",country:null,avatar_url:null},y=g.country?g.country.toLowerCase():"fi",v=g.avatar_url?`<img src="${g.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">`:'<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #151515; color: #333; font-size: 2.5rem;"><i class="fa fa-user"></i></div>';return`
            <div data-username="${g.username}" style="cursor: pointer; display:flex; flex-direction:column; align-items:center; margin: 0 5px; position: relative; z-index: ${4-f}; ${f===1?"transform: scale(1.1); margin-bottom: 10px;":""}">
                <div style="font-size: 1.5rem; margin-bottom: 5px;">${c}</div>
                
                <div style="width: 100px; height: 160px; background: #0a0a0a; border: 2px solid ${u}; border-radius: 6px; position: relative; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column;">
                    <!-- Header -->
                    <div style="background: ${u}; color: #000; padding: 2px 0; text-align: center; font-family: var(--sub-name-font); font-weight: bold; font-size: 0.5rem; letter-spacing: 1px;">
                        ${f===1?"WINNER":f===2?"2ND":"3RD"}
                    </div>
                    
                    <!-- Image -->
                    <div style="flex: 1; position: relative; overflow: hidden; background: #151515;">
                        ${v}
                        <!-- Gradient Overlay for text readability -->
                        <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 60%; background: linear-gradient(to top, #000 0%, transparent 100%);"></div>
                    </div>
                    
                    <!-- Info -->
                    <div style="position: absolute; bottom: 0; left: 0; width: 100%; padding: 8px 4px; box-sizing: border-box; text-align: center;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 3px; margin-bottom: 1px;">
                            <img src="https://flagcdn.com/w40/${y}.png" style="height: 8px; border-radius: 1px;">
                            <div style="color: #fff; font-family: var(--sub-name-font); font-size: 0.65rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;">
                                ${g.username}
                            </div>
                        </div>
                        <div style="color: ${u}; font-family: 'Russo One'; font-size: 0.9rem;">
                            ${g.elo}
                        </div>
                    </div>
                </div>
            </div>
        `},s=document.getElementById("live-content")||document.getElementById("content")||document.body,d=`
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
    `;s.innerHTML=d+`
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

                <img src="subsoccer_logo.svg" alt="Subsoccer" style="height: 50px; width: auto; display: block; margin: 0 auto 25px auto; filter: drop-shadow(0 0 15px rgba(0,0,0,0.8));">

                ${t.brand_logo_url?`
                    <div style="background: rgba(255,255,255,0.05); display: inline-block; padding: 10px 25px; border-radius: var(--sub-radius); margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                        <img src="${t.brand_logo_url}" style="max-height:70px; width:auto; display:block;">
                    </div>
                `:""}

                <h1 class="sub-heading-premium" style="font-size:3.5rem; margin-bottom:15px; line-height: 1; text-transform:uppercase; letter-spacing:3px; text-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    ${t.event_name}
                </h1>
                
                <div style="display: flex; justify-content: center; gap: 30px; align-items: center; flex-wrap: wrap; margin-top: 15px;">
                    <div style="font-size:1rem; color:#ccc; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; display:flex; align-items:center; gap:10px;">
                        <i class="fa fa-calendar" style="color: var(--sub-gold);"></i> ${r}
                    </div>
                    ${t.location?`
                        <div style="font-size:1rem; color:#ccc; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; display:flex; align-items:center; gap:10px;">
                            <i class="fa fa-map-marker-alt" style="color: var(--sub-red);"></i> ${t.location}
                        </div>
                    `:""}
                </div>

                <div style="margin-top:25px; display: flex; justify-content: center; gap: 15px;">
                    <div class="sub-badge-live live-badge-pulse" style="font-size: 0.8rem; padding: 8px 20px; border-radius: 4px; letter-spacing: 2px; background:var(--sub-red); color:#fff; font-weight:bold; display:flex; align-items:center; gap:10px; box-shadow: 0 0 20px rgba(227,6,19,0.4);">
                        <i class="fa fa-broadcast-tower"></i> LIVE BROADCAST
                    </div>
                </div>
            </div>
            
            <!-- Tournament Grid -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(450px, 1fr)); gap:30px;">
                ${e.map(l=>{try{const u=new Date(l.start_datetime).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),f=l.computed_participant_count||0;return`
                        <div class="glass-panel" style="border-top: 4px solid ${l.status==="completed"?"var(--sub-gold)":l.status==="ongoing"?"var(--sub-red)":"#333"}; position: relative; display: flex; flex-direction: column; padding: 30px; height:100%;">
                            
                            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:25px;">
                                <div style="flex: 1;">
                                    <div style="font-size:0.75rem; color:var(--sub-gold); font-family: var(--sub-name-font); letter-spacing: 2px; margin-bottom: 8px; text-transform: uppercase;">
                                        ${l.game?.game_name||"Tournament"}
                                    </div>
                                    <h2 style="font-family:var(--sub-name-font); font-size:1.6rem; margin:0; line-height: 1.2; color:#fff; letter-spacing:1px;">
                                        ${l.tournament_name||"Unofficial Match"}
                                    </h2>
                                </div>
                                <div style="text-align:right; margin-left: 20px;">
                                    ${l.status==="ongoing"?`
                                        <div style="color:var(--sub-red); font-size:0.7rem; font-weight:bold; letter-spacing:1px; animation:pulse 1.5s infinite;">● LIVE</div>
                                    `:`
                                        <div style="font-size:0.7rem; color:${l.status==="completed"?"var(--sub-gold)":"#666"}; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase; font-weight: bold;">
                                            ${l.status==="completed"?"FINISHED":"SCHEDULED"}
                                        </div>
                                    `}
                                    <div style="margin-top:5px; font-size:1.4rem; color:#fff; font-family: var(--sub-name-font); font-weight:bold;">
                                        ${u}
                                    </div>
                                </div>
                            </div>

                            <div style="height:1px; background:rgba(255,255,255,0.1); margin-bottom:25px;"></div>
                            
                            <div style="flex: 1;">
                                ${l.status==="completed"||l.status==="ongoing"?`
                                    ${l.status==="completed"?`
                                        <div style="background:rgba(255, 255, 255, 0.02); border:1px solid #333; border-radius:var(--sub-radius); padding:30px; text-align:center; margin-bottom: 30px;">
                                            <div style="color:#888; font-family:var(--sub-name-font); font-size:0.75rem; letter-spacing:4px; margin-bottom:20px; text-transform:uppercase;">Tournament Podium</div>
                                            <div style="display:flex; justify-content:center; align-items:flex-end; gap:20px;">
                                                ${a(l.second_place_name,"🥈","#C0C0C0",2)}
                                                ${a(l.winner_name,"🏆","#FFD700",1)}
                                                ${a(l.third_place_name,"🥉","#CD7F32",3)}
                                            </div>
                                        </div>
                                    `:""}
                                    
                                    <div style="margin-bottom:20px;">
                                        ${Ho(l)}
                                    </div>
                                    
                                    ${l.status==="ongoing"?`
                                        <div style="background:rgba(193, 39, 45, 0.05); border:1px solid rgba(193, 39, 45, 0.2); border-radius:var(--sub-radius); padding:25px; text-align:center;">
                                        <div class="sub-badge-live" style="margin-bottom: 20px;">MATCH IN PROGRESS</div>
                                        <div style="color:#fff; font-size:1.4rem; font-family: var(--sub-name-font); letter-spacing: 1px;">
                                            ${f} PLAYERS COMPETING
                                        </div>
                                        <div style="font-size:0.9rem; color:#888; margin-top:15px; font-family: var(--sub-name-font); letter-spacing: 1px;">
                                            Live results updating automatically
                                        </div>
                                        </div>
                                    `:""}
                                `:`
                                    <div style="background:rgba(255, 255, 255, 0.02); border:1px solid var(--sub-border); border-radius:var(--sub-radius); padding:50px 20px; text-align:center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                                        <div style="color:var(--sub-gold); font-size:1.8rem; font-family: var(--sub-name-font); margin-bottom: 15px;">PRE-MATCH</div>
                                        <div style="color:#666; font-size:1.1rem; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase;">
                                            Registration open: ${f} players joined
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                    `}catch(c){return console.warn("Skipping broken tournament in Live View:",l.id,c),""}}).join("")}
            </div>
            
            ${e.length===0?`
                <div style="text-align:center; padding:120px 20px; color:#444; background: var(--sub-charcoal); border: 1px dashed var(--sub-border); border-radius: var(--sub-radius);">
                    <i class="fa fa-trophy" style="font-size:6rem; margin-bottom:40px; opacity:0.1;"></i>
                    <h3 class="sub-heading-premium" style="font-size: 2.5rem; opacity: 0.3;">Live Broadcaster standby</h3>
                    <p style="font-size: 1.4rem; opacity: 0.5;">Awaiting tournament schedule from organizer</p>
                </div>
            `:""}

            <!-- Footer -->
            <div style="text-align:center; margin-top:100px; padding-top:40px; border-top: 1px solid var(--sub-border); opacity: 0.5;">
                <img src="subsoccer_logo.svg" style="height: 30px; width: auto; margin-bottom: 15px; filter: grayscale(1);">
                <div style="font-family: var(--sub-name-font); color: #666; font-size: 0.8rem; letter-spacing: 3px;">OFFICIAL TOURNAMENT BROADCAST SYSTEM</div>
            </div>
            
            <!-- Ticker -->
            <div class="live-ticker">
                <div class="ticker-content">
                    ${e.length>0?e.map(l=>`
                            <span style="margin-right:50px;">🏆 ${l.tournament_name||"Tournament"}: ${l.status==="completed"?`WINNER: ${l.winner_name}`:"LIVE NOW"}</span>
                        `).join(""):"WELCOME TO SUBSOCCER LIVE EVENTS • FOLLOW THE ACTION • PLAY FAIR • HAVE FUN"}
                    <span style="margin-right:50px;">• POWERED BY SUBSOCCER •</span>
                </div>
            </div>
        </div>
            `}function Vo(){const t=document.getElementById("live-content");t&&t.remove(),document.body.classList.remove("live-mode"),window.liveEventRefreshInterval&&(clearInterval(window.liveEventRefreshInterval),window.liveEventRefreshInterval=null);const e=new URL(window.location);e.searchParams.delete("live"),window.history.replaceState({},"",e);const n=document.getElementById("app-content"),o=document.getElementById("nav-tabs"),r=document.querySelector("header"),a=document.getElementById("menu-toggle-btn"),s=document.getElementById("auth-page");r&&(r.style.display=""),a&&(a.style.display="block"),i.user?(n&&(n.style.display="flex",n.classList.remove("fade-in"),n.offsetWidth,n.classList.add("fade-in")),o&&o.style.setProperty("display","flex","important"),s&&(s.style.display="none")):(s&&(s.style.display="flex"),n&&(n.style.display="none"),o&&(o.style.display="none"))}function Wo(){if(window.location.search.includes("live=")){const e=new URLSearchParams(window.location.search).get("live");if(e){document.body.classList.add("live-mode");let n=document.getElementById("live-content");n||(n=document.createElement("div"),n.id="live-content",n.style.cssText="width:100%; min-height:100vh; padding:20px; box-sizing:border-box; background:#000; color:#fff;",document.body.appendChild(n)),[".modal-overlay","#victory-overlay","#loading-overlay"].forEach(r=>{const a=document.querySelector(r);a&&(a.style.display="none")}),yt(e)}}}window.shareLiveEventLink=fn;window.viewLiveEvent=yt;window.closeLiveView=Vo;class gn{constructor(e={}){this.participants=[],this.rounds=[],this.currentRoundIndex=0,this.isActive=!1,this.containerId=e.containerId||"bracket-area",this.onMatchUpdate=e.onMatchUpdate||null,this.enableSaveButton=e.enableSaveButton!==!1}generateBracket(e,n=!0){if(e.length<2){alert("Need at least 2 players to start a tournament.");return}this.participants=n?this.shuffleArray([...e]):[...e],this.rounds=[],this.isActive=!0;const o=Math.pow(2,Math.ceil(Math.log2(this.participants.length))),r=o-this.participants.length;let a=[],s=[...this.participants];for(let c=0;c<r;c++)s.push("BYE");for(let c=0;c<o/2;c++){const u=s[c],f=s[o-1-c],g={id:`r0_m${c}`,p1:u,p2:f,winner:null,nextMatchId:`r1_m${Math.floor(c/2)}`,nextSlot:c%2===0?"p1":"p2"};f==="BYE"&&(g.winner=u),u==="BYE"&&(g.winner=f),a.push(g)}this.rounds.push(a);let d=o/2,l=1;for(;d>1;){d=d/2;let c=[];for(let u=0;u<d;u++)c.push({id:`r${l}_m${u}`,p1:null,p2:null,winner:null,nextMatchId:d>1?`r${l+1}_m${Math.floor(u/2)}`:null,nextSlot:u%2===0?"p1":"p2"});this.rounds.push(c),l++}this.propagateWinners(),this.render()}restoreState(e){if(!e||e.length===0)return;const n=(o,r,a)=>{for(let s=0;s<this.rounds.length;s++)for(let d=0;d<this.rounds[s].length;d++){const l=this.rounds[s][d];if(l.p1===o&&l.p2===r||l.p1===r&&l.p2===o){this.setMatchWinner(s,d,a,!0);return}}};e.forEach(o=>{const r=o.player1||o.p1,a=o.player2||o.p2;o.winner&&r&&a&&n(r,a,o.winner)})}propagateWinners(){for(let e=0;e<this.rounds.length-1;e++){const n=this.rounds[e],o=this.rounds[e+1];n.forEach(r=>{if(r.winner){const a=parseInt(r.id.split("_m")[1]),s=Math.floor(a/2),d=a%2===0?"p1":"p2";o[s]&&(o[s][d]=r.winner)}})}}setMatchWinner(e,n,o,r=!1){const a=this.rounds[e][n];a.p1==="BYE"||a.p2==="BYE"||(a.winner===o?a.winner=null:(a.winner=o,!r&&navigator.vibrate&&navigator.vibrate(50)),this.resetDownstream(e,n),this.propagateWinners(),this.render(),!r&&this.onMatchUpdate&&a.winner&&this.onMatchUpdate(a,a.winner))}resetDownstream(e,n){let o=e+1,r=Math.floor(n/2);for(;o<this.rounds.length;)this.rounds[o][r]&&(this.rounds[o][r].winner=null),r=Math.floor(r/2),o++}shuffleArray(e){for(let n=e.length-1;n>0;n--){const o=Math.floor(Math.random()*(n+1));[e[n],e[o]]=[e[o],e[n]]}return e}getRoundName(e,n){return e===n-1?"🏆 FINALS":e===n-2?"SEMI-FINALS":e===n-3?"QUARTER-FINALS":`ROUND ${e+1}`}render(){const e=document.getElementById(this.containerId);if(!e)return;e.innerHTML="";const n=(d,l)=>{const c=document.createElement("div");c.className="bracket-round",c.id=`bracket-round-${l}`;const u=document.createElement("div");u.className="round-title",u.innerText=this.getRoundName(l,this.rounds.length),c.appendChild(u),d.forEach((f,g)=>{const y=document.createElement("div");y.className="bracket-match",y.id=`match-${l}-${g}`;const v=this.createPlayerBtn(f.p1,f,l,g);v.classList.add("p1-bg");const b=document.createElement("div");b.className="match-vs",b.innerText="vs";const h=this.createPlayerBtn(f.p2,f,l,g);h.classList.add("p2-bg"),y.appendChild(v),y.appendChild(b),y.appendChild(h),c.appendChild(y)}),e.appendChild(c)};this.rounds.length>0&&n(this.rounds[this.rounds.length-1],this.rounds.length-1);for(let d=this.rounds.length-2;d>=0;d--)n(this.rounds[d],d);const o=this.rounds[this.rounds.length-1],r=o&&o[0]&&o[0].winner,a=document.getElementById("save-btn"),s=document.getElementById("tour-engine");a&&this.enableSaveButton&&(r?(a.style.display="block",a.classList.add("sticky-bottom-action"),a.innerHTML='<i class="fa fa-trophy"></i> FINISH & SAVE',a.parentNode!==document.body&&document.body.appendChild(a)):(a.style.display="none",a.classList.remove("sticky-bottom-action"),s&&a.parentNode!==s&&s.appendChild(a))),this.containerId==="bracket-area"&&(document.getElementById("tour-engine").style.display="flex",document.getElementById("tour-setup").style.display="none"),setTimeout(()=>{const d=this.getActiveRoundIndex(),l=this.rounds[d];let c=-1;for(let g=l.length-1;g>=0;g--){const y=l[g];if(y.p1&&y.p2&&!y.winner&&y.p1!=="BYE"&&y.p2!=="BYE"){c=g;break}}let u,f="center";c!==-1?(u=document.getElementById(`match-${d}-${c}`),f="center"):(u=document.getElementById(`bracket-round-${d}`),f="center"),u&&u.scrollIntoView({behavior:"smooth",block:f})},300)}getActiveRoundIndex(){for(let e=0;e<this.rounds.length;e++)if(this.rounds[e].some(r=>r.p1&&r.p2&&!r.winner&&r.p1!=="BYE"&&r.p2!=="BYE"))return e;return this.rounds.length-1}createPlayerBtn(e,n,o,r){const a=document.createElement("div");return a.className="match-player",e?e==="BYE"?(a.innerText="BYE",a.classList.add("bye")):(a.innerText=e,a.onclick=()=>{this.setMatchWinner(o,r,e)}):(a.innerText="...",a.classList.add("empty")),n.winner===e&&e&&a.classList.add("winner"),a}getTournamentResults(){const e=this.rounds[this.rounds.length-1];if(!e||!e[0]||!e[0].winner)return null;const n=e[0].winner,o=e[0].p1===n?e[0].p2:e[0].p1;return{winner:n,second:o}}getAllMatches(){const e=[];return this.rounds.forEach(n=>{n.forEach(o=>{o.winner&&o.p1&&o.p2&&o.p1!=="BYE"&&o.p2!=="BYE"&&e.push({p1:o.p1,p2:o.p2,winner:o.winner})})}),e}static calculateByes(e){let n=2;for(;n<e;)n*=2;return n-e}static getMatchPlayers(e,n,o){return{p1:e[o*2],p2:e[o*2+1]}}static isRoundComplete(e,n){const o=Math.floor(e.length/2);return n.filter(a=>a).length===o}static renderMatch(e,n,o,r,a,s={}){const d=document.createElement("div");d.className="bracket-match",d.style.marginBottom="10px";const l=c=>{const u=document.createElement("div");return u.className=`match-player ${r===c&&c?"winner":""}`,u.innerText=c||"...",c&&(u.dataset.action="bracket-pick",u.dataset.handler=a,u.dataset.index=o,u.dataset.player=c),u};return d.appendChild(l(e)),d.innerHTML+=`<div class="match-vs">${s.isBronze?"BRONZE":s.isFinal?"FINAL":"VS"}</div>`,d.appendChild(l(n)),d}}const Yo=new gn;window.bracketEngine=Yo;function Ko(){const t=new URLSearchParams(window.location.search),e=t.get("brand"),n=t.get("logo"),o=t.get("color");if(t.get("live")){document.body.classList.add("live-mode");const l=document.querySelector("header"),c=document.getElementById("app-content"),u=document.getElementById("nav-tabs"),f=document.getElementById("auth-page");l&&(l.style.display="none"),c&&(c.style.display="none"),u&&(u.style.display="none"),f&&(f.style.display="none");return}if(e==="none"){localStorage.removeItem("subsoccer-brand"),localStorage.removeItem("subsoccer-logo"),localStorage.removeItem("subsoccer-color"),i.brand=null,i.brandLogo=null;return}const a=e||localStorage.getItem("subsoccer-brand"),s=n||localStorage.getItem("subsoccer-logo"),d=o||localStorage.getItem("subsoccer-color");if(document.body.style.backgroundColor="#0a0a0a",document.body.style.backgroundImage=`
        linear-gradient(45deg, #0d0d0d 25%, transparent 25%),
        linear-gradient(-45deg, #0d0d0d 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #0d0d0d 75%),
        linear-gradient(-45deg, transparent 75%, #0d0d0d 75%)
    `,document.body.style.backgroundSize="8px 8px",e&&e!=="none"&&(localStorage.setItem("subsoccer-brand",e),i.brand=e),n&&n!==""&&(localStorage.setItem("subsoccer-logo",n),i.brandLogo=n),o&&o!==""&&localStorage.setItem("subsoccer-color",o),a){i.brand=a,i.brandLogo=s;let l=d?d.startsWith("#")?d:"#"+d:null;!l&&a==="partner"&&(l="#F40009"),l&&(document.documentElement.style.setProperty("--sub-red",l),document.documentElement.style.setProperty("--sub-gold","#FFFFFF"));const c=document.querySelector(".main-logo");c&&(s?(c.src=s,c.style.filter="none"):c.style.filter="brightness(0) invert(1)",c.style.opacity="1",c.style.display="block"),e&&Qo(s,l),console.log(`🤝 Branding Applied: ${a}`)}else{document.documentElement.style.setProperty("--sub-red","#E30613"),document.documentElement.style.setProperty("--sub-gold","#FFD700");const l=document.querySelector(".main-logo");l&&(l.src="subsoccer_logo.svg",l.style.filter="none")}}function Qo(t,e){const n=document.createElement("div");n.id="partner-splash",n.style.cssText=`
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: ${e||"#F40009"}; z-index: 100000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: white; font-family: 'Resolve', sans-serif;
        transition: opacity 0.8s ease-out;
    `,n.innerHTML=`
        <div style="font-size: 1.2rem; letter-spacing: 4px; margin-bottom: 20px; opacity: 0.8;">SUBSOCCER</div>
        ${t?`<img src="${t}" style="max-height: 80px; margin-bottom: 20px;">`:""}
        <div style="font-size: 2.5rem; font-weight: bold; letter-spacing: 2px; text-align: center; padding: 0 20px; line-height: 1.1;">
            OFFICIAL<br>PARTNER
        </div>
        <div style="margin-top: 40px; width: 40px; height: 2px; background: white; opacity: 0.5;"></div>
    `,document.body.appendChild(n),setTimeout(()=>{n.style.opacity="0",setTimeout(()=>n.remove(),800)},2e3)}function Jo(){const t=document.getElementById("app-content");if(!t||document.getElementById("subsoccer-footer-link"))return;const e=document.createElement("div");e.id="subsoccer-footer-link",e.className="subsoccer-footer",e.innerHTML=`
        <div style="display:flex; justify-content:center; gap:25px; margin-bottom:20px;">
            <a href="https://www.instagram.com/originalsubsoccer" target="_blank" style="color:#fff; font-size:1.5rem; opacity:0.8; transition:all 0.2s;"><i class="fa-brands fa-instagram"></i></a>
            <a href="https://www.youtube.com/@Subsoccer" target="_blank" style="color:#fff; font-size:1.5rem; opacity:0.8; transition:all 0.2s;"><i class="fa-brands fa-youtube"></i></a>
            <a href="https://www.tiktok.com/@subsoccer" target="_blank" style="color:#fff; font-size:1.5rem; opacity:0.8; transition:all 0.2s;"><i class="fa-brands fa-tiktok"></i></a>
        </div>
        <a href="https://www.subsoccer.com" target="_blank" style="color:inherit; text-decoration:none; opacity: 0.5;">WWW.SUBSOCCER.COM</a>
    `,t.appendChild(e)}const K={async capture(t){const e=document.querySelector(`#${t} .topps-collectible-card`)||document.querySelector(`#${t} .pro-card`);if(!e)return console.error("Card element not found in:",t),null;try{const n=e.style.transform;e.style.transform="none",await document.fonts.ready;const o=await html2canvas(e,{useCORS:!0,scale:3,backgroundColor:"#0a0a0a"});return e.style.transform=n,o.toDataURL("image/png")}catch(n){return console.error("Failed to generate card image:",n),null}},async captureStory(t,e){const n=document.querySelector(`#${t} .topps-collectible-card`)||document.querySelector(`#${t} .pro-card`);if(!n)return null;try{const o=document.createElement("div");o.style.position="absolute",o.style.left="-9999px",o.style.width="1080px",o.style.height="1920px",o.style.background="radial-gradient(circle at 10% 20%, #1a0000 0%, #0a0a0a 50%), radial-gradient(circle at 90% 80%, rgba(227,6,19,0.2) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(255,215,0,0.1) 0%, transparent 80%)",o.style.backgroundColor="#050505",o.style.display="flex",o.style.flexDirection="column",o.style.alignItems="center",o.style.justifyContent="center",o.style.padding="80px",o.style.position="relative",o.style.overflow="hidden";const r=document.createElement("div");r.innerHTML='<img src="subsoccer_logo.svg" style="width:800px; opacity:0.05; transform:rotate(-15deg); filter:grayscale(100%);">',r.style.position="absolute",r.style.top="30%",r.style.pointerEvents="none",o.appendChild(r);const a=document.createElement("div");a.innerHTML=`
                <div style="font-family:'Russo One'; color:var(--sub-gold); font-size:40px; letter-spacing:15px; text-transform:uppercase; margin-bottom:10px;">SUBSOCCER</div>
                <h1 style="color:#fff; font-family:'Russo One'; font-size: 100px; margin-bottom: 20px; line-height:1; text-shadow: 0 10px 30px rgba(0,0,0,0.8);">NEW PRO <span style="color:var(--sub-red);">RANK</span></h1>
            `,a.style.textAlign="center",a.style.marginBottom="80px",a.style.zIndex="10",o.appendChild(a);const s=n.cloneNode(!0);s.style.transform="scale(1.2)",s.style.margin="40px 0",s.style.boxShadow="0 50px 100px rgba(0,0,0,0.9), 0 0 50px rgba(255,215,0,0.2)",s.style.zIndex="10",o.appendChild(s);const d=document.createElement("div");d.innerHTML=`
                <div style="display:inline-block; border: 2px solid var(--sub-gold); padding: 15px 40px; border-radius:30px; margin-top:100px; background: rgba(0,0,0,0.5);">
                    <p style="color:#fff; font-size:35px; margin:0; font-family:'Resolve'; text-transform:uppercase; letter-spacing:3px;">
                        <span style="color:var(--sub-gold);">⭐</span> VERIFIED PRO
                    </p>
                </div>
                <p style="color:#666; font-size:25px; margin-top:30px; font-family:'Resolve'; letter-spacing:5px;">SUBSOCCER.COM</p>
            `,d.style.textAlign="center",d.style.zIndex="10",o.appendChild(d),document.body.appendChild(o);const l=await html2canvas(o,{useCORS:!0,scale:1});return document.body.removeChild(o),l.toDataURL("image/png")}catch(o){return console.error("Story capture failed:",o),null}},async share(t,e){if(navigator.share){const n=await(await fetch(t)).blob(),o=new File([n],`subsoccer-${e}.png`,{type:"image/png"});try{await navigator.share({title:`Subsoccer Pro Card: ${e}`,text:"Check out my official Subsoccer Pro Card! ⚽🔥",files:[o]})}catch(r){r.name!=="AbortError"&&m("Sharing failed","error")}}else{const n=document.createElement("a");n.download=`subsoccer-${e}.png`,n.href=t,n.click(),m("Card downloaded!","success")}}};window.CardGenerator=K;async function De(t){B("Player Card",`<p style="font-family:'Resolve'">LOADING CARD...</p>`,{id:"card-modal",maxWidth:"400px"});let{data:e}=await p.from("players").select("*, team_data:teams!players_team_id_fkey(*)").eq("username",t).maybeSingle();e||(e={username:t,elo:1e3,wins:0,losses:0,country:"fi",avatar_url:"placeholder-silhouette-5-wide.png"});const{data:n}=await p.from("tournament_history").select("tournament_name, winner_name, second_place_name, third_place_name, created_at").or(`winner_name.eq.${t},second_place_name.eq.${t},third_place_name.eq.${t}`).eq("status","completed").order("created_at",{ascending:!1}),{data:o}=await p.from("matches").select("*").or(`player1.eq.${t},player2.eq.${t}`).order("created_at",{ascending:!1}).limit(10),r=e.wins||0,a=e.losses||0,s=a>0?(r/a).toFixed(2):r>0?"1.00":"0.00",d=e.elo>1600?"PRO":"ROOKIE";i.brand;const l=e.avatar_url&&e.avatar_url.trim()!==""?e.avatar_url:"placeholder-silhouette-5-wide.png",c=r+a<5?"status-rookie":"";let u="";n&&n.length>0?u=`
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
                <div style="font-family:var(--sub-name-font); color:#888; font-size:0.7rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase;">🏆 Trophy Room</div>
                <div style="max-height: 150px; overflow-y: auto; padding-right:5px;">
                    ${n.map(v=>{let b="",h="#666",x="";v.winner_name===t?(b="WINNER",h="var(--sub-gold)",x="🥇"):v.second_place_name===t?(b="FINALIST",h="#C0C0C0",x="🥈"):v.third_place_name===t&&(b="3RD PLACE",h="#CD7F32",x="🥉");const E=new Date(v.created_at).toLocaleDateString();return`
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#111; margin-bottom:5px; border-radius:4px; border-left:2px solid ${h};">
                                <div>
                                    <div style="color:#fff; font-size:0.8rem; font-family:var(--sub-name-font); text-transform:uppercase;">${v.tournament_name||"Tournament"}</div>
                                    <div style="color:#666; font-size:0.6rem;">${E}</div>
                                </div>
                                <div style="color:${h}; font-size:0.7rem; font-weight:bold; font-family:var(--sub-name-font);">${x} ${b}</div>
                            </div>
                        `}).join("")}
                </div>
            </div>
        `:u=`
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px; text-align:center;">
                <div style="font-family:var(--sub-name-font); color:#444; font-size:0.7rem; letter-spacing:1px;">NO TOURNAMENT TROPHIES YET</div>
            </div>
        `;let f="";o&&o.length>0&&(f=`
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
                <div style="font-family:var(--sub-name-font); color:#888; font-size:0.7rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase;">📜 Recent Matches</div>
                <div style="max-height: 200px; overflow-y: auto; padding-right:5px;">
                    ${o.map(v=>{const b=v.player1===t,h=b?v.player2:v.player1,x=v.winner===t,E=x?"var(--sub-gold)":"#666",T=v.player1_score!==null&&v.player2_score!==null?b?`${v.player1_score}-${v.player2_score}`:`${v.player2_score}-${v.player1_score}`:x?"WIN":"LOSS",w=new Date(v.created_at).toLocaleDateString();return`
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#111; margin-bottom:4px; border-radius:4px; border-left:2px solid ${E};">
                                <div style="display:flex; flex-direction:column;">
                                    <div style="color:#fff; font-size:0.75rem; font-family:var(--sub-name-font);">vs ${h}</div>
                                    <div style="color:#666; font-size:0.6rem;">${w} • ${v.tournament_name||"Quick Match"}</div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="color:${E}; font-size:0.8rem; font-weight:bold; font-family:'Russo One';">${T}</div>
                                </div>
                            </div>
                        `}).join("")}
                </div>
            </div>
        `);const g=`
    <style>
        .pro-card-force-sharp { border-radius: 0 !important; }
        .card-bleed-edge { position: absolute; inset: 0; background: radial-gradient(circle, rgba(0,0,0,0.15) 1.5px, transparent 1.5px) 0 0, #00FFCC; background-size: 8px 8px; border: 1px solid #00ccaa; }
        .card-safe-zone { position: absolute; inset: 16px; border: 1px solid #999; border-top: 2px solid #fff; border-bottom: 2px solid #555; background: #050505; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        .card-serial { position: absolute; top: 10px; right: 10px; background: transparent; color: #444; font-family: 'Open Sans', sans-serif; font-size: 0.55rem; font-weight: bold; z-index: 10; letter-spacing: 1px; }
        .card-rc-badge { position: absolute; top: 10px; left: 10px; background: transparent; color: #E30613; font-family: 'Russo One', sans-serif; font-size: 1rem; z-index: 10; font-style: italic; text-shadow: 1px 1px 0 #fff; }
        .card-image-box { height: 65%; width: 100%; position: relative; border-bottom: 2px solid #E30613; background: #111; }
        .card-nameplate { position: absolute; bottom: 0; width: 100%; padding: 30px 10px 10px 10px; background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%); display: flex; flex-direction: column; justify-content: flex-end; }
        .card-data-box { height: 35%; width: 100%; background: #1a1a1a; padding: 10px 15px; display: flex; flex-direction: column; justify-content: space-between; }
        .pro-stamp { position: absolute; top: 12px; left: 12px; width: 60px; height: auto; z-index: 50; transform: rotate(-8deg); filter: drop-shadow(0 1px 1px rgba(0,0,0,0.5)); pointer-events: none; }
        .pro-card.flipped .card-flipper { transform: rotateY(180deg) scale(1.05); }
        .card-front, .card-back { padding: 0 !important; }
    </style>
    <div class="pro-card pro-card-force-sharp ${c}" style="margin:0; width:100% !important; background:transparent; box-shadow:none; cursor:pointer;" onclick="this.classList.toggle('flipped')">
        <div class="card-flipper" style="width: 100%; height: 100%; position: relative; transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform-style: preserve-3d; border-radius: 0; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.6);">
            <!-- FRONT SIDE -->
            <div class="card-front" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 0; background: transparent;">
                <div class="card-bleed-edge">
                    <div class="card-safe-zone">
                        ${r+a<5?'<div class="card-rc-badge">RC</div>':""}
                        <div class="card-serial">NO. 1</div>
                        
                        <div class="card-image-box">
                            <img src="${l}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">
                            <div class="card-nameplate">
                                ${e.team_data?`<div style="font-family:'Open Sans', sans-serif; color:#FFD700; font-size:0.6rem; font-weight:bold; margin-bottom:2px; letter-spacing:1px; text-transform:uppercase;">${e.team_data.tag}</div>`:""}
                                <div style="font-family:'Russo One', sans-serif; color:#fff; font-size:1.6rem; line-height:1; text-transform:uppercase;">${e.username}</div>
                            </div>
                        </div>

                        <div class="card-data-box">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-family:'Open Sans', sans-serif; color:#888; font-size:0.5rem; font-weight:800; letter-spacing:1px;">GLOBAL RANKING</div>
                                    <div style="font-family:'Russo One', sans-serif; color:#fff; font-size:1.2rem;">${e.elo}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-family:'Open Sans', sans-serif; color:#888; font-size:0.5rem; font-weight:800; letter-spacing:1px;">WIN RATIO</div>
                                    <div style="font-family:'Russo One', sans-serif; color:#00FFCC; font-size:1.2rem;">${s}</div>
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 15px; margin-top: 5px; border-top: 1px solid #333; padding-top: 8px;">
                                <div style="text-align:left;"><div style="color:#666; font-size:0.5rem; font-family:'Open Sans', sans-serif; font-weight:bold;">WINS</div><div style="color:#fff; font-family:'Russo One', sans-serif; font-size:0.9rem;">${r}</div></div>
                                <div style="text-align:left;"><div style="color:#666; font-size:0.5rem; font-family:'Open Sans', sans-serif; font-weight:bold;">LOSSES</div><div style="color:#fff; font-family:'Russo One', sans-serif; font-size:0.9rem;">${a}</div></div>
                                <div style="margin-left:auto; display:flex; align-items:center;">
                                    <img src="https://flagcdn.com/w20/${(e.country||"fi").toLowerCase()}.png" width="20" style="border:1px solid #555;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ${e.elo>=1600?'<img src="stamp.png" class="pro-stamp">':""}
                <div style="position:absolute; bottom:-25px; width:100%; text-align:center; color:#666; font-size:0.6rem; font-family:'Open Sans', sans-serif; pointer-events:none;"><i class="fa-solid fa-rotate-right"></i> TAP TO FLIP</div>
            </div>
            
            <!-- BACK SIDE -->
            <div class="card-back" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; transform: rotateY(180deg); border-radius: 0; background-color: #0a0a0a; background-image: radial-gradient(circle at center, #1a0000 0%, #000 100%); border: 1px solid #333; overflow-y: auto; overflow-x: hidden;">
                <div class="card-inner-frame" style="padding:15px; display:block; text-align:left; overflow-y:auto; overflow-x:hidden;">
                    <div style="text-align:center; padding-bottom:5px; border-bottom:1px solid #333; margin-bottom:5px;">
                        <h4 style="color:var(--sub-gold); font-family:'Russo One'; margin:0; letter-spacing:2px; font-size:1.1rem;">PLAYER DOSSIER</h4>
                        <div style="color:#fff; font-size:0.75rem; font-family:'Resolve'; margin-top:5px; text-transform:uppercase;">${e.username}</div>
                    </div>
                    ${u}
                    ${f}
                </div>
                <div class="flip-hint" style="position:absolute; bottom:8px; width:100%; text-align:center; left:0; color:rgba(255,255,255,0.3); font-size:0.6rem; font-weight:bold; letter-spacing:1.5px; z-index:2; pointer-events:none;"><i class="fa-solid fa-rotate-left"></i> TAP TO FLIP</div>
            </div>
        </div>
    </div>`,y=document.querySelector("#card-modal .modal-body");y&&(y.innerHTML=g),St(y.querySelector(".pro-card"))}function Xo(){P("card-modal")}async function yn(t,e){const o=e>=1600?"⭐ NEW PRO RANK REACHED!":"📈 RANK UP!",r=`
        <div id="level-up-container" class="level-up-anim" style="text-align:center;">
            
            <div style="font-family:'Russo One'; color:var(--sub-gold); font-size:1.5rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase; animation: pulse 1.5s infinite;">
                RANK CAP CROSSED
            </div>
            <p style="color:#aaa; font-size:0.85rem; margin-bottom:20px;">Your Official Pro Card has been updated.</p>

            <div id="level-up-card-preview" style="transform:scale(0.8); margin:-40px 0;">
                <p style="text-align:center; color:#888;">Updating Identity...</p>
            </div>
            
            <div style="margin-top:0; display:flex; flex-direction:column; gap:12px;">
                <button class="btn-red" style="background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:1.1rem; padding:18px; box-shadow:0 0 20px rgba(255,215,0,0.4);" data-action="share-story" data-player="${t}">
                    <i class="fa-brands fa-instagram" style="margin-right:8px; font-size:1.2rem;"></i> SHARE TO STORY
                    <div style="font-family:'Resolve'; font-size:0.6rem; letter-spacing:1px; margin-top:5px; color:#444;">UNLOCK 'GOLD' BORDER</div>
                </button>
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:#222; border:1px solid var(--sub-gold); color:var(--sub-gold); font-size:0.8rem; padding:12px;" data-action="order-physical-card">
                        <i class="fa-solid fa-gem"></i> ORDER PREMIUM CARD
                    </button>
                    <button class="btn-red" style="flex:1; background:#111; color:#666; font-size:0.8rem; padding:12px; border:1px solid #333;" onclick="closeModal('level-up-modal')">
                        CLOSE
                    </button>
                </div>
            </div>
        </div>
    `;B(o,r,{id:"level-up-modal",maxWidth:"400px",borderColor:"var(--sub-gold)"}),await De(t);const a=document.querySelector("#card-modal .modal-body").innerHTML;document.getElementById("level-up-card-preview").innerHTML=a,P("card-modal");const s=document.getElementById("level-up-card-preview").querySelector(".pro-card");s&&St(s)}function bn(){B("ORDER TO HOME",`
    <div style="text-align:center; padding:10px;">
        <i class="fa-solid fa-truck-fast" style="font-size:3rem; color:var(--sub-gold); margin-bottom:20px;"></i>
        <h3 style="font-family:'Russo One'; margin-bottom:10px;">PREMIUM COLLECTIBLE</h3>
        <p style="color:#888; font-size:0.85rem; line-height:1.5; margin-bottom:20px;">
            Order your official high-quality PVC printed **Pro Card** delivered to your door. Includes NFC chip for instant login at Verified Arenas.
        </p>
        <div style="background:#111; padding:15px; border-radius:12px; border:1px solid #333; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; color:#fff;">
                <span>Pro Membership Edition</span>
                <span style="color:var(--sub-gold); font-weight:bold;">19.90 €</span>
            </div>
            <div style="font-size:0.7rem; color:#666; text-align:left; margin-top:5px;">+ Free shipping inside EU</div>
        </div>
        <button class="btn-red" style="width:100%; padding:15px; font-family:'Russo One';" onclick="showNotification('Store integration coming soon!', 'info')">
            SUBSCRIBE & ORDER NOW
        </button>
    </div>
    `,{maxWidth:"400px"})}async function vn(){const t=await K.capture("profile-card-container");t&&K.share(t,i.user.username)}function nt(){const e=`
    <div style="display:grid; gap:15px;">
        ${[{id:"elite",name:"Elite Series Edition",price:"4.99€",color:"#003399"},{id:"global",name:"Global Pro Edition",price:"4.99€",color:"#006400"},{id:"legendary-gold",name:"Legendary Gold Edition",price:"9.99€",color:"var(--sub-gold)"}].map(n=>`
                <div class="sub-card" style="border-left: 4px solid ${n.color}; display:flex; justify-content:space-between; align-items:center; padding:15px;">
                    <div>
                        <div style="font-family:var(--sub-name-font); color:#fff;">${n.name}</div>
                        <div style="color:var(--sub-gold); font-size:0.9rem; font-weight:bold;">${n.price}</div>
                    </div>
                    <button class="btn-red" style="width:auto; padding:8px 15px; font-size:0.8rem;" data-edition-id="${n.id}">
                        BUY NOW
                    </button>
                </div>
            `).join("")}
        </div>
    `;B("SUBSOCCER COLLECTIBLE SHOP",e,{maxWidth:"450px"})}function bt(){B("DIGITAL CONCEPT",`
    <div style="color: #fff; font-family: 'Resolve'; max-height: 75vh; overflow-y: auto; padding-right: 15px; scrollbar-width: thin;">
        <h2 style="color: var(--sub-gold); font-size: 1.1rem; margin-bottom: 25px; line-height: 1.4; font-family: 'Russo One'; text-transform: uppercase;">
            From Living Room to Virtual Arena
        </h2>

        <div style="margin-bottom: 25px; display: grid; gap: 20px;">
            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-bolt"></i> 1. ZERO FRICTION
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Scan the QR code, click play, and the AI-referee starts instantly. No apps, no registration required.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-id-card"></i> 2. IDENTITY: THE PRO CARD
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Your Subsoccer Pro Card is a collectible identity storing your ELO, titles, and match legacy.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-earth-europe"></i> 3. THE BALANCED ECOSYSTEM
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Practice at home (B2C), but rank up to "Legend" (1600+ ELO) by playing at official Verified Arenas (B2B).
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-shield-halved"></i> 4. ANTI-CHEAT & AUTHENTICITY
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Verified Equipment ensures the Global Leaderboard is honest. True pros prove their skills on official tables.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-share-nodes"></i> 5. VIRAL ENGAGEMENT
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Every result is a shareable moment. The journey generates social currency for the player and the community.
                </div>
            </div>
        </div>

        <button onclick="closeModal()" class="btn-red" style="width: 100%; font-family: 'Russo One'; padding: 15px; margin-top: 10px; border-radius: 8px;">UNDERSTOOD</button>
    </div>
    `,{maxWidth:"450px",borderColor:"var(--sub-gold)"})}async function hn(t){await co(new Promise(e=>{setTimeout(()=>{i.activeCardEdition=t,i.inventory=[...i.inventory,t],P(),e(!0)},1500)}),"Edition purchased successfully!")}window.showAppConcept=bt;window.showLevelUpCard=yn;window.viewPlayerCard=De;function xn(){document.addEventListener("click",t=>{const e=t.target.closest("[data-username]");if(e){De(e.dataset.username);return}})}const Zo=Object.freeze(Object.defineProperty({__proto__:null,closeCardModal:Xo,downloadFanCard:vn,purchaseEdition:hn,setupPlayerCardListeners:xn,showAppConcept:bt,showCardShop:nt,showLevelUpCard:yn,showPhysicalOrderDialog:bn,viewPlayerCard:De},Symbol.toStringTag,{value:"Module"}));async function Ne(){const t=document.getElementById("profile-team-ui");if(t){if(!i.user||i.user.id==="guest"){t.style.display="none";return}t.style.display="block",i.user.team_id?await na(t):ea(t)}}function ea(t){t.innerHTML=`
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 25px 20px; text-align: center; margin-top: 20px;">
            <i class="fa-solid fa-users" style="color: var(--sub-gold); font-size: 2.5rem; margin-bottom: 15px; opacity: 0.8;"></i>
            <h3 style="font-family: 'Russo One', sans-serif; font-size: 1.2rem; color: #fff; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 1px;">CREATE OR JOIN A TEAM</h3>
            <p style="font-family: 'Open Sans', sans-serif; font-size: 0.85rem; color: #aaa; margin-bottom: 20px; max-width: 90%; margin-left: auto; margin-right: auto;">
                Unite with other players. Climb the global team ranks and show off your club tag on your Pro Card!
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="btn-red" style="font-size: 0.9rem; padding: 12px 20px; background: var(--sub-gold); color: #000; letter-spacing: 1px; border: none; font-weight: bold; border-radius: 4px; cursor: pointer;" onclick="window.showCreateTeamModal()">
                    <i class="fa-solid fa-plus"></i> CREATE TEAM
                </button>
            </div>
            
            <div style="margin-top:20px; position:relative;">
                <input type="text" id="team-search-input" placeholder="Search by team name or tag" style="width: 100%; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 0.9rem;">
                <div id="team-search-results" style="text-align:left; min-height: 20px;"></div>
            </div>
        </div>
    `;const e=document.getElementById("team-search-input");if(e){let n;e.addEventListener("input",o=>{if(clearTimeout(n),o.target.value.trim().length<2){document.getElementById("team-search-results").innerHTML="";return}n=setTimeout(()=>ta(o.target.value.trim()),500)})}}async function ta(t){const e=document.getElementById("team-search-results");if(e){e.innerHTML='<div style="color:#666; font-size:0.8rem; margin-top:10px;">Searching...</div>';try{const{data:n,error:o}=await p.from("teams").select("*").or(`name.ilike.%${t}%,tag.ilike.%${t}%`).limit(5);if(o)throw o;if(!n||n.length===0){e.innerHTML='<div style="color:#666; font-size:0.8rem; margin-top:10px;">No teams found</div>';return}e.innerHTML=n.map(r=>`
            <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.5); padding: 12px; border-radius: 4px; border: 1px solid #333; margin-top: 10px;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    ${r.logo_url?`<img src="${r.logo_url}" style="width:24px; height:24px; border-radius: 4px; object-fit: cover;">`:'<div style="width:24px; height:24px; border-radius:4px; background:#222; display:flex; justify-content:center; align-items:center; color: var(--sub-gold); font-size: 0.6rem;"><i class="fa-solid fa-shield"></i></div>'}
                    <div>
                        <div style="font-weight:bold; font-size: 0.9rem;">[${r.tag}] ${r.name}</div>
                        <div style="color:var(--sub-gold); font-size: 0.75rem;"><i class="fa-solid fa-star"></i> ${r.combined_elo}</div>
                    </div>
                </div>
                <button style="background:transparent; border:1px solid var(--sub-red); color:var(--sub-red); padding: 5px 10px; border-radius:4px; cursor:pointer;" onclick="window.joinTeam('${r.id}', '${r.name}')">JOIN</button>
            </div>
        `).join("")}catch(n){console.error("Team search failed:",n),e.innerHTML='<div style="color:var(--sub-red); font-size:0.8rem; margin-top:10px;">Failed to search teams</div>'}}}async function na(t){if(i.user.team_id)try{t.innerHTML='<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i></div>';const{data:e,error:n}=await p.from("teams").select("*").eq("id",i.user.team_id).single();if(n||!e)throw n||new Error("Team not found");const{data:o,error:r}=await p.from("players").select("id, username, elo, avatar_url").eq("team_id",e.id).order("elo",{ascending:!1});if(r)throw r;const a=o.reduce((l,c)=>l+c.elo,0);e.combined_elo!==a&&(await p.from("teams").update({combined_elo:a}).eq("id",e.id),e.combined_elo=a);const s=e.captain_id===i.user.id,d=e.logo_url?`<img src="${e.logo_url}" style="width:80px; height:80px; border-radius: 12px; border: 2px solid var(--sub-gold); object-fit: cover; margin-bottom: 15px;">`:'<div style="width:80px; height:80px; border-radius:12px; background:linear-gradient(135deg, #222, #000); border: 2px solid var(--sub-gold); display:flex; justify-content:center; align-items:center; color: var(--sub-gold); font-size: 2.5rem; margin: 0 auto 15px auto;"><i class="fa-solid fa-shield"></i></div>';t.innerHTML=`
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255,215,0,0.2); border-radius: 12px; padding: 25px 15px; text-align: center; margin-top: 20px;">
                ${d}
                <div style="color: var(--sub-gold); font-size: 0.8rem; font-weight: bold; letter-spacing: 2px;">[${e.tag}]</div>
                <h3 style="font-family: 'Russo One', sans-serif; font-size: 1.5rem; color: #fff; margin: 5px 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">${e.name}</h3>
                
                <div style="background: rgba(0,0,0,0.5); border-radius: 8px; padding: 15px; margin-bottom: 20px; display:flex; justify-content:space-around;">
                    <div>
                        <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Members</div>
                        <div style="color:#fff; font-size:1.2rem; font-family:'Russo One';">${o.length}</div>
                    </div>
                    <div>
                        <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Team ELO</div>
                        <div style="color:var(--sub-gold); font-size:1.2rem; font-family:'Russo One';">${e.combined_elo}</div>
                    </div>
                </div>
                
                <div style="text-align:left; margin-bottom:15px;">
                    <div style="font-family:'Resolve'; font-size:0.8rem; color:#888; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">ROSTER</div>
                    ${o.map(l=>`
                        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <div style="display:flex; align-items:center; gap: 10px;">
                                ${l.avatar_url?`<img src="${l.avatar_url}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`:'<i class="fa-solid fa-user-circle" style="color:#555; font-size:24px;"></i>'}
                                <span style="font-size: 0.95rem; color: ${l.id===e.captain_id?"var(--sub-gold)":"#fff"};">
                                    ${l.username} ${l.id===e.captain_id?'<i class="fa-solid fa-crown" style="font-size:0.7rem; margin-left:3px;"></i>':""}
                                </span>
                            </div>
                            <div style="color: #aaa; font-size:0.85rem;">${l.elo}</div>
                        </div>
                    `).join("")}
                </div>
                
                <button class="btn-outline" style="background:transparent; border:1px solid #555; color:#aaa; font-size:0.8rem; padding: 10px; width: 100%; letter-spacing:1px; margin-top:10px; border-radius:4px; cursor:pointer;" onclick="window.leaveTeam()">
                    LEAVE TEAM
                </button>
            </div>
        `}catch(e){console.error("Failed to load team data",e),t.innerHTML='<div style="color:var(--sub-red);">Error loading team</div>'}}function oa(){document.body.insertAdjacentHTML("beforeend",`
        <div id="create-team-modal" class="modal fade-in" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(5px);">
            <div class="modal-content" style="background: #111; border: 1px solid #333; border-radius: 12px; width: 90%; max-width: 400px; padding: 25px;">
                <h3 style="font-family: 'Russo One', sans-serif; font-size: 1.4rem; color: #fff; margin-bottom: 20px; text-transform:uppercase; text-align:center;">
                    <i class="fa-solid fa-shield" style="color:var(--sub-gold); margin-right:10px;"></i> CREATE TEAM
                </h3>
                
                <input type="text" id="new-team-name" placeholder="Team Full Name (e.g. Subsoccer Elite)" style="width: 100%; box-sizing:border-box; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid #444; color: #fff; border-radius: 4px; margin-bottom: 15px; font-size: 0.95rem;">
                
                <input type="text" id="new-team-tag" placeholder="Short Tag (3-4 letters, e.g. SSE)" maxlength="4" style="text-transform:uppercase; width: 100%; box-sizing:border-box; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid #444; color: #fff; border-radius: 4px; margin-bottom: 20px; font-size: 0.95rem; font-family:'Russo One'; letter-spacing:2px;">
                
                <div style="display:flex; gap:10px;">
                    <button id="btn-submit-team" class="btn-red" style="flex:1; background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:1rem; padding: 12px; border:none; border-radius:4px; cursor:pointer;" onclick="window.submitNewTeam()">CREATE</button>
                    <button class="btn-outline" style="flex:1; background:transparent; border:1px solid #555; color:#aaa; font-family:'Russo One'; font-size:1rem; padding: 12px; border-radius:4px; cursor:pointer;" onclick="document.getElementById('create-team-modal').remove()">CANCEL</button>
                </div>
            </div>
        </div>
    `)}async function aa(){const t=document.getElementById("new-team-name")?.value.trim(),e=document.getElementById("new-team-tag")?.value.trim().toUpperCase(),n=document.getElementById("btn-submit-team");if(!t||t.length<3)return m("Team name must be at least 3 characters","error");if(!e||e.length<2||e.length>4)return m("Tag must be 2-4 characters","error");n.disabled=!0,n.textContent="CREATING...";try{const{data:o}=await p.from("teams").select("id").ilike("name",t).maybeSingle();if(o)return n.disabled=!1,n.textContent="CREATE",m("Team name already taken","error");const{data:r,error:a}=await p.from("teams").insert({name:t,tag:e,captain_id:i.user.id,combined_elo:i.user.elo}).select().single();if(a)throw a;const{error:s}=await p.from("players").update({team_id:r.id}).eq("id",i.user.id);if(s)throw s;i.user={...i.user,team_id:r.id,team_data:r},localStorage.setItem("subsoccer-user",JSON.stringify(i.user)),document.getElementById("create-team-modal")?.remove(),m("Team created!","success"),Ne(),W()}catch(o){console.error("Error creating team:",o),m("Failed to create team","error"),n.disabled=!1,n.textContent="CREATE"}}async function ra(t,e){if(confirm(`Join ${e}?`))try{const{data:n}=await p.from("teams").select("combined_elo").eq("id",t).single(),{error:o}=await p.from("players").update({team_id:t}).eq("id",i.user.id);if(o)throw o;const{data:r}=await p.from("teams").select("*").eq("id",t).single();i.user={...i.user,team_id:t,team_data:r},localStorage.setItem("subsoccer-user",JSON.stringify(i.user)),n&&await p.from("teams").update({combined_elo:n.combined_elo+i.user.elo}).eq("id",t),m(`Joined ${e}!`,"success"),document.getElementById("team-search-input").value="",Ne(),W()}catch(n){console.error("Error joining team:",n),m("Failed to join team","error")}}async function ia(){if(confirm("Are you sure you want to leave your team?"))try{const t=i.user.team_id,{error:e}=await p.from("players").update({team_id:null}).eq("id",i.user.id);if(e)throw e;const{data:n}=await p.from("teams").select("combined_elo, captain_id").eq("id",t).single();n&&await p.from("teams").update({combined_elo:Math.max(0,n.combined_elo-i.user.elo)}).eq("id",t),i.user={...i.user,team_id:null,team_data:null},localStorage.setItem("subsoccer-user",JSON.stringify(i.user)),m("You left the team","success"),Ne(),W()}catch(t){console.error("Error leaving team:",t),m("Failed to leave team","error")}}window.showCreateTeamModal=oa;window.submitNewTeam=aa;window.joinTeam=ra;window.leaveTeam=ia;async function wn(){if(!i.user||!i.user.id)return;const t=document.getElementById("profile-avatar-display"),e=document.getElementById("avatar-preview");t&&i.user.avatar_url&&(t.src=i.user.avatar_url),e&&i.user.avatar_url&&(e.src=i.user.avatar_url);const n=document.getElementById("profile-username");n&&(n.innerText=i.user.username||"Player");const o=document.getElementById("user-display-name");o&&(o.innerText=i.user.username||"Player");const r=document.getElementById("profile-country");r&&i.user.country?r.innerText="🌍 "+i.user.country.toUpperCase():r&&(r.innerText="🌍 Set your country");const a=document.getElementById("profile-elo");a&&(a.innerText=i.user.elo||1e3);const s=document.getElementById("profile-matches");if(s&&i.user.id!=="guest")try{const{count:d}=await p.from("matches").select("*",{count:"exact",head:!0}).or(`player1.eq.${i.user.username}, player2.eq.${i.user.username} `);s.innerText=d||0}catch{s.innerText="0"}J(),Ne()}function En(){const t=document.getElementById("profile-edit-fields");if(!t)return;t.style.display="block",document.getElementById("profile-dashboard-ui").style.display="none";const e=document.getElementById("profile-games-ui");e&&(e.style.display=i.user?.id==="guest"?"none":"block"),mn();const n={"edit-username":i.user.username,"edit-full-name":i.user.full_name,"edit-email":i.user.email,"edit-phone":i.user.phone,"edit-city":i.user.city,"country-input":i.user.country,"edit-password":""};Object.entries(n).forEach(([o,r])=>{const a=document.getElementById(o);a&&(a.value=r||"")})}function Ce(){const t=document.getElementById("profile-edit-fields");t&&(t.style.display="none"),document.getElementById("profile-dashboard-ui").style.display="block";const e=document.getElementById("profile-games-ui");e&&(e.style.display="none")}function W(){const t=document.getElementById("profile-card-container");if(!t||!i.user)return;const e=i.user,n=i.activeCardEdition!=="standard"?`card-${i.activeCardEdition}-edition`:"",o=(e.wins||0)+(e.losses||0)<5?"status-rookie":"",r={standard:"PRO CARD",elite:"ELITE SERIES",global:"GLOBAL PRO","legendary-gold":"LEGENDARY GOLD"},a=i.brand?"PARTNER EDITION":r[i.activeCardEdition]||"PRO CARD";i.brand,i.brand;const s=i.myGames||[],d=(y,v)=>{const b=(y.game_name||"").toUpperCase(),h=(y.serial_number||"").toUpperCase();return b.includes(v)||h.includes(v)};s.some(y=>d(y,"ARCADE")),s.some(y=>d(y,"S7")||d(y,"SUBSOCCER 7")),s.some(y=>d(y,"S3")||d(y,"SUBSOCCER 3"));const l=e.wins||0,c=e.losses||0,u=c>0?(l/c).toFixed(2):l>0?"1.00":"0.00",f=e.avatar_url&&e.avatar_url.trim()!==""?e.avatar_url:"placeholder-silhouette-5-wide.png";t.innerHTML=`
    <style>
        .pro-card-force-sharp { border-radius: 0 !important; }
        .card-bleed-edge { position: absolute; inset: 0; background: radial-gradient(circle, rgba(0,0,0,0.15) 1.5px, transparent 1.5px) 0 0, #00FFCC; background-size: 8px 8px; border: 1px solid #00ccaa; }
        .card-safe-zone { position: absolute; inset: 16px; border: 1px solid #999; border-top: 2px solid #fff; border-bottom: 2px solid #555; background: #050505; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        .card-serial { position: absolute; top: 10px; right: 10px; background: transparent; color: #444; font-family: 'Open Sans', sans-serif; font-size: 0.55rem; font-weight: bold; z-index: 10; letter-spacing: 1px; }
        .card-rc-badge { position: absolute; top: 10px; left: 10px; background: transparent; color: #E30613; font-family: 'Russo One', sans-serif; font-size: 1rem; z-index: 10; font-style: italic; text-shadow: 1px 1px 0 #fff; }
        .card-image-box { height: 65%; width: 100%; position: relative; border-bottom: 2px solid #E30613; background: #111; }
        .card-nameplate { position: absolute; bottom: 0; width: 100%; padding: 30px 10px 10px 10px; background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%); display: flex; flex-direction: column; justify-content: flex-end; }
        .card-data-box { height: 35%; width: 100%; background: #1a1a1a; padding: 10px 15px; display: flex; flex-direction: column; justify-content: space-between; }
        .pro-stamp { position: absolute; top: 12px; left: 12px; width: 60px; height: auto; z-index: 50; transform: rotate(-8deg); filter: drop-shadow(0 1px 1px rgba(0,0,0,0.5)); pointer-events: none; }
        .pro-card.flipped .card-flipper { transform: rotateY(180deg) scale(1.05); }
        .card-front, .card-back { padding: 0 !important; }
        
        /* 300 DPI PRINT EXPORT MODE */
        body.print-mode-active #top-nav, body.print-mode-active .bottom-nav, body.print-mode-active .profile-header, body.print-mode-active .profile-stats-container, body.print-mode-active .flip-hint, body.print-mode-active button { display: none !important; }
        body.print-mode-active { background: #fff !important; overflow: hidden; margin: 0; padding: 0; }
        body.print-mode-active #profile-tab { padding: 0 !important; margin: 0 !important; }
        body.print-mode-active #profile-card-container { position: fixed; inset: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; z-index: 99999; background: #fff; }
        
        body.print-mode-active .pro-card { width: 354px !important; height: 474px !important; max-width: none !important; margin: 0 !important; zoom: 2.5; box-shadow: none !important; border-radius: 0 !important; }
        body.print-mode-active .card-front { background: radial-gradient(circle, rgba(0,0,0,0.15) 1.5px, transparent 1.5px) 0 0, #00FFCC !important; background-size: 8px 8px !important; border: 1px solid #00ccaa !important; }
        body.print-mode-active .card-bleed-edge { inset: 12px !important; border: none !important; }
        body.print-mode-active .card-safe-zone { inset: 28px !important; box-shadow: none !important; border: 1px solid #999 !important; border-top: 2px solid #fff !important; border-bottom: 2px solid #555 !important; }
        body.print-mode-active .pro-stamp { top: 24px !important; left: 24px !important; }
    </style>
    <div class="pro-card pro-card-force-sharp ${n} ${o}" style="margin:0 auto; background:transparent; box-shadow:none; cursor:pointer;" onclick="this.classList.toggle('flipped')">
        <div class="card-flipper" style="width: 100%; height: 100%; position: relative; transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform-style: preserve-3d; border-radius: 0; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.6);">
            <!-- FRONT SIDE -->
            <div class="card-front" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 0; background: transparent;">
                <div class="card-bleed-edge">
                    <div class="card-safe-zone">
                        ${l+c<5?'<div class="card-rc-badge">RC</div>':""}
                        <div class="card-serial">${a}</div>
                        
                        <div class="card-image-box">
                            <img src="${f}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'">
                            <div class="card-nameplate">
                                ${e.team_data?`<div style="font-family:'Open Sans', sans-serif; color:#FFD700; font-size:0.6rem; font-weight:bold; margin-bottom:2px; letter-spacing:1px; text-transform:uppercase;">${e.team_data.tag}</div>`:""}
                                <div style="font-family:'Russo One', sans-serif; color:#fff; font-size:1.6rem; line-height:1; text-transform:uppercase;">${e.username}</div>
                            </div>
                        </div>

                        <div class="card-data-box">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-family:'Open Sans', sans-serif; color:#888; font-size:0.5rem; font-weight:800; letter-spacing:1px;">GLOBAL RANKING</div>
                                    <div style="font-family:'Russo One', sans-serif; color:#fff; font-size:1.2rem;">${e.elo||1e3}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-family:'Open Sans', sans-serif; color:#888; font-size:0.5rem; font-weight:800; letter-spacing:1px;">WIN RATIO</div>
                                    <div style="font-family:'Russo One', sans-serif; color:#00FFCC; font-size:1.2rem;">${u}</div>
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 15px; margin-top: 5px; border-top: 1px solid #333; padding-top: 8px;">
                                <div style="text-align:left;"><div style="color:#666; font-size:0.5rem; font-family:'Open Sans', sans-serif; font-weight:bold;">WINS</div><div style="color:#fff; font-family:'Russo One', sans-serif; font-size:0.9rem;">${l}</div></div>
                                <div style="text-align:left;"><div style="color:#666; font-size:0.5rem; font-family:'Open Sans', sans-serif; font-weight:bold;">LOSSES</div><div style="color:#fff; font-family:'Russo One', sans-serif; font-size:0.9rem;">${c}</div></div>
                                <div style="margin-left:auto; display:flex; align-items:center;">
                                    <img src="https://flagcdn.com/w20/${(e.country||"fi").toLowerCase()}.png" width="20" style="border:1px solid #555;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ${e.elo>=1600?'<img src="stamp.png" class="pro-stamp">':""}
                <div style="position:absolute; bottom:-25px; width:100%; text-align:center; color:#666; font-size:0.6rem; font-family:'Open Sans', sans-serif; pointer-events:none;"><i class="fa-solid fa-rotate-right"></i> TAP TO FLIP</div>
            </div>
            
            <!-- BACK SIDE -->
            <div class="card-back" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 0; background-color: #0a0a0a; background-image: radial-gradient(circle at center, #1a0000 0%, #000 100%); transform: rotateY(180deg); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #333;">
                <div style="text-align:center; padding-bottom:5px; border-bottom:1px solid #333; margin-bottom:15px; padding:20px 20px 0 20px;">
                    <h4 style="color:#D4AF37; font-family:'Russo One', sans-serif; margin:0; letter-spacing:2px; font-size:1.1rem;">PLAYER DOSSIER</h4>
                    <div style="color:#fff; font-size:0.75rem; font-family:'Open Sans', sans-serif; margin-top:5px; text-transform:uppercase;">${e.username}</div>
                </div>
                <!-- Premium Stats Content appended asynchronously below -->
                <div id="profile-card-back-content" style="flex:1; padding:0 20px; overflow-y:auto; overflow-x:hidden; width:100%; box-sizing:border-box;">
                    <!-- Async content loads here, spinner removed for cleaner static state -->
                </div>
                <!-- Bottom edge "TAP TO FLIP" -->
                <div style="position: absolute; bottom: 8px; width: 100%; left: 0; text-align: center; color: rgba(255,255,255,0.3); font-size: 0.6rem; font-weight: bold; letter-spacing: 1.5px; z-index: 2;">
                    <i class="fa-solid fa-rotate-left" style="margin-right: 3px;"></i> TAP TO FLIP
                </div>
            </div>
        </div>
    </div>
    `,Promise.all([p.from("tournament_history").select("*").or(`winner_name.eq.${e.username},second_place_name.eq.${e.username},third_place_name.eq.${e.username}`).eq("status","completed")]).then(([{data:y}])=>{const v=document.getElementById("profile-card-back-content");if(!v)return;const b=e.elo>1600?"PRO":e.elo>1400?"AMATEUR":"ROOKIE",h=e.elo>1600?"var(--sub-gold)":e.elo>1400?"#C0C0C0":"#CD7F32";let x=y?y.filter(D=>D.winner_name===e.username).length:0,E=y?y.length:0,T=0,w=0;x===0&&e.wins>10&&(x=Math.floor(e.wins/10),E=Math.floor(e.wins/4),T=e.elo>1600?Math.floor(e.wins/30):0,w=e.elo>1400?Math.floor(e.wins/20):0);let $=`
            <div style="text-align:center; padding: 15px 0;">
                <div style="font-family:'Resolve'; color:#888; font-size:0.6rem; letter-spacing:2px; margin-bottom:5px;">CURRENT STATUS</div>
                <div style="font-family:'Russo One'; color:${h}; font-size:1.6rem; letter-spacing:3px;">${b}</div>
            </div>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.5rem; font-family:'Russo One'; color:#fff;">${x}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Tournament<br>VictorIES</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center;">
                    <div style="font-size:1.5rem; font-family:'Russo One'; color:#fff;">${E}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Total<br>Podiums</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center; opacity:0.5;">
                    <div style="font-size:1.2rem; font-family:'Russo One'; color:#fff;">${w}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Arena<br>Champs</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); border:1px solid #333; padding:15px 10px; border-radius:8px; text-align:center; opacity:0.5;">
                    <div style="font-size:1.2rem; font-family:'Russo One'; color:#fff;">${T}</div>
                    <div style="font-size:0.55rem; color:#888; font-family:'Resolve'; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">Major<br>Titles</div>
                </div>
            </div>
        `;v.innerHTML=$}).catch(y=>{console.error("Error fetching card dossier stats:",y)});const g=t.querySelector(".topps-collectible-card");g&&St(g)}window.loadUserProfile=wn;window.showEditProfile=En;window.cancelEditProfile=Ce;window.updateProfileCard=W;async function In(t){const e=document.getElementById("search-results");if(!t){e.style.display="none";return}const n=t.trim().toUpperCase();let o=[];try{const{data:s}=await p.from("players").select("username").ilike("username",`%${n}%`).limit(5);s&&(o=s.map(d=>d.username))}catch(s){console.error(s)}const a=[...new Set([...o,...i.sessionGuests])].filter(s=>s.toUpperCase().includes(n)&&!i.pool.includes(s));e.innerHTML=a.map(s=>`<div class="search-item" data-action="direct-add" data-name="${s}">${s}</div>`).join("")+`<div class="search-item" style="color:var(--sub-gold);" data-action="direct-add" data-name="${n}">Add: "${n}"</div>`,e.style.display="block"}function ot(){const t=document.getElementById("add-p-input"),e=t.value.trim().toUpperCase();e&&!i.pool.includes(e)&&(i.pool=[...i.pool,e]),t.value="",document.getElementById("search-results").style.display="none"}function $e(t){const e=t.toUpperCase();i.pool.includes(e)||(i.pool=[...i.pool,e]),document.getElementById("add-p-input").value="",document.getElementById("search-results").style.display="none"}let Ee=!1;const vt=async()=>{const t=document.getElementById("conn-dot");if(t){if(!navigator.onLine){Ee||(window.showNotification&&window.showNotification("No internet connection","error"),Ee=!0),t.classList.add("dot-offline");return}try{if(Ee){const{error:e}=await p.from("players").select("id").limit(1);e||(window.showNotification&&window.showNotification("Connection restored","success"),Ee=!1,t.classList.remove("dot-offline"))}}catch{}}};setInterval(vt,3e4);window.addEventListener("online",vt);window.addEventListener("offline",vt);window.handleSearch=In;window.addP=ot;window.directAdd=$e;let X="players";async function at(){M("Fetching Rankings...");try{const t=document.getElementById("lb-data");if(!t)return;let e=`
            <div style="text-align:center; margin-bottom:15px;">
                <h2 style="font-family:var(--sub-name-font); font-size:1.5rem; color:var(--sub-gold); margin:0; letter-spacing:2px;">GLOBAL RANKING</h2>
            </div>`;We.ENABLE_TEAMS&&(e+=`
            <div style="display:flex; justify-content:center; gap: 10px; margin-bottom: 25px;">
                <button id="lb-toggle-players" style="flex:1; padding: 10px; font-family:'Russo One'; font-size: 0.9rem; border:none; border-radius:4px; cursor:pointer; background: ${X==="players"?"var(--sub-gold)":"#222"}; color: ${X==="players"?"#000":"#888"}; transition: background 0.3s;">TOP PLAYERS</button>
                <button id="lb-toggle-teams" style="flex:1; padding: 10px; font-family:'Russo One'; font-size: 0.9rem; border:none; border-radius:4px; cursor:pointer; background: ${X==="teams"?"var(--sub-gold)":"#222"}; color: ${X==="teams"?"#000":"#888"}; transition: background 0.3s;">TOP TEAMS</button>
            </div>`),e+='<div id="lb-content"></div>',t.innerHTML=e,We.ENABLE_TEAMS&&(document.getElementById("lb-toggle-players").addEventListener("click",()=>{X="players",at()}),document.getElementById("lb-toggle-teams").addEventListener("click",()=>{X="teams",at()}));const n=document.getElementById("lb-content");X==="players"?await sa(n):await la(n)}finally{R()}}async function sa(t){const{data:e}=await p.from("players").select("*, team_data:teams!players_team_id_fkey(*)").or("wins.gt.0,losses.gt.0").order("elo",{ascending:!1});if(!e||e.length===0){t.innerHTML='<div style="text-align:center; padding:40px; color:#666;">No players yet</div>';return}let n="";e.length>=1&&(n+='<div class="podium-section">',e.slice(0,3).forEach((r,a)=>{const s=a+1,d=r.avatar_url||"placeholder-silhouette-5-wide.png",l=r.country?r.country.toLowerCase():"fi",c=r.team_data?Qe(`<div style="color:var(--sub-gold); font-size:0.6rem; margin-bottom:2px; font-weight:bold;">[${r.team_data.tag}]</div>`):"";n+=q`
            <div class="podium-place p-${s}">
                <div class="podium-card" data-username="${r.username}" style="cursor:pointer;">
                    <img src="${d}" alt="${r.username}" onerror="this.src='placeholder-silhouette-5-wide.png'">
                    <div class="podium-card-overlay">
                        ${c}
                        <img src="https://flagcdn.com/w40/${l}.png" style="width:16px; height:auto; margin-bottom:3px; border-radius:1px; box-shadow:0 1px 3px rgba(0,0,0,0.5);">
                        <div class="podium-name">${r.username}</div>
                        <div class="podium-elo">${Math.round(r.elo)}</div>
                    </div>
                </div>
                <div class="podium-step">${s}</div>
            </div>`}),n+="</div>"),e.length>3&&(n+='<h3 style="font-family:var(--sub-name-font); color:#444; margin:20px 0 15px 0; font-size:0.75rem; text-transform:uppercase; letter-spacing:3px; text-align:center;">CONTENDERS</h3>',n+=e.slice(3).map((o,r)=>{const a=o.country?o.country.toLowerCase():"fi",s=r+4,d=o.team_data?Qe(`<span style="color:var(--sub-gold); font-size:0.7rem; margin-right:5px; font-weight:bold;">[${o.team_data.tag}]</span>`):"";return q`
            <div class="ranking-row" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:#0a0a0a; border-radius:var(--sub-radius); margin-bottom:10px; border:1px solid #222; border-left:2px solid #333; transition:all 0.3s ease;" data-username="${o.username}">
                <div style="display:flex; align-items:center; gap:15px;">
                    <span style="color:#444; font-family:var(--sub-name-font); font-size:0.8rem; min-width:30px;">#${s}</span>
                    <img src="https://flagcdn.com/w40/${a}.png" style="height:12px; width:auto; border-radius:1px;">
                    <span class="lb-name" style="font-size:1rem !important;">${d}${o.username}</span>
                </div>
                <span class="lb-elo" style="font-size:1.1rem !important;">${o.elo}</span>
            </div>`}).join("")),t.innerHTML=n}async function la(t){const{data:e}=await p.from("teams").select("*").order("combined_elo",{ascending:!1});if(!e||e.length===0){t.innerHTML='<div style="text-align:center; padding:40px; color:#666;">No teams founded yet</div>';return}let n="";e.length>=1&&(n+='<div class="podium-section">',e.slice(0,3).forEach((r,a)=>{const s=a+1,d=r.logo_url||"placeholder-silhouette-5-wide.png";n+=`
            <div class="podium-place p-${s}">
                <div class="podium-card" style="cursor:default; border: 2px solid var(--sub-gold);">
                    <img src="${d}" alt="${r.name}" onerror="this.src='placeholder-silhouette-5-wide.png'">
                    <div class="podium-card-overlay">
                        <div style="color:var(--sub-gold); font-size:0.6rem; margin-bottom:2px; font-weight:bold;">[${r.tag}]</div>
                        <div class="podium-name" style="font-size:0.65rem;">${r.name}</div>
                        <div class="podium-elo">${r.combined_elo}</div>
                    </div>
                </div>
                <div class="podium-step">${s}</div>
            </div>`}),n+="</div>"),e.length>3&&(n+='<h3 style="font-family:var(--sub-name-font); color:#444; margin:20px 0 15px 0; font-size:0.75rem; text-transform:uppercase; letter-spacing:3px; text-align:center;">CONTENDERS</h3>',n+=e.slice(3).map((o,r)=>{const a=r+4,s=o.logo_url?`<img src="${o.logo_url}" style="width:24px; height:24px; border-radius: 4px; object-fit: cover;">`:'<div style="width:24px; height:24px; border-radius:4px; background:#222; display:flex; justify-content:center; align-items:center; color: var(--sub-gold); font-size: 0.6rem;"><i class="fa-solid fa-shield"></i></div>';return`
            <div class="ranking-row" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:#0a0a0a; border-radius:var(--sub-radius); margin-bottom:10px; border:1px solid #222; border-left:2px solid var(--sub-gold); transition:all 0.3s ease;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <span style="color:#444; font-family:var(--sub-name-font); font-size:0.8rem; min-width:30px;">#${a}</span>
                    ${s}
                    <div>
                        <div class="lb-name" style="font-size:0.9rem !important;">${o.name}</div>
                        <div style="color:var(--sub-gold); font-size:0.7rem; font-weight:bold;">[${o.tag}]</div>
                    </div>
                </div>
                <span class="lb-elo" style="font-size:1.1rem !important; color:var(--sub-gold);">${o.combined_elo}</span>
            </div>`}).join("")),t.innerHTML=n}async function da(){M("Fetching History...");try{const{data:t}=await p.from("tournament_history").select("*, events(event_name)").order("created_at",{ascending:!1}),{data:e}=await p.from("matches").select("*").order("created_at",{ascending:!1}),n=document.getElementById("hist-list");if(!n)return;if((!t||t.length===0)&&(!e||e.length===0)){n.innerHTML="No history.";return}const o={};t&&t.forEach(s=>{const d=s.events?.event_name||s.event_name||"Individual Tournaments";o[d]||(o[d]=[]),o[d].push(s)});const r=e?e.filter(s=>!s.tournament_id):[];r.length>0&&(o["Free Play & Arcade"]=[{is_standalone_group:!0,name:"Recent Matches",matches:r,created_at:r[0].created_at}]);let a="";for(const s in o)a+=`<div class="event-group"><h2 class="event-title">${s}</h2>`,a+=o[s].map(d=>{if(d.is_standalone_group){const l=d.matches.map(c=>{const u=new Date(c.created_at),f=`${u.getDate()}.${u.getMonth()+1}. ${u.getHours()}:${u.getMinutes().toString().padStart(2,"0")}`,g=c.tournament_name||"Verified Session",y=c.player1_score!==null&&c.player2_score!==null?`${c.player1_score} - ${c.player2_score}`:"WIN";return`
                        <div style="background:#111; padding:10px; border-radius:5px; margin-top:5px; font-size:0.8rem; border-left:2px solid var(--sub-red); position:relative;">
                            <div style="color:var(--sub-gold); font-size:0.7rem; margin-bottom:5px; font-weight:bold;">[${g}]</div>
                            <b>${c.winner}</b> defeated ${c.winner===c.player1?c.player2:c.player1} <span style="color:#aaa;">(${y})</span>
                            <div style="position: absolute; bottom: 10px; right: 10px; font-size: 0.6rem; color: #666;">${f}</div>
                        </div>`}).join("");return`
                    <div class="ranking-row" style="background:#0a0a0a; padding:15px; border-radius:var(--sub-radius); border:1px solid #222; border-left:2px solid var(--sub-gold); margin-bottom:10px;">
                        <div style="font-family: var(--sub-name-font); font-size: 1rem; margin-bottom: 8px; text-transform:uppercase; color:var(--sub-gold);">${d.name}</div>
                        <div style="margin-top:10px;">${l}</div>
                    </div>`}else{const l=e?e.filter(b=>b.tournament_id===d.id):[],c=[...new Set(l.flatMap(b=>[b.player1,b.player2]))],u=JSON.stringify([...new Set(c)]),f=l.map(b=>`<div style="background:#111; padding:10px; border-radius:5px; margin-top:5px; font-size:0.8rem;"><b>${b.winner}</b> defeated ${b.winner===b.player1?b.player2:b.player1}</div>`).join(""),g=new Date(d.created_at),y=`${g.getDate()}.${g.getMonth()+1}.${g.getFullYear()}`;let v='<div style="font-family: var(--sub-body-font); font-size:0.85rem; color:#fff;">';return d.winner_name&&(v+=`<div>🏆 ${d.winner_name}</div>`),d.second_place_name&&(v+=`<div style="color:#ccc; font-size:0.8rem; margin-top:2px;">🥈 ${d.second_place_name}</div>`),d.third_place_name&&(v+=`<div style="color:#cd7f32; font-size:0.8rem; margin-top:2px;">🥉 ${d.third_place_name}</div>`),v+="</div>",`<div class="ranking-row" style="background:#0a0a0a; padding:15px; border-radius:var(--sub-radius); border:1px solid #222; border-left:2px solid var(--sub-gold); margin-bottom:10px; position: relative; display:block; text-align:left;">
                    <div style="position: absolute; top: 15px; right: 15px; cursor: pointer; font-size: 1rem; z-index: 5; opacity:0.6;" data-replay-players='${u}' data-replay-name="${d.tournament_name}">🔄</div>
                    <div style="cursor:pointer;" data-toggle-tournament="${d.id}"><div style="font-family: var(--sub-name-font); font-size: 1rem; margin-bottom: 8px; text-transform:uppercase; color:var(--sub-gold);">${d.tournament_name}</div>${v}</div>
                    <div id="tour-matches-${d.id}" style="display:none; margin-top:10px;">${f}</div>
                    <div style="position: absolute; bottom: 10px; right: 10px; font-size: 0.6rem; color: #666;">${y}</div>
                </div>`}}).join(""),a+="</div>";n.innerHTML=a}finally{R()}}function rt(t){const e=document.getElementById("events-view");if(!e)return;const n=t.length===0?q`
            <div class="empty-events-container" style="text-align:center; padding:80px 20px; color:#444; border: 1px dashed #222; border-radius: 8px; background: rgba(255,255,255,0.01);">
                <i class="fa-solid fa-calendar-xmark" style="font-size:3rem; margin-bottom:20px; opacity:0.1; color: var(--sub-red);"></i>
                <div style="font-size:0.8rem; letter-spacing:3px; font-family: var(--sub-name-font); color: #555;">NO UPCOMING EVENTS</div>
            </div>
    `:t.map(a=>ca(a)),r=i.user&&i.user.id!=="guest"&&i.user.id!=="spectator"?q`
        <div class="events-setup-header" style="margin-bottom: 20px;">
            <div style="display:flex; justify-content:center;">
                <button class="create-event-action-btn" onclick="showCreateEventForm()" style="width:100%; max-width:400px; padding:15px; border: 1px solid #333; background: #1a1a1a; color: var(--sub-gold); border-radius: var(--sub-radius); cursor: pointer; transition: all 0.3s ease; font-family: var(--sub-name-font); letter-spacing: 2px; font-size: 0.85rem;">
                    <i class="fa-solid fa-calendar-plus" style="margin-right:8px;"></i> CREATE NEW EVENT
                </button>
            </div>
            
            <div id="create-event-form" style="display:none; transition: all 0.4s ease;"></div>
        </div>
    `:"";e.innerHTML=q`
        ${r}
        
        <div class="events-separator" style="display:flex; align-items:center; gap:15px; margin:20px 0 20px 0;">
            <div style="height:1px; background:linear-gradient(to right, transparent, #333); flex:1;"></div>
            <div style="font-family:var(--sub-name-font); color:#888; font-size:0.7rem; letter-spacing:2px; font-weight: bold;">EVENTS</div>
            <div style="height:1px; background:linear-gradient(to left, transparent, #333); flex:1;"></div>
        </div>

        <div id="events-list" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:15px; padding-bottom: 40px;">
            ${n}
        </div>
    `}function ca(t){const e=new Date(t.start_datetime),n=e.getDate(),o=e.toLocaleDateString("en-GB",{month:"short"}).toUpperCase(),r=e.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),s={tournament:"var(--sub-gold)",league:"#4CAF50",casual:"#0089CF"}[t.event_type]||"#888";return q`
        <div class="event-card-premium" style="position:relative; background:#0a0a0a; border:1px solid #222; border-radius:var(--sub-radius); overflow:hidden; display:flex; flex-direction:column; min-height:300px; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
            
            <!-- Card Image / Header -->
            <div class="event-card-image-wrapper" style="height:160px; position:relative; overflow:hidden; background:#111;">
                ${t.image_url?q`
                    <img src="${t.image_url}" loading="lazy" alt="${t.event_name}" style="width:100%; height:100%; object-fit:cover; transition: transform 0.5s ease;">
                `:q`
                    <div style="width:100%; height:100%; background: linear-gradient(45deg, #0f0f0f, #1a1a1a); display:flex; align-items:center; justify-content:center;">
                        <i class="fa-solid fa-trophy" style="font-size:4rem; color:rgba(255,255,255,0.03);"></i>
                    </div>
                `}
                
                <!-- Date Badge -->
                <div class="event-date-badge" style="position:absolute; top:15px; left:15px; background:rgba(0,0,0,0.85); border:1px solid var(--sub-border); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); padding:8px 12px; border-radius:var(--sub-radius); text-align:center; min-width:50px; z-index:2;">
                    <div style="font-size:0.65rem; color:var(--sub-gold); font-family:var(--sub-name-font); letter-spacing:1px; line-height:1; margin-bottom:2px;">${o}</div>
                    <div style="font-size:1.4rem; color:#fff; font-family:var(--sub-name-font); line-height:1; font-weight:bold;">${n}</div>
                </div>

                <!-- Overlay Gradient -->
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:linear-gradient(to bottom, transparent 30%, rgba(10,10,10,0.95) 100%); z-index:1;"></div>
                
                <!-- Type Tag -->
                <div style="position:absolute; bottom:15px; left:20px; z-index:2; display:flex; align-items:center; gap:8px;">
                     <span style="height:6px; width:6px; border-radius:50%; background:${s}; box-shadow: 0 0 10px ${s};"></span>
                     <span style="font-size:0.65rem; color:#fff; font-weight:bold; letter-spacing:2px; text-transform:uppercase; font-family:var(--sub-name-font);">${t.event_type}</span>
                </div>
            </div>

            <!-- Card Content -->
            <div class="event-card-body" style="padding:15px; flex:1; display:flex; flex-direction:column; background: linear-gradient(to bottom, rgba(10,10,10,1), #080808);">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
                    <h3 style="font-family:var(--sub-name-font); font-size:1.1rem; margin:0; color:#fff; letter-spacing:0.5px; text-transform:uppercase; line-height:1.2; font-weight:bold; flex:1;">
                        ${t.event_name}
                    </h3>
                    <div style="font-size:0.7rem; color:#888; font-family:var(--sub-name-font); letter-spacing:1px; white-space:nowrap; margin-left:10px;">
                        <i class="fa-regular fa-clock" style="margin-right:3px; color:${s};"></i> ${r}
                    </div>
                </div>
                
                <div style="font-size:0.8rem; color:#888; margin-bottom:15px; display:flex; align-items:flex-start; gap:6px; line-height:1.3;">
                    <i class="fa-solid fa-location-dot" style="color:var(--sub-red); margin-top:2px; font-size:0.8rem;"></i> 
                    <span style="font-family:var(--sub-body-font);">${t.location?t.location.toUpperCase():"LOCATION TBD"}</span>
                </div>
                
                <div style="margin-top:auto; padding-top:10px; border-top:1px solid #1a1a1a;">
                    <button class="event-view-btn-premium" 
                            style="width:100%; padding:10px; font-size:0.75rem; font-weight:bold; letter-spacing:2px; background:#111; border:1px solid #333; color:var(--sub-gold); cursor:pointer; font-family:var(--sub-name-font); text-transform:uppercase; transition:all 0.3s ease; border-radius:var(--sub-radius);"
                            data-action="view-event-details" data-id="${t.id}">
                        VIEW EVENT DETAILS
                    </button>
                </div>
            </div>
            
            <!-- Hover Border Effect -->
            <div class="card-hover-border" style="position:absolute; top:0; left:0; width:100%; height:100%; border:1px solid var(--sub-gold); opacity:0; pointer-events:none; transition:opacity 0.3s ease; z-index:10;"></div>
        </div>
    `}function ua(t,e,n,o=[]){const r=new Date(t.start_datetime),a=t.end_datetime?new Date(t.end_datetime):null;let s;if(a&&a.toDateString()!==r.toDateString()){const u=r.toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long"}),f=a.toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});s=`${u} - ${f}`}else s=r.toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});const d=r.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),l=ht(t,o);let c=`
        <div style="background:#0e0e0e; border-radius:var(--sub-radius); overflow:hidden; border: 1px solid var(--sub-border); box-shadow: var(--sub-shadow);">
                ${t.image_url?`
                    <div style="width:100%; height:220px; background:url('${t.image_url}') center/cover; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:linear-gradient(to bottom, transparent 40%, #0e0e0e 100%);"></div>
                        <div style="position:absolute; bottom:20px; left:25px; right:25px;">
                            <div style="background:var(--sub-gold); color:#000; padding:3px 8px; font-size:0.65rem; font-weight:bold; display:inline-block; margin-bottom:8px; border-radius:2px; text-transform:uppercase; letter-spacing:1px;">${t.event_type}</div>
                            <h2 style="font-family:var(--sub-name-font); font-size:2rem; margin:0; color:#fff; text-transform:uppercase; letter-spacing:1px; line-height:1; text-shadow:0 2px 15px rgba(0,0,0,0.8);">${t.event_name}</h2>
                        </div>
                    </div>
                `:`
                    <div style="padding:30px 25px 10px 25px; border-bottom:1px solid #222; background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%); background-size: 8px 8px; background-color: #111;">
                        <div style="background:var(--sub-gold); color:#000; padding:3px 8px; font-size:0.65rem; font-weight:bold; display:inline-block; margin-bottom:10px; border-radius:2px; text-transform:uppercase; letter-spacing:1px;">${t.event_type}</div>
                        <h2 style="font-family:var(--sub-name-font); font-size:1.8rem; margin:0; color:#fff; text-transform:uppercase; letter-spacing:1px;">${t.event_name}</h2>
                    </div>
                `}
                
                <div style="padding:25px;">
                    <!-- Info Bar -->
                    <div style="display:flex; flex-wrap:wrap; gap:20px; margin-bottom:25px; padding-bottom:20px; border-bottom:1px solid #222;">
                        <div style="flex:1; min-width:140px;">
                            <div style="font-size:0.65rem; color:#666; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">DATE</div>
                            <div style="color:#fff; font-size:0.9rem; font-weight:bold;"><i class="fa fa-calendar" style="color:var(--sub-gold); margin-right:6px;"></i> ${s}</div>
                            ${!a||a.toDateString()===r.toDateString()?`<div style="color:#888; font-size:0.8rem; margin-top:2px; margin-left:20px;">${d}</div>`:""}
                        </div>
                        <div style="flex:1; min-width:140px;">
                            <div style="font-size:0.65rem; color:#666; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">LOCATION</div>
                            <div style="color:#fff; font-size:0.9rem; font-weight:bold;"><i class="fa fa-map-marker-alt" style="color:var(--sub-red); margin-right:6px;"></i> ${t.location||"TBA"}</div>
                        </div>
                        <div style="flex:1; min-width:140px;">
                            <div style="font-size:0.65rem; color:#666; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">ORGANIZER</div>
                            <div style="color:#fff; font-size:0.9rem; font-weight:bold;"><i class="fa fa-user-circle" style="color:#888; margin-right:6px;"></i> ${t.organizer?.username||"System"}</div>
                        </div>
                    </div>

                    ${t.description?`<div style="margin-bottom:30px; background:#161616; padding:15px; border-radius:6px; border:1px solid #222;"><div style="font-size:0.7rem; color:var(--sub-gold); margin-bottom:8px; font-weight:bold; letter-spacing: 1px; text-transform: uppercase;">ABOUT EVENT</div><p style="font-size:0.9rem; color:#ccc; margin:0; line-height:1.5;">${t.description}</p></div>`:""}

                    ${t.organizer_id===i.user?.id||ye()?`
                        <div class="sub-card-premium" data-event-id="${t.id}" style="margin-bottom:24px; border-left:4px solid var(--sub-red); padding: 16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                <div style="font-size:0.85rem; color:#fff; font-weight:bold; font-family: var(--sub-name-font); letter-spacing: 1px;">🛡️ MODERATORS</div>
                                <button data-action="toggle-moderator-search" data-event-id="${t.id}" class="btn-red" style="padding:6px 12px; font-size:0.75rem; width: auto;">+ ADD MODERATOR</button>
                            </div>
                            <div id="event-moderators-list" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;"></div>
                            <div id="moderator-search-container" style="display:none; background:var(--sub-black); padding:12px; border:1px solid var(--sub-border);">
                                <input type="text" id="mod-search-input" placeholder="Search player name..." style="width:100%; padding:10px; background:var(--sub-charcoal); border:1px solid var(--sub-border); color:#fff; font-size:0.85rem; box-sizing:border-box; outline: none;">
                                <div id="mod-search-results" style="max-height:150px; overflow-y:auto; margin-top:8px;"></div>
                            </div>
                        </div>
                    `:""}
                    
                    <div style="margin-bottom:24px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div style="font-size:0.8rem; color:#fff; font-family: var(--sub-name-font); letter-spacing: 1px; text-transform: uppercase;">🏆 TOURNAMENTS</div>
                            ${l?`<button class="btn-red" style="width:auto; padding:6px 12px; font-size:0.7rem; background:var(--sub-gold); color:#000;" data-action="show-create-tournament-form" data-event-id="${t.id}" data-event-name="${t.event_name}">+ CREATE</button>`:""}
                        </div>

                        ${e.length===0?`
                            <div style="text-align:center; padding:40px 24px; color:#666; background: var(--sub-charcoal); border: 1px dashed var(--sub-border);">
                                <i class="fa fa-trophy" style="font-size:2rem; color:#333; margin-bottom:12px; display:block;"></i>
                                <div style="font-size:0.85rem; font-family: var(--sub-name-font); letter-spacing: 1px;">NO TOURNAMENTS CREATED YET</div>
                                ${l?'<div style="font-size:0.75rem; margin-top:8px; color:#888;">Create tournaments during the event</div>':""}
                            </div>
                        `:e.map(u=>{(n||[]).some(b=>b.tournament_id===u.id);const y=(u.start_datetime?new Date(u.start_datetime):new Date(u.created_at)).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),v=u.status==="completed"&&(u.participant_count||0)===0&&u.max_participants?u.max_participants:u.participant_count||0;return`
                                <div style="background:#141414; border:1px solid ${u.status==="ongoing"?"var(--sub-red)":"#2a2a2a"}; border-radius:6px; margin-bottom:12px; overflow:hidden; position:relative;">
                                    ${u.status==="ongoing"?'<div style="position:absolute; top:0; right:0; background:var(--sub-red); color:#fff; font-size:0.6rem; padding:2px 8px; font-weight:bold; border-bottom-left-radius:6px;">LIVE</div>':""}
                                    
                                    <div style="padding:15px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                                        <div style="text-align:center; min-width:55px; padding-right:12px; border-right:1px solid #333;">
                                            <div style="font-size:1.1rem; font-family:var(--sub-name-font); color:#fff; line-height:1;">${y}</div>
                                            <div style="font-size:0.6rem; color:#666; text-transform:uppercase; margin-top:2px;">Start</div>
                                        </div>
                                        
                                        <div style="flex:1; min-width:150px;">
                                            <div style="font-size:0.65rem; color:var(--sub-gold); font-weight:bold; text-transform:uppercase; margin-bottom:2px;">${u.game?.game_name||"Table TBD"}</div>
                                            <div style="font-size:1rem; color:#fff; font-family:var(--sub-name-font); letter-spacing:0.5px; line-height:1.2;">${u.tournament_name||"Tournament"}</div>
                                            <div style="font-size:0.7rem; color:#888; margin-top:4px;"><i class="fa fa-users" style="font-size:0.7rem; margin-right:4px;"></i> ${v} ${u.max_participants>0?"/ "+u.max_participants:""} Players</div>
                                        </div>

                                        <div style="display:flex; gap:6px; min-width:fit-content; margin-left:auto;">
                                             ${v>=2?`<button data-action="view-bracket" data-id="${u.id}" data-event-id="${t.id}" data-name="${(u.tournament_name||"Tournament").replace(/[`'"]/g,"")}" data-max="${u.max_participants}" style="background:rgba(255,255,255,0.05); border:1px solid #444; color:#fff; cursor:pointer; font-size:0.65rem; font-weight:bold; padding:8px 12px; border-radius:4px; text-align:center; font-family:var(--sub-name-font); text-transform:uppercase;">BRACKET</button>`:""}
                                             <button data-action="view-participants" data-event-id="${t.id}" data-tour-id="${u.id}" data-name="${(u.tournament_name||"Tournament").replace(/[`'"]/g,"")}" style="background:none; border:1px solid #333; color:#aaa; cursor:pointer; font-size:0.65rem; padding:8px 12px; border-radius:4px; text-align:center; font-family:var(--sub-name-font); text-transform:uppercase;">ROSTER</button>
                                        </div>
                                    </div>
                                    
                                    ${u.status==="completed"&&u.winner_name?`<div style="background:rgba(255,215,0,0.05); border-top:1px solid rgba(255,215,0,0.1); padding:8px 15px; display:flex; align-items:center; gap:10px;"><span style="font-size:0.9rem;">🏆</span> <span style="color:var(--sub-gold); font-weight:bold; font-size:0.8rem;">WINNER: ${u.winner_name}</span></div>`:""}
                                    
                                    ${l?`<div style="display:flex; gap:1px; background:#111; border-top:1px solid #222;">
                                        <button style="flex:1; padding:8px; font-size:0.7rem; background:none; border:none; color:#888; cursor:pointer; border-right:1px solid #222;" onclick="editTournament('${u.id}', '${t.id}', '${t.event_name}')">EDIT</button>
                                        <button style="flex:1; padding:8px; font-size:0.7rem; background:none; border:none; color:#888; cursor:pointer; border-right:1px solid #222;" onclick="duplicateTournament('${u.id}', '${t.id}')">COPY</button>
                                        <button style="flex:1; padding:8px; font-size:0.7rem; background:none; border:none; color:var(--sub-red); cursor:pointer;" onclick="deleteTournament('${u.id}', '${t.id}')">DELETE</button>
                                    </div>`:""}
                                </div>`}).join("")}
                    </div>
                    
                    ${l?'<div style="padding:12px; background:#1a1a1a; border:1px solid #333; border-radius:6px; font-size:0.75rem; color:#888; margin-bottom:20px; display:flex; gap:10px; align-items:center;"><i class="fa fa-info-circle"></i> <span>Create tournaments above to start matches.</span></div>':""}
                    
                    <div style="display:flex; gap:10px; margin-top:30px; border-top:1px solid #222; padding-top:20px;">
                        ${l?`
                            <button class="btn-red" style="flex:1; background:#222; border:1px solid #333; color:#ccc;" data-action="edit-event" data-id="${t.id}">EDIT</button>
                            <button class="btn-red" style="flex:1; background:#222; border:1px solid #333; color:var(--sub-red);" data-action="delete-event" data-id="${t.id}">DELETE</button>
                            <button class="btn-red" style="flex:1.5; background:#0089CF; color:#fff;" data-action="open-public-display" data-id="${t.id}"><i class="fa fa-tv"></i> PUBLIC SCREEN</button>
                        `:""}
                    </div>
                    
                    <div style="display:flex; gap:10px; margin-top:10px; padding-bottom:10px;">
                        <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000; padding:14px;" data-action="share-live-link" data-id="${t.id}" data-name="${t.event_name}"><i class="fa fa-share-alt"></i> SHARE LINK</button>
                        <button class="btn-red" style="flex:1; background:#333; padding:14px;" data-action="close-event-modal">CLOSE</button>
                    </div>
                </div>
        </div>
    `;B(t.event_name,c,{id:"event-modal",maxWidth:"600px"})}function kn(){P("event-modal")}function ht(t,e=[]){return i.user?ye()||t.organizer_id===i.user.id||t.organizer&&t.organizer.username&&i.user.username&&t.organizer.username.toLowerCase()===i.user.username.toLowerCase()?!0:(e||[]).includes(i.user.id):!1}let U=null,H=null;function xt(t=null){t||(U=null,H=null);const e=document.getElementById("create-event-form");if(!e)return;const o=$n(new Date),r=oe(o),a=new Date(o.getTime()+1800*1e3),s=oe(a),d=t?"update-event-form":"create-event",l=t?'<i class="fa fa-save"></i> SAVE CHANGES':'<i class="fa fa-check"></i> CREATE EVENT',c=t?`data-id="${t.id}"`:"",u=t?'<i class="fa fa-edit"></i> Edit Event':'<i class="fa fa-plus-circle"></i> Create New Event';e.style.display="block",e.innerHTML=`
        <div style="background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px; margin-bottom:20px;">
            <h4 style="font-family:var(--sub-name-font); text-transform:uppercase; margin:0 0 20px 0; color:var(--sub-gold); font-size:1.1rem; letter-spacing:2px;">
                ${u}
            </h4>
            
            <input type="text" id="event-name-input" placeholder="Event Name *" 
                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:0.95rem; margin-bottom:15px; box-sizing:border-box;">
            
            <select id="event-type-select" class="dark-select" 
                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:0.95rem; margin-bottom:15px; box-sizing:border-box;">
                <option value="tournament">🏆 Tournament</option>
                <option value="league">⚽ League Match</option>
                <option value="casual">🎮 Casual Play</option>
            </select>
            
            <div style="margin-bottom:15px;">
                <label style="font-size:0.95rem; color:#aaa; display:block; margin-bottom:10px; font-weight:600;">
                    <i class="fa fa-calendar" style="color:var(--sub-gold); margin-right:8px;"></i> EVENT DATES
                </label>
                <div style="display:flex; gap:12px;">
                    <div style="flex:1; min-width:0;">
                        <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">Start Date & Time *</label>
                        <input type="datetime-local" id="event-start-input" value="${r}" min="${r}" step="900"
                            style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:1rem; box-sizing:border-box; color-scheme: dark;">
                    </div>
                    <div style="flex:1; min-width:0;">
                        <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">End Date & Time (optional)</label>
                        <input type="datetime-local" id="event-end-input" value="${s}" min="${r}" step="900"
                            style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:1rem; box-sizing:border-box; color-scheme: dark;">
                    </div>
                </div>
            </div>
            
            <input type="text" id="event-location-input" placeholder="Location / Address (optional)" 
                style="width:100%; padding:12px; background:#111; border:1px solid #333; border-radius:8px; color:#fff; font-size:0.95rem; margin-bottom:15px; box-sizing:border-box;">
            
            <textarea id="event-desc-input" placeholder="Event Description (optional)" 
                style="width:100%; min-height:80px; padding:12px; background:#111; border:1px solid #333; color:#fff; border-radius:8px; font-family:'Open Sans'; font-size:0.95rem; margin-bottom:15px; resize:vertical; box-sizing:border-box;"></textarea>
            
            <div style="margin-bottom:20px; padding:15px; background:#111; border:1px solid #333; border-radius:8px;">
                <label style="font-size:0.9rem; color:#aaa; display:block; margin-bottom:10px; font-weight:600;">
                    <i class="fa fa-star" style="color:var(--sub-gold); margin-right:8px;"></i> EVENT BRANDING
                </label>
                
                <div style="margin-bottom:15px;">
                    <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">Brand Logo (e.g. Tournament/Sponsor)</label>
                    <input type="file" id="brand-logo-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
                    <label for="brand-logo-input" id="brand-logo-label" style="display:inline-block; padding:8px 15px; background:#333; color:#fff; border-radius:6px; cursor:pointer; font-size:0.8rem; border:1px solid #444;">
                        <i class="fa fa-upload"></i> Upload Logo
                    </label>
                    <div id="brand-logo-preview" style="margin-top:10px; display:flex; align-items:center;"></div>
                </div>
                
                <div>
                    <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:5px;">Primary Theme Color</label>
                    <input type="color" id="event-color-input" value="#FFD700" style="width:100%; height:40px; padding:2px; background:none; border:none; cursor:pointer;">
                </div>
            </div>

            <div style="margin-bottom:20px;">
                <input type="file" id="event-image-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
                <label for="event-image-input" id="event-image-label" 
                    style="display:block; padding:14px; background:var(--sub-red); color:#fff; border-radius:8px; cursor:pointer; font-size:1rem; font-family:var(--sub-name-font); text-transform:uppercase; text-align:center; transition:all 0.2s;">
                    <i class="fa fa-upload"></i> CHOOSE IMAGE
                </label>
                <div id="event-image-preview" style="margin-top:12px;"></div>
            </div>
            
            <div style="display:flex; gap:12px; margin-top:25px;">
                <button class="btn-red" data-action="${d}" ${c} style="flex:1; padding:14px; font-size:1rem;">
                    ${l}
                </button>
                <button class="btn-red" data-action="hide-create-event-form" style="flex:1; padding:14px; font-size:1rem; background:#333;">
                    <i class="fa fa-times"></i> CANCEL
                </button>
            </div>
        </div>
    `,e.scrollIntoView({behavior:"smooth",block:"nearest"}),document.getElementById("event-start-input").addEventListener("change",f=>{const g=document.getElementById("event-end-input");if(g){g.min=f.target.value;const y=new Date(f.target.value),v=new Date(y.getTime()+1800*1e3);g.value=oe(v)}})}function qe(){const t=document.getElementById("create-event-form");t&&(t.style.display="none",t.innerHTML=""),U=null,H=null}function Tn(t){const e=document.getElementById("event-image-preview"),n=document.getElementById("event-image-label");if(e&&t.files&&t.files[0]){if(U=t.files[0],U.size>5*1024*1024){m("Image too large. Max 5MB allowed.","error"),t.value="",U=null,e.innerHTML="";return}n&&(n.style.display="none");const o=new FileReader;o.onload=r=>{e.innerHTML=`
                <div style="position:relative; width:100%; max-width:300px;">
                    <img src="${r.target.result}" style="width:100%; border-radius:8px; border:2px solid var(--sub-gold);">
                    <button onclick="clearEventImage()" style="position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.8); color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; font-size:1.2rem;">×</button>
                </div>
            `},o.readAsDataURL(U)}}function Sn(){const t=document.getElementById("event-image-input"),e=document.getElementById("event-image-preview"),n=document.getElementById("event-image-label");t&&(t.value=""),e&&(e.innerHTML=""),n&&(n.style.display="inline-block"),U=null}function Bn(t){const e=document.getElementById("brand-logo-preview");if(document.getElementById("brand-logo-label"),!!e&&t.files&&t.files[0]){if(H=t.files[0],H.size>2*1024*1024){m("Logo too large. Max 2MB allowed.","error"),t.value="",H=null,e.innerHTML="";return}const n=new FileReader;n.onload=o=>{e.innerHTML=`
                <img src="${o.target.result}" style="height:40px; width:auto; margin-right:10px;">
                <button onclick="clearBrandLogo()" style="background:none; border:none; color:#888; cursor:pointer;">&times; Remove</button>
            `},n.readAsDataURL(H)}}function _n(){const t=document.getElementById("brand-logo-input"),e=document.getElementById("brand-logo-preview");t&&(t.value=""),e&&(e.innerHTML=""),H=null}async function Ln(){if(!i.user){m("You must be logged in to create events","error");return}const t=document.querySelector('button[data-action="create-event"]');if(t){if(t.disabled)return;t.disabled=!0,t.innerHTML='<i class="fa fa-spinner fa-spin"></i> CREATING...'}const e=document.getElementById("event-name-input")?.value.trim(),n=document.getElementById("event-type-select")?.value,o=document.getElementById("event-start-input")?.value,r=document.getElementById("event-end-input")?.value||null,a=document.getElementById("event-desc-input")?.value.trim(),s=document.getElementById("event-location-input")?.value.trim()||null,d=document.getElementById("event-color-input")?.value;if(!e||!o){m("Please fill required fields (Event Name, Start Time)","error"),t&&(t.disabled=!1,t.innerHTML='<i class="fa fa-check"></i> CREATE EVENT');return}try{let l=null,c=null;U&&(m("Uploading image...","success"),l=await Nt(U,!0)),H&&(m("Uploading logo...","success"),c=await Nt(H,!1));const u={event_name:e,event_type:n,start_datetime:o?new Date(o).toISOString():null,end_datetime:r?new Date(r).toISOString():null,description:a||null,location:s,organizer_id:i.user.id,image_url:l,brand_logo_url:c,primary_color:d,status:"upcoming",is_public:!0},{error:f}=await p.from("events").insert(u).select().single();if(f)throw f;m("Event created successfully! 🎉","success"),qe(),window.loadEventsPage&&window.loadEventsPage()}catch(l){console.error("Failed to create event:",l),m("Failed to create event: "+l.message,"error")}finally{t&&(t.disabled=!1,t.innerHTML='<i class="fa fa-check"></i> CREATE EVENT')}}async function ma(t){return new Promise((e,n)=>{const o=new FileReader;o.readAsDataURL(t),o.onload=r=>{const a=new Image;a.src=r.target.result,a.onload=()=>{const s=document.createElement("canvas"),d=1200;let l=a.width,c=a.height;l>d&&(c=Math.round(c*d/l),l=d),s.width=l,s.height=c,s.getContext("2d").drawImage(a,0,0,l,c),s.toBlob(f=>{f?e(f):n(new Error("Image compression failed"))},"image/jpeg",.8)},a.onerror=s=>n(s)},o.onerror=r=>n(r)})}async function Nt(t,e=!1){let n=t,o=t.name.split(".").pop();if(e)try{n=await ma(t),o="jpg"}catch(d){console.warn("Image compression failed, uploading original:",d)}const r=`${i.user.id}-${Date.now()}.${o}`,{error:a}=await p.storage.from("event-images").upload(r,n,{cacheControl:"3600",upsert:!1});if(a)throw new Error("Image upload failed");const{data:{publicUrl:s}}=p.storage.from("event-images").getPublicUrl(r);return s}async function wt(t,e){if(!i.user){m("You must be logged in to create tournaments","error");return}if(!i.allGames||i.allGames.length===0){M();const{data:c,error:u}=await p.from("games").select("*").eq("is_public",!0).order("game_name");if(R(),u||!c||c.length===0){m("No game tables available.","error");return}i.allGames=c}const n=i.allGames.map(c=>`<option value="${c.id}">${c.game_name}${c.location?" - "+c.location:""}</option>`).join(""),r=$n(new Date),a=oe(r),s=oe(new Date(r.getTime()+1800*1e3)),d=`
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; overflow-y:auto; padding:20px; box-sizing:border-box;">
                <div style="max-width:500px; margin:0 auto; background:#0a0a0a; border:2px solid var(--sub-gold); border-radius:12px; padding:25px;">
                    <h2 style="font-family:var(--sub-name-font); font-size:1.1rem; margin:0 0 20px 0; color:var(--sub-gold); text-align:center; text-transform:uppercase; letter-spacing:2px;">
                        <i class="fa fa-trophy" style="margin-right:8px;"></i> CREATE TOURNAMENT
                    </h2>
                    <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:15px; font-size:0.85rem; color:#888;">Event: <span style="color:#fff;">${e}</span></div>
                    <div style="margin-bottom:15px;"><label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">TOURNAMENT NAME</label><input type="text" id="tournament-name-input" placeholder="e.g. Morning Finals" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff;"></div>
                    <div style="margin-bottom:15px;"><label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">GAME TABLE *</label><select id="tournament-game-select" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff;">${n}</select></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                        <div><label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">START TIME *</label><input type="datetime-local" id="tournament-start-input" value="${a}" min="${a}" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; color-scheme:dark;"></div>
                        <div><label style="display:block; font-size:0.8rem; color:#888; margin-bottom:5px;">END TIME</label><input type="datetime-local" id="tournament-end-input" value="${s}" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff; color-scheme:dark;"></div>
                    </div>
                    <div style="margin-bottom:15px;"><label style="display:block; font-size:0.85rem; color:#888; margin-bottom:5px;">MAX PLAYERS</label><input type="number" id="tournament-max-input" value="8" min="2" max="32" style="width:100%; padding:10px; background:#111; border:1px solid #333; border-radius:6px; color:#fff;"></div>
                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" onclick="createTournament('${t}')">CREATE</button>
                        <button class="btn-red" style="flex:1; background:#333;" onclick="closeTournamentForm()">CANCEL</button>
                    </div>
                </div>
            </div>`;let l=document.getElementById("tournament-form-modal");l||(l=document.createElement("div"),l.id="tournament-form-modal",document.body.appendChild(l)),l.innerHTML=d,document.getElementById("tournament-start-input").addEventListener("change",c=>{const u=document.getElementById("tournament-end-input");if(u){u.min=c.target.value;const f=new Date(c.target.value),g=new Date(f.getTime()+1800*1e3);u.value=oe(g)}})}function Ge(){const t=document.getElementById("tournament-form-modal");t&&t.remove()}async function Cn(t){if(i.user)try{const{data:e}=await p.from("events").select("*, moderators:event_moderators(player_id)").eq("id",t).single();if(!e)return;const n=e.moderators?e.moderators.map(a=>a.player_id):[];if(!ht(e,n)){m("Not authorized","error");return}const o={event_id:t,game_id:document.getElementById("tournament-game-select")?.value,organizer_id:i.user.id,tournament_name:document.getElementById("tournament-name-input")?.value.trim()||null,tournament_type:"elimination",max_participants:parseInt(document.getElementById("tournament-max-input")?.value)||8,start_datetime:new Date(document.getElementById("tournament-start-input")?.value).toISOString(),end_datetime:document.getElementById("tournament-end-input")?.value?new Date(document.getElementById("tournament-end-input").value).toISOString():null,status:"scheduled"},{error:r}=await p.from("tournament_history").insert(o);if(r)throw r;m("Tournament created!","success"),Ge(),window.viewEventDetails&&window.viewEventDetails(t)}catch(e){m("Error: "+e.message,"error")}}function oe(t){const e=new Date(t);return e.setMinutes(e.getMinutes()-e.getTimezoneOffset()),e.toISOString().slice(0,16)}function $n(t,e=15){const n=6e4*e;return new Date(Math.ceil(t.getTime()/n)*n)}window.showCreateEventForm=xt;window.hideCreateEventForm=qe;window.previewEventImage=Tn;window.clearEventImage=Sn;window.previewBrandLogo=Bn;window.clearBrandLogo=_n;window.createNewEvent=Ln;window.showCreateTournamentForm=wt;window.closeTournamentForm=Ge;window.createTournament=Cn;let ee=null,An=0;const pa=6e4;async function Fe(t=!1){if(!document.getElementById("events-view"))return;const n=Date.now();if(!t&&ee&&n-An<pa){rt(ee),qt();return}ee?rt(ee):M("Loading Events..."),await qt(!0)}async function qt(t=!1){const e=document.getElementById("events-view");try{const n=new Date,o=new Date;o.setMonth(n.getMonth()-3);let r=null,a=null;for(let l=1;l<=3;l++){const c=await p.from("events").select("id, event_name, event_type, start_datetime, end_datetime, location, image_url").neq("status","cancelled").gte("start_datetime",o.toISOString()).order("start_datetime",{ascending:!0});if(c.error)a=c.error,l<3&&await new Promise(u=>setTimeout(u,800));else{r=c.data,a=null;break}}if(a)throw a;const s=[],d=[];(r||[]).forEach(l=>{const c=new Date(l.start_datetime);(l.end_datetime?new Date(l.end_datetime):new Date(c.getTime()+10800*1e3))<n?d.push(l):s.push(l)}),d.sort((l,c)=>new Date(c.start_datetime)-new Date(l.start_datetime)),ee=[...s,...d],An=Date.now(),rt(ee)}catch(n){console.error("Failed to load events:",n),e&&!ee&&(e.innerHTML='<div style="text-align:center; padding:40px; color:var(--sub-red);"><button onclick="loadEventsPage(true)" class="btn-red">TRY AGAIN</button></div>')}finally{t&&R()}}async function O(t){M("Loading Event...");try{const{data:e,error:n}=await p.from("events").select("*").eq("id",t).single();if(n)throw n;const{data:o}=await p.from("tournament_history").select("*, game:games(game_name)").eq("event_id",t).order("start_datetime",{ascending:!0}),{data:r}=await p.from("event_registrations").select("tournament_id").eq("event_id",t).eq("status","registered");(o||[]).forEach(l=>{l.participant_count=(r||[]).filter(c=>c.tournament_id===l.id).length});let a=[];if(i.user){const{data:l}=await p.from("event_registrations").select("*").eq("event_id",t).eq("player_id",i.user.id);a=l||[]}const{data:s}=await p.from("event_moderators").select("player_id").eq("event_id",t),d=s?s.map(l=>l.player_id):[];ua(e,o||[],a,d)}catch{m("Failed to load event details","error")}finally{R()}}async function Et(t,e){if(!i.user){m("You must be logged in to register","error");return}if(!i.user.email){Mn(t,e);return}try{const{error:n}=await p.from("event_registrations").insert({event_id:t,tournament_id:e,player_id:i.user.id,status:"registered"});if(n)throw n;m("Registered!","success"),O(t)}catch{m("Registration failed","error")}}function Mn(t,e){const n=`
        <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:11000;">
            <div style="background:#222; padding:30px; border-radius:8px; border:2px solid var(--sub-gold); max-width:400px; width:100%;">
                <h3 style="color:var(--sub-gold); text-align:center;">Email Required</h3>
                <p style="color:#ccc; text-align:center; margin-bottom:20px;">Required for tournament participation.</p>
                <input type="email" id="email-prompt-input" placeholder="email@example.com" style="width:100%; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px;">
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button onclick="closeEmailPrompt()" style="flex:1; background:#555; border:none; color:#fff; padding:10px; border-radius:4px;">Cancel</button>
                    <button onclick="saveEmailAndRegister('${t}', '${e}')" class="btn-gold" style="flex:1;">Save & Register</button>
                </div>
            </div>
        </div>
    `;let o=document.getElementById("email-prompt-modal");o||(o=document.createElement("div"),o.id="email-prompt-modal",document.body.appendChild(o)),o.innerHTML=n}function It(){const t=document.getElementById("email-prompt-modal");t&&t.remove()}async function Rn(t,e){const n=document.getElementById("email-prompt-input")?.value.trim();if(!n||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)){m("Valid email required","error");return}try{await p.from("players").update({email:n}).eq("id",i.user.id),i.user.email=n,It(),m("Email saved!","success"),setTimeout(()=>Et(t,e),500)}catch{m("Failed to save email","error")}}async function zn(t,e){if(i.user)try{const{error:n}=await p.from("event_registrations").delete().eq("event_id",t).eq("tournament_id",e).eq("player_id",i.user.id);if(n)throw n;m("Cancelled","success"),O(t)}catch{m("Failed to cancel","error")}}async function Pn(t){if(confirm("Are you sure? This will delete the event and all associated tournaments."))try{const{error:e}=await p.from("events").delete().eq("id",t);if(e)throw e;m("Event deleted","success"),kn(),Fe()}catch{m("Delete failed","error")}}async function On(t){try{const{data:e}=await p.from("events").select("*").eq("id",t).single();if(!e)return;xt(e),setTimeout(()=>{document.getElementById("event-name-input")&&(document.getElementById("event-name-input").value=e.event_name),document.getElementById("event-type-select")&&(document.getElementById("event-type-select").value=e.event_type),document.getElementById("event-location-input")&&(document.getElementById("event-location-input").value=e.location||""),document.getElementById("event-desc-input")&&(document.getElementById("event-desc-input").value=e.description||""),document.getElementById("event-start-input")&&(document.getElementById("event-start-input").value=new Date(e.start_datetime).toISOString().slice(0,16)),document.getElementById("event-end-input")&&(document.getElementById("event-end-input").value=e.end_datetime?new Date(e.end_datetime).toISOString().slice(0,16):"");const n=document.querySelector('button[onclick="createNewEvent()"]');n&&(n.setAttribute("onclick",`updateEventForm('${t}')`),n.innerHTML="UPDATE EVENT")},100)}catch{m("Failed to load event for editing","error")}}async function Dn(t){const e={event_name:document.getElementById("event-name-input")?.value.trim(),event_type:document.getElementById("event-type-select")?.value,location:document.getElementById("event-location-input")?.value.trim(),description:document.getElementById("event-desc-input")?.value.trim(),start_datetime:document.getElementById("event-start-input")?.value?new Date(document.getElementById("event-start-input").value).toISOString():null,end_datetime:document.getElementById("event-end-input")?.value?new Date(document.getElementById("event-end-input").value).toISOString():null,primary_color:document.getElementById("event-color-input")?.value};try{const{error:n}=await p.from("events").update(e).eq("id",t);if(n)throw n;m("Event updated!","success"),qe(),Fe()}catch{m("Update failed","error")}}async function Nn(t,e,n){try{const{data:o}=await p.from("tournament_history").select("*").eq("id",t).single(),{data:r}=await p.from("events").select("*, moderators:event_moderators(player_id)").eq("id",e).single(),a=r.moderators?r.moderators.map(s=>s.player_id):[];if(!ht(r,a)){m("Not authorized","error");return}await fa(o,e,n)}catch{m("Failed to load tournament","error")}}async function fa(t,e,n){if(!i.allGames||i.allGames.length===0){const{data:o}=await p.from("games").select("*").order("game_name");i.allGames=o||[]}await wt(e,n),setTimeout(()=>{document.getElementById("tournament-name-input")&&(document.getElementById("tournament-name-input").value=t.tournament_name||""),document.getElementById("tournament-game-select")&&(document.getElementById("tournament-game-select").value=t.game_id),document.getElementById("tournament-start-input")&&t.start_datetime&&(document.getElementById("tournament-start-input").value=new Date(t.start_datetime).toISOString().slice(0,16)),document.getElementById("tournament-end-input")&&t.end_datetime&&(document.getElementById("tournament-end-input").value=new Date(t.end_datetime).toISOString().slice(0,16)),document.getElementById("tournament-max-input")&&(document.getElementById("tournament-max-input").value=t.max_participants||8);const o=document.querySelector('#tournament-form-modal button[onclick*="createTournament"]');o&&(o.setAttribute("onclick",`saveTournamentEdit('${t.id}', '${e}')`),o.innerHTML='<i class="fa fa-save"></i> SAVE CHANGES')},100)}async function qn(t,e){const n={tournament_name:document.getElementById("tournament-name-input")?.value.trim(),game_id:document.getElementById("tournament-game-select")?.value,start_datetime:new Date(document.getElementById("tournament-start-input").value).toISOString(),end_datetime:document.getElementById("tournament-end-input")?.value?new Date(document.getElementById("tournament-end-input").value).toISOString():null,max_participants:parseInt(document.getElementById("tournament-max-input")?.value)||8};try{const{error:o}=await p.from("tournament_history").update(n).eq("id",t);if(o)throw o;m("Tournament updated!","success"),Ge(),O(e)}catch(o){m("Failed to update: "+o.message,"error")}}async function Gn(t,e){if(confirm("Are you sure?"))try{const{error:n}=await p.from("tournament_history").delete().eq("id",t);if(n)throw n;m("Tournament deleted","success"),O(e)}catch{m("Delete failed","error")}}async function ga(t,e){try{const{data:n}=await p.from("tournament_history").select("*").eq("id",t).single(),o={...n};delete o.id,o.tournament_name=`${n.tournament_name} (Copy)`,o.status="scheduled",o.created_at=new Date().toISOString();const{error:r}=await p.from("tournament_history").insert(o);if(r)throw r;m("Duplicated!","success"),O(e)}catch{m("Failed to duplicate","error")}}function Fn(t,e,n){const o=`${window.location.origin}${window.location.pathname}?page=events&event_id=${t}`,r=`
        <div style="text-align:center;">
            <p style="color:#ccc; margin-bottom:20px;">Scan to register for <strong>${n}</strong></p>
            <div style="background:#fff; padding:15px; display:inline-block; border-radius:8px; margin-bottom:20px;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(o)}" style="width:200px; height:200px; display:block;">
            </div>
            <button class="btn-red" onclick="navigator.clipboard.writeText('${o}').then(() => showNotification('Link copied!', 'success'))">COPY LINK</button>
        </div>
    `;B("SHARE",r,{maxWidth:"400px"})}window.loadEventsPage=Fe;window.viewEventDetails=O;window.deleteEvent=Pn;window.registerForTournament=Et;window.unregisterFromTournament=zn;window.editTournament=Nn;window.deleteTournament=Gn;window.duplicateTournament=ga;window.saveTournamentEdit=qn;window.shareTournamentLink=Fn;window.editEvent=On;window.updateEventForm=Dn;window.showEmailPrompt=Mn;window.closeEmailPrompt=It;window.saveEmailAndRegister=Rn;let pe=null;async function Ue(t,e,n){pe=t;try{const{data:o}=await p.from("event_registrations").select("id, player:players(username, country, avatar_url)").eq("tournament_id",e).eq("status","registered");let r=`
            <div style="padding:15px; background:#111; border-radius:8px; margin-bottom:20px;">
                <h4 style="color:var(--sub-gold); margin-bottom:15px;">ADD PLAYER</h4>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="participant-search-${e}" placeholder="Search or type name..." 
                        style="width:100%; padding:10px; background:#222; border:1px solid #333; color:#fff;"
                        data-tour-id="${e}">
                    <button data-action="add-participant" data-tour-id="${e}" class="btn-red" style="width: auto; padding: 0 15px;">ADD</button>
                </div>
                <div id="search-dropdown-${e}" style="display:none; background:#0a0a0a; border:1px solid #333; max-height:200px; overflow-y:auto; margin-top:5px;"></div>
            </div>
            <div id="participants-list">
                ${(o||[]).map(a=>`
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #222;">
                        <span>${a.player?.username||"Guest"}</span>
                        <button data-action="remove-participant" data-reg-id="${a.id}" data-tour-id="${e}" style="background:none; border:none; color:var(--sub-red); cursor:pointer;"><i class="fa fa-trash"></i></button>
                    </div>
                `).join("")}
            </div>
            <button data-action="close-participants-modal" class="btn-red" style="width:100%; margin-top:20px;">DONE</button>
        `;B("PARTICIPANTS",r,{id:"participants-modal",maxWidth:"400px"})}catch{m("Failed to load participants","error")}}async function ya(t){const e=document.getElementById(`participant-search-${t}`),n=document.getElementById(`search-dropdown-${t}`);if(!e||!n)return;const o=e.value.trim();if(o.length<1){n.style.display="none";return}const{data:r}=await p.from("players").select("username").ilike("username",`%${o}%`).limit(5);let a=(r||[]).map(s=>`<div style="padding:8px; cursor:pointer;" data-action="select-participant" data-tour-id="${t}" data-name="${s.username}">${s.username}</div>`).join("");a+=`<div style="padding:8px; color:var(--sub-gold); cursor:pointer;" data-action="select-participant" data-tour-id="${t}" data-name="${o}">+ Add "${o}"</div>`,n.innerHTML=a,n.style.display="block"}function ba(t,e){const n=document.getElementById(`participant-search-${t}`);n&&(n.value=e),Un(t)}async function Un(t){const e=document.getElementById(`participant-search-${t}`),n=e?.value.trim();if(n)try{let{data:o}=await p.from("players").select("id").ilike("username",n).single(),r=o?.id;if(!r){const{data:s,error:d}=await p.rpc("create_guest_player",{p_username:n});if(d)throw d;r=s}const{error:a}=await p.rpc("add_tournament_participant",{p_tournament_id:t,p_player_id:r});if(a)throw a;m("Added!","success"),e.value="",Ue(pe,t,"")}catch{m("Failed to add participant","error")}}async function va(t,e){if(confirm("Remove participant?"))try{await p.from("event_registrations").delete().eq("id",t),Ue(pe,e,"")}catch{m("Failed to remove","error")}}function ha(){P("participants-modal"),pe&&O(pe)}async function Hn(t,e){const n=document.getElementById("mod-search-results");if(!n||t.length<1){n&&(n.innerHTML="");return}try{const{data:o}=await p.from("players").select("id, username").ilike("username",`%${t}%`).limit(5);n.innerHTML=(o||[]).map(r=>`
            <div style="padding:8px; border-bottom:1px solid #222; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#fff; font-size:0.85rem;">${r.username}</span>
                <button data-action="add-moderator" data-event-id="${e}" data-player-id="${r.id}" data-username="${r.username}"
                    style="background:var(--sub-red); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">ADD</button>
            </div>`).join("")||'<div style="padding:8px; color:#666; font-size:0.85rem;">No players found</div>'}catch(o){console.error("Search failed:",o)}}async function jn(t,e,n){try{const{error:o}=await p.from("event_moderators").insert({event_id:t,player_id:e});if(o)if(o.code==="23505")m("Already a moderator","warning");else throw o;else m(`${n} added as moderator`,"success"),O(t)}catch{m("Failed to add moderator","error")}}async function Vn(t,e){try{const{error:n}=await p.from("event_moderators").delete().eq("event_id",t).eq("player_id",e);if(n)throw n;m("Moderator removed","success"),O(t)}catch{m("Failed to remove moderator","error")}}window.searchModerators=Hn;window.addModerator=jn;window.removeModerator=Vn;let Q=null,it=null,Ae=null,st=null;async function kt(t,e,n){try{it=t,Ae=e,st=n;const{data:o}=await p.from("tournament_history").select("*").eq("id",t).single();if(o?.status==="completed"){const l=[o.winner_name,o.second_place_name,o.third_place_name].filter(u=>u),{data:c}=l.length>0?await p.from("players").select("username, elo, country, avatar_url").in("username",l):{data:[]};wa(o,c||[]);return}o?.status==="scheduled"&&await p.from("tournament_history").update({status:"ongoing"}).eq("id",t);const{data:r}=await p.from("event_registrations").select("player_id, players:player_id(username)").eq("tournament_id",t).eq("status","registered");if(!r||r.length<2){m("At least 2 players required","error");return}const a=r.map(l=>l.players.username),{data:s}=await p.from("matches").select("*").eq("tournament_id",t);xa(),Q=new gn({containerId:"event-bracket-container",enableSaveButton:!1,onMatchUpdate:async(l,c)=>{await ve.recordMatch({player1Name:l.p1,player2Name:l.p2,winnerName:c,tournamentId:it,tournamentName:Ae}),m(`${c} wins!`,"success"),Gt()}});const d=s&&s.length>0;Q.generateBracket(a,!d),d&&Q.restoreState(s),Gt()}catch{m("Failed to load bracket","error")}}function xa(){B(Ae,`
        <div id="event-bracket-container" style="width:100%; display:flex; flex-direction:column; align-items:center;"></div>
        <div style="text-align:center; margin-top:20px; padding-top:20px; border-top:1px solid #333;">
            <div id="event-bracket-controls"></div>
        </div>
    `,{id:"bracket-modal",maxWidth:"600px"})}function Gt(){const t=document.getElementById("event-bracket-controls");if(!t||!Q)return;const e=Q.getTournamentResults();e&&e.winner?t.innerHTML='<button onclick="finishEventTournament()" class="btn-red" style="padding:15px 40px;"><i class="fa fa-trophy"></i> FINISH TOURNAMENT</button>':t.innerHTML='<small style="color:#666;">Select winners to proceed</small>'}async function Tt(){if(Q)try{const t=Q.getTournamentResults();if(!t)return;const{error:e}=await p.from("tournament_history").update({winner_name:t.winner,second_place_name:t.second,third_place_name:t.third,status:"completed",end_datetime:new Date().toISOString()}).eq("id",it);if(e)throw e;m("Tournament completed!","success"),He(),st&&O(st)}catch{m("Failed to finish","error")}}function He(){P("bracket-modal"),Q=null}function wa(t,e){const n=d=>e.find(l=>l.username===d)||{username:d,elo:"-"},o=n(t.winner_name),r=n(t.second_place_name),a=n(t.third_place_name),s=`
        <div style="text-align:center; padding:20px;">
            <h3 style="color:var(--sub-gold); margin-bottom:30px;">🏆 TOURNAMENT COMPLETED</h3>
            <div style="display:flex; justify-content:center; align-items:flex-end; gap:20px;">
                <div style="text-align:center;">🥈<br>${r.username}<br><span style="color:#666;">${r.elo}</span></div>
                <div style="text-align:center; font-size:1.2rem;">🏆<br><strong>${o.username}</strong><br><span style="color:var(--sub-gold);">${o.elo}</span></div>
                <div style="text-align:center;">🥉<br>${a.username}<br><span style="color:#666;">${a.elo}</span></div>
            </div>
            <button onclick="closeBracketModal()" class="btn-red" style="margin-top:40px;">CLOSE</button>
        </div>
    `;B(Ae,s,{id:"bracket-modal",maxWidth:"500px"})}window.viewTournamentBracket=kt;window.finishEventTournament=Tt;window.closeBracketModal=He;function Ea(){document.addEventListener("click",t=>{const e=t.target.closest('[data-action="view-bracket"]');if(e){const{id:a,eventId:s,name:d}=e.dataset;kt(a,d,s);return}const n=t.target.closest('[data-action="view-participants"]');if(n){const{eventId:a,tourId:s,name:d}=n.dataset;Ue(a,s);return}const o=t.target.dataset.action;o==="finish-event-tournament"&&Tt(),o==="close-bracket-modal"&&He();const r=t.target.closest("[data-action]");if(r){const a=r.dataset.action,s=r.dataset.id,d=r.dataset.eventId,l=r.dataset.tourId,c=r.dataset.name,u=r.dataset.eventName;if(a==="show-create-event-form"){xt();return}if(a==="hide-create-event-form"){qe();return}if(a==="view-event-details"){O(s);return}if(a==="edit-tournament"){Nn(s,d,u);return}if(a==="delete-tournament"){Gn(s,d);return}if(a==="unregister-tournament"){zn(d,l);return}if(a==="register-tournament"){Et(d,l);return}if(a==="show-create-tournament-form"){wt(d,u);return}if(a==="edit-event"){On(s);return}if(a==="delete-event"){Pn(s);return}if(a==="open-public-display"){window.open(`?live=${s}`,"_blank");return}if(a==="share-live-link"){fn(s);return}if(a==="close-event-modal"){kn();return}if(a==="close-participants-modal"){ha();return}if(a==="add-participant"){Un(l);return}if(a==="remove-participant"){va(r.dataset.regId,l);return}if(a==="select-participant"){ba(l,c);return}if(a==="share-tournament"){Fn(d,l,c);return}if(a==="create-tournament"){Cn(d);return}if(a==="close-tournament-form"){Ge();return}if(a==="save-tournament-edit"){qn(s,d);return}if(a==="clear-event-image"){Sn();return}if(a==="clear-brand-logo"){_n();return}if(a==="create-event"){Ln();return}if(a==="update-event-form"){Dn(s);return}if(a==="close-email-prompt"){It();return}if(a==="save-email-register"){Rn(d,l);return}if(a==="reload-page"){location.reload();return}if(a==="select-all"){t.target.select();return}if(a==="copy-live-link"){navigator.clipboard.writeText(r.dataset.url).then(()=>{m("Copied!","success"),r.closest('div[style*="position:fixed"]').remove()});return}if(a==="close-share-modal"){r.closest('div[style*="position:fixed"]').remove();return}if(a==="toggle-moderator-search"){const f=document.getElementById("moderator-search-container");f&&(f.style.display=f.style.display==="none"?"block":"none");return}if(a==="add-moderator"){jn(d,r.dataset.playerId,r.dataset.username);return}if(a==="remove-moderator"){Vn(d,r.dataset.playerId);return}}}),document.addEventListener("input",t=>{if(t.target.id&&t.target.id.startsWith("participant-search-")){const e=t.target.id.replace("participant-search-","");ya(e)}if(t.target.id==="mod-search-input"){const e=t.target.closest("[data-event-id]")?.dataset.eventId;e&&Hn(t.target.value,e)}}),document.addEventListener("change",t=>{t.target.id==="brand-logo-input"&&Bn(t.target),t.target.id==="event-image-input"&&Tn(t.target)})}let N=null,j=null;async function Ia(){if(!i.user||i.user.id==="guest"||i.user.id==="spectator"){typeof window.showAuthPage=="function"?window.showAuthPage("login"):alert("You need to be logged in to host a tournament.");return}try{const{data:t,error:e}=await p.from("qr_lobbies").insert([{host_id:i.user.id}]).select().single();if(e)throw e;N=t.id;const n=document.getElementById("smart-host-modal"),o=document.getElementById("smart-host-qr-img"),r=document.getElementById("smart-host-count");n&&(n.style.display="flex"),r.textContent="0";const a=`${window.location.origin}/?join=${N}`;o.src=`https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=ffffff&bgcolor=0a0a0a&data=${encodeURIComponent(a)}`,j&&p.removeChannel(j),j=p.channel(`lobby-${N}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"qr_lobby_participants",filter:`lobby_id=eq.${N}`},s=>{ka(s.new)}).subscribe()}catch(t){console.error("Error creating lobby:",t),alert("Failed to create tournament lobby. Check console.")}}function ka(t){const e=document.getElementById("smart-host-count");let n=parseInt(e.textContent||"0");n++,e.textContent=n.toString(),$e(t.guest_name),e.style.transform="scale(1.5)",setTimeout(()=>{e.style.transform="scale(1)"},200)}async function Ta(){const t=document.getElementById("smart-host-modal");t&&(t.style.display="none"),N&&(await p.from("qr_lobbies").update({status:"cancelled"}).eq("id",N),j&&(p.removeChannel(j),j=null),N=null)}async function Sa(){const t=document.getElementById("smart-host-modal");t&&(t.style.display="none"),N&&(await p.from("qr_lobbies").update({status:"started"}).eq("id",N),j&&(p.removeChannel(j),j=null),N=null)}async function Ba(){const e=new URLSearchParams(window.location.search).get("join");e&&(document.body.innerHTML=`
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0a0a0a; color:#fff; font-family:'Resolve', sans-serif;">
            <i class="fa-solid fa-trophy" style="font-size:4rem; color:var(--sub-gold); margin-bottom:20px;"></i>
            <h1 style="font-family:'Russo One', sans-serif; text-transform:uppercase; margin-bottom:20px;">Join Tournament</h1>
            <input type="text" id="join-guest-name" placeholder="Enter your player name..." style="padding:15px; font-size:1.2rem; border-radius:8px; border:none; margin-bottom:20px; text-align:center; width:80%; max-width:300px; background:#222; color:#fff;">
            <button id="btn-confirm-join" style="padding:15px 40px; font-size:1.2rem; background:linear-gradient(135deg, var(--sub-red), #aa0000); color:white; border:none; border-radius:8px; font-family:'Russo One', sans-serif; cursor:pointer;">JOIN NOW</button>
            <div id="join-status" style="margin-top:20px; color:#888;"></div>
        </div>
    `,document.getElementById("btn-confirm-join").addEventListener("click",async()=>{const n=document.getElementById("join-guest-name").value.trim(),o=document.getElementById("join-status");if(!n){o.textContent="Please enter a name.";return}o.textContent="Joining...";const{error:r}=await p.from("qr_lobby_participants").insert([{lobby_id:e,guest_name:n}]);r?(o.textContent="Error: Could not join lobby. Maybe it started already?",console.error(r)):document.body.innerHTML=`
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0a0a0a; color:#fff; font-family:'Resolve', sans-serif;">
                    <i class="fa-solid fa-check-circle" style="font-size:5rem; color:#4CAF50; margin-bottom:20px;"></i>
                    <h1 style="font-family:'Russo One', sans-serif; text-transform:uppercase;">YOU'RE IN!</h1>
                    <p style="color:#aaa; margin-top:10px; font-size:1.1rem;">Look at the main screen.</p>
                </div>
            `}))}let lt="Local Tournament";function dt(){if(i.pool.length<2){m("Add at least 2 players!","error");return}const t=document.getElementById("local-tournament-name");lt=t&&t.value.trim()?t.value.trim():`Tournament ${new Date().toLocaleDateString()}`,window.bracketEngine?window.bracketEngine.generateBracket(i.pool):(console.error("BracketEngine not loaded"),m("System error: Bracket Engine missing","error"))}function _a(){console.log("Advance round requested")}async function La(){const t=window.bracketEngine;if(!t)return;const e=t.getTournamentResults();if(!e){m("Tournament not finished yet","error");return}M("Saving tournament results...");try{let n=null,o=i.user?i.user.id:null;if((o==="guest"||o==="spectator")&&(o=null),o!==null){const{data:d,error:l}=await p.from("tournament_history").insert({tournament_name:lt,organizer_id:o,status:"completed",winner_name:e.winner,second_place_name:e.second,third_place_name:e.third,start_datetime:new Date().toISOString(),end_datetime:new Date().toISOString(),max_participants:t.participants.length,tournament_type:"elimination"}).select().single();!l&&d?n=d.id:console.error("Failed to save tournament history:",l)}const r=t.getAllMatches();let a=0,s=0;for(const d of r){const l=await ve.recordMatch({player1Name:d.p1,player2Name:d.p2,winnerName:d.winner,tournamentName:lt,tournamentId:n});d.winner===e.winner&&!d.isBronze&&(a=l.gain,s=l.newElo)}on(e.winner,s,a)}catch(n){console.error(n),m("Error saving tournament","error")}finally{R()}}function Ca(t,e){if(t&&t.length>0){i.pool=t;const n=document.getElementById("local-tournament-name");n&&e&&(n.value=e),dt()}}const $a="modulepreload",Aa=function(t){return"/"+t},Ft={},Ma=function(e,n,o){let r=Promise.resolve();if(n&&n.length>0){let c=function(u){return Promise.all(u.map(f=>Promise.resolve(f).then(g=>({status:"fulfilled",value:g}),g=>({status:"rejected",reason:g}))))};var s=c;document.getElementsByTagName("link");const d=document.querySelector("meta[property=csp-nonce]"),l=d?.nonce||d?.getAttribute("nonce");r=c(n.map(u=>{if(u=Aa(u),u in Ft)return;Ft[u]=!0;const f=u.endsWith(".css"),g=f?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${u}"]${g}`))return;const y=document.createElement("link");if(y.rel=f?"stylesheet":$a,f||(y.as="script"),y.crossOrigin="",y.href=u,l&&y.setAttribute("nonce",l),document.head.appendChild(y),f)return new Promise((v,b)=>{y.addEventListener("load",v),y.addEventListener("error",()=>b(new Error(`Unable to preload CSS for ${u}`)))})}))}function a(d){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=d,window.dispatchEvent(l),!l.defaultPrevented)throw d}return r.then(d=>{for(const l of d||[])l.status==="rejected"&&a(l.reason);return e().catch(a)})};function ct(){return JSON.parse(localStorage.getItem("subsoccer-saved-partners")||"[]")}function Wn(t){localStorage.setItem("subsoccer-saved-partners",JSON.stringify(t))}function ut(){const t=document.getElementById("partners-list");if(!t)return;const e=ct();if(e.length===0){t.innerHTML='<div style="font-size:0.75rem; color:#444; text-align:center; padding:10px;">No saved partners</div>';return}t.innerHTML=e.map((n,o)=>`
        <div class="sub-item-row" style="padding:8px 12px; background:#0a0a0a; border:1px solid #222; display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <div style="display:flex; align-items:center; gap:10px; flex:1; cursor:pointer;" data-copy-index="${o}">
                <div style="width:12px; height:12px; border-radius:50%; background:${n.color}; border:1px solid #fff;"></div>
                <div style="font-size:0.85rem; color:#fff; font-family:'Resolve';">${n.brand.toUpperCase()} <i class="fa fa-link" style="font-size:0.6rem; margin-left:5px; opacity:0.5;"></i></div>
            </div>
            <div style="display:flex; gap:12px;">
                <button data-edit-index="${o}" style="background:none; border:none; color:var(--sub-gold); cursor:pointer; font-size:0.9rem;"><i class="fa fa-edit"></i></button>
                <button data-delete-index="${o}" style="background:none; border:none; color:var(--sub-red); cursor:pointer; font-size:0.9rem;"><i class="fa fa-trash"></i></button>
            </div>
        </div>
    `).join(""),t.querySelectorAll("[data-copy-index]").forEach(n=>{n.onclick=()=>{const o=e[n.dataset.copyIndex],r=window.location.origin+window.location.pathname,a=new URLSearchParams;a.append("brand",o.brand),o.color&&a.append("color",o.color.replace("#","")),o.logo&&a.append("logo",o.logo);const s=`${r}?${a.toString()}`;navigator.clipboard.writeText(s).then(()=>m("Link copied!","success"))}}),t.querySelectorAll("[data-edit-index]").forEach(n=>{n.onclick=()=>{const o=e[n.dataset.editIndex];document.getElementById("gen-brand-id").value=o.brand,document.getElementById("gen-brand-color").value=o.color,document.getElementById("gen-brand-color-text").value=o.color,document.getElementById("gen-brand-logo").value=o.logo||"",document.getElementById("gen-partner-index").value=n.dataset.editIndex,document.getElementById("form-title").innerText="EDIT PARTNER: "+o.brand.toUpperCase(),document.getElementById("btn-save-partner-action").innerText="UPDATE CONFIG"}}),t.querySelectorAll("[data-delete-index]").forEach(n=>{n.onclick=()=>{if(!confirm("Delete this partner config?"))return;const o=ct();o.splice(n.dataset.deleteIndex,1),Wn(o),ut(),m("Partner deleted","error")}})}function Ra(){B("PARTNER MANAGER",`
        <div style="display:flex; flex-direction:column; gap:20px;">
            <div id="partner-form-area" style="background:#111; padding:15px; border-radius:8px; border:1px solid #333;">
                <h4 id="form-title" style="margin:0 0 15px 0; font-size:0.7rem; color:var(--sub-gold); font-family:'Resolve'; letter-spacing:1px;">CREATE NEW PARTNER</h4>
                <input type="hidden" id="gen-partner-index" value="-1">
                
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block; font-size:0.6rem; color:#666; margin-bottom:4px; font-family:'Resolve';">BRAND ID</label>
                        <input type="text" id="gen-brand-id" placeholder="partner-name" style="margin-bottom:0; background:#000; border:1px solid #222;">
                    </div>
                    
                    <div>
                        <label style="display:block; font-size:0.6rem; color:#666; margin-bottom:4px; font-family:'Resolve';">THEME COLOR</label>
                        <div style="display:flex; gap:8px;">
                            <input type="color" id="gen-brand-color" value="#F40009" style="width:40px; height:38px; padding:0; border:1px solid #222; background:none; cursor:pointer;">
                            <input type="text" id="gen-brand-color-text" value="#F40009" style="flex:1; margin-bottom:0; background:#000; border:1px solid #222; font-family:monospace; font-size:0.8rem;">
                        </div>
                    </div>
                    
                    <div>
                        <label style="display:block; font-size:0.6rem; color:#666; margin-bottom:4px; font-family:'Resolve';">LOGO URL</label>
                        <input type="text" id="gen-brand-logo" placeholder="https://..." style="margin-bottom:0; background:#000; border:1px solid #222;">
                    </div>
                    
                    <div style="display:flex; gap:10px; margin-top:5px;">
                        <button class="btn-red" id="btn-save-partner-action" style="flex:2; background:var(--sub-gold); color:#000; font-size:0.8rem; font-weight:bold;">
                            SAVE CONFIG
                        </button>
                        <button class="btn-red" id="btn-reset-form" style="flex:1; background:#222; color:#888; font-size:0.8rem; border:1px solid #333;">
                            RESET
                        </button>
                        <button class="btn-red" id="btn-clear-all-branding" style="flex:1; background:#c62828; color:#fff; font-size:0.8rem;">CLEAR APP BRANDING</button>
                    </div>
                </div>
            </div>

            <div id="saved-partners-area">
                <h4 style="margin:0 0 10px 0; font-size:0.65rem; color:#666; font-family:'Resolve'; letter-spacing:1px;">SAVED PARTNERS (CLICK TO COPY LINK)</h4>
                <div id="partners-list" style="display:flex; flex-direction:column; gap:2px; max-height:180px; overflow-y:auto;">
                </div>
            </div>
        </div>
    `,{maxWidth:"420px"});const e=document.getElementById("gen-brand-color"),n=document.getElementById("gen-brand-color-text");e.oninput=r=>n.value=r.target.value.toUpperCase(),n.oninput=r=>e.value=r.target.value;const o=()=>{document.getElementById("gen-brand-id").value="",document.getElementById("gen-brand-color").value="#F40009",document.getElementById("gen-brand-color-text").value="#F40009",document.getElementById("gen-brand-logo").value="",document.getElementById("gen-partner-index").value="-1",document.getElementById("form-title").innerText="CREATE NEW PARTNER",document.getElementById("btn-save-partner-action").innerText="SAVE CONFIG"};document.getElementById("btn-reset-form").onclick=o,document.getElementById("btn-clear-all-branding").onclick=()=>{confirm("Reset app to original Subsoccer branding?")&&(window.location.href=window.location.origin+window.location.pathname+"?brand=none")},document.getElementById("btn-save-partner-action").onclick=()=>{const r=document.getElementById("gen-brand-id").value.trim(),a=n.value.trim();let s=document.getElementById("gen-brand-logo").value.trim();const d=parseInt(document.getElementById("gen-partner-index").value);if(s.includes("brand=")&&s.includes("logo="))try{const f=new URLSearchParams(s.split("?")[1]).get("logo");f&&(s=f)}catch(u){console.error("Logo URL parsing failed",u)}if(!r)return m("Brand ID required","error");const l=ct(),c={brand:r,color:a,logo:s};d>=0?(l[d]=c,m("Partner updated","success")):(l.push(c),m("Partner saved","success")),Wn(l),o(),ut()},ut()}async function Yn(){M("Fetching users...");try{const{data:t,error:e}=await p.from("players").select("id, username, elo, wins, losses, country, created_at, is_admin, email").order("username");if(e)throw e;const o=`
            <div style="max-height: 400px; overflow-y: auto; padding-right: 5px;">
                ${t.filter(r=>r.email).map(r=>`
                    <div style="background:#111; padding:12px; border-radius:4px; margin-bottom:8px; border-left:3px solid ${r.is_admin?"var(--sub-gold)":"#333"}; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-family:'Resolve'; color:#fff; font-size:0.9rem;">
                                ${r.is_admin?"⭐ ":""}${r.username}
                            </div>
                            <div style="font-size:0.7rem; color:#666;">${r.country?.toUpperCase()||"FI"} • Joined ${new Date(r.created_at).toLocaleDateString()}</div>
                            <div style="font-size:0.6rem; color:#444;">${r.email}</div>
                        </div>
                        <div style="text-align:right; display:flex; flex-direction:column; gap:5px;">
                            <div style="color:var(--sub-gold); font-family:'Resolve'; font-size:1rem;">${r.elo}</div>
                            <button class="btn-red" 
                                    style="font-size:0.6rem; padding:4px 8px; background:${r.is_admin?"#c62828":"var(--sub-gold)"}; color:${r.is_admin?"#fff":"#000"}; border:none; width:auto; min-width:80px;"
                                    onclick="toggleAdminStatus('${r.id}', ${r.is_admin})">
                                ${r.is_admin?"REVOKE ADMIN":"MAKE ADMIN"}
                            </button>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;B("REGISTERED USERS",o,{maxWidth:"450px"})}catch(t){m("Failed to fetch users: "+t.message,"error")}finally{R()}}async function za(t){Ma(()=>Promise.resolve().then(()=>Zo),void 0).then(e=>{window.closeModal&&window.closeModal("generic-modal"),e.viewPlayerCard(t),setTimeout(()=>{if(document.body.classList.add("print-mode-active"),!document.getElementById("admin-print-style")){const n=document.createElement("style");n.id="admin-print-style",n.innerHTML=`
                    body.print-mode-active .modal-overlay:not(#card-modal) { display: none !important; }
                    body.print-mode-active #card-modal { background: #fff !important; z-index: 999999 !important; display: flex !important; align-items: center; justify-content: center; }
                    body.print-mode-active #card-modal .modal-content { width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important; border-radius: 0 !important; margin: 0 !important; background: #fff !important; border: none !important; box-shadow: none !important; padding: 0 !important; display: flex !important; flex-direction: column; justify-content: center; align-items: center; }
                    body.print-mode-active #card-modal .modal-header, body.print-mode-active #card-modal .btn-close, body.print-mode-active #card-modal button { display: none !important; }
                    body.print-mode-active #card-modal .modal-body { flex: none; overflow: visible; display: flex; justify-content: center; height: 100%; align-items: center; width: 100%; }
                    body.print-mode-active .pro-card { width: 354px !important; height: 474px !important; max-width: none !important; margin: 0 !important; zoom: 2.5; position: static !important; transform: none !important; }
                    body.print-mode-active .card-front { background: radial-gradient(circle, rgba(0,0,0,0.15) 1.5px, transparent 1.5px) 0 0, #00FFCC !important; background-size: 8px 8px !important; border: 1px solid #00ccaa !important; }
                    body.print-mode-active .card-bleed-edge { inset: 12px !important; border: none !important; }
                    body.print-mode-active .card-safe-zone { inset: 28px !important; box-shadow: none !important; border: 1px solid #999 !important; border-top: 2px solid #fff !important; border-bottom: 2px solid #555 !important; }
                    body.print-mode-active .pro-stamp { top: 24px !important; left: 24px !important; }
                `,document.head.appendChild(n)}},800)})}window.openAdminPrintMode=za;async function Pa(t,e){if(t===i.user?.id){m("You cannot change your own admin status","error");return}if(e&&!Wt()){m("Vain pääkäyttäjä voi poistaa ylläpito-oikeuksia muilta admineilta","error");return}if(confirm(`Are you sure you want to ${e?"revoke":"grant"} admin rights for this user?`)){M("Updating permissions...");try{const{error:o}=await p.from("players").update({is_admin:!e}).eq("id",t);if(o)throw o;m(`Admin rights ${e?"revoked":"granted"}!`,"success"),Yn()}catch(o){m("Failed to update admin status: "+o.message,"error")}finally{R()}}}window.toggleAdminStatus=Pa;async function Oa(){if(!ye()){m("Access denied: Admin privileges required.","error");return}M("Generating CSV logs...");try{const{data:t,error:e}=await p.from("matches").select("*").order("created_at",{ascending:!1});if(e)throw e;if(!t||t.length===0){m("No match logs found","info");return}const o=[["ID","Date","Player 1","Player 2","Winner","P1 Score","P2 Score","Tournament"].join(",")];t.forEach(d=>{const l=[d.id,d.created_at,d.player1,d.player2,d.winner,d.player1_score,d.player2_score,d.tournament_name];o.push(l.map(c=>`"${c||""}"`).join(","))});const r=new Blob([o.join(`
`)],{type:"text/csv"}),a=window.URL.createObjectURL(r),s=document.createElement("a");s.setAttribute("hidden",""),s.setAttribute("href",a),s.setAttribute("download",`subsoccer_match_logs_${new Date().toISOString().split("T")[0]}.csv`),document.body.appendChild(s),s.click(),document.body.removeChild(s),m("Logs downloaded successfully!","success")}catch(t){m("Download failed: "+t.message,"error")}finally{R()}}async function Da(){if(!ye()){m("Access denied: Admin privileges required.","error");return}if(confirm("⚠️ WARNING: This will reset ALL players to 1300 ELO. This action cannot be undone. Proceed?")){M("Resetting ELOs...");try{const{error:e}=await p.from("players").update({elo:1300,wins:0,losses:0}).neq("username","SYSTEM_RESERVED_NAME");if(e)throw e;m("Leaderboard reset successfully","success")}catch(e){m("Reset failed: "+e.message,"error")}finally{R()}}}function Na(){document.getElementById("btn-mod-partner-gen")?.addEventListener("click",()=>{Ra()}),document.getElementById("btn-mod-view-users")?.addEventListener("click",()=>{Yn()}),document.getElementById("btn-mod-download-logs")?.addEventListener("click",()=>{Oa()}),document.getElementById("btn-mod-reset-lb")?.addEventListener("click",()=>{Da()})}async function qa(){const t=document.getElementById("analytics-arcade-list"),e=document.getElementById("analytics-tour-list");if(!(!t||!e)){t.innerHTML="Loading...",e.innerHTML="Loading...";try{const{data:n}=await p.from("tournament_history").select("*, events(event_name)").order("created_at",{ascending:!1}).limit(20),{data:o}=await p.from("matches").select("*").order("created_at",{ascending:!1}).limit(50),r=o?o.filter(a=>!a.tournament_id):[];r.length>0?t.innerHTML=r.map(a=>{const s=new Date(a.created_at),d=`${s.getDate()}.${s.getMonth()+1}. ${s.getHours()}:${s.getMinutes().toString().padStart(2,"0")}`,l=a.tournament_name||"Verified Session",c=a.player1_score!==null&&a.player2_score!==null?`${a.player1_score} - ${a.player2_score}`:"WIN";return`
                <div style="background:#111; padding:15px; border-radius:5px; margin-top:5px; font-size:0.9rem; border-left:3px solid var(--sub-red); position:relative;">
                    <div style="color:var(--sub-gold); font-size:0.7rem; margin-bottom:5px; font-weight:bold; letter-spacing: 1px;">[${l}]</div>
                    <span style="font-family:'Resolve'; color:#fff; text-transform:uppercase;">${a.winner}</span> 
                    <span style="color:#888;">defeated</span> 
                    <span style="font-family:'Resolve'; color:#fff; text-transform:uppercase;">${a.winner===a.player1?a.player2:a.player1}</span> 
                    <span style="color:var(--sub-gold); font-weight:bold;">(${c})</span>
                    <div style="position: absolute; top: 15px; right: 15px; font-size: 0.7rem; color: #666;">${d}</div>
                </div>`}).join(""):t.innerHTML="<div style='color:#666;'>No recent free play or arcade sessions found.</div>",n&&n.length>0?e.innerHTML=n.map(a=>{const s=a.events?.event_name||a.event_name||"",d=new Date(a.created_at),l=`${d.getDate()}.${d.getMonth()+1}. ${d.getHours()}:${d.getMinutes().toString().padStart(2,"0")}`;let c=`
                <div style="background:#111; padding:15px; border-radius:5px; margin-top:10px; font-size:0.9rem; border-left:3px solid var(--sub-gold); position:relative;">
                    <div style="color:var(--sub-gold); font-size:0.7rem; margin-bottom:5px; font-weight:bold; letter-spacing: 1px;">[${a.tournament_name}] ${s?" - "+s:""}</div>
                    <div style="position: absolute; top: 15px; right: 15px; font-size: 0.7rem; color: #666;">${l}</div>`;return a.winner_name&&(c+=`<div style="margin-top:5px; font-family:'Resolve';">🏆 ${a.winner_name}</div>`),a.second_place_name&&(c+=`<div style="color:#aaa; font-size:0.8rem; margin-top:2px;">🥈 ${a.second_place_name}</div>`),a.third_place_name&&(c+=`<div style="color:#aa7f32; font-size:0.8rem; margin-top:2px;">🥉 ${a.third_place_name}</div>`),c+="</div>",c}).join(""):e.innerHTML="<div style='color:#666;'>No official tournaments found.</div>"}catch(n){console.error("Failed to load analytics:",n),t.innerHTML="Error loading analytics",e.innerHTML="Error loading analytics"}}}let ke=null,Kn=0;const Te=["profile","tournament","events","map","leaderboard","moderator"];let Z=1;function Ga(t,e,n){const o=document.getElementById("victory-overlay");if(!o)return;const r=document.getElementById("victory-player-name"),a=document.getElementById("victory-elo-count"),s=document.getElementById("victory-elo-gain");if(r&&(r.innerText=t||"Winner"),a&&(a.innerText=e||""),s){const d=parseInt(n);if(!isNaN(d)){const l=d>=0?"+":"";s.innerText=`${l}${d} POINTS`}}o.style.display="flex"}function _(t){i.currentPage===t&&Jn(t),i.currentPage=t}function Qn(t="landing"){const e=document.getElementById("auth-page"),n=document.getElementById("app-content"),o=document.getElementById("nav-tabs"),r=document.getElementById("menu-toggle-btn");if(t==="app"){e&&(e.style.display="none"),n&&(n.style.display="flex"),o&&(o.style.display="flex");const c=document.querySelector("header");c&&(c.style.display="flex");return}e&&(e.style.display="block"),n&&(n.style.display="none"),o&&(o.style.display="none"),r&&(r.style.display="none");const a=document.querySelector("header");a&&(a.style.display="none");const s=document.getElementById("landing-hero"),d=document.getElementById("login-form"),l=document.getElementById("signup-form");t==="landing"?(s&&(s.style.display="flex"),d&&(d.style.display="none"),l&&(l.style.display="none")):t==="signup"?(s&&(s.style.display="none"),d&&(d.style.display="none"),l&&(l.style.display="block")):(s&&(s.style.display="none"),d&&(d.style.display="block"),l&&(l.style.display="none"))}window.showAuthPage=Qn;function Jn(t){document.querySelectorAll(".section").forEach(d=>d.classList.remove("active")),document.querySelectorAll(".tab").forEach(d=>d.classList.remove("active"));const e=document.getElementById("section-"+t);e&&e.classList.add("active"),window.scrollTo(0,0);const n=document.getElementById("app-content");n&&n.scrollTo(0,0);const o=document.getElementById("save-btn");o&&o.classList.contains("sticky-bottom-action")&&(o.style.display=t==="tournament"?"block":"none");let r="tab-"+t;(t==="leaderboard"||t==="history")&&(r="tab-profile");const a=document.getElementById(r);a&&a.classList.add("active");const s=Te.indexOf(t);if(s!==-1&&(Z=s),t==="profile"){Ce();const d=document.getElementById("profile-games-ui");d&&(d.style.display="none"),document.getElementById("profile-dashboard-ui")&&(document.getElementById("profile-dashboard-ui").style.display="block"),wn(),typeof W=="function"&&W()}t==="leaderboard"&&at(),t==="history"&&da(),t==="games"&&J(),t!=="games"&&be(),t!=="profile"&&Ce(),t==="map"&&Kt(),t==="events"&&Fe(),t==="analytics"&&qa(),t==="games"&&setTimeout(()=>{i.gameMap?i.gameMap.invalidateSize():Yt()},200)}function Fa(){const t=document.getElementById("tournament-game-select");t&&(t.innerHTML='<option value="" disabled selected>Select Game Table</option>',i.allGames.forEach(e=>{const n=document.createElement("option");n.value=e.id,n.innerText=e.game_name,t.appendChild(n)}))}function Me(t){const e=document.getElementById("quick-match-section"),n=document.getElementById("tournament-section"),o=document.getElementById("btn-quick-match-mode"),r=document.getElementById("btn-tournament-mode"),a=document.getElementById("tournament-icon-status");if(t==="tournament"&&i&&i.user&&i.user.id==="guest"){const s=document.getElementById("tour-auth-message");s&&(s.style.display="block");const d=document.getElementById("guest-login-section");d&&(d.style.display="none"),localStorage.removeItem("subsoccer-user"),i.user=null,Qn("login");return}t==="quick"?(e.style.display="block",n.style.display="none",o.style.background="linear-gradient(135deg, #E30613 0%, #c00510 100%)",o.style.color="#fff",o.style.border="none",o.style.boxShadow="none",r.style.background="#1a1a1a",r.style.color="#888",r.style.border="2px solid #333",r.style.boxShadow="0 0 15px rgba(255, 215, 0, 0.3)",a&&(a.style.color="#666")):(e.style.display="none",n.style.display="block",o.style.background="#1a1a1a",o.style.color="#888",o.style.border="2px solid #333",o.style.boxShadow="0 0 15px rgba(227, 6, 19, 0.3)",r.style.background="linear-gradient(135deg, #FFD700 0%, #d4af37 100%)",r.style.color="#000",r.style.border="none",r.style.boxShadow="none",a&&(a.style.color="#000"))}function Ua(){const e=ke-Kn;Math.abs(e)>50&&(e>0?Z<Te.length-1&&(Z++,_(Te[Z])):Z>0&&(Z--,_(Te[Z])))}function Ut(){const t=document.getElementById("app-content");t&&(t.addEventListener("touchstart",e=>{if(e.target.closest(".leaflet-container")||e.target.closest(".no-swipe")||e.target.closest('input[type="range"]')||e.target.closest(".pro-card")){ke=null;return}ke=e.changedTouches[0].screenX},{passive:!0}),t.addEventListener("touchend",e=>{ke!==null&&(Kn=e.changedTouches[0].screenX,Ua())},{passive:!0}))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Ut):Ut();function Ha(){window.onerror=function(t,e,n,o,r){return console.error("🚀 Subsoccer Global Error:",t,r),t.includes("Script error")||t.includes("ResizeObserver")||m("An unexpected error occurred. Please refresh if the app behaves strangely.","error"),!1},window.onunhandledrejection=function(t){console.error("🚀 Subsoccer Promise Rejection:",t.reason);const e=t.reason?.message||"Network or Database error occurred.";e.includes("fetch")?m("Connection lost. Please check your internet.","error"):m(e,"error")}}function St(t){if(!t)return;if(!t.querySelector(".card-shine")){const r=document.createElement("div");r.className="card-shine",t.appendChild(r)}let e=!1;const n=r=>{const a=r.touches?r.touches[0].clientX:r.clientX,s=r.touches?r.touches[0].clientY:r.clientY;e||(window.requestAnimationFrame(()=>{const d=t.getBoundingClientRect(),l=a-d.left,c=s-d.top,u=d.width/2,g=(d.height/2-c)/12,y=(l-u)/12;t.style.transform=`rotateX(${g}deg) rotateY(${y}deg) scale3d(1.02, 1.02, 1.02)`,t.style.setProperty("--x",`${l} px`),t.style.setProperty("--y",`${c} px`),e=!1}),e=!0)},o=()=>{t.style.transform="rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)"};t.addEventListener("mousemove",n),t.addEventListener("mouseleave",o)}function Y(t){t&&t.stopPropagation();const e=document.getElementById("settings-menu");e&&(e.style.display=e.style.display==="flex"?"none":"flex")}function ja(){_("sensors"),m("Sensor tools activated","success")}let Ht=!1;function Va(){if(Ht)return;Ht=!0;let t=document.getElementById("conn-dot");if(!t){t=document.createElement("div"),t.id="conn-dot",t.style.cssText="position:fixed; top:15px; left:15px; width:10px; height:10px; background:var(--sub-red); border-radius:50%; z-index:20000; display:none; box-shadow:0 0 10px var(--sub-red);",document.body.appendChild(t);const a=document.createElement("style");a.innerHTML=".dot-offline { display:block !important; animation: pulse-red 1s infinite; } @keyframes pulse-red { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }",document.head.appendChild(a)}const e=document.getElementById("audio-threshold-line");e&&e.remove();const n=document.querySelector(".main-logo");if(n){n.style.cursor="pointer",n.title="Visit subsoccer.com",n.addEventListener("click",()=>window.open("https://www.subsoccer.com","_blank")),document.querySelectorAll(".version-badge-container").forEach(s=>s.remove());const a=document.createElement("div");a.className="version-badge-container",a.style.cssText="display:flex; justify-content:center; width:100%; margin-top:5px; margin-bottom:5px;",a.innerHTML=`
            <span class="version-label" style="color:var(--sub-gold); font-size:0.7rem; letter-spacing:2px; font-weight:bold;">${io}</span>
        `,n.after(a)}Jo(),document.querySelectorAll("#beta-feedback-btn").forEach(a=>a.remove()),document.querySelectorAll('a[href*="docs.google.com/forms"]').forEach(a=>a.remove()),document.querySelectorAll("a, button").forEach(a=>{a.id!=="beta-feedback-btn"&&a.textContent&&a.textContent.toUpperCase().includes("FEEDBACK")&&a.remove()});const o=document.createElement("button");o.id="beta-feedback-btn",o.style.cssText="display:block; margin:15px auto 0 auto; width:auto; padding:8px 20px; font-size:0.7rem; background:transparent; color:#fff; border:1px solid rgba(255,255,255,0.3); border-radius:30px; cursor:pointer; font-family:var(--sub-name-font); letter-spacing:1px; text-transform:uppercase; transition:all 0.2s;",o.innerHTML='<i class="fa fa-comment-dots" style="margin-right:6px;"></i> FEEDBACK',o.onmouseover=()=>{o.style.background="rgba(255,255,255,0.1)",o.style.borderColor="#fff"},o.onmouseout=()=>{o.style.background="transparent",o.style.borderColor="rgba(255,255,255,0.3)"},o.onclick=async()=>{const a=prompt("Describe the issue or suggestion:");if(a)try{m("Sending...","info"),await p.from("feedback").insert([{message:a,user_id:i.user?.id||"guest",page:i.currentPage||"unknown"}]),m("Thanks for your feedback!","success")}catch(s){console.error(s),m("Error sending feedback","error")}};const r=document.getElementById("subsoccer-footer-link");r&&r.appendChild(o),document.querySelectorAll(".nav-tabs .tab").forEach(a=>{a.addEventListener("click",()=>{const s=a.getAttribute("data-page");s&&_(s)})}),document.getElementById("menu-toggle-btn")?.addEventListener("click",a=>Y(a)),document.getElementById("menu-item-leaderboard")?.addEventListener("click",a=>{_("leaderboard"),Y(a)}),document.getElementById("menu-item-map")?.addEventListener("click",a=>{_("map"),Y(a)}),document.getElementById("menu-item-edit-profile")?.addEventListener("click",a=>{_("profile"),En(),Y(a)}),document.getElementById("menu-item-shop")?.addEventListener("click",a=>{nt(),Y(a)}),document.getElementById("menu-item-sensors")?.addEventListener("click",a=>{ja(),Y(a)}),document.getElementById("menu-item-moderator")?.addEventListener("click",a=>{_("moderator"),Y(a)}),document.getElementById("sound-toggle-btn")?.addEventListener("click",a=>{gt(),Y(a)}),document.getElementById("avatar-file-input")?.addEventListener("change",a=>Dt(a.target)),document.getElementById("signup-avatar-file")?.addEventListener("change",a=>Dt(a.target,"signup-avatar-preview","signup-avatar-filename")),document.getElementById("btn-save-profile")?.addEventListener("click",a=>Go(a)),document.getElementById("btn-cancel-edit-profile")?.addEventListener("click",Ce),document.getElementById("btn-profile-leaderboard")?.addEventListener("click",()=>_("leaderboard")),document.getElementById("btn-dashboard-play")?.addEventListener("click",()=>_("tournament")),document.getElementById("btn-dashboard-arena")?.addEventListener("click",()=>_("map")),document.getElementById("btn-profile-history")?.addEventListener("click",()=>_("history")),document.getElementById("btn-profile-register-game")?.addEventListener("click",()=>_("games")),document.getElementById("menu-item-concept")?.addEventListener("click",()=>{bt(),document.getElementById("settings-menu").style.display="none"}),document.getElementById("btn-search-location")?.addEventListener("click",()=>Jt()),document.getElementById("btn-reg-game")?.addEventListener("click",()=>Xt()),document.getElementById("btn-update-game")?.addEventListener("click",()=>Zt()),document.getElementById("btn-cancel-edit-game")?.addEventListener("click",()=>be()),document.getElementById("btn-view-transfer-requests")?.addEventListener("click",()=>nn()),document.querySelectorAll(".visibility-btn").forEach(a=>{a.addEventListener("click",()=>{const s=a.getAttribute("data-value");document.getElementById("game-visibility-input").value=s,document.querySelectorAll(".visibility-btn").forEach(l=>l.classList.remove("active")),a.classList.add("active");const d=document.getElementById("visibility-desc");s==="public"?d.innerText="Visible to all players on the global map.":s==="private"?d.innerText="Hidden from others, but visible to you on your personal map.":d.innerText="Completely hidden from the map. Only visible in your 'My Game Tables' list."})}),document.getElementById("btn-search-public-map")?.addEventListener("click",()=>po()),document.getElementById("btn-quick-match-mode")?.addEventListener("click",()=>Me("quick")),document.getElementById("btn-tournament-mode")?.addEventListener("click",()=>Me("tournament")),document.getElementById("add-p-input")?.addEventListener("input",a=>In(a.target.value)),document.getElementById("add-p-input")?.addEventListener("keypress",a=>{a.key==="Enter"&&ot()}),document.getElementById("btn-add-player")?.addEventListener("click",()=>ot()),document.getElementById("btn-clear-pool")?.addEventListener("click",()=>Ya()),document.getElementById("btn-start-tournament")?.addEventListener("click",()=>dt()),document.getElementById("btn-smart-host")?.addEventListener("click",()=>Ia()),document.getElementById("btn-cancel-smart-host")?.addEventListener("click",()=>Ta()),document.getElementById("btn-start-smart-host")?.addEventListener("click",()=>{Sa(),dt()}),document.getElementById("next-rd-btn")?.addEventListener("click",()=>_a()),document.getElementById("save-btn")?.addEventListener("click",()=>La()),document.getElementById("btn-close-card-modal")?.addEventListener("click",()=>closeCardModal()),document.addEventListener("click",a=>{const s=document.getElementById("settings-menu"),d=document.getElementById("menu-toggle-btn");s&&s.style.display==="flex"&&!s.contains(a.target)&&!d.contains(a.target)&&(s.style.display="none")}),document.addEventListener("click",a=>{const s=a.target.closest('[data-action="direct-add"]');if(s){$e(s.dataset.name);return}const d=a.target.closest('[data-action="view-bracket"]');if(d){const{id:k,eventId:z,name:F,max:_t}=d.dataset;kt(k,F,z);return}const l=a.target.closest('[data-action="share-story"]');if(l){(async()=>{const k=await K.captureStory("level-up-card-preview",l.dataset.player);k&&K.share(k,l.dataset.player)})();return}if(a.target.closest('[data-action="order-physical-card"]')){bn();return}if(a.target.closest('[data-action="show-card-shop"]')){m("Pro Card Shop opens soon – keep ranking up to unlock borders!","info");return}if(a.target.closest('[data-action="download-card"]')){m("Generating high-res image...","info"),K.capture("profile-card-container",i.user?.username||"Player").catch(k=>{console.error(k),m("Failed to generate image","error")});return}const g=a.target.closest('[data-action="view-participants"]');if(g){const{eventId:k,tourId:z,name:F}=g.dataset;Ue(k,z);return}const y=a.target.dataset.action;y==="finish-event-tournament"&&Tt(),y==="close-bracket-modal"&&He();const v=a.target.closest("[data-remove-index]");if(v){Wa(parseInt(v.dataset.removeIndex));return}const b=a.target.closest("[data-guest]");if(b){$e(b.dataset.guest);return}const h=a.target.closest("[data-toggle-tournament]");if(h){const k=document.getElementById(`tour-matches-${h.dataset.toggleTournament}`);k&&(k.style.display=k.style.display==="none"?"block":"none");return}const x=a.target.closest("[data-replay-players]");if(x){Ca(JSON.parse(x.dataset.replayPlayers),x.dataset.replayName);return}const E=a.target.closest("[data-action]");if(E){const k=E.dataset.action;k==="show-card-shop"&&nt(),k==="download-card"&&vn();return}const T=a.target.closest("[data-edition-id]");if(T){hn(T.dataset.editionId);return}const w=a.target.closest("[data-share-level-up]");if(w){const k=w.dataset.shareLevelUp;(async()=>{const z=await K.capture("level-up-container");z&&K.share(z,k)})();return}if(a.target.closest('[data-action="external-link"]')){a.stopPropagation();return}const D=a.target.closest(".map-filter-btn");if(D){Qt(D.dataset.filter);return}const S=a.target.closest('[data-action="fly-to-location"]');if(S){uo(parseFloat(S.dataset.lat),parseFloat(S.dataset.lng));return}}),Ea(),zo(),Na(),xn()}function Bt(){const t=document.getElementById("pool-list"),e=document.getElementById("pool-count");if(t){if(t.innerHTML="",i.pool.length===0){t.innerHTML=`
            <div style="text-align:center; color:#444; padding:30px 0; font-size:0.8rem;">
                <i class="fa fa-users" style="font-size:2rem; margin-bottom:10px; opacity:0.3;"></i><br>
                Add players to start
            </div>
        `,e&&(e.innerText=0);return}i.pool.forEach((n,o)=>{const r=document.createElement("div");r.className="sub-item-row",r.style.cssText="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; background: #161616; padding: 10px 15px; border-radius: 4px; border: 1px solid #222;",r.innerHTML=`
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #444; font-family: var(--sub-name-font); font-size: 0.8rem; width: 20px;">${o+1}.</span>
                <span style="color: white; text-transform: uppercase; font-size: 0.9rem; font-family: var(--sub-name-font); letter-spacing:1px;">${n}</span>
            </div>
            <button class="pool-remove-btn" data-remove-index="${o}" style="background:none; border:none; color:#666; cursor:pointer; font-size:0.9rem; padding:5px; transition:color 0.2s;" onmouseover="this.style.color='var(--sub-red)'" onmouseout="this.style.color='#666'">
                <i class="fa fa-times"></i>
            </button>
        `,t.appendChild(r)}),e&&(e.innerText=i.pool.length)}}function Wa(t){const e=i.pool[t];i.pool.splice(t,1),Bt(),m(`${e} removed from pool`,"error")}function Ya(){i.pool=[],Bt(),m("Player pool cleared","error")}function Ka(){const t=document.getElementById("active-guests");t&&(t.innerHTML=i.sessionGuests.map(e=>`<span class="guest-badge" style="background:#333; padding:5px 10px; border-radius:15px; font-size:0.7rem; cursor:pointer; margin:4px; display:inline-block; border:1px solid #444;" data-guest="${e}">${e}</span>`).join(""))}te("user",()=>{try{if(!i.user)return;const t=document.getElementById("auth-page").style.display!=="none",e=document.getElementById("auth-page"),n=document.getElementById("app-content"),o=document.getElementById("nav-tabs"),r=document.getElementById("menu-toggle-btn"),a=document.querySelector("header"),s=()=>{const v=ye(),b=document.getElementById("menu-item-moderator");b&&(b.style.display=v?"flex":"none");const h=document.getElementById("menu-item-venue-manager");h&&(h.style.display=v?"flex":"none");const x=document.getElementById("menu-item-sensors");x&&(x.style.display="flex");const E=document.getElementById("conn-dot");E&&E.remove()},d=new URLSearchParams(window.location.search);if(d.get("live")){document.body.classList.add("live-mode"),e&&(e.style.display="none"),n&&(n.style.display="none"),o&&(o.style.display="none"),r&&(r.style.display="none"),a&&(a.style.display="none");return}e&&(e.style.display="none"),n&&(n.style.display="flex",n.classList.remove("fade-in"),n.offsetWidth,n.classList.add("fade-in")),a&&(a.style.display="flex"),o&&o.style.setProperty("display","flex","important"),r&&(r.style.display=so?"none":"block");const c=document.getElementById("tab-events");c&&(c.style.display=i.user.id!=="guest"&&We.ENABLE_EVENTS?"flex":"none");const u=document.getElementById("btn-profile-register-game");u&&(u.style.display=i.user.id==="guest"||i.user.id==="spectator"?"none":"block");const f=document.querySelector(".mode-selector-container");f&&(f.style.display=i.user.id==="guest"||i.user.id==="spectator"?"none":"flex"),s();const g=document.getElementById("start-quick-match");g&&(g.textContent="START GAME",g.style.background="");const y=document.querySelector('a[href*="flick-game.html"]');if(y){const v=i.user.id==="guest"?"guest":"registered";y.href=`flick-game.html?game_id=QUICK-PLAY&mode=casual&user_type=${v}`}if(W(),Ka(),Bo(),t)if(d.get("action")==="claim_result"){const v=parseInt(d.get("p1_score"))||0,b=parseInt(d.get("p2_score"))||0,h=d.get("game_id");ln(v,b,h)}else{const v=d.get("page"),b=d.get("event_id");v&&["events","profile","map","leaderboard","history","tournament"].includes(v)?(i.currentPage=v,v==="events"&&b?setTimeout(()=>viewEventDetails(b),800):v==="tournament"&&d.get("tab")==="tournament"&&Me("tournament")):i.currentPage="tournament"}}catch(t){console.error("Error in user state subscription:",t)}});te("currentPage",t=>{Jn(t);const e=new URL(window.location);e.searchParams.set("page",t),window.history.replaceState({},"",e)});te("activeCardEdition",()=>{W()});te("pool",()=>{Bt()});te("allGames",()=>{Fa()});te("myGames",()=>{W()});te("victoryData",t=>{t&&Ga(t.winnerName,t.winnerElo,t.winnerGain)});let I=null,V=null,ae=null,ce=null,ie=!1,Se=null,fe=2e3,ge=3500,Ie=200,re=.65;try{const t=localStorage.getItem("subsoccer_audio_threshold");if(t!==null){const e=parseFloat(t);!isNaN(e)&&e>=0&&e<=1&&(re=e)}}catch{}const Qa=50,Xn=1500;let mt=0,se=0,le=null,Re=0,ze=0,Zn=0,eo=0,Be=null,_e=null;function to(){if(I)return!0;try{return window.soundEffects&&window.soundEffects.audioContext?(I=window.soundEffects.audioContext,console.log("AudioEngine: Reusing SoundEffects AudioContext")):I=new(window.AudioContext||window.webkitAudioContext),V=I.createAnalyser(),V.fftSize=2048,V.smoothingTimeConstant=.8,!0}catch(t){return console.error("AudioContext initialization failed:",t),!1}}async function Ja(){if(ie)return{success:!0,message:"Already active"};try{if(!I&&!to())return{success:!1,message:"Failed to initialize audio system"};I.state==="suspended"&&await I.resume();const t={audio:{echoCancellation:{ideal:!1},noiseSuppression:{ideal:!1},autoGainControl:{ideal:!1}}};return ae=await navigator.mediaDevices.getUserMedia(t),ce=I.createMediaStreamSource(ae),ce.connect(V),ie=!0,mt=0,se=0,le=null,Be=document.getElementById("hud-bar-p1"),_e=document.getElementById("hud-bar-p2"),Za(),no(!0),{success:!0,message:"Goal detection activated"}}catch(t){return console.error("Microphone access denied or failed:",t),{success:!1,message:"Microphone access required for goal detection"}}}function Xa(){ie&&(Se&&(clearInterval(Se),Se=null),ce&&(ce.disconnect(),ce=null),V&&V.disconnect(),ae&&(ae.getTracks().forEach(t=>t.stop()),ae=null),I&&I.state==="running"&&I.suspend(),ie=!1,no(!1))}function Za(){const t=V.frequencyBinCount,e=new Uint8Array(t),n=I.sampleRate;Se=setInterval(()=>{if(!ie)return;V.getByteFrequencyData(e);const o=er(e,n);tr(o)},30)}function er(t,e){const n=t.length,o=e/V.fftSize,r=Math.floor((fe-Ie)/o),a=Math.ceil((fe+Ie)/o),s=Math.floor((ge-Ie)/o),d=Math.ceil((ge+Ie)/o);let l=0,c=0;for(let u=r;u<=a&&u<n;u++)t[u]>l&&(l=t[u]);for(let u=s;u<=d&&u<n;u++)t[u]>c&&(c=t[u]);if(l/=255,c/=255,Zn=l,eo=c,l>Re&&(Re=l),c>ze&&(ze=c),Be&&_e){const u=Math.min(100,l*100),f=Math.min(100,c*100);Be.style.height=`${u}%`,_e.style.height=`${f}%`;const g=Math.min(100,re*100);Be.parentElement.style.setProperty("--threshold",`${g}%`),_e.parentElement.style.setProperty("--threshold",`${g}%`)}return l>re&&l>c?1:c>re&&c>l?2:null}function tr(t){const e=Date.now();if(t===null){le=null,se=0;return}if(e-mt<Xn)return;if(le!==t){le=t,se=e;return}e-se>=Qa&&(nr(t),mt=e,se=0,le=null)}function nr(t){const e=t===1?2:1;typeof window.handleGoalDetected=="function"?window.handleGoalDetected(e):console.warn("window.handleGoalDetected not found. Make sure it's defined in script.js"),or()}function or(){try{if(!I||I.state==="closed")return;const t=I.createOscillator(),e=I.createGain();t.connect(e),e.connect(I.destination),t.frequency.value=800,e.gain.setValueAtTime(.1,I.currentTime),e.gain.exponentialRampToValueAtTime(.01,I.currentTime+.2),t.start(I.currentTime),t.stop(I.currentTime+.2)}catch{}}function ar(t){if(!I&&!to())return;I.state==="suspended"&&I.resume();const e=I.createOscillator(),n=I.createGain();e.connect(n),n.connect(I.destination);const o=t===1?fe:ge;e.type="sine",e.frequency.setValueAtTime(o,I.currentTime),n.gain.setValueAtTime(0,I.currentTime),n.gain.linearRampToValueAtTime(.2,I.currentTime+.05),n.gain.exponentialRampToValueAtTime(.001,I.currentTime+.5),e.start(I.currentTime),e.stop(I.currentTime+.5),console.log(`🔊 Playing test sound for Goal ${t}: ${o}Hz`)}function no(t){const e=document.getElementById("toggle-audio-btn"),n=document.getElementById("audio-frequency-display"),o=document.getElementById("audio-meter-wrapper"),r=document.getElementById("audio-meter-container"),a=document.getElementById("audio-telemetry");e&&(e.textContent=t?"DEACTIVATE":"ACTIVATE",e.style.backgroundColor=t?"#c62828":"#333"),n&&(n.style.display=t?"block":"none"),o&&(o.style.display=t?"block":"none"),r&&(r.style.display=t?"block":"none"),a&&(a.style.display=t?"flex":"none")}function rr(){return{isListening:ie,hasMicrophone:ae!==null,settings:{goal1Frequency:fe,goal2Frequency:ge,threshold:re,cooldown:Xn},debug:{peakGoal1:Re,peakGoal2:ze,currentG1:Zn,currentG2:eo}}}function ir(){Re=0,ze=0}function sr(t,e){return t>0&&(fe=t),e>0&&(ge=e),!0}function lr(t){if(t>=0&&t<=1){re=t;try{localStorage.setItem("subsoccer_audio_threshold",t)}catch{}return!0}return!1}window.audioEngine={startListening:Ja,stopListening:Xa,getStatus:rr,setThreshold:lr,setFrequencies:sr,resetPeaks:ir,playTestSound:ar};class dr{constructor(){this.sounds={},this.enabled=!1,this.volume=.7,this.initSounds()}initSounds(){this.audioContext=null,(window.AudioContext||window.webkitAudioContext)&&(this.audioContext=new(window.AudioContext||window.webkitAudioContext))}resume(){this.audioContext&&this.audioContext.state==="suspended"&&this.audioContext.resume()}loadSound(e,n){const o=new Audio(n);o.volume=this.volume,o.preload="auto",this.sounds[e]=o,console.log(`🔊 Loaded sound: ${e} from ${n}`)}playSound(e){if(this.enabled)if(this.sounds[e]){const n=this.sounds[e].cloneNode();n.volume=this.volume,n.play().catch(o=>console.log("Sound play failed:",o))}else console.warn(`Sound not found: ${e}`)}playGameplayTheme(){this.enabled&&(this.stopMusic(),this.sounds.gameplay&&(this.currentMusic=this.sounds.gameplay,this.currentMusic.loop=!0,this.currentMusic.currentTime=0,this.currentMusic.volume=this.volume*.5,this.currentMusic.play().catch(e=>console.log("Gameplay theme play failed:",e))))}playVictoryTheme(){this.enabled&&(this.stopMusic(),this.sounds.victory&&(this.currentMusic=this.sounds.victory,this.currentMusic.loop=!1,this.currentMusic.currentTime=0,this.currentMusic.volume=this.volume*.8,this.currentMusic.play().catch(e=>console.log("Victory theme play failed:",e))))}stopMusic(){this.currentMusic&&(this.currentMusic.pause(),this.currentMusic.currentTime=0,this.currentMusic=null)}fadeOutMusic(e=5){if(!this.currentMusic)return;let n=setInterval(()=>{this.currentMusic.volume>.05?this.currentMusic.volume-=.05:(clearInterval(n),this.stopMusic())},e*1e3/(this.volume/.05))}playGoalSound(){this.sounds.goal?this.playSound("goal"):this.playC64Sound("hit")}playCrowdCheer(){this.sounds.crowd?this.playSound("crowd"):this.playC64Sound("combo")}playC64Sound(e="hit"){if(!this.audioContext||!this.enabled)return;const n=this.audioContext.createOscillator(),o=this.audioContext.createGain();n.connect(o),o.connect(this.audioContext.destination);const r=this.audioContext.currentTime;e==="hit"?(n.type="square",n.frequency.setValueAtTime(440,r),n.frequency.setValueAtTime(880,r+.1),o.gain.setValueAtTime(0,r),o.gain.linearRampToValueAtTime(this.volume*.3,r+.05),o.gain.exponentialRampToValueAtTime(.01,r+.3),n.start(r),n.stop(r+.3)):e==="combo"&&(n.type="sawtooth",n.frequency.setValueAtTime(349.23,r),n.frequency.setValueAtTime(440,r+.05),n.frequency.setValueAtTime(523.25,r+.1),n.frequency.setValueAtTime(698.46,r+.15),o.gain.setValueAtTime(0,r),o.gain.linearRampToValueAtTime(this.volume*.3,r+.05),o.gain.exponentialRampToValueAtTime(.01,r+.4),n.start(r),n.stop(r+.4))}synthesizeGoalSound(){if(!this.audioContext||!this.enabled)return;const e=this.audioContext.currentTime,n=this.audioContext.createOscillator(),o=this.audioContext.createGain();n.connect(o),o.connect(this.audioContext.destination),n.type="square",n.frequency.setValueAtTime(220,e),n.frequency.exponentialRampToValueAtTime(200,e+.3),o.gain.setValueAtTime(0,e),o.gain.linearRampToValueAtTime(this.volume*.3,e+.02),o.gain.exponentialRampToValueAtTime(.01,e+.5),n.start(e),n.stop(e+.5),setTimeout(()=>this.playBeepSequence(),200)}playBeepSequence(){if(!this.audioContext||!this.enabled)return;const e=[{freq:523,time:0},{freq:659,time:.15},{freq:784,time:.3}],n=this.audioContext.currentTime;e.forEach(o=>{const r=this.audioContext.createOscillator(),a=this.audioContext.createGain();r.connect(a),a.connect(this.audioContext.destination),r.frequency.value=o.freq,r.type="sine";const s=n+o.time;a.gain.setValueAtTime(0,s),a.gain.linearRampToValueAtTime(this.volume*.2,s+.02),a.gain.exponentialRampToValueAtTime(.01,s+.15),r.start(s),r.stop(s+.15)})}synthesizeCrowdCheer(){if(!this.audioContext||!this.enabled)return;const e=this.audioContext.currentTime,n=2,o=this.audioContext.sampleRate*n,r=this.audioContext.createBuffer(1,o,this.audioContext.sampleRate),a=r.getChannelData(0);for(let c=0;c<o;c++)a[c]=Math.random()*2-1;const s=this.audioContext.createBufferSource();s.buffer=r;const d=this.audioContext.createBiquadFilter();d.type="bandpass",d.frequency.value=1e3,d.Q.value=1;const l=this.audioContext.createGain();l.gain.setValueAtTime(0,e),l.gain.linearRampToValueAtTime(this.volume*.15,e+.1),l.gain.linearRampToValueAtTime(this.volume*.15,e+1),l.gain.exponentialRampToValueAtTime(.01,e+n),s.connect(d),d.connect(l),l.connect(this.audioContext.destination),s.start(e),s.stop(e+n),this.addCheerAccents(e)}addCheerAccents(e){if(!this.audioContext)return;[{freq:800,time:.3},{freq:1e3,time:.6},{freq:900,time:1},{freq:1100,time:1.3}].forEach(o=>{const r=this.audioContext.createOscillator(),a=this.audioContext.createGain();r.connect(a),a.connect(this.audioContext.destination),r.type="sine",r.frequency.value=o.freq;const s=e+o.time;a.gain.setValueAtTime(0,s),a.gain.linearRampToValueAtTime(this.volume*.1,s+.05),a.gain.exponentialRampToValueAtTime(.01,s+.3),r.start(s),r.stop(s+.3)})}setVolume(e){this.volume=Math.max(0,Math.min(1,e)),Object.values(this.sounds).forEach(n=>{n.volume!==void 0&&(n.volume=this.volume)})}setEnabled(e){this.enabled=e}toggle(){return this.enabled=!this.enabled,this.enabled}}const pt=new dr;try{pt.loadSound("gameplay","sounds/gameplay_theme.m4a"),pt.loadSound("victory","sounds/victory_theme.m4a"),console.log("🔊 Custom sound files loaded")}catch{console.log("🔊 Using synthesized sounds (custom files not found)")}window.soundEffects=pt;console.log("🔊 Sound Effects System loaded");const jt=()=>{Ha(),Wo(),Ba();const t=new URLSearchParams(window.location.search);if(t.get("page")==="tournament"){const e=document.getElementById("tour-auth-message");e&&(e.style.display="block");const n=document.getElementById("guest-login-section");n&&(n.style.display="none"),t.get("tab")==="tournament"&&Me("tournament"),typeof window.showAuthPage=="function"&&!localStorage.getItem("sb-ujxmmrsmdwrgcwatdhvx-auth-token")&&window.showAuthPage("login")}else t.get("page")==="analytics"&&(typeof window.showAuthPage=="function"&&!localStorage.getItem("sb-ujxmmrsmdwrgcwatdhvx-auth-token")?window.showAuthPage("login"):setTimeout(()=>{_("analytics")},500));Ko(),Va(),Po()};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",jt):jt();document.addEventListener("DOMContentLoaded",function(){const t=new URLSearchParams(window.location.search),e=document.getElementById("auth-page");if(t.get("action")==="claim_result"){const o=t.get("p1_score"),r=t.get("p2_score");if(e&&getComputedStyle(e).display!=="none"){typeof window.toggleAuth=="function"&&window.toggleAuth(!0);const a=document.getElementById("signup-form");if(a&&!document.getElementById("victory-claim-msg")){const s=document.createElement("div");s.id="victory-claim-msg",s.style.cssText="background: rgba(255, 215, 0, 0.1); border: 1px solid var(--sub-gold); color: #fff; padding: 15px; border-radius: var(--sub-radius); margin-bottom: 25px; font-family: 'Open Sans'; font-size: 0.9rem; line-height: 1.5; text-align: center;",s.innerHTML=`<span style="color:var(--sub-gold); font-weight:bold; font-size:1.2rem; display:block; margin-bottom:5px;">🏆 CLAIM YOUR VICTORY!</span>Create your Pro account to save that <strong>${Math.max(o,r)}-${Math.min(o,r)}</strong> win. Start your journey to the Global Top 100 today!`;const d=a.querySelector("h2");d&&d.parentNode.insertBefore(s,d.nextSibling)}}}if(t.get("live")&&e&&getComputedStyle(e).display!=="none"&&!document.getElementById("live-event-msg")){const o=document.createElement("div");o.id="live-event-msg",o.style.cssText="background: rgba(255, 215, 0, 0.1); border: 1px solid var(--sub-gold); color: #fff; padding: 15px; border-radius: var(--sub-radius); margin-bottom: 25px; font-family: 'Open Sans'; font-size: 0.9rem; line-height: 1.5; text-align: center;",o.innerHTML='<span style="color:var(--sub-gold); font-weight:bold; font-size:1.2rem; display:block; margin-bottom:5px;">📢 LIVE EVENT ACCESS</span>Join as a guest or log in to view the live brackets and real-time scores for this event!';const r=document.getElementById("login-form");if(r){const a=r.querySelector("h2");a&&a.parentNode.insertBefore(o,a.nextSibling)}}});
