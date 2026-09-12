# Subsoccer Arcade — Uuden Toimipaikan ja Pelipöydän Asennusohje
**Dokumentin versio:** 1.0.0  
**Päivitetty:** 2026-09-12  
**Arkkitehtuuriversio:** Phase 3 — On-Site Venue Gateway (Outbound Polling)

---

## 1. Arkkitehtuurin Yleiskuvaus

Subsoccer Arcade mahdollistaa kolikkopelimäisen maksullisen ja ajastetun pelikokemuksen tavallisella tai sensoroidulla Subsoccer-pöydällä. Järjestelmä yhdistää pilvessä tapahtuvan mobiilimaksamisen (Stripe), tietokantajonon (Supabase) ja paikallisen lähiverkko-ohjauksen (NETIO PowerBOX) ilman, että toimipaikan palomuuriin tarvitsee avata yhtään saapuvaa porttia tai luoda julkisia tunneleita.

```mermaid
flowchart TD
    subgraph Cloud["Pilviympäristö (Netlify + Supabase + Stripe)"]
        Customer["Asiakkaan Mobiiliselain\n(subsoccer.pro/arcade)"] -->|1. Maksu 2,50 €| Stripe["Stripe Payments"]
        Stripe -->|2. Webhook| Netlify["Netlify Serverless\n(stripe-webhook)"]
        Netlify -->|3. Jonoutus (15s deadline)| SupabaseQueue["Supabase-käskyjono\n(arcade_gateway_commands)"]
    end

    subgraph Venue["Toimipaikka / Ravintola (LAN)"]
        Gateway["Paikallinen Gateway-palvelu\n(Raspberry Pi / mini-PC / Mac)"]
        NETIO["NETIO PowerBOX 3PF\n(192.168.x.x)"]
        Table["Lähtö 1: Subsoccer Pulse\n(Pelipöytä / Led-valot)"]
        Display["Lähtö 2: Opastusnäyttö\n(Pelin ohjeet / QR)"]
        Attract["Lähtö 3: Huomiovalot\n(Attract Lights)"]

        Gateway -->|4. Outbound Poll (ANON_KEY)| SupabaseQueue
        Gateway -->|5. Pysyvä levykirjaus (WAL)| WAL["gateway-wal.json"]
        Gateway -->|6. Local HTTP JSON Short ON 300s| NETIO
        NETIO --> Table
        NETIO --> Display
        NETIO --> Attract
    end
```

---

## 2. Laitteistovaatimukset (Bill of Materials)

Toimipaikkaan asennettava laitteisto:

| Komponentti | Malli / Suositus | Tehtävä / Liitäntä |
| :--- | :--- | :--- |
| **Pelipöytä** | Subsoccer Pulse (tai vakio Subsoccer) | Pelialusta ja pöydän sisäinen Pulse-elektroniikka / valot. |
| **Älyvirtakytkin** | **NETIO PowerBOX 3PF** (tai 4KF) | 3 erikseen ohjattavaa Schuko-lähtöä, laitteistotason sisäinen ajastin (`Delay`). |
| **Paikallinen Gateway** | **Raspberry Pi 4/5**, Intel N100 mini-PC tai Mac | Ajaa kevyttä Node.js -daemonia, joka hakee käskyjä ulospäin pilvestä. |
| **Lähiverkkoyhteys** | Ethernet-kaapeli (suositus) tai 2.4 GHz WiFi | Reititin / kytkin toimipaikassa. NETIO ja Gateway samassa aliverkossa. |
| **Opastusnäyttö** *(optio)* | Tabletti / HDMI-näyttö mini-PC:llä | Näyttää ohjeet, QR-koodin ja tilannekuvan pelaajille. |
| **Huomiovalot** *(optio)* | LED-nauha / spotti pöydän yllä | Syttyy kutsumaan pelaajia kun pöytä on vapaa; sammuu pelin ajaksi. |

---

## 3. NETIO PowerBOX 3PF -konfiguraatio

### 3.1 Verkkoliitäntä ja IP-osoite
1. Kytke NETIO virtapistokkeeseen ja liitä se verkkokaapelilla samaan paikallisverkkoon gateway-laitteen kanssa.
2. Selvitä laitteen IP-osoite reitittimen DHCP-listasta tai NETIO Discover -työkalulla.
3. **Suositus:** Määritä reitittimeen kiinteä DHCP-varaus NETIOn MAC-osoitteelle (esim. `192.168.8.120`).

### 3.2 Lähdöt ja kytkentäjärjestys
Kytke laitteet NETIOn pistorasioihin seuraavasti:
* **Lähtö 1 (Outlet 1):** Subsoccer Pulse -pelipöydän virtalähde (Short ON -rele).
* **Lähtö 2 (Outlet 2):** Opastusnäyttö (Jatkuva virta / Auto).
* **Lähtö 3 (Outlet 3):** Huomiovalot / Attract Lights (Automaattinen valmiusvalo).

