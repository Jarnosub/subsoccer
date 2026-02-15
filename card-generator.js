import { showNotification } from './ui-utils.js';

/**
 * CardGenerator Service
 * Handles capturing DOM elements as images and sharing them.
 */
export const CardGenerator = {
    async capture(elementId) {
        const element = document.querySelector(`#${elementId} .topps-collectible-card`) || 
                        document.querySelector(`#${elementId} .pro-card`);
        
        if (!element) {
            console.error("Card element not found in:", elementId);
            return null;
        }

        try {
            // Reset tilt before capture to avoid distortion in the image
            const originalTransform = element.style.transform;
            element.style.transform = 'none';

            await document.fonts.ready;
            const canvas = await html2canvas(element, {
                useCORS: true,
                scale: 3, // High resolution for social media
                backgroundColor: "#0a0a0a"
            });

            // Restore transform after capture
            element.style.transform = originalTransform;

            return canvas.toDataURL('image/png');
        } catch (err) {
            console.error("Failed to generate card image:", err);
            return null;
        }
    },

    async share(dataUrl, playerName) {
        if (navigator.share) {
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], `subsoccer-${playerName}.png`, { type: 'image/png' });
            try {
                await navigator.share({
                    title: `Subsoccer Pro Card: ${playerName}`,
                    text: `Check out my official Subsoccer Pro Card! ⚽🔥`,
                    files: [file]
                });
            } catch (err) {
                if (err.name !== 'AbortError') showNotification("Sharing failed", "error");
            }
        } else {
            const link = document.createElement('a');
            link.download = `subsoccer-${playerName}.png`;
            link.href = dataUrl;
            link.click();
            showNotification("Card downloaded!", "success");
        }
    }
};

window.CardGenerator = CardGenerator;