import { showModal, showNotification, showLoading, hideLoading } from './ui-utils.js';
import { _supabase, state, isSuperAdmin, isAdmin } from './config.js';

/**
 * MODERATOR SERVICE
 * Tools for system administration
 */

function getSavedPartners() {
    return JSON.parse(localStorage.getItem('subsoccer-saved-partners') || '[]');
}

function savePartners(partners) {
    localStorage.setItem('subsoccer-saved-partners', JSON.stringify(partners));
}

function renderPartnersList() {
    const list = document.getElementById('partners-list');
    if (!list) return;

    const partners = getSavedPartners();

    if (partners.length === 0) {
        list.innerHTML = '<div style="font-size:0.75rem; color:#444; text-align:center; padding:10px;">No saved partners</div>';
        return;
    }

    list.innerHTML = partners.map((p, i) => `
        <div class="sub-item-row" style="padding:8px 12px; background:#0a0a0a; border:1px solid #222; display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <div style="display:flex; align-items:center; gap:10px; flex:1; cursor:pointer;" data-copy-index="${i}">
                <div style="width:12px; height:12px; border-radius:50%; background:${p.color}; border:1px solid #fff;"></div>
                <div style="font-size:0.85rem; color:#fff; font-family:'Resolve';">${p.brand.toUpperCase()} <i class="fa fa-link" style="font-size:0.6rem; margin-left:5px; opacity:0.5;"></i></div>
            </div>
            <div style="display:flex; gap:12px;">
                <button data-edit-index="${i}" style="background:none; border:none; color:var(--sub-gold); cursor:pointer; font-size:0.9rem;"><i class="fa fa-edit"></i></button>
                <button data-delete-index="${i}" style="background:none; border:none; color:var(--sub-red); cursor:pointer; font-size:0.9rem;"><i class="fa fa-trash"></i></button>
            </div>
        </div>
    `).join('');

    // Add listeners
    list.querySelectorAll('[data-copy-index]').forEach(el => {
        el.onclick = () => {
            const p = partners[el.dataset.copyIndex];
            const baseUrl = window.location.origin + window.location.pathname;
            const params = new URLSearchParams();
            params.append('brand', p.brand);
            if (p.color) params.append('color', p.color.replace('#', ''));
            if (p.logo) params.append('logo', p.logo);
            const url = `${baseUrl}?${params.toString()}`;
            navigator.clipboard.writeText(url).then(() => showNotification('Link copied!', 'success'));
        };
    });

    list.querySelectorAll('[data-edit-index]').forEach(el => {
        el.onclick = () => {
            const p = partners[el.dataset.editIndex];
            document.getElementById('gen-brand-id').value = p.brand;
            document.getElementById('gen-brand-color').value = p.color;
            document.getElementById('gen-brand-color-text').value = p.color;
            document.getElementById('gen-brand-logo').value = p.logo || '';
            document.getElementById('gen-partner-index').value = el.dataset.editIndex;
            document.getElementById('form-title').innerText = 'EDIT PARTNER: ' + p.brand.toUpperCase();
            document.getElementById('btn-save-partner-action').innerText = 'UPDATE CONFIG';
        };
    });

    list.querySelectorAll('[data-delete-index]').forEach(el => {
        el.onclick = () => {
            if (!confirm('Delete this partner config?')) return;
            const p = getSavedPartners();
            p.splice(el.dataset.deleteIndex, 1);
            savePartners(p);
            renderPartnersList();
            showNotification('Partner deleted', 'error');
        };
    });
}

