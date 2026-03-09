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
            this.canvas.style.opacity = '0.6'; // Parannettu kameran näkyvyys
            document.body.insertBefore(this.canvas, document.body.firstChild);
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

            // Päivitä kameran koko ruudun käännöissä
            window.addEventListener('resize', () => {
                if (this.video && this.video.videoWidth) {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                }
            });
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
                zone.color = 'rgba(0, 255, 204, 1.0)'; // Neon osumaväri, voimakkaampi glow
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

            // Hehku (glow) efekti maalille
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = zone.color;
            this.ctx.strokeStyle = zone.color;
            this.ctx.lineWidth = 6;

            // Piirretään scifi-tyyliset kulmat koko laatikon sijaan
            const cornerLength = w * 0.25;
            this.ctx.beginPath();

            // Ylä-vasen
            this.ctx.moveTo(x, y + cornerLength);
            this.ctx.lineTo(x, y);
            this.ctx.lineTo(x + cornerLength, y);

            // Ylä-oikea
            this.ctx.moveTo(x + w - cornerLength, y);
            this.ctx.lineTo(x + w, y);
            this.ctx.lineTo(x + w, y + cornerLength);

            // Ala-oikea
            this.ctx.moveTo(x + w, y + h - cornerLength);
            this.ctx.lineTo(x + w, y + h);
            this.ctx.lineTo(x + w - cornerLength, y + h);

            // Ala-vasen
            this.ctx.moveTo(x + cornerLength, y + h);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h - cornerLength);

            this.ctx.stroke();

            // Tähtäimen risti keskelle - siro
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x + w / 2, y + h / 2 - 15);
            this.ctx.lineTo(x + w / 2, y + h / 2 + 15);
            this.ctx.moveTo(x + w / 2 - 15, y + h / 2);
            this.ctx.lineTo(x + w / 2 + 15, y + h / 2);
            this.ctx.stroke();

            // Lisätään selkeä teksti telineen maaleihin
            this.ctx.shadowBlur = 0; // Teksti ilman rajua hehkua
            this.ctx.font = "bold 24px 'Russo One', sans-serif";
            this.ctx.fillStyle = zone.color;
            this.ctx.textAlign = "center";
            this.ctx.fillText("TARGET GOAL", x + w / 2, y - 10);
        });

        // Nollataan lopuksi shadow, jottei se vaikuta muihin
        this.ctx.shadowBlur = 0;
    }
}

window.visionEngine = new VisionEngine();
