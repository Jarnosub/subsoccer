# ⚡ INSTANT PLAY - Quick Start

## For Players 🎮

### 1. Scan QR Code
- Find the QR code sticker on the Subsoccer table
- Open your phone camera
- Point at the QR code
- Tap the notification to open

### 2. Rotate Phone
- Turn your phone to **landscape mode** (sideways)
- Place phone in the middle of the table
- Screen should face both players

### 3. Play!
```
┌─────────────┬─────────────┐
│  Player 1   │  Player 2   │
│             │             │
│      0      │      0      │
│             │             │
│  (tap here) │ (tap here)  │
└─────────────┴─────────────┘
```

- **Left side = Player 1** (tap when you score)
- **Right side = Player 2** (tap when you score)
- First to **5 goals wins**! 🏆

### Controls (bottom of screen):
- 🔄 **Reset** - Start new game
- 🔊 **Sound** - Toggle sound effects
- ↩️ **Undo** - Remove last goal

---

## For Table Owners 🏢

### What You Need:
1. **QR Code Sticker** (print from `INSTANT_PLAY_SETUP.md`)
2. **Place on table** (visible near center)
3. **Done!** Players can now scan and play

### Setup Steps:

**1. Generate QR Code:**
```bash
# Option A: Use online generator
Go to: qr-code-generator.com
Enter: https://yourdomain.com/subsoccer/instant-play.html

# Option B: Use Python script
python3 generate_qr.py https://yourdomain.com/instant-play.html
```

**2. Print Sticker:**
- Print QR code at **5cm x 5cm** minimum
- Laminate or use waterproof sticker
- Add text: "SUBSOCCER INSTANT PLAY - Scan & Play"

**3. Place on Table:**
- Near center
- Visible to both sides
- Weather-proof if outdoor

**4. Test:**
```bash
# Local test
./test-instant-play.sh

# Scan with phone
http://YOUR_IP:8000/instant-play.html
```

---

## Benefits ✨

### For Bars/Pubs:
- ✅ **Lower barrier to entry** - customers try game easier
- ✅ **No app download** - works instantly in browser
- ✅ **No registration needed** - anonymous play
- ✅ **Professional look** - phone as scoreboard
- ✅ **More plays** - faster setup = more games

### For Players:
- ✅ **Start playing in 5 seconds**
- ✅ **No account needed**
- ✅ **No typing names**
- ✅ **Clean scoreboard UI**
- ✅ **Sound effects included**

### For Organizers:
- ✅ **Easy deployment** - just QR sticker
- ✅ **Works on any phone** - iOS & Android
- ✅ **No maintenance** - static HTML file
- ✅ **Scales infinitely** - no backend needed

---

## URLs

### Production:
```
https://yourdomain.com/subsoccer/instant-play.html
```

### Testing (Local):
```
http://localhost:8000/instant-play.html
http://192.168.1.X:8000/instant-play.html  (replace X with your IP)
```

---

## Troubleshooting 🔧

### "Rotate your device" message won't go away
**Fix:** Turn phone to landscape (horizontal) mode

### Sound doesn't work
**Fix:** Tap 🔊 Sound button to enable

### Can't scan QR code
**Fix:** Make sure QR code is in focus and well-lit

### Page doesn't load
**Fix:** Check internet connection or use local test

### Goals not registering
**Fix:** 
- Make sure you're tapping the correct side
- Check if game already ended (winner declared)
- Try Reset button

---

## Acoustic Detection 🎵

If your table has **goal sound emitters** (2kHz / 3.5kHz):

1. **Grant microphone access** when prompted
2. **Acoustic detection activates automatically**
3. **Goals register from sound** - no tapping needed
4. **Manual tapping still works** as backup

---

## Next Level 🚀

Want to track your stats? Create an account in the main app:

1. Open main Subsoccer app
2. Create account (free)
3. Play Quick Match or tournaments
4. Track ELO, wins, and climb leaderboard

**Instant Play** is perfect for casual play.  
**Main App** is for competitive players.

---

## Support

Questions? See full documentation:
- [INSTANT_PLAY_SETUP.md](INSTANT_PLAY_SETUP.md) - Complete setup guide
- [README.md](README.md) - Main app documentation

Enjoy playing Subsoccer! ⚽🔥