export function showPartnerLinkGenerator() {
    const html = `
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
    `;

    showModal('PARTNER MANAGER', html, { maxWidth: '420px' });

    const colorPicker = document.getElementById('gen-brand-color');
    const colorText = document.getElementById('gen-brand-color-text');

    colorPicker.oninput = (e) => colorText.value = e.target.value.toUpperCase();
    colorText.oninput = (e) => colorPicker.value = e.target.value;

    const resetForm = () => {
        document.getElementById('gen-brand-id').value = '';
        document.getElementById('gen-brand-color').value = '#F40009';
        document.getElementById('gen-brand-color-text').value = '#F40009';
        document.getElementById('gen-brand-logo').value = '';
        document.getElementById('gen-partner-index').value = '-1';
        document.getElementById('form-title').innerText = 'CREATE NEW PARTNER';
        document.getElementById('btn-save-partner-action').innerText = 'SAVE CONFIG';
    };

    document.getElementById('btn-reset-form').onclick = resetForm;

    document.getElementById('btn-clear-all-branding').onclick = () => {
        if (!confirm('Reset app to original Subsoccer branding?')) return;
        window.location.href = window.location.origin + window.location.pathname + '?brand=none';
    };

    document.getElementById('btn-save-partner-action').onclick = () => {
        const brand = document.getElementById('gen-brand-id').value.trim();
        const color = colorText.value.trim();
        let logo = document.getElementById('gen-brand-logo').value.trim();
        const editIndex = parseInt(document.getElementById('gen-partner-index').value);

        // Siivotaan logo-URL: jos käyttäjä liitti koko brändilinkin, poimitaan vain logo-parametri
        if (logo.includes('brand=') && logo.includes('logo=')) {
            try {
                const urlParams = new URLSearchParams(logo.split('?')[1]);
                const extractedLogo = urlParams.get('logo');
                if (extractedLogo) logo = extractedLogo;
            } catch (e) {
                console.error("Logo URL parsing failed", e);
            }
        }

        if (!brand) return showNotification('Brand ID required', 'error');

        const partners = getSavedPartners();
        const newPartner = { brand, color, logo };

        if (editIndex >= 0) {
            partners[editIndex] = newPartner;
            showNotification('Partner updated', 'success');
        } else {
            partners.push(newPartner);
            showNotification('Partner saved', 'success');
        }

        savePartners(partners);
        resetForm();
        renderPartnersList();
    };

    renderPartnersList();
}

