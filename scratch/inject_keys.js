const fs = require('fs');

const file = '/Users/jarnosaarinen/subsoccer/translations.js';
let content = fs.readFileSync(file, 'utf8');

const keysToInject = `
        rules_and_guide: "RULES & GUIDE",
        rules_official_rules: "OFFICIAL RULES",
        rules_host_tournament: "HOW TO HOST A TOURNAMENT",
        rules_btn_close: "CLOSE",
        rules_start_title: "START",
        rules_start_desc: "The winner of Rock/Paper/Scissors starts.",
        rules_kickoff_title: "KICK-OFF",
        rules_kickoff_desc: "Kick-off must be taken inside your own goal area.",
        rules_position_title: "POSITIONING",
        rules_position_desc: "Both buttocks must remain on the bench. Hands must not enter the play area and should be kept on the table or on the sides of the benches.",
        rules_ballout_title: "BALL OUT OF PLAY",
        rules_ballout_desc: "If the ball leaves the table, play resumes with a kick-off by the player from whose side the ball went out.",
        rules_winner_title: "WINNER",
        rules_winner_desc: "The first player to score 3 goals wins.",
        host_step1_title: "SELECT 2-8 PLAYERS",
        host_step1_desc: "Enter player names and start the tournament.",
        host_step2_title: "AUTOMATIC BRACKETS",
        host_step2_desc: "Subsoccer GO shuffles matches and generates the tournament bracket automatically. If the player count is uneven (e.g. 3 or 5 players), the app assigns free passes (BYE) for the first round.",
        host_step3_title: "MATCH WINNER & FORFEIT",
        host_step3_desc: "Mark the winner by clicking the player's name in the bracket. If a player forfeits, mark the opponent as the winner.",
        host_step4_title: "LARGE TOURNAMENTS",
        host_step4_desc: "Host multiple separate qualifying pools (max 8 players per pool). Choose the top 1–4 players from each pool and create a new \\"finals tournament\\" in the app to crown the overall champion."`;

const lines = content.split('\n');
let currentLang = '';
const processedLines = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const langMatch = line.match(/^\s+([a-z]{2}):\s*\{/);
    if (langMatch) {
        currentLang = langMatch[1];
    }
    
    processedLines.push(line);
    
    if (line.includes('signup_back_login:') && currentLang !== 'en' && currentLang !== 'fi' && currentLang !== 'ja') {
        let updatedLine = processedLines.pop();
        if (!updatedLine.trim().endsWith(',')) {
            updatedLine += ',';
        }
        processedLines.push(updatedLine + keysToInject);
    }
}

fs.writeFileSync(file, processedLines.join('\n'), 'utf8');
console.log('Done injecting keys!');
