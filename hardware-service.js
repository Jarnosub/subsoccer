import { _supabase } from './config.js';
import { showNotification, showLoading, hideLoading } from './ui-utils.js';

export function setupHardwareGarage() {
    window.openHardwareClaimModal = () => {
        document.getElementById('hardware-serial-input').value = '';
        document.getElementById('hardware-claim-message').innerText = '';
        document.getElementById('hardware-claim-modal').style.display = 'flex';
    };

    const submitBtn = document.getElementById('btn-submit-hardware-claim');
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const serialInput = document.getElementById('hardware-serial-input').value.trim();
            const locationInput = document.getElementById('hardware-location-input').value;
            const messageBox = document.getElementById('hardware-claim-message');

            if (!serialInput) {
                messageBox.style.color = '#ff4444';
                messageBox.innerText = 'Please enter a valid serial number.';
                return;
            }

            try {
                messageBox.style.color = 'var(--sub-gold)';
                messageBox.innerText = 'Verifying hardware...';
                showLoading('Activating Device...');

                const { data, error } = await _supabase.rpc('claim_hardware', {
                    target_serial_number: serialInput,
                    claim_location_type: locationInput
                });

                if (error) {
                    console.error("Hardware claim RPC error:", error);
                    throw new Error("Server error while claiming hardware.");
                }

                if (data && data.success) {
                    document.getElementById('hardware-claim-modal').style.display = 'none';
                    showNotification(`Successfully activated ${data.device.model}!`, 'success');
                    
                    // Refresh the garage list
                    loadHardwareGarage();
                } else {
                    messageBox.style.color = '#ff4444';
                    messageBox.innerText = data.error || 'Failed to claim device.';
                }
            } catch (err) {
                console.error("Hardware claim exception:", err);
                messageBox.style.color = '#ff4444';
                messageBox.innerText = err.message || 'Error communicating with the server.';
            } finally {
                hideLoading();
            }
        });
    }
}

export async function loadHardwareGarage() {
    const listContainer = document.getElementById('hardware-garage-list');
    if (!listContainer) return;

    try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (!user) return;

        const { data: hardware, error } = await _supabase
            .from('hardware_registry')
            .select('*')
            .eq('owner_id', user.id)
            .order('claimed_at', { ascending: false });

        if (error) {
            console.error("Failed to load hardware garage:", error);
            return;
        }

        if (!hardware || hardware.length === 0) {
            listContainer.innerHTML = '<div style="font-size:0.75rem; color:#888;">No registered tables or devices yet.</div>';
            return;
        }

        let html = '';
        for (const item of hardware) {
            const icon = item.product_category === 'dock' ? 'fa-hdd' : 'fa-chess-board';
            const color = item.product_category === 'dock' ? '#4CAF50' : 'var(--sub-gold)';

            html += `
                <div style="background:#222; padding:10px 15px; border-radius:6px; border:1px solid #333; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <i class="fa-solid ${icon}" style="color:${color}; font-size:1.2rem;"></i>
                        <div>
                            <div style="color:#fff; font-family:'SubsoccerLogo', sans-serif; font-size:0.9rem;">${item.product_model}</div>
                            <div style="color:#888; font-family:monospace; font-size:0.7rem; letter-spacing:1px;">SN: ${item.serial_number}</div>
                        </div>
                    </div>
                    <div style="color:#aaa; font-size:0.7rem;">
                        <i class="fa-solid fa-check-circle" style="color:green;"></i> ACTIVE
                    </div>
                </div>
            `;
        }

        listContainer.innerHTML = html;

    } catch (err) {
        console.error("Error drawing garage:", err);
    }
}