export async function viewAllUsers() {
    showLoading('Fetching users...');
    try {
        const { data, error } = await _supabase
            .from('players')
            .select('id, username, elo, wins, losses, country, created_at, is_admin, email')
            .order('username');

        if (error) throw error;

        // Suodatetaan pois vieraat (ne joilla ei ole sähköpostia)
        const registeredUsers = data.filter(u => u.email);

        const html = `
            <div style="max-height: 400px; overflow-y: auto; padding-right: 5px;">
                ${registeredUsers.map(u => `
                    <div style="background:#111; padding:12px; border-radius:4px; margin-bottom:8px; border-left:3px solid ${u.is_admin ? 'var(--sub-gold)' : '#333'}; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-family:'Resolve'; color:#fff; font-size:0.9rem;">
                                ${u.is_admin ? '⭐ ' : ''}${u.username}
                            </div>
                            <div style="font-size:0.7rem; color:#666;">${u.country?.toUpperCase() || 'FI'} • Joined ${new Date(u.created_at).toLocaleDateString()}</div>
                            <div style="font-size:0.6rem; color:#444;">${u.email}</div>
                        </div>
                        <div style="text-align:right; display:flex; flex-direction:column; gap:5px;">
                            <div style="color:var(--sub-gold); font-family:'Resolve'; font-size:1rem;">${u.elo}</div>
                            <div style="display:flex; gap: 5px; width: 100%; justify-content: flex-end;">
                                <button class="btn-red" 
                                        style="font-size:0.6rem; padding:4px 8px; background:#4CAF50; color:#fff; border:none; width:auto; min-width:60px;"
                                        onclick="openAdminPrintMode('${u.username}')">
                                    <i class="fa fa-download"></i> HI-RES PRINT PNGs
                                </button>
                                <button class="btn-red" 
                                        style="font-size:0.6rem; padding:4px 8px; background:${u.is_admin ? '#c62828' : 'var(--sub-gold)'}; color:${u.is_admin ? '#fff' : '#000'}; border:none; width:auto; min-width:80px;"
                                        onclick="toggleAdminStatus('${u.id}', ${u.is_admin})">
                                    ${u.is_admin ? 'REVOKE ADMIN' : 'MAKE ADMIN'}
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        showModal('REGISTERED USERS', html, { maxWidth: '450px' });
    } catch (e) {
        showNotification('Failed to fetch users: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

export async function openAdminPrintMode(username) {
    showLoading('Generating 300+ DPI Origials...');
    import('./player-card-ui.js').then(module => {
        if (window.closeModal) window.closeModal('generic-modal');

        // Ladataan kortti modaaliin, mutta ei rikota sitä visuaalisesti!
        module.viewPlayerCard(username);

        setTimeout(async () => {
             try {
                const liveFront = document.querySelector('#card-modal .card-front');
                const liveBack = document.querySelector('#card-modal .card-back');
                
                if (!liveFront || !liveBack) throw new Error("Card elements not found");

                // Odota graafikoiden ja fonttien latausta
                await new Promise(r => setTimeout(r, 600));

                // 1. CLONE STRATEGY: Eristetään kaappaus kokonaan ruudulta
                // Pidetään alkuperäinen modaali ehjänä, ettei käyttäjän UI hajoa.
                const trap = document.createElement('div');
                trap.style.position = 'absolute'; // ABSOLUTE on oikein, yhdistettynä top: 0 koodiin
                trap.style.top = '0px'; // Pakotetaan DOkumentin yläreunaan, ei viewportin, välttääksemme scroll offsetit!
                trap.style.left = '0px'; 
                trap.style.zIndex = '-9999'; // Piiloon muun sisällön taakse
                trap.style.width = '354px';
                trap.style.display = 'block';
                document.body.appendChild(trap);
                
                const front = liveFront.cloneNode(true);
                const back = liveBack.cloneNode(true);

                // Siivotaan kääntönapit klooneista
                front.querySelectorAll('.fa-rotate-right, .fa-rotate-left, .flip-hint').forEach(e => {
                    if (e.parentNode) e.parentNode.style.display = 'none';
                });
                back.querySelectorAll('.fa-rotate-right, .fa-rotate-left, .flip-hint').forEach(e => {
                    if (e.parentNode) e.parentNode.style.display = 'none';
                });

                // Apufunktio inset offset bugien korjaamiseen
                const fixInsets = (el) => {
                    el.querySelectorAll('.card-bleed-edge').forEach(e => { 
                        e.style.top='0px'; e.style.left='0px'; e.style.bottom='0px'; e.style.right='0px'; e.style.inset='auto'; 
                    });
                    el.querySelectorAll('.card-safe-zone').forEach(z => { 
                        z.style.top='16px'; z.style.left='16px'; z.style.bottom='16px'; z.style.right='16px'; z.style.inset='auto'; 
                    });
                };

                // Valmistellaan ETUPUOLI suoraan (0,0) origoon
                front.style.position = 'relative';
                front.style.transform = 'none';
                front.style.backfaceVisibility = 'visible';
                front.style.width = '354px';
                front.style.height = '474px';
                front.style.margin = '0';
                front.style.overflow = 'hidden';
                fixInsets(front);

                trap.appendChild(front);

                // KORJAUS: Nollataan html2canvas mahdolliset offset/scroll -bugit täysin 
                const canvasOpts = {
                    scale: 4, 
                    useCORS: true, 
                    logging: false,
                    x: 0,
                    y: 0,
                    scrollX: 0,
                    scrollY: 0,
                    width: 354,
                    height: 474
                };

                // 2. Kaappaus ETUPUOLI
                const frontCanvas = await html2canvas(front, { ...canvasOpts, backgroundColor: null });
                trap.innerHTML = ''; // Tyhjennä 

                // Valmistellaan TAKAPUOLI 
                back.style.position = 'relative';
                back.style.transform = 'none';
                back.style.backfaceVisibility = 'visible';
                back.style.width = '354px';
                back.style.height = '474px';
                back.style.margin = '0';
                back.style.overflow = 'hidden'; // Katkaisee ylipitkän tyhjän tilan
                
                // Rajoitetaan lista
                const bb = back.querySelector('#profile-card-back-content');
                if(bb) {
                    bb.style.flex = 'none';
                    bb.style.height = '290px'; // Pakota korkeus kiinteäksi
                    bb.style.overflow = 'hidden';
                }
                fixInsets(back);
                
                trap.appendChild(back);

                // Kaappaus TAKAPUOLI
                const backCanvas = await html2canvas(back, { ...canvasOpts, backgroundColor: '#0a0a0a' });
                document.body.removeChild(trap); 

                // 3. Lataukset
                const link1 = document.createElement('a');
                link1.download = `SUBSOCCER_PRO_CARD_${username}_FRONT_PRINT.png`;
                link1.href = frontCanvas.toDataURL('image/png');
                link1.click();
                
                setTimeout(() => {
                    const link2 = document.createElement('a');
                    link2.download = `SUBSOCCER_PRO_CARD_${username}_BACK_PRINT.png`;
                    link2.href = backCanvas.toDataURL('image/png');
                    link2.click();
                    
                    showNotification('Hi-Res Print Originals Downloaded!', 'success');
                    hideLoading();
                }, 800);

             } catch(err) {
                 console.error("Print generation failed:", err);
                 showNotification("Failed to generate prints", "error");
                 hideLoading();
             }
        }, 1200); 
    });
}
window.openAdminPrintMode = openAdminPrintMode;

export async function toggleAdminStatus(userId, currentStatus) {
    if (userId === state.user?.id) {
        showNotification("You cannot change your own admin status", "error");
        return;
    }

    // Estetään muiden adminien poistaminen, paitsi jos kyseessä on pääkäyttäjä
    if (currentStatus && !isSuperAdmin()) {
        showNotification("Vain pääkäyttäjä voi poistaa ylläpito-oikeuksia muilta admineilta", "error");
        return;
    }

    const action = currentStatus ? 'revoke' : 'grant';
    if (!confirm(`Are you sure you want to ${action} admin rights for this user?`)) return;

    showLoading('Updating permissions...');
    try {
        const { error } = await _supabase
            .from('players')
            .update({ is_admin: !currentStatus })
            .eq('id', userId);

        if (error) throw error;

        showNotification(`Admin rights ${currentStatus ? 'revoked' : 'granted'}!`, 'success');
        // Päivitetään lista lennosta
        viewAllUsers();
    } catch (e) {
        showNotification('Failed to update admin status: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

window.toggleAdminStatus = toggleAdminStatus;

export async function downloadSystemLogs() {
    if (!isAdmin()) {
        showNotification("Access denied: Admin privileges required.", "error");
        return;
    }

    showLoading('Generating CSV logs...');
    try {
        const { data, error } = await _supabase
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            showNotification('No match logs found', 'info');
            return;
        }

        // CSV-otsikot ja rivien generointi
        const headers = ['ID', 'Date', 'Player 1', 'Player 2', 'Winner', 'P1 Score', 'P2 Score', 'Tournament'];
        const csvRows = [headers.join(',')];

        data.forEach(m => {
            const row = [m.id, m.created_at, m.player1, m.player2, m.winner, m.player1_score, m.player2_score, m.tournament_name];
            csvRows.push(row.map(v => `"${v || ''}"`).join(','));
        });

        // Luodaan tiedosto ja käynnistetään lataus
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `subsoccer_match_logs_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showNotification('Logs downloaded successfully!', 'success');
    } catch (e) {
        showNotification('Download failed: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

export async function resetGlobalLeaderboard() {
    if (!isAdmin()) {
        showNotification("Access denied: Admin privileges required.", "error");
        return;
    }

    const confirmReset = confirm('⚠️ WARNING: This will reset ALL players to 1300 ELO. This action cannot be undone. Proceed?');
    if (!confirmReset) return;

    showLoading('Resetting ELOs...');
    try {
        // Päivitetään kaikki pelaajat (käytetään ehtoa joka täsmää kaikkiin)
        const { error } = await _supabase
            .from('players')
            .update({ elo: 1300, wins: 0, losses: 0 })
            .neq('username', 'SYSTEM_RESERVED_NAME');

        if (error) throw error;
        if (error) throw error;
        showNotification('Leaderboard reset successfully', 'success');
    } catch (e) {
        showNotification('Reset failed: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

export async function refreshTrackingAnalytics() {
    if (!isAdmin()) {
        showNotification("Access denied: Admin privileges required.", "error");
        return;
    }

    const tbody = document.getElementById('mod-tracking-list');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center;">Loading data from Supabase...</td></tr>';

    try {
        let { data: events, error } = await _supabase
            .from('public_tracking')
            .select('*')
            .order('client_time', { ascending: false })
            .limit(500);

        if (error) throw error;

        if (!events || events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center;">No tracking data found yet.</td></tr>';
            return;
        }

        let opens = 0;
        let finished = 0;
        let codeCounts = {};
        let html = '';

        events.forEach(ev => {
            if (ev.event_type === 'app_opened') opens++;
            if (ev.event_type === 'game_finished') finished++;

            const code = ev.game_code || 'Unknown';
            codeCounts[code] = (codeCounts[code] || 0) + 1;

            let badgeClass = ev.event_type === 'game_finished' ? 'background:#E30613; padding:2px 4px; border-radius:3px;' : 'background:#4CAF50; padding:2px 4px; border-radius:3px;';
            let typeLabel = ev.event_type === 'game_finished' ? 'GAME FINISHED' : 'APP OPENED';
            let dateStr = new Date(ev.client_time).toLocaleString();
            let returningBadge = ev.is_returning ? '<span style="color:#00FFCC; font-weight:bold;">PRO</span>' : '<span style="color:#888;">NEW</span>';
            let durationText = ev.session_duration ? Math.floor(ev.session_duration / 60) + 'm ' + (ev.session_duration % 60) + 's' : '-';

            html += `
                <tr style="border-bottom:1px solid #222;">
                    <td style="padding:10px; color:#888;">${dateStr.split(',')[1]}</td>
                    <td style="padding:10px;"><span style="${badgeClass} color:#fff; font-size:0.75rem; font-weight:bold;">${typeLabel}</span></td>
                    <td style="padding:10px; font-weight:bold; color:var(--sub-gold);">${code}</td>
                    <td style="padding:10px;">${returningBadge}</td>
                    <td style="padding:10px;"><span style="font-size:0.8rem; background:#333; padding:2px 5px; border-radius:3px;">${ev.browser_lang || '-'}</span></td>
                    <td style="padding:10px; color:#00FFCC;">${ev.location || 'Unknown'}</td>
                    <td style="padding:10px; color:#FFD700; font-family:'Jockey One', sans-serif;">${durationText}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        document.getElementById('mod-total-opens').textContent = opens;
        document.getElementById('mod-total-finished').textContent = finished;

        let topCode = '-';
        let maxCount = 0;
        for (const [code, count] of Object.entries(codeCounts)) {
            if (count > maxCount) { maxCount = count; topCode = code; }
        }
        document.getElementById('mod-top-code').textContent = topCode;

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="7" style="padding:20px; color:red; text-align:center;">Error: ${err.message}</td></tr>`;
    }
}

export async function exportTrackingCSV() {
    if (!isAdmin()) {
        showNotification("Access denied: Admin privileges required.", "error");
        return;
    }

    showLoading('Generating CSV logs...');
    try {
        const { data, error } = await _supabase
            .from('public_tracking')
            .select('*')
            .order('client_time', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            showNotification('No tracking data found', 'info');
            return;
        }

        const headers = ['ID', 'Client Time', 'Event Type', 'Game Code', 'Score', 'Source Partner', 'Location', 'Is Returning', 'Language', 'Duration (s)'];
        const csvRows = [headers.join(',')];

        data.forEach(m => {
            const row = [
                m.id, 
                m.client_time, 
                m.event_type, 
                m.game_code, 
                m.score, 
                m.source_partner, 
                m.location, 
                m.is_returning, 
                m.browser_lang, 
                m.session_duration
            ];
            csvRows.push(row.map(v => `"${v === null || v === undefined ? '' : String(v).replace(/"/g, '""')}"`).join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `subsoccer_qr_analytics_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showNotification('Analytics downloaded successfully!', 'success');
    } catch (e) {
        showNotification('Download failed: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

export function setupModeratorListeners() {
    document.getElementById('btn-mod-partner-gen')?.addEventListener('click', () => {
        showPartnerLinkGenerator();
    });
    document.getElementById('btn-mod-view-users')?.addEventListener('click', () => {
        viewAllUsers();
    });
    document.getElementById('btn-mod-download-logs')?.addEventListener('click', () => {
        downloadSystemLogs();
    });
    document.getElementById('btn-mod-reset-lb')?.addEventListener('click', () => {
        resetGlobalLeaderboard();
    });
    document.getElementById('btn-refresh-tracking')?.addEventListener('click', () => {
        refreshTrackingAnalytics();
    });
    document.getElementById('btn-export-tracking')?.addEventListener('click', () => {
        exportTrackingCSV();
    });
    // Auto-load if tab is opened? We can just hook up a click event on the mod tab.
    document.getElementById('menu-item-moderator')?.addEventListener('click', () => {
        if (isAdmin()) {
            refreshTrackingAnalytics();
        }
    });
}