# 🔊 Äänien Vaihtaminen Verkosta Ladattuihin

## Nopea Ohje

### Vaihtoehto 1: Käytä Freesound.org (Ilmainen)

#### 1. Etsi Äänet

**Maaliääni:**
- Mene: https://freesound.org
- Hae: "goal horn" tai "air horn" tai "buzzer"
- Suositellut:
  - https://freesound.org/people/VlatkoBlazek/sounds/195311/ (Epic Horn)
  - https://freesound.org/people/InspectorJ/sounds/415510/ (Air Horn)

**Yleisön Hurraus:**
- Hae: "crowd cheer" tai "stadium roar"
- Suositellut:
  - https://freesound.org/people/alexthegrate/sounds/164953/ (Crowd Cheer)
  - https://freesound.org/people/jobro/sounds/35466/ (Sports Crowd)

#### 2. Lataa Äänet

1. Klikkaa Download
2. Valitse "MP3" formaatti
3. Tallenna `sounds/` kansioon:
   - `sounds/goal.mp3`
   - `sounds/crowd.mp3`

#### 3. Lataa Sovelluksessa

**Päävelluksessa (index.html):**

Avaa Developer Console (F12) ja aja:
```javascript
window.soundEffects.loadSound('goal', 'sounds/goal.mp3');
window.soundEffects.loadSound('crowd', 'sounds/crowd.mp3');
```

TAI lisää rivi `sound-effects.js` loppuun (automaattinen lataus):
```javascript
// Auto-load sounds if files exist
if (window.location.protocol !== 'file:') {
    soundEffects.loadSound('goal', 'sounds/goal.mp3');
    soundEffects.loadSound('crowd', 'sounds/crowd.mp3');
}
```

**Instant Play:ssä (instant-play.html):**

Lisää suoraan HTML:ään script-osioon (rivi 283 jälkeen):
```javascript
// Load custom sound effects from URLs
const goalAudio = new Audio('sounds/goal.mp3');
const crowdAudio = new Audio('sounds/crowd.mp3');

// Replace playGoalSound function
function playGoalSound() {
    if (!soundEnabled) return;
    goalAudio.currentTime = 0;
    goalAudio.play().catch(e => console.log('Audio play failed'));
}

// Replace playCrowdCheer function  
function playCrowdCheer() {
    if (!soundEnabled) return;
    crowdAudio.currentTime = 0;
    crowdAudio.play().catch(e => console.log('Audio play failed'));
}
```

---

## Vaihtoehto 2: Käytä Verkko-URLeja Suoraan

### Ilmaiset Äänikirjastot:

**Mixkit** (Ei rekisteröintiä tarvita):
- https://mixkit.co/free-sound-effects/
- Hae: "crowd" ja "horn"
- Copy direct MP3 link

**Zapsplat** (Ilmainen rekisteröinti):
- https://www.zapsplat.com
- Laadukkaat äänet
- Download MP3

### Ladaa URLista:

```javascript
// Instant Play
const goalAudio = new Audio('https://example.com/path/to/goal.mp3');
const crowdAudio = new Audio('https://example.com/path/to/crowd.mp3');

// Main App
window.soundEffects.loadSound('goal', 'https://example.com/goal.mp3');
window.soundEffects.loadSound('crowd', 'https://example.com/crowd.mp3');
```

---

## Vaihtoehto 3: YouTube Audio → MP3

### 1. Etsi Ääni YouTubesta

Hae esim:
- "goal horn sound effect"
- "crowd cheer sound effect"

### 2. Muunna MP3:ksi

Käytä: https://ytmp3.nu/
1. Kopioi YouTube URL
2. Liitä converteriin
3. Download MP3

### 3. Lisää Projectiin

Tallenna `sounds/` kansioon ja lataa kuten yllä.

---

## Suositellut Äänet (Lataa Heti)

### 🎺 Maaliäänet:

**1. Classic Air Horn**
- URL: https://freesound.org/people/InspectorJ/sounds/415510/
- Kuvaus: Klassinen ilmatorvi
- Kesto: 1.5s

**2. Stadium Goal Horn**
- URL: https://freesound.org/people/VlatkoBlazek/sounds/195311/
- Kuvaus: Stadion maalitorvi
- Kesto: 2s

**3. Epic Celebration Horn**
- Hae: "celebration horn fanfare"
- Kuvaus: Juhlallinen fanfaari

### 👏 Yleisön Hurraukset:

**1. Crowd Celebration**
- URL: https://freesound.org/people/alexthegrate/sounds/164953/
- Kuvaus: Suosionosoitukset
- Kesto: 3s

