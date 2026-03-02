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

    async captureStory(elementId, playerName) {
        const element = document.querySelector(`#${elementId} .topps-collectible-card`) ||
            document.querySelector(`#${elementId} .pro-card`);

        if (!element) return null;

        try {
            // Setup hidden temporary container for story formatting (9:16)
            const temp = document.createElement('div');
            temp.style.position = 'absolute';
            temp.style.left = '-9999px';
            temp.style.width = '1080px';
            temp.style.height = '1920px'; // 9:16 Aspect

            // Pillar 5: Social Currency Background
            temp.style.background = 'radial-gradient(circle at 10% 20%, #1a0000 0%, #0a0a0a 50%), radial-gradient(circle at 90% 80%, rgba(227,6,19,0.2) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(255,215,0,0.1) 0%, transparent 80%)';
            temp.style.backgroundColor = '#050505';
            temp.style.display = 'flex';
            temp.style.flexDirection = 'column';
            temp.style.alignItems = 'center';
            temp.style.justifyContent = 'center';
            temp.style.padding = '80px';
            temp.style.position = 'relative';
            temp.style.overflow = 'hidden';

            // Add background logo watermark
            const watermark = document.createElement('div');
            watermark.innerHTML = '<img src="logo.png" style="width:800px; opacity:0.05; transform:rotate(-15deg); filter:grayscale(100%);">';
            watermark.style.position = 'absolute';
            watermark.style.top = '30%';
            watermark.style.pointerEvents = 'none';
            temp.appendChild(watermark);

            // Subsoccer Header for the Story
            const header = document.createElement('div');
            header.innerHTML = `
                <div style="font-family:'Russo One'; color:var(--sub-gold); font-size:40px; letter-spacing:15px; text-transform:uppercase; margin-bottom:10px;">SUBSOCCER</div>
                <h1 style="color:#fff; font-family:'Russo One'; font-size: 100px; margin-bottom: 20px; line-height:1; text-shadow: 0 10px 30px rgba(0,0,0,0.8);">NEW PRO <span style="color:var(--sub-red);">RANK</span></h1>
            `;
            header.style.textAlign = 'center';
            header.style.marginBottom = '80px';
            header.style.zIndex = '10';
            temp.appendChild(header);

            // Clone the card and strip interactive styles
            const clone = element.cloneNode(true);
            clone.style.transform = 'scale(1.2)'; // Make the card massive for the story
            clone.style.margin = '40px 0';
            clone.style.boxShadow = '0 50px 100px rgba(0,0,0,0.9), 0 0 50px rgba(255,215,0,0.2)'; // Gold glow
            clone.style.zIndex = '10';
            temp.appendChild(clone);

            // Footer / Branding
            const footer = document.createElement('div');
            footer.innerHTML = `
                <div style="display:inline-block; border: 2px solid var(--sub-gold); padding: 15px 40px; border-radius:30px; margin-top:100px; background: rgba(0,0,0,0.5);">
                    <p style="color:#fff; font-size:35px; margin:0; font-family:'Resolve'; text-transform:uppercase; letter-spacing:3px;">
                        <span style="color:var(--sub-gold);">⭐</span> VERIFIED PRO
                    </p>
                </div>
                <p style="color:#666; font-size:25px; margin-top:30px; font-family:'Resolve'; letter-spacing:5px;">SUBSOCCER.COM</p>
            `;
            footer.style.textAlign = 'center';
            footer.style.zIndex = '10';
            temp.appendChild(footer);

            document.body.appendChild(temp);

            const canvas = await html2canvas(temp, { useCORS: true, scale: 1 });
            document.body.removeChild(temp);

            return canvas.toDataURL('image/png');
        } catch (err) {
            console.error("Story capture failed:", err);
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