// ============================================================
// SUBSOCCER VISION ENGINE - Computer Vision Goal Detection
// Proof of Concept: Uses back camera to detect color changes (Subsoccer Red)
// ============================================================

class VisionEngine {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.stream = null;
        this.isScanning = false;

        // Konfiguroitavat alueet
        this.zones = [
            { id: 'top-left', x: 0.1, y: 0.1, width: 0.2, height: 0.2, color: 'rgba(255, 215, 0, 0.5)' },
            { id: 'top-right', x: 0.7, y: 0.1, width: 0.2, height: 0.2, color: 'rgba(255, 215, 0, 0.5)' },
            { id: 'bottom-left', x: 0.1, y: 0.7, width: 0.2, height: 0.2, color: 'rgba(255, 215, 0, 0.5)' },
            { id: 'bottom-right', x: 0.7, y: 0.7, width: 0.2, height: 0.2, color: 'rgba(255, 215, 0, 0.5)' }
        ];

        // Tunnistuksen herkkyysasetukset
        this.subsoccerRedTarget = { r: 227, g: 6, b: 19 }; // Subsoccerin pallo (#e30613)
        this.tolerance = 60; // RGB toleranssi per värikanava
        this.pixelThreshold = 0.05; // 5% alueen pikseleistä pitää muuttua pallon väriseksi

        // Tilanhallinta
        this.lastDetections = {};
        this.zones.forEach(z => this.lastDetections[z.id] = 0);
        this.COOLDOWN_MS = 1500;

        this.onTargetHit = null; // Takaisinkutsufunktio kun osuma tapahtuu
    }

    async init() {
        if (!this.video) {
            this.video = document.createElement('video');
            this.video.setAttribute('playsinline', '');
            this.video.setAttribute('autoplay', '');
            this.video.muted = true;
            this.video.style.display = 'none';
            document.body.appendChild(this.video);
        }

        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'vision-canvas';
            this.canvas.style.position = 'fixed';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.width = '100vw';
            this.canvas.style.height = '100vh';
            this.canvas.style.zIndex = '0'; // Taustalla pelin takana
            this.canvas.style.objectFit = 'cover';
            this.canvas.style.opacity = '0.3'; // Näkyy himmeästi läpi arcade-ruudun takaa
            document.body.insertBefore(this.canvas, document.body.firstChild);
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        }
    }

    async startCamera() {
        try {
            await this.init();

            // Pyydä puhelimen takakameraa
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });

            this.video.srcObject = this.stream;

            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    this.isScanning = true;
                    this.appLoop();
                    resolve(true);
                };
            });
        } catch (err) {
            console.error("Camera error:", err);
            return false;
        }
    }

    stopCamera() {
        this.isScanning = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    appLoop() {
        if (!this.isScanning) return;

        // Piirrä videokuva kankaalle
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        this.analyseFrame();
        this.drawOverlay();

        requestAnimationFrame(() => this.appLoop());
    }

    analyseFrame() {
        const now = Date.now();

        this.zones.forEach((zone, index) => {
            // Laske alueen fysiologiset rajat kankaalla
            const x = Math.floor(zone.x * this.canvas.width);
            const y = Math.floor(zone.y * this.canvas.height);
            const w = Math.floor(zone.width * this.canvas.width);
            const h = Math.floor(zone.height * this.canvas.height);

            // Jos liian nopea, ohita
            if (now - this.lastDetections[zone.id] < this.COOLDOWN_MS) return;

            // Ota kuvadataa laatikon alueelta
            const imageData = this.ctx.getImageData(x, y, w, h);
            const data = imageData.data;

            let matchCount = 0;
            const totalPixels = data.length / 4;

            // Etsi pallon punaista
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                if (Math.abs(r - this.subsoccerRedTarget.r) < this.tolerance &&
                    Math.abs(g - this.subsoccerRedTarget.g) < this.tolerance &&
                    Math.abs(b - this.subsoccerRedTarget.b) < this.tolerance) {
                    matchCount++;
                }
            }

            // Jos löydettiin tarpeeksi pallon väriä (esim pallo peittää reitin)
            if (matchCount / totalPixels > this.pixelThreshold) {
                this.lastDetections[zone.id] = now;

                // Visuaalinen indikaattori onnistumisesta (väläyttää laatikkoa)
                zone.color = 'rgba(0, 255, 204, 0.8)'; // Neon osumaväri
                setTimeout(() => { zone.color = 'rgba(255, 215, 0, 0.5)'; }, 500);

                if (this.onTargetHit) {
                    this.onTargetHit(zone.id, index);
                }
            }
        });
    }

    drawOverlay() {
        this.zones.forEach(zone => {
            const x = zone.x * this.canvas.width;
            const y = zone.y * this.canvas.height;
            const w = zone.width * this.canvas.width;
            const h = zone.height * this.canvas.height;

            this.ctx.strokeStyle = zone.color;
            this.ctx.lineWidth = 4;
            this.ctx.strokeRect(x, y, w, h);

            // Tähtäimen risti keskelle
            this.ctx.beginPath();
            this.ctx.moveTo(x + w / 2, y + h / 2 - 10);
            this.ctx.lineTo(x + w / 2, y + h / 2 + 10);
            this.ctx.moveTo(x + w / 2 - 10, y + h / 2);
            this.ctx.lineTo(x + w / 2 + 10, y + h / 2);
            this.ctx.stroke();
        });
    }
}

window.visionEngine = new VisionEngine();
