# ⚡ SUBSOCCER INSTANT PLAY - QR Setup

## 🎯 Nopein tapa pelata Subsocceria

**Instant Play** on täydellinen ratkaisu baareihin ja pelipöytiin:

1. **Skannaa QR-koodi** pöydän tarrasta
2. **Ei rekisteröintiä** - peli alkaa heti
3. **Laita puhelin keskelle pöytää**
4. **Pelaa!** - Kosketa omaa puoltasi tai käytä acoustic detectionia

---

## 📱 Käyttö

### Pelaajille:
1. Skannaa QR-koodi puhelimellasi
2. Puhelin pyytää kääntämään vaaka-asentoon
3. Näet ison 0-0 scoreboardin
4. **Pelaaja 1 vasemmalla** | **Pelaaja 2 oikealla**
5. Kosketa omaa puoltasi kun teet maalin
6. Ensimmäinen 5 maaliin voittaa! 🏆

### Kontrollit (alaosassa):
- **🔄 Reset** - Aloita peli alusta
- **🔊 Sound** - Ääniefektit päälle/pois
- **↩️ Undo** - Peru viimeinen maali

---

## 🖨️ QR-Koodin Luominen

### Vaihtoehto 1: Online QR Generator

1. Mene sivulle: https://www.qr-code-generator.com/
2. Valitse "URL"
3. Syötä URL:
   ```
   https://yourdomain.com/subsoccer/instant-play.html
   ```
   TAI paikallinen testi:
   ```
   http://localhost:8000/instant-play.html
   ```

4. Lataa QR-koodi (PNG, 300x300px tai suurempi)
5. Tulosta tai tilaa tarra

### Vaihtoehto 2: Python QR Generator

```python
import qrcode

# Luo QR-koodi
qr = qrcode.QRCode(version=1, box_size=10, border=4)
qr.add_data('https://yourdomain.com/subsoccer/instant-play.html')
qr.make(fit=True)

# Tallenna kuva
img = qr.make_image(fill_color="black", back_color="white")
img.save("subsoccer_instant_play_qr.png")
```

Aja:
```bash
pip install qrcode[pil]
python generate_qr.py
```

### Vaihtoehto 3: Node.js QR Generator

```bash
npm install qrcode
```

```javascript
const QRCode = require('qrcode');

QRCode.toFile('subsoccer_qr.png', 
  'https://yourdomain.com/subsoccer/instant-play.html',
  { width: 400 },
  (err) => {
    if (err) throw err;
    console.log('QR code saved!');
  }
);
```

---

## 🎨 Tarran Suunnittelu

### Suositeltu koko:
- **A6 (10.5 x 14.8 cm)** - Sopiva pöytään
- **A7 (7.4 x 10.5 cm)** - Pienempi versio

### Layout:

```
┌─────────────────────────┐
│                         │
│      SUBSOCCER          │
│    ⚽ INSTANT PLAY ⚽    │
│                         │
│   ┌─────────────┐       │
│   │             │       │
│   │   QR CODE   │       │
│   │             │       │
│   └─────────────┘       │
│                         │
│  📱 Scan & Start        │
│   Playing in Seconds!   │
│                         │
└─────────────────────────┘
```

### Värit:
- **Tausta:** Musta (#0a0a0a)
- **Teksti:** Punainen (#FF0000) ja Kulta (#FFD700)
- **QR-koodi:** Valkoinen/Musta

### Fontti:
- **Otsikko:** Russo One (Bold)
- **Alaotsikko:** Open Sans

---

## 🖨️ Tulostus

### DIY - Kodin tulostin:
1. Lataa QR PNG
2. Avaa Canva tai Word
3. Lisää:
   - QR-koodi keskelle
   - Otsikko: "SUBSOCCER ⚽ INSTANT PLAY"
   - Alaosa: "📱 Scan & Play"
4. Tulosta tarralle tai laminoituun paperiin

### Ammattilainen:
- **Vistaprint** - Custom stickers
- **Stickermule** - High quality stickers
- **Local print shop** - Laminoidut tarrat

Tilaa esim. 50-100 kpl tarroja pöytiin.

---

## 🌐 Hosting

### Julkaise Instant Play verkossa:

**GitHub Pages (ilmainen):**
```bash
# Lisää GitHub repoon
git add instant-play.html
git commit -m "Add instant play mode"
git push origin main

# Aktivoi GitHub Pages
# Settings → Pages → Deploy from main branch
```

URL: `https://yourusername.github.io/subsoccer/instant-play.html`

**Netlify (ilmainen):**
1. Vedä `instant-play.html` Netlify Drop -alueelle
2. Saat URL: `https://random-name.netlify.app/instant-play.html`
3. Voit ostaa domainin: `play.subsoccer.com`

---

## 📊 Acoustic Detection

Instant Play tukee acoustic detectionia!

Jos käytät pöytää jossa on goal soundit:
1. Puhelin kuuntelee automaattisesti
2. Ei tarvitse koskea puolta - maali rekisteröityy äänestä
3. Toimii täysin samalla tavalla kuin main app

---

## 🎮 Testaa Paikallisesti

### 1. Käynnistä local server:

**Python:**
```bash
cd /Users/jarnosaarinen/subsoccer
python3 -m http.server 8000
```

**Node.js:**
```bash
npx http-server -p 8000
```

### 2. Avaa puhelimella:
```
http://YOUR_COMPUTER_IP:8000/instant-play.html
```

Esim: `http://192.168.1.100:8000/instant-play.html`

### 3. Luo QR tästä URLista testausta varten

---

## 💡 Käyttötapaukset

### 🍺 Baareissa:
- QR-tarra jokaisessa Subsoccer-pöydässä
- Asiakkaat skannaavat ja pelaavat heti
- Ei rekisteröintiä → Madallaa kynnystä kokeilla

### 🏢 Toimistoissa:
- QR-koodi taukotilan pöydässä
- Nopea tauko-peli kollegoiden kanssa
- Ei tarvitse muistaa URLia

### 🎉 Tapahtumissa:
- QR-koodi turnauspöydissä
- Järjestäjä näkee pistetilanteen
- Nopea pelaaminen ilman setuppia

### 🏠 Kotona:
- QR-koodi omassa pöydässä
- Vieraat voivat heti pelata
- Ei tarvitse opastaa sovellusta

---

## ⚙️ Asetukset

### Muuta voittopisteitä:

Muokkaa `instant-play.html`:
```javascript
const WIN_SCORE = 5;  // Muuta 3, 7, 10, jne.
```

### Poista kontrollit:

Poista rivi 177-182 HTML:stä (`.controls` div)

### Muuta värejä:

Muokkaa CSS `:root` sektiota:
```css
:root {
    --sub-red: #FF0000;     /* Punainen */
    --sub-gold: #FFD700;    /* Kulta */
    --sub-black: #0a0a0a;   /* Musta */
}
```

---

## 📈 Seuraavat Parannukset

Tulevaisuudessa voidaan lisätä:
- [ ] Anonyymien pelien tilastointi (cloud functions)
- [ ] Pöytäkohtaiset tilastot (kuinka monta peliä per pöytä)
- [ ] Leaderboard ilman kirjautumista
- [ ] Share-nappi jakaa tulos sosiaaliseen mediaan
- [ ] Turnausmoodi useammalle pelaajalle

---

## 🚀 Valmis!

Instant Play on nyt käytössä. Luo QR-koodi, tulosta tarra, ja anna ihmisten pelata Subsocceria **ilman mitään setuppia**!

**Instant Play URL:**
```
[Your Domain]/instant-play.html
```

Kysymyksiä? Katso pääsovelluksen dokumentaatio.
