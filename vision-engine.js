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
            { id: 'top-left', x: 0.1, y: 0.1, width: 0.2, height: 0.2, hitAnimationTime: 0 },
            { id: 'top-right', x: 0.7, y: 0.1, width: 0.2, height: 0.2, hitAnimationTime: 0 },
            { id: 'bottom-left', x: 0.1, y: 0.7, width: 0.2, height: 0.2, hitAnimationTime: 0 },
            { id: 'bottom-right', x: 0.7, y: 0.7, width: 0.2, height: 0.2, hitAnimationTime: 0 }
        ];

        // Tunnistuksen herkkyysasetukset
        this.subsoccerRedTarget = { r: 227, g: 6, b: 19 }; // Subsoccerin pallo (#e30613)
        this.tolerance = 60; // Ei enää suorassa käytössä uudistetussa laskennassa
        this.pixelThreshold = 0.02; // 2% alueen pikseleistä pitää muuttua pallon väriseksi

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
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
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
                    // Aseta canvas täsmälleen laitteen näytön pikselikokoon
                    this.canvas.width = window.innerWidth;
                    this.canvas.height = window.innerHeight;
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

        // Laske cover-skaalaus videolle jotta se täyttää koko näytön leikkaamalla ylimääräiset (kuten CSS object-fit: cover)
        const canvasRatio = this.canvas.width / this.canvas.height;
        const videoRatio = this.video.videoWidth / this.video.videoHeight;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (canvasRatio > videoRatio) {
            drawWidth = this.canvas.width;
            drawHeight = this.canvas.width / videoRatio;
            offsetX = 0;
            offsetY = (this.canvas.height - drawHeight) / 2;
        } else {
            drawHeight = this.canvas.height;
            drawWidth = this.canvas.height * videoRatio;
            offsetX = (this.canvas.width - drawWidth) / 2;
            offsetY = 0;
        }

        // Piirrä videokuva kankaalle leikatussa koossa
        this.ctx.drawImage(this.video, offsetX, offsetY, drawWidth, drawHeight);

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

                // Parannettu väritunnistus: Pallon punainen on voimakas riippumatta valaistuksesta
                // Sallii varjon ja kirkkaat valot, kunhan punainen dominoi 1.5 -kertaisesti vihreää ja sinistä vastaan.
                if (r > 110 && r > g * 1.4 && r > b * 1.4) {
                    matchCount++;
                }
            }

            // Jos löydettiin tarpeeksi pallon väriä (esim pallo peittää reitin)
            if (matchCount / totalPixels > this.pixelThreshold) {
                this.lastDetections[zone.id] = now;

                // Käynnistetään pyörähdysanimaatio
                zone.hitAnimationTime = now;

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

            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const radius = Math.min(w, h) / 2;

            this.ctx.save();
            this.ctx.translate(centerX, centerY);

            // Pyörähdysanimaatio jos osuma tapahtunut
            if (zone.hitAnimationTime) {
                const elapsed = Date.now() - zone.hitAnimationTime;
                const animDuration = 800; // millisekuntia
                if (elapsed < animDuration) {
                    const progress = elapsed / animDuration;
                    const scaleX = Math.cos(progress * Math.PI * 2); // Pyörähtää täyden ympyrän Y-akselilla
                    this.ctx.scale(scaleX, 1);
                }
            }

            // Ulkovarjo
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = 'rgba(0,0,0,0.8)';

            // Ulkoympyrä (Tummansininen) - piirretään leveänä viivana jotta alueiden väliin jää läpinäkyvä raita
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
            this.ctx.lineWidth = radius * 0.36; // Ulottuu 0.64:stä 1.00:aan
            this.ctx.strokeStyle = 'rgba(38, 59, 94, 0.9)';
            this.ctx.stroke();

            // Ohut vaalea reunus aivan uloimmalle reunalle
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
            this.ctx.lineWidth = 4;
            this.ctx.strokeStyle = 'rgba(224, 223, 209, 0.6)';
            this.ctx.stroke();

            // Nollataan varjo
            this.ctx.shadowBlur = 0;

            // Keskiympyrä (Valkoinen/Beige) - toinen viivarengas (Tässä on nyt täysin läpinäkyvä alue sinisen ja valkoisen välissä)
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
            this.ctx.lineWidth = radius * 0.2; // Ulottuu 0.35:stä 0.55:een
            this.ctx.strokeStyle = 'rgba(224, 223, 209, 0.9)';
            this.ctx.stroke();

            // Sisäympyrä (Punainen) - umpikuja keskellä, laidoilla on täysin läpinäkyvä alue valkoiseen nähden
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2); // Ulottuu 0:sta 0.22:een
            this.ctx.fillStyle = 'rgba(199, 46, 46, 0.9)';
            this.ctx.fill();

            this.ctx.restore();

            // Teksti
            this.ctx.font = "bold 16px 'Russo One', sans-serif";
            this.ctx.fillStyle = "rgba(255,255,255,0.7)";
            this.ctx.textAlign = "center";
            this.ctx.fillText("TARGET", centerX, centerY - radius - 15);
        });

        // Nollataan lopuksi shadow, jottei se vaikuta muihin
        this.ctx.shadowBlur = 0;
    }
}

window.visionEngine = new VisionEngine();
