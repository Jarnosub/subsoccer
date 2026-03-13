// ============================================================
// SUBSOCCER VISION ENGINE - Computer Vision Goal Detection
// Proof of Concept: Uses back camera to detect color changes (Subsoccer Red)
// ============================================================

class VisionEngine {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.ctx = null;
        this.stream = null;
        this.isScanning = false;
        this.facingMode = 'environment';
        this.showTargets = true;

        // Konfiguroitavat alueet (hitScale määrittää kuinka pieni osa taulun keskustasta on herkkää aluetta)
        this.zones = [
            { id: 'top-left', x: 0.18, y: 0.05, width: 0.2, height: 0.2, hitScale: 0.35, hitAnimationTime: 0 },
            { id: 'top-right', x: 0.62, y: 0.05, width: 0.2, height: 0.2, hitScale: 0.35, hitAnimationTime: 0 },
            { id: 'bottom-left', x: 0.21, y: 0.42, width: 0.2, height: 0.2, hitScale: 0.35, hitAnimationTime: 0 },
            { id: 'bottom-right', x: 0.59, y: 0.42, width: 0.2, height: 0.2, hitScale: 0.35, hitAnimationTime: 0 }
        ];

        // Tunnistuksen herkkyysasetukset
        this.subsoccerRedTarget = { r: 227, g: 6, b: 19 }; // Subsoccerin pallo (#e30613)
        this.tolerance = 60; // Ei enää suorassa käytössä uudistetussa laskennassa
        this.pixelThreshold = 0.02; // 2% alueen pikseleistä pitää muuttua pallon väriseksi

        this.activeZoneId = null; // Jos määritetty, vain tämä maali reagoi ja on kirkas

        // Tilanhallinta
        this.lastDetections = {};
        this.zones.forEach(z => this.lastDetections[z.id] = 0);
        this.COOLDOWN_MS = 1500;

        this.onTargetHit = null; // Takaisinkutsufunktio kun osuma tapahtuu

        // Pallon nopeuden seuranta (km/h arvio)
        this.measureBallSpeed = false;
        this.lastBallPos = null;
        this.currentBallSpeedKmh = 0;
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

    async startCamera(facingMode = 'environment') {
        try {
            this.stopCamera(); // Pysäytä mahdollinen aiempi streami lennosta
            await this.init();

            this.facingMode = facingMode;
            this.showTargets = (facingMode === 'environment');

            // Pyydä kameraa
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.facingMode },
                audio: false
            });

            this.video.srcObject = this.stream;

            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    // Aseta canvas täsmälleen laitteen näytön pikselikokoon
                    this.canvas.width = window.innerWidth;
                    this.canvas.height = window.innerHeight;

                    // Peilaa etukamera, muuten näyttää oudolta (kuten peiliin katsoisi)
                    if (this.facingMode === 'user') {
                        this.canvas.style.transform = 'scaleX(-1)';
                    } else {
                        this.canvas.style.transform = 'scaleX(1)';
                    }

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

        if (this.showTargets) {
            this.analyseFrame();
            this.drawOverlay();
        }

        if (this.measureBallSpeed) {
            this.calculateBallSpeed(Date.now());
        }

        requestAnimationFrame(() => this.appLoop());
    }

    analyseFrame() {
        const now = Date.now();

        this.zones.forEach((zone, index) => {
            // Laske visuaalisen alueen keskipiste kankaalla
            const vw = zone.width * this.canvas.width;
            const vh = zone.height * this.canvas.height;
            const cx = (zone.x * this.canvas.width) + (vw / 2);
            const cy = (zone.y * this.canvas.height) + (vh / 2);

            // Laske varsinainen pienetty "hitbox" osumaalue (vain punainen häränsilmä reagoi)
            const w = Math.floor(vw * zone.hitScale);
            const h = Math.floor(vh * zone.hitScale);
            const x = Math.floor(cx - w / 2);
            const y = Math.floor(cy - h / 2);

            // RANDOM GENERATOR MODE: Jos vain yksi maali on aktiivinen, ohita muut
            if (this.activeZoneId && zone.id !== this.activeZoneId) return;

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

    calculateBallSpeed(now) {
        // Skannataan harvemmalla resoluutiolla nopeutta varten (koko 10 pikselin välein)
        const step = 15;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // Vain alempi n. 70% ruudusta on aluetta jossa pallo liikkuu, ei syytä skannata ihan kattoa
        const startY = Math.floor(h * 0.2); 
        const scanH = h - startY;

        const imageData = this.ctx.getImageData(0, startY, w, scanH);
        const data = imageData.data;
        
        let sumX = 0, sumY = 0, matchCount = 0;

        for (let y = 0; y < scanH; y += step) {
            for (let x = 0; x < w; x += step) {
                const i = (y * w + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                if (r > 120 && r > g * 1.5 && r > b * 1.5) {
                    sumX += x;
                    sumY += (y + startY);
                    matchCount++;
                }
            }
        }

        if (matchCount > 3) {
            const cx = sumX / matchCount;
            const cy = sumY / matchCount;

            if (this.lastBallPos) {
                const dt = (now - this.lastBallPos.time) / 1000; // sekunteja
                if (dt > 0 && dt < 0.2) { // Rajoitetaan ettei taukojen jälkeen hypi
                    const dx = cx - this.lastBallPos.x;
                    const dy = cy - this.lastBallPos.y;
                    const pixelSpeed = Math.sqrt(dx * dx + dy * dy) / dt; // pikseliä sekunnissa
                    
                    // Karkea arvio: Oletetaan että puhelimen ruudun korkeus vastaa noin 1.2 metrin kenttäpituutta
                    const metersPerPixel = 1.2 / h; 
                    const speedMs = pixelSpeed * metersPerPixel; // metriä sekunnissa
                    let speedKmh = speedMs * 3.6; // km/h
                    
                    // Suodatetaan liian kovat virhepiikit pois (yli 150 kmh)
                    if (speedKmh > 5 && speedKmh < 150) {
                        // Tasainen liukuva keskiarvo (smoothing)
                        this.currentBallSpeedKmh = this.currentBallSpeedKmh * 0.7 + speedKmh * 0.3;
                    }
                }
            }
            this.lastBallPos = { x: cx, y: cy, time: now };
        } else {
            // Jos pallo katoaa ruudulta liian pitkäksi aikaa, nollataan edellinen paikka
            if (this.lastBallPos && (now - this.lastBallPos.time) > 200) {
                this.lastBallPos = null;
                // Ei nollata nopeusmittaria heti, jotta numero ehtii näkyä "osuman" hetkellä
            }
        }
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

            // Random-tilassa himmennetään ei-aktiiviset taulut
            if (this.activeZoneId && zone.id !== this.activeZoneId) {
                this.ctx.globalAlpha = 0.2; // Himmeä
            } else {
                this.ctx.globalAlpha = 1.0; // Kirkas
            }

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
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = 'rgba(0,0,0,0.4)';

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
        });

        // Nollataan lopuksi shadow, jottei se vaikuta muihin
        this.ctx.shadowBlur = 0;
    }
}

window.visionEngine = new VisionEngine();
