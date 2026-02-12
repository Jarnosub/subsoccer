# Ääniefektit lisätty! 🔊

## ✅ Mitä lisättiin:

1. **sound-effects.js** - Äänijärjestelmä joka soittaa:
   - Maaliäänen kun maali tulee
   - Yleisön hurrauksen kun peli päättyy

2. **Integraatio script.js:ään:**
   - Maaliääni soitetaan `handleGoalDetected()` funktiossa (pikapeli)
   - Maaliääni soitetaan `handleGoalDetectedPro()` funktiossa (Pro Mode)
   - Yleisön hurraus soitetaan kun peli päättyy (`finalizeQuickMatch()` ja Pro Mode voittaja)

3. **sounds/** kansio oikeille äänitiedostoille (valinnainen)

## 🎮 Testaa heti:

1. Avaa sovellus
2. Aloita Quick Match tai Pro Mode
3. Tee maali (acoustic detection tai manuaalinen kosketus Pro Modessa)
4. Kuulet maaliäänen! 📣
5. Päätä peli - kuulet yleisön hurrauksen! 👏

## 🎵 Nykyiset äänet

Tällä hetkellä käytetään **syntetisoituja ääniä** (Web Audio API):
- ✅ Toimii heti ilman tiedostoja
- ✅ Ei vaadi latauksia
- ✅ Toimii kaikissa selaimissa

## 🔧 Haluat omat äänitiedostot?

Jos haluat korvata synteettiset äänet oikeilla äänillä:

1. Hanki tai nauhoita äänitiedostot:
   - `goal.mp3` (maaliääni)
   - `crowd.mp3` (yleisön hurraus)

2. Lisää tiedostot: `sounds/goal.mp3` ja `sounds/crowd.mp3`

3. Lataa äänet lisäämällä **sound-effects.js** loppuun (rivit 239-241):
   ```javascript
   soundEffects.loadSound('goal', 'sounds/goal.mp3');
   soundEffects.loadSound('crowd', 'sounds/crowd.mp3');
   ```

## 🎚️ Äänien hallinta

### Consolessa (Developer Tools):

```javascript
// Testaa ääniä
window.soundEffects.playGoalSound();
window.soundEffects.playCrowdCheer();

// Säädä äänenvoimakkuutta (0.0 - 1.0)
window.soundEffects.setVolume(0.5);

// Sammuta äänet
window.soundEffects.setEnabled(false);

// Kytke päälle
window.soundEffects.setEnabled(true);
```

## 📱 Lisää äänien on/off-painike (valinnainen)

Jos haluat lisätä käyttöliittymään painikkeen äänien päälle/pois kytkemiseen:

**Lisää HTML:ään (esim. nav-bar kohtaan):**
```html
<button onclick="toggleSoundEffects()" id="sound-toggle-btn" style="background: #333; padding: 8px 12px; border: none; color: #fff; border-radius: 5px; cursor: pointer;">
  🔊 SOUNDS ON
</button>
```

**Lisää script.js:ään:**
```javascript
function toggleSoundEffects() {
    const enabled = window.soundEffects.toggle();
    const btn = document.getElementById('sound-toggle-btn');
    if (enabled) {
        btn.textContent = '🔊 SOUNDS ON';
        btn.style.background = '#333';
        showNotification('Sound effects enabled', 'success');
    } else {
        btn.textContent = '🔇 SOUNDS OFF';
        btn.style.background = '#666';
        showNotification('Sound effects disabled', 'info');
    }
}
```

## 🚀 Valmis!

Kaikki toimii heti. Testaa pelaamalla pelin!

Kysymyksiä? Katso: **sounds/README.md**
