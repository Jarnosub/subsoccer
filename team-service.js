import { _supabase, state, FLAGS } from './config.js';
import { showNotification, showModal, closeModal } from './ui-utils.js';
import { updateProfileCard } from './profile-ui.js';

/**
 * Initializes the Teams UI in the profile dashboard
 */
export async function initTeamUI() {
    if (!FLAGS.ENABLE_TEAMS) return; // Feature flag

    const container = document.getElementById('profile-team-ui');
    if (!container) return;

    if (!state.user || state.user.id === 'guest') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    if (state.user.team_id) {
        await renderMyTeam(container);
    } else {
        renderNoTeam(container);
    }
}

function renderNoTeam(container) {
    container.innerHTML = `
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
    `;

    // Bind search event
    const searchInput = document.getElementById('team-search-input');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            if (e.target.value.trim().length < 2) {
                document.getElementById('team-search-results').innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(() => searchTeams(e.target.value.trim()), 500);
        });
    }
}

async function searchTeams(query) {
    const resultsContainer = document.getElementById('team-search-results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '<div style="color:#666; font-size:0.8rem; margin-top:10px;">Searching...</div>';

    try {
        const { data, error } = await _supabase
            .from('teams')
            .select('*')
            .or(`name.ilike.%${query}%,tag.ilike.%${query}%`)
            .limit(5);

        if (error) throw error;

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<div style="color:#666; font-size:0.8rem; margin-top:10px;">No teams found</div>';
            return;
        }

        resultsContainer.innerHTML = data.map(team => `
            <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.5); padding: 12px; border-radius: 4px; border: 1px solid #333; margin-top: 10px;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    ${team.logo_url
                ? `<img src="${team.logo_url}" style="width:24px; height:24px; border-radius: 4px; object-fit: cover;">`
                : `<div style="width:24px; height:24px; border-radius:4px; background:#222; display:flex; justify-content:center; align-items:center; color: var(--sub-gold); font-size: 0.6rem;"><i class="fa-solid fa-shield"></i></div>`
            }
                    <div>
                        <div style="font-weight:bold; font-size: 0.9rem;">[${team.tag}] ${team.name}</div>
                        <div style="color:var(--sub-gold); font-size: 0.75rem;"><i class="fa-solid fa-star"></i> ${team.combined_elo}</div>
                    </div>
                </div>
                <button style="background:transparent; border:1px solid var(--sub-red); color:var(--sub-red); padding: 5px 10px; border-radius:4px; cursor:pointer;" onclick="window.joinTeam('${team.id}', '${team.name}')">JOIN</button>
            </div>
        `).join('');
    } catch (e) {
        console.error("Team search failed:", e);
        resultsContainer.innerHTML = '<div style="color:var(--sub-red); font-size:0.8rem; margin-top:10px;">Failed to search teams</div>';
    }
}

async function renderMyTeam(container) {
    if (!state.user.team_id) return;

    try {
        container.innerHTML = `<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

        // Fetch team
        const { data: team, error } = await _supabase
            .from('teams')
            .select('*')
            .eq('id', state.user.team_id)
            .single();

        if (error || !team) throw error || new Error("Team not found");

        // Fetch members
        const { data: members, error: memErr } = await _supabase
            .from('players')
            .select('id, username, elo, avatar_url')
            .eq('team_id', team.id)
            .order('elo', { ascending: false });

        if (memErr) throw memErr;

        // Recalculate and update combined ELO if out of sync
        const totalElo = members.reduce((sum, p) => sum + p.elo, 0);
        if (team.combined_elo !== totalElo) {
            await _supabase.from('teams').update({ combined_elo: totalElo }).eq('id', team.id);
            team.combined_elo = totalElo;
        }

        const isCaptain = team.captain_id === state.user.id;

        const logoHtml = team.logo_url
            ? `<img src="${team.logo_url}" style="width:80px; height:80px; border-radius: 12px; border: 2px solid var(--sub-gold); object-fit: cover; margin-bottom: 15px;">`
            : `<div style="width:80px; height:80px; border-radius:12px; background:linear-gradient(135deg, #222, #000); border: 2px solid var(--sub-gold); display:flex; justify-content:center; align-items:center; color: var(--sub-gold); font-size: 2.5rem; margin: 0 auto 15px auto;"><i class="fa-solid fa-shield"></i></div>`;

        container.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255,215,0,0.2); border-radius: 12px; padding: 25px 15px; text-align: center; margin-top: 20px;">
                ${logoHtml}
                <div style="color: var(--sub-gold); font-size: 0.8rem; font-weight: bold; letter-spacing: 2px;">[${team.tag}]</div>
                <h3 style="font-family: 'Russo One', sans-serif; font-size: 1.5rem; color: #fff; margin: 5px 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">${team.name}</h3>
                
                <div style="background: rgba(0,0,0,0.5); border-radius: 8px; padding: 15px; margin-bottom: 20px; display:flex; justify-content:space-around;">
                    <div>
                        <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Members</div>
                        <div style="color:#fff; font-size:1.2rem; font-family:'Russo One';">${members.length}</div>
                    </div>
                    <div>
                        <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Team ELO</div>
                        <div style="color:var(--sub-gold); font-size:1.2rem; font-family:'Russo One';">${team.combined_elo}</div>
                    </div>
                </div>
                
                <div style="text-align:left; margin-bottom:15px;">
                    <div style="font-family:'Resolve'; font-size:0.8rem; color:#888; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">ROSTER</div>
                    ${members.map(m => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <div style="display:flex; align-items:center; gap: 10px;">
                                ${m.avatar_url ? `<img src="${m.avatar_url}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">` : `<i class="fa-solid fa-user-circle" style="color:#555; font-size:24px;"></i>`}
                                <span style="font-size: 0.95rem; color: ${m.id === team.captain_id ? 'var(--sub-gold)' : '#fff'};">
                                    ${m.username} ${m.id === team.captain_id ? '<i class="fa-solid fa-crown" style="font-size:0.7rem; margin-left:3px;"></i>' : ''}
                                </span>
                            </div>
                            <div style="color: #aaa; font-size:0.85rem;">${m.elo}</div>
                        </div>
                    `).join('')}
                </div>
                
                <button class="btn-outline" style="background:transparent; border:1px solid #555; color:#aaa; font-size:0.8rem; padding: 10px; width: 100%; letter-spacing:1px; margin-top:10px; border-radius:4px; cursor:pointer;" onclick="window.leaveTeam()">
                    LEAVE TEAM
                </button>
            </div>
        `;
    } catch (e) {
        console.error("Failed to load team data", e);
        container.innerHTML = `<div style="color:var(--sub-red);">Error loading team</div>`;
    }
}

export function showCreateTeamModal() {
    const modalHtml = `
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
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

