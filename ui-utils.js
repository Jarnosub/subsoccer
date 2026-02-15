/**
 * SUBSOCCER UI UTILITIES
 * Basic UI functions with no dependencies to break circular loops.
 */

/**
 * Tagged template for safe HTML rendering.
 * Usage: container.innerHTML = safeHTML`<div>${userInput}</div>`;
 */
export function safeHTML(strings, ...values) {
    const escape = (str) => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    return strings.reduce((acc, str, i) => 
        acc + str + (values[i] !== undefined ? escape(values[i]) : ''), '');
}

export function showNotification(message, type = 'error') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = `toast-notification ${type}`;
    notification.innerText = message;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
}

export function showLoading(message = 'Loading...') {
    let loader = document.getElementById('loading-overlay');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'loading-overlay';
        loader.innerHTML = '<div class="spinner"></div><div id="loading-text" style="font-family:var(--sub-name-font); color:var(--sub-gold); letter-spacing:2px; text-transform:uppercase; font-size:0.8rem;"></div>';
        document.body.appendChild(loader);
    }
    const textEl = document.getElementById('loading-text');
    if (textEl) textEl.innerText = message;
    loader.style.display = 'flex';
}

export function hideLoading() {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = 'none';
}

export async function handleAsync(promise, successMsg = null) {
    try {
        showLoading();
        const result = await promise;
        if (successMsg) showNotification(successMsg, 'success');
        return [result, null];
    } catch (error) {
        showNotification(error.message || 'An unexpected error occurred', 'error');
        return [null, error];
    } finally {
        hideLoading();
    }
}

export function showModal(title, content, options = {}) {
    const modalId = options.id || 'generic-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        document.body.appendChild(modal);
    }
    modal.className = 'modal-overlay';
    const maxWidth = options.maxWidth || '500px';
    const borderColor = options.borderColor || 'var(--sub-gold)';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: ${maxWidth}; border-color: ${borderColor};">
            <div class="modal-header">
                <h3 style="color: ${borderColor};">${title}</h3>
                <button class="modal-close" data-close-modal="${modalId}">&times;</button>
            </div>
            <div class="modal-body">${content}</div>
        </div>
    `;
    modal.style.display = 'flex';
    modal.onclick = (e) => { if (e.target === modal) closeModal(modalId); };
    document.body.style.overflow = 'hidden';
    
    // Add listener to the close button
    const closeBtn = modal.querySelector(`[data-close-modal="${modalId}"]`);
    if (closeBtn) closeBtn.onclick = () => closeModal(modalId);
}

export function closeModal(id = 'generic-modal') {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
    const openModals = document.querySelectorAll('.modal-overlay[style*="display: flex"]');
    if (openModals.length === 0) document.body.style.overflow = '';
}

// Make available globally for legacy/inline calls
window.showNotification = showNotification;
window.showLoading = showLoading;
window.hideLoading = hideLoading;