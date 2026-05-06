# Triple Whale -integraatio (Poistettu käytöstä 6.5.2026)

## Mitä tämä oli?
Automaattinen yöllinen synkronointi, joka lähetti Supabasen `public_tracking`-taulun päivittäiset metriikat (app opens, tournaments played) Triple Whalen Data-In API:in.

## Rakenne
- **GitHub Actions Workflow:** `.github/workflows/triple-whale-sync.yml`
- **Sync-skripti:** `scripts/sync-triple-whale.js`
- **Backfill-skripti:** `scripts/backfill-triple-whale.js` (historian täyttö)
- **Ajastus:** Joka yö klo 00:05 UTC (cron: `5 0 * * *`)

## Miten palauttaa käyttöön

### 1. Luo GitHub Secrets
Mene GitHubissa → Settings → Secrets and variables → Actions ja lisää:
- `SUPABASE_URL` → Supabase-projektin URL (esim. `https://xxxxx.supabase.co`)
- `SUPABASE_KEY` → Supabase anon key (pitkä `eyJ...` JWT-token)
- `TRIPLE_WHALE_API_KEY` → Triple Whale API-avain

### 2. Luo workflow-tiedosto `.github/workflows/triple-whale-sync.yml`
```yaml
name: Nightly Triple Whale Sync

on:
  schedule:
    - cron: '5 0 * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      TRIPLE_WHALE_API_KEY: ${{ secrets.TRIPLE_WHALE_API_KEY }}
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install @supabase/supabase-js
      - run: node scripts/sync-triple-whale.js
```

### 3. Luo skripti `scripts/sync-triple-whale.js`
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TRIPLE_WHALE_API_KEY = process.env.TRIPLE_WHALE_API_KEY;
const SHOP_DOMAIN = "subsoccer-intl.myshopify.com";

async function syncDailyMetrics(dateString) {
    const startDate = new Date(`${dateString}T00:00:00Z`).toISOString();
    const endDate = new Date(`${dateString}T23:59:59Z`).toISOString();

    const { data, error } = await supabase
        .from('public_tracking')
        .select('event_type')
        .gte('client_time', startDate)
        .lte('client_time', endDate);

    if (error) { console.error(error); process.exit(1); }

    const appOpens = data.filter(d => d.event_type === 'app_opened').length;
    const tournaments = data.filter(d => d.event_type === 'tournament_finished').length;
    const timestamp = Math.floor(new Date(endDate).getTime() / 1000);

    async function sendEvent(eventName, value) {
        const res = await fetch('https://api.triplewhale.com/api/v2/data-in/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': TRIPLE_WHALE_API_KEY },
            body: JSON.stringify({
                shop: SHOP_DOMAIN, type: "custom", timestamp,
                profileIdentifiers: { externalId: `daily_${dateString}` },
                event_name: eventName, value
            })
        });
        console.log(`${eventName}: ${value} → HTTP ${res.status}`);
    }

    await sendEvent("total_app_opens", appOpens);
    await sendEvent("tournaments_played", tournaments);
}

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
syncDailyMetrics(yesterday.toISOString().split('T')[0]);
```

### 4. Triple Whale API
- **Endpoint:** `https://api.triplewhale.com/api/v2/data-in/event`
- **Auth:** Header `x-api-key`
- **Shop domain:** `subsoccer-intl.myshopify.com`
- **Tapahtumat:** `total_app_opens`, `tournaments_played`

## Miksi poistettiin?
Ei tuottanut arvoa vielä tässä vaiheessa. Voidaan palauttaa myöhemmin kun Triple Whale -dashboard on aktiivisessa käytössä.
