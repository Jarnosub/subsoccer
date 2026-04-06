sed -i '' "s/let remainingSeconds = 15 \* 60;/const cfg = JSON.parse(localStorage.getItem('subsoccer_table_config')) || {};\nlet remainingSeconds = cfg.matchTime || 90;/g" tv-logic.js
