# 🛠️ Subsoccer - Technical Stack & Architecture

## 📋 Yleiskatsaus

Subsoccer on full-stack web-sovellus, joka on rakennettu modernilla teknologiapinolla. Sovellus on täysin frontend-pohjainen (no backend server), hyödyntäen Supabase BaaS:ia (Backend-as-a-Service) kaikkeen backend-logiikkaan.

---

## 🖥️ Frontend Stack

### Core Technologies

**HTML5**
- Semantic markup
- Custom data attributes
- Accessibility (ARIA)

**CSS3** (`style.css` - 452 riviä)
- CSS Variables (--sub-red, --sub-gold, --sub-black)
- Flexbox & Grid layouts
- Custom animations (fadeIn, goal-flash)
- Mobile-first responsive design
- Dark theme optimized

**Vanilla JavaScript** (ES6+)
- Modular architecture (4 tiedostoa)
- `config.js` (6 riviä) - Supabase init
- `auth.js` (117 riviä) - Authentication logic
- `ui.js` (~161 riviä) - UI utilities, swipe navigation
- `script.js` (1479 riviä) - Game engine, Pro Mode
- `audio-engine.js` (382 riviä) - Acoustic detection
- Async/await patterns
- Arrow functions
- Template literals
- Destructuring

### UI Libraries & Frameworks

**Font Awesome 6.4.0**
```html
https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css
```
- Icons: trophy, bolt, chart, map, etc.
- 1000+ icon library

**Leaflet.js 1.9.4** (Map library)
```html
https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
```
- Interactive maps
- Custom markers
- Location picker
- Public game tables map

**html2canvas** (Screenshot library)
```html
https://html2canvas.hertzen.com/dist/html2canvas.min.js
```
- Pro Card image generation
- Player profile screenshots
- Shareable graphics

**UUID.js 8.3.2**
```html
https://cdnjs.cloudflare.com/ajax/libs/uuid/8.3.2/uuid.min.js
```
- Unique ID generation
- Tournament IDs
- Match tracking

### Custom Fonts

**SubsoccerLogo** (Custom font)
- Brand identity
- Headers & titles

**Russo One** (Google Fonts)
- Display text
- Stats & numbers
- Tournament brackets

**Resolve** (Custom)
- Player names
- Clean typography

**Open Sans** (Fallback)
- Body text
- Descriptions

---

## ☁️ Backend & Infrastructure

### Supabase (BaaS Platform)

**Project ID:** `ujxmmrsmdwrgcwatdhvx`

**Supabase Client 2.x**
```javascript
https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
```

**Services Used:**

1. **PostgreSQL Database**
   - Managed relational database
   - 500MB free tier storage
   - Row Level Security (RLS)
   - Real-time subscriptions ready

2. **Supabase Auth** (minimal usage)
   - Currently using custom auth (players table)
   - RLS policies configured
   - Future: migrate to Supabase Auth

3. **Supabase Storage** (planned)
   - Event images bucket
   - 1GB free storage
   - CDN delivery
   - Public/private buckets

4. **API Auto-generation**
   - RESTful API
   - Real-time capabilities
   - Automatic CRUD endpoints

---

## 🗄️ Database Schema

### Current Tables (7 total)

**1. `players`**
```sql
id, username, password, elo, wins, country, avatar_url
```
- User accounts
- ELO rating system
- Win tracking

**2. `games`**
```sql
id, game_code, game_name, location, latitude, longitude, 
owner_id, is_public
```
- Physical game tables
- Location data
- Ownership

**3. `matches`**
```sql
id, player1, player2, winner, tournament_name, 
tournament_id, created_at, event_id
```
- Match history
- 1v1 results
- Tournament linkage

**4. `tournament_history`**
```sql
id, tournament_name, winner_name, second_place_name, 
third_place_name, tournament_id, event_name, game_id, 
created_at, event_id
```
- Tournament results
- Podium tracking
- Event linking

**5. `countries`**
```sql
id, name, code
```
- Player nationalities
- Flag display (flagcdn.com)

**6. `events`** (NEW - pending deployment)
```sql
id, event_name, event_type, game_id, start_datetime, 
end_datetime, organizer_id, status, max_participants, 
registration_deadline, description, is_public, image_url
```
- Event calendar
- Tournament scheduling

**7. `event_registrations`** (NEW - pending deployment)
```sql
id, event_id, player_id, registered_at, status, checked_in
```
- Event sign-ups
- Check-in system

