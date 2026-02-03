# Subsoccer Pro v70.0 Master

Subsoccer Pro is a mobile-optimized tournament and ranking management application designed for physical Subsoccer (table football) games. This application serves as a digital companion to track player performance, manage tournament brackets, and maintain a global ranking system.

## 🚀 Features

- **Premium Player Cards:** High-fidelity UI with real-time stats (Wins, ELO, Team) pixel-perfectly aligned to custom graphics.
- **Character Selection:** Integrated avatar system allowing players to choose their identity from a set of silhouettes.
- **Tournament Engine:** - Automated bracket generation with support for "BYE" rounds (odd player counts).
  - Hybrid search: Instant search across database-registered players and session-based guest players.
  - "Quick Add" functionality: Add any name to the pool instantly by pressing Enter.
- **Competitive Ranking (ELO):** A chess-inspired ranking system that awards +25 ELO per victory.
- **Global Updates:** The engine automatically updates the ELO of any registered winner in the database, regardless of who is currently logged in to the device.
- **History Tracking:** Persistent storage of tournament winners and event names.

## 🛠 Technical Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (Flexbox & Absolute Positioning).
- **Backend-as-a-Service:** [Supabase](https://supabase.com/) (PostgreSQL).
- **Hosting:** [Netlify](https://netlify.com/) with automated GitHub CI/CD deployment.
- **Typography:** Russo One (Sporty Headers) and Open Sans (UI/Body).

## 📂 Project Structure

- `index.html`: The main Single Page Application containing all logic and styling.
- `logo.png`: Official Subsoccer branding.
- `silver-temp.jpg`: The graphic background for the premium player cards.
- `placeholder-silhouette.png`: Player avatar assets.

## 🔧 Development Notes

This version (**v70.0 Master**) is the most stable release, prioritizing reliable database connections and precise CSS alignment. 

### Global ELO Update Logic
The application performs a cross-reference check upon tournament completion. If the winner's name exists in the `players` table, the system updates their global ELO and Win count automatically. This allows for multi-user tournaments to affect rankings without requiring every player to log in individually.

## 👥 Developers & Contributions

This repository serves as a **Sandbox Environment** for feature testing and UI refinement. 
- Primary testing focused on mobile browser compatibility and database latency handling.
- For production-level integration, refer to the database schema in the connected Supabase instance.

---
*Developed as a collaborative project for the Subsoccer gaming community.*
