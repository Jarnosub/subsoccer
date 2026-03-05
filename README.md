⚽ Subsoccer Pro - Master Edition
A high-performance web application designed for competitive Subsoccer matches. This tool focuses on a "Play First" philosophy, allowing players to start matches instantly, track ELO ratings, and manage local tournaments.

## 🎯 Core Philosophy & The Three Personas
To prevent feature creep ("The Himmeli"), the architecture strictly separates the user experience into three independent personas. Features from one persona must **never** clutter the interface of another:

1. **The Player (Consumer):** Super simple, frictionless experience. Scan a QR code, play a quick match, and see the results instantly. No forced registrations, no complex bracket management. Just play.
2. **The Organizer (Moderator):** The "Excel" layer, but fun. Needs calendar management, event sign-ups, and tournament brackets (which act as a visual guide, not a strict bottleneck). They manage the event flow on an iPad/Laptop, completely separate from the TV broadcast.
3. **The Broadcaster (Pro Producer):** The Showman. Uses the dedicated `/control-room.html` to manage a multi-camera WebRTC setup, director graphics, and live TV casting without interfering with the Organizer's physical event flow.

🚀 Core Features

⚡ **NEW: Instant Play Mode**
**The fastest way to play Subsoccer - perfect for bars and public tables!**

- **Scan QR Code** → Play in seconds
- **No registration** → Just scoreboard
- **Full-screen mode** → Phone as scoreboard in table center
- **Touch control** → Tap your side to score
- **Acoustic detection** → Automatic goal detection
- **Perfect for bars** → QR sticker on every table

[Learn more: INSTANT_PLAY_SETUP.md](INSTANT_PLAY_SETUP.md)

---

1. Quick Match (Primary Mode)
Instant Start: Jump into a match by simply entering two player names.

ELO Prediction: Real-time calculation of potential ELO gains before the match begins.

Winner Reveal: High-impact "Victory Overlay" that celebrates the winner and displays rating changes with professional animations.

**Auto-fill Players**: Previous match players stay selected for instant rematch.

**Sound Effects**: Goal sounds and crowd cheers for immersive experience.

2. ELO Ranking System
Fully integrated with Supabase for persistent data storage.

Tracks player wins, losses, and overall skill level.

Guest support: Casual players can participate in matches without permanent accounts.

3. Tournament Engine (Advanced)
Bracket Generation: Create single-elimination brackets for local events.

Management Tools: Dedicated "Manage Game Tables" section for organizers to handle physical table settings and live stream integration.

4. Player Profiles & Pro Cards
Custom Pro Cards: Generate high-resolution, shareable player cards using html2canvas.

National Representation: Select flags and clubs to personalize the competitive experience.

🛠 Technical Stack
Frontend: Vanilla JS, CSS3, HTML5.

Backend: Supabase (Database & Auth).

Mapping: Leaflet.js for managing game table locations.

Fonts: Specialized sports typography (SubsoccerLogo, Russo One, Resolve Narrow).