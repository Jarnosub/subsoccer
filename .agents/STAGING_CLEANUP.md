# Staging Cleanup — TODO

## Tilanne (15.8.2026 klo 16:08)

Stagingissa on ~50 uncommitted muutosta. Osa on jo tuotannossa, osa odottaa päätöstä.

### Jo tuotannossa ✅ (ei vaadi toimia)
- 16-player bracket, upsell gate, round-tabit
- Match details tracking (maalit, kesto, comeback)
- GoatCounter analytics (27+ sivua)
- netlify.toml CSP + brand-rewritet
- sitemap.xml, login.html, register.html, podcast.html
- analytics-dashboard.html (filtteröinti + city-koordinaatit)

### Odottaa päätöstä ⚠️
- **Add to Map** (mobile-game-logic.js, mobile-game.html, instant-play.html) — testaa mobiililla
- **index.html** — subdomain redirect, ticker fix — matala riski
- **map.js** — klusterointi, filtterit — matala riski
- **brands/** — white-label engine — onko valmis?
- **mini-game.js + goalie/stadium kuvat** — penalty shootout — tarvitaanko?
- **moderator/registered-players.html** — admin toggle — matala riski
- **flick-network.js, online-game.js, tv-app.js** — pieniä lisäyksiä, ei aktiivikäytössä
