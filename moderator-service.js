import { showModal, showNotification, showLoading, hideLoading } from './ui-utils.js';
import { _supabase } from './config.js';

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
            .select('username, elo, wins, losses, country, created_at')
            .order('username');

        if (error) throw error;

        const html = `
            <div style="max-height: 400px; overflow-y: auto; padding-right: 5px;">
                ${data.map(u => `
                    <div style="background:#111; padding:12px; border-radius:4px; margin-bottom:8px; border-left:3px solid var(--sub-gold); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-family:'Resolve'; color:#fff; font-size:0.9rem;">${u.username}</div>
                            <div style="font-size:0.7rem; color:#666;">${u.country?.toUpperCase() || 'FI'} • Joined ${new Date(u.created_at).toLocaleDateString()}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="color:var(--sub-gold); font-family:'Resolve'; font-size:1rem;">${u.elo}</div>
                            <div style="font-size:0.6rem; color:#444;">W:${u.wins} L:${u.losses || 0}</div>
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

export async function downloadSystemLogs() {
    const pwd = prompt("Syötä moderaattorin salasana ladataaksesi lokit:");
    if (pwd === null) return;
    
    if (pwd !== "admin123") {
        showNotification("Väärä salasana!", "error");
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
    const pwd = prompt("Syötä moderaattorin salasana vahvistaaksesi nollauksen:");
    if (pwd === null) return; // Käyttäjä peruutti
    
    if (pwd !== "admin123") { // Voit vaihtaa tämän haluamaasi salasanaan
        showNotification("Väärä salasana!", "error");
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
        showNotification('Leaderboard reset successfully', 'success');
    } catch (e) {
        showNotification('Reset failed: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}