---

## 🎨 External Services & APIs

### Maps & Geolocation

**Nominatim (OpenStreetMap)**
```javascript
https://nominatim.openstreetmap.org/search
```
- Address geocoding
- Location search
- Free & open-source

**FlagCDN**
```html
https://flagcdn.com/w40/fi.png
```
- Country flags
- Multiple resolutions (w20, w40, w80)
- Free CDN

### Future Integrations (Planned)

**Cloudflare R2** (optional)
- Image storage alternative
- Lower costs at scale

**SendGrid / Mailgun**
- Event notifications
- Email confirmations

---

## 🎵 Advanced Features

### Web Audio API

**Acoustic Goal Detection** (PATENTED TECHNOLOGY)
```javascript
navigator.mediaDevices.getUserMedia({ audio: true })
AudioContext, AnalyserNode, FFT
```
- Real-time frequency analysis
- Dual-tone detection (2000 Hz / 3500 Hz)
- Goal 1: 2000 Hz → Player 2 scores
- Goal 2: 3500 Hz → Player 1 scores
- Threshold: 0.65 intensity
- Min duration: 100ms
- Cooldown: 1500ms

**MediaRecorder API**
```javascript
MediaRecorder(stream, { mimeType: 'audio/webm' })
```
- 3-second goal sound recording
- Frequency analysis
- Testing & calibration

### Touch Gestures

**Swipe Navigation**
```javascript
touchstart, touchend events
passive: true listeners
50px threshold detection
```
- Mobile-optimized
- Tab switching
- Smooth transitions

---

## 🎯 Architecture Patterns

### Modular JavaScript Structure

```
config.js         → Supabase client, global variables
auth.js           → Login, signup, session management
ui.js             → UI utilities, notifications, navigation
script.js         → Core game engine, tournament logic
audio-engine.js   → Acoustic detection system
```

**Benefits:**
- Separation of concerns
- Easy debugging
- Maintainability
- Selective loading

### State Management

**Global Variables** (config.js)
```javascript
user, pool, sessionGuests, allDbNames, 
allGames, myGames, gameMap, publicMap
```

**Tournament State** (script.js)
```javascript
rP, rW, finalists, bronzeContenders, 
currentTournamentId, initialPlayerCount
```

**Pro Mode State** (script.js)
```javascript
proModeActive, proModeEnabled, proScoreP1, 
proScoreP2, proGoalHistory
```

### Event-Driven Architecture

**Window bindings**
```javascript
window.showPage = showPage;
window.startQuickMatch = startQuickMatch;
window.toggleProMode = toggleProMode;
// 40+ global functions
```

**DOM Events**
- onclick inline handlers
- addEventListener (swipe, audio)
- DOMContentLoaded initialization

---

## 📱 Progressive Web App (PWA) Ready

### Current Capabilities

✅ **Mobile responsive**
✅ **Touch-optimized**
✅ **Offline-resistant** (cached assets)
✅ **Installable** (add to home screen ready)

### Missing for Full PWA

⚠️ Service Worker (not implemented)
⚠️ manifest.json (not configured)
⚠️ Offline data sync

---

## 🚀 Deployment & Hosting

### Frontend Hosting

**Netlify**
- Repository: `github.com/Jarnosub/subsoccer`
- Branch: `main`
- Auto-deploy on push
- CDN distribution
- HTTPS SSL
- Build command: (none - static files)
- Publish directory: `/`

### Version Control

**Git & GitHub**
```
Repository: Jarnosub/subsoccer
Branches: main
Tags: v1.0-pre-events (backup point)
Commits: 20+ feature commits
```

**Commit Strategy:**
- Feature-based commits
- Descriptive messages
- Backup tags before major changes

---

## 🔐 Security & Privacy

### Authentication

**Current:** Custom implementation
- Plain password storage (⚠️ needs hashing)
- Session-based (in-memory)
- Guest accounts supported

**Planned:** Migrate to Supabase Auth
- Bcrypt password hashing
- JWT tokens
- OAuth providers (Google, etc.)

### Row Level Security (RLS)

**Enabled on:**
- events table
- event_registrations table

**Policies:**
- Public read for public events
- Organizer-only updates/deletes
- Player-only registration management

---

## 📊 Performance Optimizations

### Current Optimizations

✅ **Indexed database queries**
- event_id, game_id, player_id indexes
- Faster lookups

