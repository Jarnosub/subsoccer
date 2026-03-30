const fs = require('fs');

let html = fs.readFileSync('mini-game.html', 'utf8');

const regex = /\/\* Scoreboard Overlay Styles \(Imported from Instant-Play\) \*\/[\s\S]*?(?=\/\* Turn announcement overlay \*\/|\/\* Turn announcement)/;

const newCSS = `/* Scoreboard Overlay Styles (Imported from Instant-Play) */
        .scoreboard {
            position: absolute;
            top: 40px;
            left: 0;
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 0 50px;
            pointer-events: none;
            z-index: 100;
        }

        .player-side {
            display: flex;
            flex-direction: column;
            align-items: center;
            background: transparent !important;
        }

        .center-divider {
            display: none;
        }

        .score {
            font-size: 8rem;
            font-family: 'Subsoccer', 'Russo One', sans-serif;
            color: #fff;
            line-height: 1;
            margin: 0;
            text-shadow: 0 5px 20px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255,215,0,0.3);
            pointer-events: none;
        }

        .goals-visual {
            font-size: 2rem;
            color: #fff;
            letter-spacing: 8px;
            margin-top: 5px;
            text-shadow: 0 5px 15px rgba(0, 0, 0, 0.8);
        }

        .player-label {
            position: static; /* Removing the absolute positioning */
            font-family: 'Russo One', sans-serif;
            font-size: 1.5rem;
            color: var(--sub-gold, #FFD700);
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-bottom: 5px;
            pointer-events: none;
            text-shadow: 0 5px 15px rgba(0,0,0,0.8);
        }
        
        /* Opponent specific colors */
        .player-right .player-label {
            color: var(--sub-red, #E30613);
        }

        .goal-flash {
            animation: goalFlash 0.5s ease-in-out;
        }
        
        @keyframes goalFlash {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }

        @media (orientation: portrait) {
            .scoreboard { top: 70px; padding: 0 20px; flex-direction: row; }
            .player-side { width: auto; height: auto; }
            .score { font-size: 4rem; margin-top: 5px; }
            .player-label { font-size: 1rem; top: auto; }
            .goals-visual { font-size: 1.5rem; letter-spacing: 5px; }
        }

        `;
        
html = html.replace(regex, newCSS);

fs.writeFileSync('mini-game.html', html);
console.log('HUD Updated');
