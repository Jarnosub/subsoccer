# Sound Effects

## Äänet on nyt käytössä! 🔊

Subsoccer soittaa automaattisesti:
- **Maaliäänen** kun maali tulee (pikapeli ja Pro Mode)
- **Yleisön hurrauksen** kun peli päättyy

## Nykyinen toiminta

Tällä hetkellä äänet luodaan Web Audio API:lla (syntetisoidut äänet). Äänet toimivat heti ilman mitään tiedostoja.

## Omien äänitiedostojen lisääminen (valinnainen)

Jos haluat käyttää oikeita äänitiedostoja synteettisten sijaan:

### 1. Hanki äänitiedostot

Lataa tai nauhoita kaksi äänitiedostoa:
- `goal.mp3` - maaliääni (esim. torvi, goal horn, räjähdys)
- `crowd.mp3` - yleisön hurraus (2-3 sekuntia hurraamista/suosionosoituksia)

Tuetut formaatit: MP3, WAV, OGG

### 2. Lisää tiedostot

Kopioi tiedostot tähän kansioon (`/sounds/`):
```
subsoccer/
  sounds/
    goal.mp3
    crowd.mp3
```

### 3. Lataa äänet koodissa

Lisää rivi index.html:ään scriptin latauksen jälkeen tai avaa Developer Console ja aja:

```javascript
// Lataa äänitiedostot
window.soundEffects.loadSound('goal', 'sounds/goal.mp3');
window.soundEffects.loadSound('crowd', 'sounds/crowd.mp3');
```

TAI lisää automaattinen lataus sound-effects.js:n loppuun (rivit 239-241):

```javascript
// Auto-load sounds if files exist
soundEffects.loadSound('goal', 'sounds/goal.mp3');
soundEffects.loadSound('crowd', 'sounds/crowd.mp3');
```

## Äänten hallinta

### Säädä äänenvoimakkuutta
```javascript
window.soundEffects.setVolume(0.5);  // 0.0 = hiljainen, 1.0 = täysi
```

### Sammuta äänet
```javascript
window.soundEffects.setEnabled(false);  // Kytke pois
window.soundEffects.setEnabled(true);   // Kytke päälle
```

### Vaihda äänet päälle/pois
```javascript
window.soundEffects.toggle();
```

## Testi-komennot

Testaa ääniä Developer Consolessa:

```javascript
// Testaa maaliääni
window.soundEffects.playGoalSound();

// Testaa yleisön hurraus
window.soundEffects.playCrowdCheer();
```

## Missä äänet toimivat

✅ **Maaliääni soitetaan kun:**
- Acoustic detection tunnistaa maalin (Quick Match)
- Acoustic detection tunnistaa maalin (Pro Mode)
- Pelaaja koskettaa puolta Pro Modessa (manuaalinen maali)

✅ **Yleisön hurraus soitetaan kun:**
- Jompikumpi pelaaja voittaa pikapelin
- Jompikumpi pelaaja voittaa Pro Mode -pelin

## Suositellut ääniefektit

Etsi vapaasti käytettäviä ääniefektejä esim:
- [Freesound.org](https://freesound.org)
- [Zapsplat.com](https://www.zapsplat.com)
- [Mixkit.co](https://mixkit.co/free-sound-effects/)

Hakusanat:
- "goal horn", "air horn", "buzzer" (maaliäänelle)
- "crowd cheer", "crowd celebration", "stadium roar" (yleisölle)
