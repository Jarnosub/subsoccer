# ⚡ Pro Mode - First to 3 Acoustic Live Scoring

## 🎯 What is Pro Mode?

Pro Mode is an advanced feature that transforms Quick Match into a professional live-scoring experience:
- **Acoustic goal detection** automatically counts goals
- **Split-screen display** shows live score (like real scoreboards)
- **First to 3 goals wins** (official Subsoccer rules)
- **Landscape optimized** for phone placed between players
- **Visual effects** with goal animations and status updates

## 🚀 How to Use

### Step 1: Enable Pro Mode
1. Go to **Quick Match**
2. Select **Player 1** and **Player 2**
3. Expand **"Tournament Mode & Settings"**
4. Check **"⚡ PRO MODE"** checkbox
5. Notice "START MATCH" button becomes **"⚡ START PRO MATCH"** (gold color)

### Step 2: Start Pro Match
1. Click **"⚡ START PRO MATCH"**
2. Phone screen switches to **full-screen split view**
3. **Microphone activates automatically** for goal detection
4. Place phone **landscape (sideways)** between players

### Step 3: Play & Score
- Goals are detected automatically via acoustic sensors
- **Player 1** side shows their score on the LEFT
- **Player 2** side shows their score on the RIGHT
- Live updates: `●●○` visual goal indicators
- Status: "LEADING", "TIE", "MATCH POINT"

### Step 4: Winner
- **First player to score 3 goals wins automatically**
- Victory screen appears (same as regular Quick Match)
- **ELO is calculated and saved** to database
- Match history is recorded

## 📱 Screen Layout (Landscape)

```
┌─────────────────────────────────────┐
│  PLAYER 1     │     PLAYER 2        │
│               │                     │
│      2        │        1            │  ← Live scores
│               │                     │
│   ●●○         │      ●○○            │  ← Goal indicators
│               │                     │
│   LEADING     │   MATCH POINT       │  ← Dynamic status
└─────────────────────────────────────┘
        [× EXIT] button (top-right)
```

## 🎨 Visual Features

### Goal Indicators
- `●●●` = 3 goals (winner!)
- `●●○` = 2 goals
- `●○○` = 1 goal
- `○○○` = 0 goals

### Status Messages
- **"LEADING"** - Player in the lead
- **"TIE"** - Even score
- **"MATCH POINT"** - Player at 2 goals (one away from winning)

### Animations
- **Goal Flash** - Screen flashes gold when goal is scored
- **Haptic Feedback** - Phone vibrates on goal detection
- **Match Point Highlight** - Gold color when match point reached

## 🎙️ Audio Detection

Pro Mode automatically activates acoustic goal detection:
- **Goal 1 sound (2000 Hz)** → Player 2 scores
- **Goal 2 sound (3500 Hz)** → Player 1 scores
- Goals counted instantly and displayed live

**Testing without hardware:**
- Use table knocks, claps, or tone generator
- See AUDIO_DETECTION_TESTING.md for details

## 🎮 Controls

### During Match
- **× EXIT** (top-right) - Exit Pro Mode
  - Shows confirmation: "Exit Pro Mode? Current match will not be saved."
  - Returns to Quick Match selection

### After Match
- Victory screen appears automatically at 3 goals
- Same ELO calculation as regular matches
- Match saved to history

## 🔧 Technical Details

### Official Rules
- **First to 3 goals wins** (Subsoccer official rule)
- No tie breaks - continuous play until 3 goals
- Fastest scoring format for tournament play

### ELO & Database
- Winner's ELO calculated same as Quick Match
- Match saved with winner only (no goal count stored)
- Compatible with existing match history
- Does NOT affect tournament mode logic

### Orientation
- **Landscape recommended** for split-screen symmetry
- System attempts to lock landscape automatically
- Works in portrait too (vertical split)

## 🛠️ Troubleshooting

### Pro Mode checkbox not visible
- Expand "Tournament Mode & Settings" section
- Should see gold-bordered box at top

### "START PRO MATCH" button stays normal
- Make sure checkbox is checked ✓
- Button should turn gold when Pro Mode enabled

### Goals not detected
1. Check microphone permission granted
2. Verify audio detection is active (console shows "🎙️ Pro Mode: Audio detection active")
3. Test with manual sounds (table knocks)
4. Adjust sensitivity: `window.audioEngine.setThreshold(0.4)`

### Screen not rotating to landscape
- Manually rotate phone sideways
- Some browsers don't support auto-lock
- Still works in any orientation

### Match freezes at 3-3 or higher
- Should auto-finish at first player reaching 3
- Use EXIT button if stuck
- Report bug with console logs

## 🔄 Reverting to Basic Version

Pro Mode is **100% modular** and can be removed without breaking anything:

### Remove Pro Mode completely:

1. **HTML** (`index.html`):
   - Search for `<!-- PRO MODE TOGGLE` and delete until `<!-- END PRO MODE TOGGLE -->`
   - Search for `/* PRO MODE STYLES` and delete until `/* END PRO MODE STYLES */`
   - Search for `<!-- PRO MODE VIEW` and delete until `<!-- END PRO MODE VIEW -->`

2. **JavaScript** (`script.js`):
   - Search for `// 9C. PRO MODE` and delete entire section until `// END PRO MODE`
   - Remove these window bindings:
     ```javascript
     window.toggleProMode = toggleProMode;
     window.startProMatch = startProMatch;
     window.exitProMode = exitProMode;
     ```
   - In `startQuickMatch()`, remove the Pro Mode check:
     ```javascript
     if (proModeEnabled) {
         startProMatch();
         return;
     }
     ```
   - In `handleGoalDetected()`, remove Pro Mode routing:
     ```javascript
     if (proModeActive) {
         handleGoalDetectedPro(playerNumber);
         return;
     }
     ```

3. **Revert to checkpoint**:
   ```bash
   git log --oneline  # Find commit before Pro Mode
   git checkout <commit-hash> -- index.html script.js
   ```

## 📊 Comparison: Pro Mode vs Regular Quick Match

| Feature | Regular Quick Match | Pro Mode |
|---------|---------------------|----------|
| **Goal counting** | Manual ("WHO WON?") | Automatic (acoustic) |
| **Display** | Simple winner selection | Split-screen live score |
| **Win condition** | Select winner | First to 3 goals |
| **Orientation** | Any | Landscape optimized |
| **Visual feedback** | Minimal | Animations + effects |
| **Use case** | Single matches | Tournament-style play |
| **Complexity** | Simple | Advanced |

## 🎯 Best Practices

### For Testing
- Start with manual toggle (not automatic play)
- Test with tone generator (2000 Hz / 3500 Hz)
- Verify goals register correctly before using in tournament

### For Tournaments
- Use Pro Mode for finals (more professional)
- Regular Quick Match for early rounds (faster)
- Place phone in center with clear view for both players

### For Demos
- Pro Mode looks impressive for showcasing
- Landscape mode + live scoring = wow factor
- Great for social media content

## 📝 Version History

- **v2.0-promode** - Initial Pro Mode release
  - First to 3 goals win condition
  - Split-screen landscape display
  - Acoustic goal detection integration
  - Modular implementation (fully removable)

---

**Questions?** Check console for debug logs or report issues on GitHub.

**Official Rules:** First to 3 goals wins - Subsoccer regulation format.