✅ **Lazy loading**
- fetchLB(), fetchHist() on tab change
- Map initialization on demand

✅ **Debounced search**
- Player search typeahead
- Prevents DB spam

✅ **Connection watchdog**
- 30s interval health check
- Visual offline indicator

### Future Optimizations

⚠️ Image lazy loading (events)
⚠️ Code splitting
⚠️ Service Worker caching
⚠️ Compression (gzip/brotli)

---

## 🧪 Development Tools

### Browser DevTools
- Chrome/Safari Inspector
- Network monitoring
- Console debugging

### Version Control
```bash
git
GitHub Desktop (optional)
```

### Code Editor
- VS Code (GitHub Copilot integration)
- Live Server extension

---

## 📦 Dependencies Summary

### Production Dependencies

```
@supabase/supabase-js@2       → Backend client
leaflet@1.9.4                  → Maps
html2canvas@latest             → Screenshots
uuid@8.3.2                     → ID generation
font-awesome@6.4.0             → Icons
```

### Zero Build Tools
- No npm/yarn
- No webpack/vite
- Pure vanilla JS
- CDN-delivered libraries

---

## 🎯 Key Features by Technology

| Feature | Technology |
|---------|-----------|
| Authentication | Supabase + Custom |
| Database | PostgreSQL (Supabase) |
| Maps | Leaflet.js + Nominatim |
| Icons | Font Awesome |
| Pro Cards | html2canvas |
| ELO System | Custom algorithm (K=32) |
| Pro Mode | Web Audio API + FFT |
| Swipe Nav | Touch Events API |
| Tournaments | Custom bracket engine |
| Flags | FlagCDN |
| Hosting | Netlify |
| Version Control | Git + GitHub |

---

## 🔮 Planned Technologies

### Near Future
- **Supabase Storage** → Event images
- **FullCalendar.js** or custom → Event calendar UI
- **Chart.js** → Player statistics graphs

### Long-term
- **Supabase Realtime** → Live match updates
- **Push Notifications** → Event reminders
- **PWA** → Offline support
- **WebRTC** → Live streaming integration

---

## 📝 Code Statistics

```
Total Lines: ~2,600
- script.js:        1,479 lines
- style.css:          452 lines
- audio-engine.js:    382 lines
- ui.js:              161 lines
- auth.js:            117 lines
- config.js:            6 lines
- index.html:         443 lines
```

**File Count:** 
- 7 core files (HTML, CSS, JS)
- 3 SQL schema files
- 2 documentation files (README, PRO_MODE_GUIDE)

---

## 🏆 Unique Innovations

### 1. Acoustic Goal Detection (Patent Pending)
- First-of-its-kind in table sports
- Dual-frequency recognition
- Real-time FFT analysis
- Hybrid acoustic + manual scoring

### 2. Split-Screen Pro Mode
- Landscape-optimized live scoring
- Touch-to-score backup
- Undo functionality
- Match point status

### 3. Zero-Backend Architecture
- No server to maintain
- Supabase handles everything
- Infinite scalability
- Cost-effective

---

## 💰 Cost Analysis (Current)

| Service | Plan | Cost |
|---------|------|------|
| Supabase | Free Tier | $0/month |
| Netlify | Free Tier | $0/month |
| Git/GitHub | Free | $0/month |
| Leaflet | Open Source | $0 |
| Nominatim | OSM Free | $0 |
| FlagCDN | Free | $0 |
| **TOTAL** | | **$0/month** |

**Free Tier Limits:**
- Supabase: 500MB DB, 1GB Storage, 2GB bandwidth
- Netlify: 100GB bandwidth, 300 build minutes

**Scale costs (if needed):**
- Supabase Pro: $25/month (8GB DB, 100GB storage)
- Netlify Pro: $19/month (unlimited bandwidth)

---

## 🎓 Learning Resources

**Technologies Used:**
- Supabase Docs: https://supabase.com/docs
- Leaflet Tutorial: https://leafletjs.com/examples.html
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- PostgreSQL: https://www.postgresql.org/docs/

**Best Practices:**
- RLS Security: https://supabase.com/docs/guides/auth/row-level-security
- PWA Guide: https://web.dev/progressive-web-apps/
- Touch Events: https://developer.mozilla.org/en-US/docs/Web/API/Touch_events

---

**Last Updated:** 10 February 2026  
**Version:** v1.0-pre-events  
**Maintained by:** Jarno Saarinen / Subsoccer Team
