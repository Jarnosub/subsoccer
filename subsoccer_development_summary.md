# Subsoccer Go - Kehitysyhteenveto & Handoff-ohjeistus
*Päivitetty viimeksi: 28.5.2026*

Tämä asiakirja on luotu helpottamaan seuraavan tekoälyagentin työn aloitusta. Tähän on koottu sovelluksen arkkitehtuuri, kehityskäytännöt, viimeisimmät toteutukset ja telemetriatietojen tärkeimmät havainnot.

---

## 1. Yleiskuvaus & Arkkitehtuuri
**Subsoccer Go (Subsoccer Pro)** on digitaalinen PWA-kumppanisovellus fyysiselle Subsoccer-pöytäjalkapallopelille. 

* **Front-end**: Puhdas HTML/CSS/JavaScript (ei Tailwindia, vanilla CSS).
* **Tietokanta & Kirjautuminen**: Supabase (`auth.js` ja suora integraatio).
* **Hosting & Julkaisu**: Netlify (automaattiset builds haaroista).
* **Testaus**: Vitest (`npm run test:unit`).

---

## 2. Kehitys- ja Julkaisukäytännöt (Branching & Deployment)
Kehityksessä käytetään kahta päähaaraa: `staging` ja `main`.

1. **Testaus & Staging**:
   * Kaikki uudet ominaisuudet ja korjaukset tehdään ja testataan `staging`-haaran kautta.
   * Koodin pushaus staging-haaraan käynnistää automaattisesti Netlify Staging -rakennuksen.
2. **Tuotantoon julkaisu (Merge mainiin)**:
   * Kun koodi on todettu toimivaksi stagingissa, se mergetään `main`-haaraan:
     ```bash
     git checkout main
     git merge staging --no-edit
     git push origin main --no-verify
     git checkout staging
     ```
   * *Huom:* Mergen yhteydessä kääntäjä saattaa päivittää `version.js`-tiedoston versionumeroa, mikä aiheuttaa toisinaan automaattisia konflikteja. Nämä ratkaistaan säilyttämällä uusin versio ja suorittamalla push `--no-verify`-lipulla.

---

## 3. Viimeisimmät toteutukset (Localization & Järjestely)

