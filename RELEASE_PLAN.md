# Subsoccer App - Julkaisusuunnitelma & Roadmap (BETA)

Tämä dokumentti määrittelee Subsoccer-sovelluksen (The Forge & Global League) asteittaisen julkaisustrategian. Pääasiallinen tavoite on julkaista teknisesti ja visuaalisesti laadukas **MVP (Minimum Viable Product)** Beta-testiin karsimalla ylimääräinen monimutkaisuus pois.

## 🎯 Julkaisufilosofia (Progressive Disclosure)
1. **Zero Confusion:** Pelaajan täytyy ymmärtää ydinkokemus ensimmäisen 30 sekunnin aikana.
2. **Koukuttavuus ensin:** Yksinkertainen ELO-järjestelmä ja näyttävä Pro Card -pelaajakortti muodostavat peliluupin sydämen.
3. **Hallittu tila (Feature Freeze):** Raskaat, mutta koodiin jo rakennetut ominaisuudet piilotetaan käyttöliittymästä Feature Flag -kytkimillä ja avataan vaiheittain markkinointityökaluina.

---

## 🔥 PHASE 1: Avoimen Betan MVP (Tuotannossa & Näkyvissä)

Nämä ominaisuudet pidetään aktiivisina ja niitä hiotaan Beta-julkaisua varten.

### 1. Pikaottelu & ELO-laskenta (Quick Match) - **TÄRKEYS 10/10**
- Koko järjestelmän ydin. Ottelun aloittaminen (QR-koodi / haku), tuloksen (0-3) syöttäminen ja lennosta päivittyvä vastustajien ELO-laskenta.
- **Tila:** Valmis. Vaatii stressitestausta eri laitteilla.

### 2. Saumaton "Nolla-kitkan" Kirjautuminen (Auth & Guest Flow) - **TÄRKEYS 9/10**
- Baari/Arena-asiakas ei saa törmätä salasanamuureihin ennen peliä.
- Uudet pelaajat aloittavat "Guest" (Vieras) nimellä suoraan peliin ja The Forge tarjoaa ottelun *jälkeen* porkkanan rekisteröityä ja tallentaa ansaittu rankki pysyvästi 3D-kortille.
- **Tila:** Valmis. Konversioputki liitetty ELO-järjestelmään.

### 3. Pääprofiili & Pro Card - **TÄRKEYS 9/10**
- Pelaajan esports-identiteetti. Tyylitelty 3D-kääntyvä keräilykortti (Pro Card), joka visualisoi voittosuhteen, ELO-tasot ja sijoitukset. Tämä on paras jakotyökalu someen.
- **Tila:** Valmis. Hiottu visuaalisuus.

### 4. Globaali Leaderboard (Vain Pelaajat) - **TÄRKEYS 8/10**
- Lista The Forgen parhaista pelaajista. Nostaa kilpailuviettiä ja antaa pisteille merkityksen.
- **Tila:** Valmis. Välilehti tiimeille ohjelmoidaan piiloon Betan ajaksi.

---

## 🥷 PHASE 2 & 3: Laajennukset (Piilotetaan Betasta)

Koodattu ja tietokannassa testeihin valmiina, mutta käyttöliittymästä ("UI") toistaiseksi kytkimillä piilotettu estämään informaatioähkyä ja häiriöitä.

### Vaihe 2.0: "The Squad Update" (Julkaisu ~1 kk Betan jälkeen)
**Tiimit / Joukkueet** *(Tärkeys: Valtava konversiolle tulevaisuudessa)*
- Pelaajat aloittavat pyytää kavereitaan peliin oman seuran nimen alle (esim. `[FIN] JARNO`).
- **Miksi piilotetaan nyt:** Luo UI-ähkyä uuteen pelaajaan. Pelaajien on ensin rakastuttava omaan sijaansa ennen muiden seurojen rankkausta.

**Keräilykauppa (Physical Orders / Shop)**
- Mahdollisuus tilata fyysinen NFC-älykortti kotiin "Coming Soon" -tiloilla.
- **Miksi piilotetaan nyt:** Keskeneräinen maksuinfra syö uskottavuutta ensivaikutelmalta.

### Vaihe 3.0: "The Pro Arena Update" (B2B/Tapahtumajärjestäjät)
**Pro Mode (Tuomari / Äänentunnistus)**
- Automatisoitu tekoäly-maalien tunnistus mikrofonin ja "Pro"-painikkeiden avulla.
- **Miksi piilotetaan nyt:** Meluisa baari tai demotila tuhoaa ääniohjauksen herkästi "vahinkomaaleilla". Vaatii kalibroidun rauhallisen tapahtumaympäristön testin myöhemmin.

**Sisäänrakennettu Turnausmoottori (Brackets) & Live View**
- Laaja turnauspuun generaattori ja TV-näyttöjen Control Room organisaattoreille.
- **Miksi piilotetaan nyt:** Liian monimutkainen ja massiivinen casual-pelaajan älypuhelimelle. Näitä ohjataan tulevaisuudessa salasanan tai roolin takaa Smart Host -kioskilla tapahtumajärjestäjän tabletilta.

---

## 🚀 Seuraavat askeleet (Beta Bug Fixing)

Kun uusia ominaisuuksia ei enää lisätä (Feature Freeze), alamme siivoamaan:

1. **Feature Flagien asennus (`config.js`)**
   - Koodataan loogiset virtalukot (`ENABLE_TEAMS = false` jne.), joilla poistetaan yläolevien Phase 2 ja 3 -elementtien painikkeet ja UI-komponentit näkyvistä.
2. **Käyttöliittymän "Idioottitesti" & UI Flow**
   - Luovutetaan peli koehenkilölle ilman opastusta. Selviääkö hän ensimmäisestä matsista ELO-pisteiden tallennukseen?
3. **Mobiilin Rullaus & Layout Stressitesti**
   - Rullaavatko kaikki ikkunat iPhonessa/Androidissa täydellisesti? Ovatko näppäimistöt tai alareunan navigaatiopalkit Tallenna-nappien tiellä?
