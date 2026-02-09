# 🎙️ Quick Guide: Testing Audio Detection UI

## New Features Added

### 1. Audio Status Indicator
- **Location**: Quick Match screen (appears after selecting both players)
- **Visual**: Green pulsing dot when active, gray when inactive
- **Button**: "ACTIVATE" / "DEACTIVATE" to manually control

### 2. Goal Sound Recorder
- **Purpose**: Record actual goal sounds for frequency analysis
- **How to use**:
  1. Select both players in Quick Match
  2. Click "📍 Record Goal 1" or "📍 Record Goal 2"
  3. Make the sound (3 seconds recording)
  4. File automatically downloads as `.webm`
  5. Console shows detected frequency

### 3. Real-time Frequency Display
- Shows target frequencies when audio detection is active
- Goal 1: 2000 Hz
- Goal 2: 3500 Hz

## Testing Workflow

### Step-by-Step Test

1. **Open Subsoccer App**
   - Navigate to Quick Match

2. **Select Players**
   - Choose Player 1 (e.g., "TEST1")
   - Choose Player 2 (e.g., "TEST2")
   - Audio panels appear automatically

3. **Record Goal Sounds** (Optional but recommended)
   ```
   Click "📍 Record Goal 1"
   → Make a sharp sound (knock, clap, or tone)
   → Recording stops after 3 seconds
   → Check console for frequency: "🎵 Goal 1 dominant frequency: XXXX Hz"
   ```

4. **Activate Audio Detection**
   ```
   Click "ACTIVATE" button
   → Browser asks for microphone permission → ALLOW
   → Indicator turns green
   → Status shows "🎙️ Audio detection active"
   ```

5. **Test Goal Detection**
   - Click "START MATCH"
   - Audio detection starts automatically
   - Make goal sounds:
     - **Goal 1** sound (2000 Hz or table knock) → Player 2 should score
     - **Goal 2** sound (3500 Hz or different knock) → Player 1 should score

6. **Manual Control**
   - Use "DEACTIVATE" button to stop detection anytime
   - Use "ACTIVATE" to restart without starting a new match

## What Happens During Recording

1. **Browser requests microphone access** → Grant permission
2. **Recording starts** → Red dot shows "🔴 Recording Goal X sound... (3 sec)"
3. **Make your sound** → Knock table, clap, use tone generator
4. **Auto-stop after 3 seconds** → File downloads automatically
5. **Frequency analysis** → Console shows: `🎵 Goal 1 dominant frequency: 2156 Hz`
6. **Success message** → "✅ Goal 1 sound saved!"

## Recording Tips

### For Best Results:
- 🎯 **Sharp, percussive sounds** work best (table knocks, claps)
- 🔊 **Hold phone close** to sound source
- 🔇 **Minimize background noise**
- 📱 **Use tone generator app** for precise frequency testing:
  - Set to 2000 Hz for Goal 1
  - Set to 3500 Hz for Goal 2

### Analyzing Recordings:
1. Check console after recording completes
2. Look for: `🎵 Goal X dominant frequency: YYYY Hz`
3. If frequency is close to target (±200 Hz), it should work!
4. If frequency is way off, try a different sound source

## Tone Generator App Recommendations

### iOS:
- **Tone Generator** by Estudio Barbarela
- **Audio Function Generator** by Katsura Tarou

### Android:
- **Frequency Sound Generator** by TMSOFT
- **Simple Tone Generator** by Szymon Dyja

### Web-based (works on any browser):
- https://www.szynalski.com/tone-generator/
- https://onlinetonegenerator.com/

## UI Elements Explained

### Audio Status Panel (Gray Box):
```
● AUDIO DETECTION          [ACTIVATE]
Goal 1: 2000 Hz | Goal 2: 3500 Hz
```
- **Dot color**: Gray = off, Green = active
- **Button**: Click to toggle on/off
- **Frequencies**: Target ranges for detection

### Recording Panel (Dashed Box):
```
🎙️ GOAL SOUND RECORDER (Testing)
[📍 Record Goal 1]  [📍 Record Goal 2]
Recording status appears here...
```
- Click button to start 3-second recording
- Status shows recording progress
- Downloads audio file automatically

## Console Commands

### Check Audio Status:
```javascript
window.audioEngine.getStatus()
// Returns: { isListening: true/false, hasMicrophone: true/false, settings: {...} }
```

### Adjust Sensitivity:
```javascript
// More sensitive (quieter sounds trigger goal)
window.audioEngine.setThreshold(0.4)

// Less sensitive (louder sounds only)
window.audioEngine.setThreshold(0.8)
```

### Manual Start/Stop:
```javascript
// Start detection
await window.audioEngine.startListening()

// Stop detection
window.audioEngine.stopListening()
```

### Simulate Goal (for testing):
```javascript
// Simulate Player 1 scoring
window.handleGoalDetected(1)

// Simulate Player 2 scoring
window.handleGoalDetected(2)
```

## Troubleshooting

### "Microphone access required"
- **Fix**: Click browser's microphone icon in address bar → Allow

### Audio detection not working
1. Check indicator is green (detection active)
2. Lower threshold: `window.audioEngine.setThreshold(0.3)`
3. Make louder sounds
4. Check browser console for errors

### Recording doesn't download
- **Chrome**: Check if pop-ups are blocked
- **Safari**: May need to manually save from browser
- **Firefox**: Should work automatically

### Frequency shows 0 Hz
- Recording was too quiet
- Try making a sharper, louder sound
- Hold phone closer to sound source

## Next Steps

After testing with manual sounds:

1. **Find your optimal threshold**
   - Start at 0.65 (default)
   - Adjust based on environment noise

2. **Record actual goal sounds**
   - Use real game table if available
   - Analyze frequencies → adjust detection ranges if needed

3. **Install sound emitters**
   - 2000 Hz speaker in Goal 1
   - 3500 Hz speaker in Goal 2
   - System should detect perfectly!

---

**Ready to test?** Open the app and select two players to see the new audio panels! 🚀