export async function submitNewTeam() {
    const name = document.getElementById('new-team-name')?.value.trim();
    const tag = document.getElementById('new-team-tag')?.value.trim().toUpperCase();
    const btn = document.getElementById('btn-submit-team');

    if (!name || name.length < 3) return showNotification("Team name must be at least 3 characters", "error");
    if (!tag || tag.length < 2 || tag.length > 4) return showNotification("Tag must be 2-4 characters", "error");

    btn.disabled = true;
    btn.textContent = "CREATING...";

    try {
        // 1. Check if name exists
        const { data: existing } = await _supabase.from('teams').select('id').ilike('name', name).maybeSingle();
        if (existing) {
            btn.disabled = false;
            btn.textContent = "CREATE";
            return showNotification("Team name already taken", "error");
        }

        // 2. Insert new team
        const { data: newTeam, error: createErr } = await _supabase
            .from('teams')
            .insert({
                name: name,
                tag: tag,
                captain_id: state.user.id,
                combined_elo: state.user.elo
            })
            .select()
            .single();

        if (createErr) throw createErr;

        // 3. Update player's team
        const { error: updateErr } = await _supabase
            .from('players')
            .update({ team_id: newTeam.id })
            .eq('id', state.user.id);

        if (updateErr) throw updateErr;

        // 4. Update local state
        state.user = { ...state.user, team_id: newTeam.id, team_data: newTeam };
        localStorage.setItem('subsoccer-user', JSON.stringify(state.user));

        document.getElementById('create-team-modal')?.remove();
        showNotification("Team created!", "success");
        initTeamUI();
        updateProfileCard(); // Refreshes the 3D card with the new tag

    } catch (e) {
        console.error("Error creating team:", e);
        showNotification("Failed to create team", "error");
        btn.disabled = false;
        btn.textContent = "CREATE";
    }
}

export async function joinTeam(teamId, teamName) {
    if (!confirm(`Join ${teamName}?`)) return;

    try {
        // Fetch current team ELO before joining
        const { data: teamData } = await _supabase.from('teams').select('combined_elo').eq('id', teamId).single();

        const { error } = await _supabase
            .from('players')
            .update({ team_id: teamId })
            .eq('id', state.user.id);

        if (error) throw error;

        // Fetch full team data to put in local state
        const { data: fullTeam } = await _supabase.from('teams').select('*').eq('id', teamId).single();

        state.user = { ...state.user, team_id: teamId, team_data: fullTeam };
        localStorage.setItem('subsoccer-user', JSON.stringify(state.user));

        // Update combined ELO
        if (teamData) {
            await _supabase.from('teams').update({ combined_elo: teamData.combined_elo + state.user.elo }).eq('id', teamId);
        }

        showNotification(`Joined ${teamName}!`, "success");
        document.getElementById('team-search-input').value = '';
        initTeamUI();
        updateProfileCard();

    } catch (e) {
        console.error("Error joining team:", e);
        showNotification("Failed to join team", "error");
    }
}

export async function leaveTeam() {
    if (!confirm(`Are you sure you want to leave your team?`)) return;

    try {
        const teamId = state.user.team_id;

        const { error } = await _supabase
            .from('players')
            .update({ team_id: null })
            .eq('id', state.user.id);

        if (error) throw error;

        // We'll let the next member load or a background job correct the team ELO properly,
        // or just subtract it now.
        const { data: teamData } = await _supabase.from('teams').select('combined_elo, captain_id').eq('id', teamId).single();
        if (teamData) {
            await _supabase.from('teams').update({ combined_elo: Math.max(0, teamData.combined_elo - state.user.elo) }).eq('id', teamId);

            // If captain left, we really should disband or reassign, but for MVP:
            // if captain, maybe disband. Let's keep it simple: no disbanding explicitly yet, just leave.
        }

        state.user = { ...state.user, team_id: null, team_data: null };
        localStorage.setItem('subsoccer-user', JSON.stringify(state.user));

        showNotification(`You left the team`, "success");
        initTeamUI();
        updateProfileCard();

    } catch (e) {
        console.error("Error leaving team:", e);
        showNotification("Failed to leave team", "error");
    }
}

// Map globals for HTML access
window.showCreateTeamModal = showCreateTeamModal;
window.submitNewTeam = submitNewTeam;
window.joinTeam = joinTeam;
window.leaveTeam = leaveTeam;