**2. Stadium Roar**
- URL: https://freesound.org/people/jobro/sounds/35466/
- Kuvaus: Stadion jyrinä
- Kesto: 4s

**3. Applause + Cheers**
- Hae: "sports crowd applause"
- Kuvaus: Taputukset + hurraus

---

## Täydellinen Esimerkki (Instant Play)

Korvaa instant-play.html:n audio funktiot tällä:

```html
<script>
    // ... existing code ...
    
    // Load custom sounds
    let goalAudio = null;
    let crowdAudio = null;
    
    // Initialize sounds
    window.addEventListener('load', () => {
        // Try to load custom sounds
        goalAudio = new Audio('sounds/goal.mp3');
        crowdAudio = new Audio('sounds/crowd.mp3');
        
        // Preload
        goalAudio.load();
        crowdAudio.load();
        
        // Fallback to synthesized if custom sounds fail
        goalAudio.onerror = () => {
            console.log('Custom goal sound not found, using synthesized');
            goalAudio = null;
        };
        crowdAudio.onerror = () => {
            console.log('Custom crowd sound not found, using synthesized');
            crowdAudio = null;
        };
    });
    
    // Play goal sound
    function playGoalSound() {
        if (!soundEnabled) return;
        
        if (goalAudio) {
            // Use custom sound
            goalAudio.currentTime = 0;
            goalAudio.volume = 0.7;
            goalAudio.play().catch(e => {
                // Fallback to synthesized
                synthesizeGoalSound();
            });
        } else {
            // Synthesized sound
            synthesizeGoalSound();
        }
    }
    
    // Play crowd cheer
    function playCrowdCheer() {
        if (!soundEnabled) return;
        
        if (crowdAudio) {
            // Use custom sound
            crowdAudio.currentTime = 0;
            crowdAudio.volume = 0.7;
            crowdAudio.play().catch(e => {
                // Fallback to synthesized
                synthesizeCrowdCheer();
            });
        } else {
            // Synthesized sound
            synthesizeCrowdCheer();
        }
    }
    
    // Keep existing synthesized functions as fallbacks
    function synthesizeGoalSound() {
        if (!audioContext || !soundEnabled) return;
        
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        
        osc.start(now);
        osc.stop(now + 0.3);
    }
    
    function synthesizeCrowdCheer() {
        // ... existing synthesized crowd sound code ...
    }
    
    // ... rest of existing code ...
</script>
```

---

## Testaa Äänet

### Developer Consolessa:

```javascript
// Testaa maaliääni
playGoalSound();

// Testaa yleisön hurraus
playCrowdCheer();

// Säädä voimakkuutta
if (goalAudio) goalAudio.volume = 0.5;
if (crowdAudio) crowdAudio.volume = 0.5;
```

---

## Äänen Optimointi

### Suositeltu Formaatti:
- **MP3** (best compatibility)
- **Kesto:** 1-3s (maali), 2-4s (hurraus)
- **Bitrate:** 128kbps riittää
- **Sample rate:** 44.1kHz

### Pienennä Tiedostokoko:

**Online:**
- https://www.mp3smaller.com/
- Lataa MP3
- Valitse laatutaso (128kbps)
- Download

**FFmpeg (komentorivi):**
```bash
# Pienennä ja optimoi
ffmpeg -i original.mp3 -b:a 128k -ac 1 sounds/goal.mp3
```

---

## Vianetsintä

### Äänet eivät toimi:
- ✅ Tarkista että tiedostot ovat `sounds/` kansiossa
- ✅ Tarkista että URLit ovat oikein
- ✅ Avaa Developer Console (F12) ja katso virheet
- ✅ Testaa tiedosto suoraan: `open sounds/goal.mp3`

### CORS-virhe:
- Jos käytät verkko-URLia, varmista että palvelin sallii CORS
- Tallenna tiedosto paikallisesti jos mahdollista

### Ei ääntä ensimmäisellä klikkauksella:
- Selaimet vaativat käyttäjän interaktion ennen äänen toistoa
- Tämä on normaalia, toisesta klikkauksesta alkaen toimii

---

## Valmis!

Nyt sinulla on laadukkaat ääniefektit Subsoccerissa! 🎉

**Pikakomennot:**
1. Lataa äänet Freesound.org
2. Tallenna `sounds/goal.mp3` ja `sounds/crowd.mp3`
3. Lataa sovelluksessa tai lisää automaattinen lataus
4. Pelaa ja nauti! 🔊⚽
