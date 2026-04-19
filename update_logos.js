const fs = require('fs');
const files = [
    'index.html', 'instant-play.html', 'join.html', 'login.html', 
    'mini-game-promo.html', 'mobile-game.html', 'online-game.html', 
    'player-card.html', 'single-game.html', 'register.html'
];
files.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        let regex = /<img\s+([^>]*src=["']subsoccer_logo\.svg["'][^>]*)>/g;
        let modified = false;
        content = content.replace(regex, (match, p1) => {
            if (!p1.includes('onclick')) {
                modified = true;
                // Add onclick and cursor:pointer
                let newInner = p1;
                if (newInner.includes('style="')) {
                    newInner = newInner.replace('style="', 'style="cursor: pointer; ');
                } else {
                    newInner += ' style="cursor: pointer;"';
                }
                newInner += ` onclick="window.location.href='https://subsoccer.com';"`;
                return `<img ${newInner}>`;
            }
            return match;
        });
        if (modified) {
            fs.writeFileSync(file, content);
            console.log(`Updated ${file}`);
        }
    }
});