### 3.3 NETIO Hallintapaneelin Asetukset
Kirjaudu NETIOn selaushallintaan (`http://<netio-ip>/`):
1. **Settings $\rightarrow$ M2M API Protocols $\rightarrow$ JSON API:**
   - Ota käyttöön: **Enable JSON API**
   - Protokolla: **HTTP** (portti 80)
   - Luku- ja kirjoitusoikeus: **Read-Write enabled**
   - Käyttäjätunnus ja salasana: esim. `netio` / `<vahva_salasana>`
2. **Outputs $\rightarrow$ Nimeäminen:**
   - Output 1: `Subsoccer Pulse`
   - Output 2: `Display`
   - Output 3: `Attract Lights`
3. **Outputs $\rightarrow$ Oletustilat sähkökatkon jälkeen (Power-Up State):**
   - Output 1: `OFF (0)` *(pelipöytä pysyy pimeänä)*
   - Output 2: `ON (1)` *(näyttö käynnistyy)*
   - Output 3: `ON (1)` *(huomiovalo syttyy kutsumaan pelaajia)*

---

## 4. Paikallisen Gateway-palvelun Asennus

Gateway-palvelu ([`services/arcade-gateway/arcade-venue-gateway.js`](file:///Users/jarnosaarinen/subsoccer/services/arcade-gateway/arcade-venue-gateway.js)) on kevyt Node.js -daemon, joka ei tarvitse web-palvelinta tai saapuvia portteja.

### 4.1 Asennus laitteelle (esim. Raspberry Pi tai Linux mini-PC)
```bash
# 1. Asenna Node.js (v18 tai uudempi)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Kloonaa repositorio tai kopioi vain gateway-tiedostot
git clone https://github.com/Jarnosub/subsoccer.git /opt/subsoccer
cd /opt/subsoccer

# 3. Asenna riippuvuudet
npm install --omit=dev
```

### 4.2 Ympäristömuuttujat (`.env`)
Luo toimipaikkakohtainen tiedosto `/opt/subsoccer/.env`:
```env
# Supabase-yhteys (Käytä vain julkista ANON-avainta, EI koskaan service_role-avainta!)
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your-public-anon-key>

# Toimipaikan ja Pöydän tunnisteet
PILOT_VENUE_ID=venue-tripla-01
PILOT_TABLE_ID=table-tripla-pulse-01
GATEWAY_ID=gw-tripla-pi-01

# Toimipaikan salainen gateway-token (määritetty pilvikannassa)
GATEWAY_TOKEN=subsoccer_gtw_<vahva_satunnainen_salaisuus>

# Paikallinen NETIO lähiverkossa
NETIO_BASE_URL=http://192.168.8.120
NETIO_USERNAME=netio
NETIO_PASSWORD=<netio_salasana>

# Pysyvän levy-WALin tallennuspolku
GATEWAY_WAL_PATH=/opt/subsoccer/services/arcade-gateway/gateway-wal.json
```

### 4.3 Automaattikäynnistys (systemd Linuxilla)
Luo systemd-palvelu, jotta gateway käynnistyy automaattisesti sähkökatkon tai uudelleenkäynnistyksen jälkeen:

```bash
sudo nano /etc/systemd/system/subsoccer-gateway.service
```

Lisää sisältö:
```ini
[Unit]
Description=Subsoccer Arcade On-Site Venue Gateway
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/subsoccer
ExecStart=/usr/bin/node services/arcade-gateway/arcade-venue-gateway.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/subsoccer/.env

[Install]
WantedBy=multi-user.target
```

Ota palvelu käyttöön:
```bash
sudo systemctl daemon-reload
sudo systemctl enable subsoccer-gateway
sudo systemctl start subsoccer-gateway
sudo systemctl status subsoccer-gateway
```

Lokien seuranta:
```bash
journalctl -u subsoccer-gateway -f
```

*(macOS-laitteilla käytetään vastaavasti launchd-palvelua).*

---

## 5. Pilviasetukset (Supabase & Netlify)

### 5.1 Toimipaikan ja Gateway-tokenin luonti
Generoi turvallinen SHA-256 -tiiviste toimipaikan gateway-tokenille ennen sen viemistä kantaan:

```bash
# Esimerkki Node.js:llä:
node -e '
const crypto = require("crypto");
const token = "subsoccer_gtw_tripla_secret_key_12345";
const hash = crypto.createHash("sha256").update(token).digest("hex");
console.log("TOKEN:", token);
console.log("HASH:", hash);
'
```

Suorita SQL Supabasessa (tai migraationa):
```sql
-- 1. Lisää toimipaikka ja token-tiiviste
INSERT INTO public.arcade_venues (
    venue_id,
    name,
    city,
    gateway_token_hash,
    created_at
) VALUES (
    'venue-tripla-01',
    'Mall of Tripla - Subsoccer Arena',
    'Helsinki',
    extensions.digest('subsoccer_gtw_tripla_secret_key_12345'::bytea, 'sha256'),
    now()
) ON CONFLICT (venue_id) DO UPDATE
SET gateway_token_hash = EXCLUDED.gateway_token_hash;

-- 2. Lisää pöytä
INSERT INTO public.arcade_table_configs (
    table_id,
    venue_id,
    is_enabled,
    lock_state,
    switch_type,
    switch_output_id,
    display_output_id,
    lights_output_id,
    default_duration_seconds,
    max_duration_seconds
) VALUES (
    'table-tripla-pulse-01',
    'venue-tripla-01',
    true,
    'available',
    'netio_json',
    1, -- Pelipöytä
    2, -- Opastusnäyttö
    3, -- Huomiovalot
    300,  -- 5 min
    1800  -- 30 min max
) ON CONFLICT (table_id) DO NOTHING;
```

### 5.2 Asiakkaan QR-koodi
Luo fyysinen QR-kooditarra pelipöydän kanteen / kylkeen osoitteella:
```text
https://subsoccer.pro/arcade?table=table-tripla-pulse-01
```

---

## 6. Tietoturva- ja Vikasietoisuusperiaatteet

1. **Ei saapuvia portteja (Zero Ingress):**
   - Paikallinen gateway ottaa vain **ulospäin suuntautuvia HTTPS-yhteyksiä** Supabaseen (portti 443).
   - NETIO-laite ei näy internetiin eikä vaadi portinohjauksia, dynaamista DNS:ää tai Cloudflare-tunneleita.
2. **Käyttöoikeuksien minimointi (Least Privilege):**
   - Gateway käyttää unprivileged `ANON_KEY`-avainta.
   - Suorat taulukyselyt on estetty RLS-säännöillä. Gateway voi ainoastaan kutsua tiettyjä RPC-funktioita (`arcade_gateway_claim_command`, `arcade_gateway_report_activation_success`, `arcade_gateway_report_off`, `arcade_gateway_report_uncertain`), jotka todentavat toimipaikkakohtaisen tokenin SHA-256 -tiivisteen.
3. **Pysyvä levykirjaus (WAL):**
   - Ennen jokaista fyysistä releohjausta gateway tallentaa tilan levylle (`gateway-wal.json`).
   - Jos gateway kaatuu sähkökatkon tai prosessin keskeytymisen vuoksi, se ei koskaan lähetä toista Short ON -käskyä herätessään, vaan lukee laitteen nykytilan ja jatkaa valvontaa.
4. **Lähiverkkoautonomia (Internetkatkot):**
   - Jos internet-yhteys katkeaa pelin aikana, NETIOn sisäinen kello katkaisee pelipöydän virran itsenäisesti.
   - Gateway kytkee huomiovalot takaisin päälle paikallisesti ilman pilviyhteyttä, jotta tila ei jää pimeäksi.
   - Pöytä säilyttää lukituksen pilvessä, kunnes netti palautuu ja kuittaus menee läpi.

---

## 7. Käyttöönoton Tarkistuslista (Acceptance Checklist)

Suorita seuraavat tarkistukset ennen pöydän avaamista asiakkaille:

- [ ] **1. Fyysinen valotarkistus valmiustilassa:**
  - Lähtö 1 (Pelipöytä): Pimeänä (State: 0).
  - Lähtö 2 (Näyttö): Päällä (State: 1).
  - Lähtö 3 (Huomiovalot): Päällä (State: 1).
- [ ] **2. Gateway-palvelun toiminta:**
  - `systemctl status subsoccer-gateway` näyttää `active (running)`.
  - Lokissa näkyy: `[POLL] Gateway polling queue for venue venue-tripla-01...`.
- [ ] **3. QR-koodin skannaus puhelimella:**
  - Avaa QR-koodi mobiililaitteella.
  - Sivu `arcade.html` latautuu ilman virheitä.
  - Näkyvissä hinnasto: 5 min (2,50 €), 10 min (4,50 €), 20 min (8,00 €).
- [ ] **4. Testipelin aktivointi:**
  - Valitse 5 min ja suorita maksu testikortilla.
  - Tarkista välitön siirtymä: *"Maksu vastaanotettu. Käynnistetään pöytää..."*.
  - **Laitteistovaste:** Lähtö 1 syttyy heti, Lähtö 3 sammuu.
  - Pelikello laskee alaspäin (05:00 $\rightarrow$ 04:59).
- [ ] **5. Pelin päättyminen:**
  - 5 minuutin kuluttua Lähtö 1 sammuu itsenäisesti, Lähtö 3 syttyy heti takaisin päälle.
  - Puhelimen näytölle ilmestyy: *"Peliaika päättynyt! Kiitos pelistä."*.
  - Pöytä palaa vapaaksi seuraavalle pelaajalle.