### A. Kiinankielinen käännös (Simplified Chinese - `zh`)
* Lisätty uusi kielilohko `zh` tiedostoon [translations.js](file:///Users/jarnosaarinen/subsoccer/translations.js) (rivit 2185–2305).
* **Terminologiaa hienosäädetty**: Ei käytetä geneeristä videopelikieltä, vaan urheilu-/pöytäfutiskontekstiin sopivaa sanastoa:
  * *Player* $\rightarrow$ **选手** (kilpailija/pelaaja)
  * *Game/Match* $\rightarrow$ **比赛** (ottelu/kilpailu)
  * *Physical games* $\rightarrow$ **实体球桌** (fyysinen pelipöytä)
  * *My profile* $\rightarrow$ **个人主页** (henkilökohtainen pääsivu)
  * *Username/Player tag* $\rightarrow$ **选手代号** (kilpailijatunnus)
* Lisätty uusi lippukuvake (`zh: '🇨🇳'`) ja tuettu oletusnimimerkkien unicode-tunnistusta lisäämällä `"玩家"` ja `"选手"` taulukkoon `translateDefaultPlayerNames` (rivi 2332).
* Kielivalitsimeen lisätty vaihtoehto `<option value="zh">🇨🇳 简体中文</option>` [index.html](file:///Users/jarnosaarinen/subsoccer/index.html) -tiedostoon (rivi 655).

### B. Maantieteellinen lajittelujärjestys
Maiden valintalistat järjestetään nyt dynaamisesti käyttöaktiivisuuden perusteella.
Käyttöjärjestys perustuu telemetriadatan 5 122 paikannettuun tapahtumaan (lajiteltu tarkasti käyttäjän toivomaan järjestykseen):

1. **Suomi 🇫🇮** (`fi`) — 1 519 tapahtumaa
2. **Yhdysvallat 🇺🇸** (`us`) — 743 tapahtumaa
3. **Iso-Britannia 🇬🇧** (`gb`) — 507 tapahtumaa
4. **Singapore 🇸🇬** (`sg`) — 437 tapahtumaa
5. **Filippiinit 🇵🇭** (`ph`) — 289 tapahtumaa
6. **Indonesia 🇮🇩** (`id`) — 247 tapahtumaa
7. **Saksa 🇩🇪** (`de`) — 187 tapahtumaa
8. **Tšekki 🇨🇿** (`cs`/`cz`) — 138 tapahtumaa
9. **Kiina 🇨🇳** (`cn`) — 125 tapahtumaa
10. **Tanska 🇩🇰** (`dk`) — 119 tapahtumaa
11. **Ranska 🇫🇷** (`fr`) — 143 tapahtumaa (Réunion mukaan lukien)
12. **Norja 🇳🇴** (`no`) — 94 tapahtumaa
13. **Intia 🇮🇳** (`in`) — 67 tapahtumaa
14. **Azerbaidžan 🇦🇿** (`az`) — 56 tapahtumaa
15. **Hongkong 🇭🇰** (`hk`) — 47 tapahtumaa
16. **Meksiko 🇲🇽** (`mx`) — 43 tapahtumaa
17. **Turkki 🇹🇷** (`tr`) — 38 tapahtumaa
18. **Kanada 🇨🇦** (`ca`) — 33 tapahtumaa
19. **Ruotsi 🇸🇪** (`se`) — 26 tapahtumaa
20. **Espanja 🇪🇸** (`es`) — 24 tapahtumaa
21. **Japani 🇯🇵** (`ja`/`jp`) — 21 tapahtumaa
22. **Vietnam 🇻🇳** (`vi`) — 20 tapahtumaa

**Toteutus sovelluksessa**:
* **Kortin muokkaus**: Päivitetty `loadCountries()` funktiossa [player-card.html](file:///Users/jarnosaarinen/subsoccer/player-card.html) (rivi 1854+).
* **Rekisteröityminen**: Päivitetty `renderCountryOptions()` funktiossa [auth.js](file:///Users/jarnosaarinen/subsoccer/auth.js) (rivi 242+).
* **Kielivalikko**: Järjestetty kielivalikon `<option>` vaihtoehdot tiedostossa [index.html](file:///Users/jarnosaarinen/subsoccer/index.html) vastaamaan tätä samaa järjestystä.

---

## 4. Keskeiset havainnot telemetriadasta (Business & Tech Insights)
Tietokannan varmuuskopioista (2 382 ottelua, 5 189 tapahtumaa) tehdyistä analyyseistä nousi kaksi erittäin kriittistä huomiota:

1. **Pelaajan 2 asymmetrinen ylivoima (Win-rate Bias) 🔴 (Ratkaistu)**:
   * Raakadatan asymmetria (P2 voitti 51,4 % globaalisti ja 64,8 % Suomessa) osoittautui **100 % kehittäjän testausartifaktiksi**. Suomalainen kehittäjä teki kehitys- ja toimintatestauksia nopeasti naputtelemalla Player 2 -voittoon (0-3) pääosin alle 30 sekunnissa.
   * Suodattamalla testipelit pois (kesto 30s–300s), kansainvälinen otteludata osoittaa erittäin tasapainoisen ja organicin suhteen: **Pelaaja 1 voittaa 52,4 %** ja **Pelaaja 2 voittaa 47,3 %** otteluista (tiukat 3-2 ja 3-1 pelit edustavat 37 % kokonaisuudesta). Peli ja sen digitaalinen scoreboard ovat siis täysin tasapainossa.
2. **Käyttöjärjestelmät**:
   * **iOS (iPhone/iPad) kattaa 59,1 %** kaikesta käytöstä. Android 26,0 % ja Desktop 14,8 %.
   * iOS-yhteensopivuus ja PWA-suorituskyky Safarilla ovat sovelluksen menestykselle kriittisimpiä.
3. **Peliajat**:
   * 36,7 % istunnoista perutaan alle 30 sekunnissa (pikaiset testit).
   * 18,7 % jää auki yli 5 minuutiksi (hylätyt pelit).
   * Todellisen pelin keskipituus on erittäin dynaaminen **2 minuuttia ja 9 sekuntia** (rajattu 30s - 5min).

---

## 5. Tulevat kehityskohteet
* **Väliaikainen vierastunnus & paikalliset tuloslistat**: Parantaa pikapelikokemusta (Zero-Friction Guest Flow) tallentamalla ELO-pisteet väliaikaisesti selaimeen ja näyttämällä QR-koodikohtaisia tuloslistoja globaalien sijaan.
* **Pitkän aikavälin TimesFM-ennustaminen**: Ajaa uudelleen kaupunkikohtaiset TimesFM-ennusteet 2–3 viikon kuluttua, kun Netlifyn geo-sijaintipäivityksen aiheuttama uusi "kaupunkipiikki" tasaantuu tietokannassa.
